'use strict';
/**
 * 评分引擎。
 *
 * 团队分 = 同伴互评 × w.peer + 助教过程检查 × w.ta + 教师终评 × w.teacher
 * 缺失的分项按「已有分项权重重归一化」处理，并在返回值里标注 complete=false，
 * 这样中期预览分数可用，但导出与发布时会提示哪些队伍还没评完。
 *
 * 个人分 = 团队分 × 贡献系数；贡献系数来自组内互评，
 * 系数 = 个人组内得分 / 队内平均分，并夹在 [0.6, 1.4] 内。
 */
const store = require('./store');

const DEFAULT_WEIGHTS = { peer: 20, ta: 20, teacher: 60 };

function round(n, digits = 1) {
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
}

/** 把 [{rubricId, score}] 按 rubric 权重折算为 0~100 分。 */
function scoreAgainstRubric(rubric, scores) {
  if (!Array.isArray(scores) || !rubric || !rubric.length) return null;
  let weightSum = 0;
  let got = 0;
  for (const item of rubric) {
    const found = scores.find((s) => String(s.rubricId) === String(item.id) || s.rubricId === item.name);
    if (!found || found.score === null || found.score === undefined || found.score === '') continue;
    const max = Number(item.max) || 10;
    const weight = Number(item.weight) || 1;
    const raw = Math.max(0, Math.min(max, Number(found.score)));
    got += (raw / max) * weight;
    weightSum += weight;
  }
  if (!weightSum) return null;
  return round((got / weightSum) * 100, 1);
}

function projectWeights(project) {
  const w = Object.assign({}, DEFAULT_WEIGHTS, project.weights || {});
  const sum = Number(w.peer || 0) + Number(w.ta || 0) + Number(w.teacher || 0);
  if (!sum) return { peer: 20, ta: 20, teacher: 60, sum: 100 };
  return { peer: Number(w.peer || 0), ta: Number(w.ta || 0), teacher: Number(w.teacher || 0), sum };
}

function latestSubmissionsOfTeam(teamId) {
  const subs = store.where('submissions', (s) => s.teamId === teamId);
  const byIteration = new Map();
  for (const s of subs) {
    const cur = byIteration.get(s.iterationId);
    if (!cur || (s.version || 1) > (cur.version || 1)) byIteration.set(s.iterationId, s);
  }
  return Array.from(byIteration.values());
}

/** 组间互评得分：对该队各迭代最新提交收到的互评取平均。 */
function peerScoreOfTeam(project, teamId) {
  const latest = latestSubmissionsOfTeam(teamId);
  const details = [];
  const totals = [];
  for (const sub of latest) {
    const reviews = store.where(
      'reviews',
      (r) => r.submissionId === sub.id && r.type === 'cross' && r.status !== 'draft'
    );
    if (!reviews.length) continue;
    const iter = store.find('iterations', sub.iterationId);
    const values = reviews.map((r) => r.total).filter((v) => typeof v === 'number');
    if (!values.length) continue;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    totals.push(avg);
    details.push({
      iterationId: sub.iterationId,
      iterationName: iter ? iter.name : sub.iterationId,
      submissionId: sub.id,
      reviewCount: reviews.length,
      avg: round(avg, 1)
    });
  }
  if (!totals.length) return { score: null, reviewCount: 0, details };
  const score = totals.reduce((a, b) => a + b, 0) / totals.length;
  return { score: round(score, 1), reviewCount: details.reduce((a, d) => a + d.reviewCount, 0), details };
}

/** 助教过程检查得分：该队全部检查记录分数的平均。 */
function taScoreOfTeam(teamId) {
  const checks = store.where('checks', (c) => c.teamId === teamId && typeof c.score === 'number');
  const sorted = checks.slice().sort((a, b) => String(a.checkDate).localeCompare(String(b.checkDate)));
  if (!checks.length) return { score: null, checkCount: 0, lastCheckAt: null, checks: sorted };
  const avg = checks.reduce((a, c) => a + Number(c.score), 0) / checks.length;
  return {
    score: round(avg, 1),
    checkCount: checks.length,
    lastCheckAt: sorted.length ? sorted[sorted.length - 1].checkDate : null,
    checks: sorted
  };
}

/** 教师终评得分：取最新一条教师评分记录。 */
function teacherScoreOfTeam(projectId, teamId) {
  const list = store
    .where('teacherGrades', (g) => g.projectId === projectId && g.teamId === teamId)
    .sort((a, b) => String(a.gradedAt).localeCompare(String(b.gradedAt)));
  if (!list.length) return { score: null, comment: null, gradedAt: null, record: null };
  const last = list[list.length - 1];
  return { score: last.total, comment: last.comment || '', gradedAt: last.gradedAt, record: last };
}

/** 组内互评 → 贡献系数。 */
function contributionFactors(project, team) {
  const members = store.where('teamMembers', (m) => m.teamId === team.id && m.active !== false);
  const rubric = project.internalRubric || [];
  const raw = new Map();
  for (const m of members) {
    const received = store.where('reviews', (r) => r.type === 'internal' && r.teamId === team.id && r.targetUserId === m.userId);
    const values = received.map((r) => r.total).filter((v) => typeof v === 'number');
    raw.set(m.userId, values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  }
  const present = Array.from(raw.values()).filter((v) => v !== null);
  const avg = present.length ? present.reduce((a, b) => a + b, 0) / present.length : 100;
  const out = new Map();
  for (const m of members) {
    const v = raw.get(m.userId);
    if (v === null || !avg) {
      out.set(m.userId, { factor: 1, rawScore: null, reviewsReceived: 0 });
      continue;
    }
    const factor = Math.max(0.6, Math.min(1.4, v / avg));
    out.set(m.userId, {
      factor: round(factor, 3),
      rawScore: round(v, 1),
      reviewsReceived: store.where('reviews', (r) => r.type === 'internal' && r.teamId === team.id && r.targetUserId === m.userId).length
    });
  }
  return { factors: out, average: round(avg, 1), memberCount: members.length, hasData: present.length > 0, rubric };
}

function computeTeamGrade(project, team) {
  const weights = projectWeights(project);
  const peer = peerScoreOfTeam(project, team.id);
  const ta = taScoreOfTeam(team.id);
  const teacher = teacherScoreOfTeam(project.id, team.id);
  const contribution = contributionFactors(project, team);

  const parts = [];
  if (peer.score !== null) parts.push({ key: 'peer', score: peer.score, weight: weights.peer });
  if (ta.score !== null) parts.push({ key: 'ta', score: ta.score, weight: weights.ta });
  if (teacher.score !== null) parts.push({ key: 'teacher', score: teacher.score, weight: weights.teacher });

  const weightSum = parts.reduce((a, p) => a + p.weight, 0);
  let total = null;
  if (weightSum > 0) {
    total = round(parts.reduce((a, p) => a + p.score * p.weight, 0) / weightSum, 1);
  }

  const members = store
    .where('teamMembers', (m) => m.teamId === team.id && m.active !== false)
    .map((m) => {
      const user = store.find('users', m.userId);
      const c = contribution.factors.get(m.userId) || { factor: 1, rawScore: null, reviewsReceived: 0 };
      const final = total === null ? null : Math.min(100, round(total * c.factor, 1));
      return {
        userId: m.userId,
        name: user ? user.name : m.userId,
        studentNo: user ? user.studentNo || '' : '',
        teamRole: m.role,
        factor: c.factor,
        internalScore: c.rawScore,
        internalReviewsReceived: c.reviewsReceived,
        final
      };
    });

  const missing = [];
  if (peer.score === null) missing.push('同伴互评');
  if (ta.score === null) missing.push('助教过程检查');
  if (teacher.score === null) missing.push('教师终评');

  const published = store.first('grades', (g) => g.projectId === project.id && g.teamId === team.id && g.published) || null;

  return {
    teamId: team.id,
    teamName: team.name,
    taId: team.taId || null,
    taName: team.taId && store.find('users', team.taId) ? store.find('users', team.taId).name : '',
    memberCount: members.length,
    peer, ta, teacher,
    contribution: { average: contribution.average, hasData: contribution.hasData },
    weights,
    total,
    missing,
    complete: missing.length === 0,
    published: !!published,
    publishedAt: published ? published.publishedAt : null,
    members,
    submissions: latestSubmissionsOfTeam(team.id).map((s) => {
      const iter = store.find('iterations', s.iterationId);
      return {
        submissionId: s.id,
        iterationId: s.iterationId,
        iterationName: iter ? iter.name : s.iterationId,
        title: s.title,
        version: s.version || 1,
        submittedAt: s.submittedAt
      };
    })
  };
}

function computeProjectGrades(projectId) {
  const project = store.find('projects', projectId);
  if (!project) return null;
  const teams = store.where('teams', (t) => t.projectId === projectId);
  const rows = teams.map((t) => computeTeamGrade(project, t));
  const scored = rows.filter((r) => r.total !== null).map((r) => r.total);
  return {
    project,
    weights: projectWeights(project),
    teams: rows,
    stats: {
      teamCount: rows.length,
      gradedTeams: scored.length,
      completeTeams: rows.filter((r) => r.complete).length,
      publishedTeams: rows.filter((r) => r.published).length,
      average: scored.length ? round(scored.reduce((a, b) => a + b, 0) / scored.length, 1) : null,
      max: scored.length ? Math.max(...scored) : null,
      min: scored.length ? Math.min(...scored) : null
    }
  };
}

/** 学生视角：自己所在队伍的成绩。 */
function gradesForStudent(userId) {
  const teamMemberships = store.where('teamMembers', (m) => m.userId === userId && m.active !== false);
  const out = [];
  for (const tm of teamMemberships) {
    const team = store.find('teams', tm.teamId);
    if (!team) continue;
    const project = store.find('projects', team.projectId);
    if (!project) continue;
    const grade = computeTeamGrade(project, team);
    const mine = grade.members.find((m) => m.userId === userId) || null;
    out.push({
      projectId: project.id,
      projectTitle: project.title,
      courseId: project.courseId,
      teamId: team.id,
      teamName: team.name,
      teamTotal: grade.total,
      published: grade.published,
      publishedAt: grade.publishedAt,
      breakdown: { peer: grade.peer.score, ta: grade.ta.score, teacher: grade.teacher.score },
      weights: grade.weights,
      factor: mine ? mine.factor : 1,
      final: mine ? mine.final : null,
      missing: grade.missing
    });
  }
  return out;
}

/** 成绩导出：一行一名学生。 */
function buildExportRows(projectId) {
  const data = computeProjectGrades(projectId);
  if (!data) return null;
  const rows = [];
  for (const t of data.teams) {
    for (const m of t.members) {
      rows.push({
        学号: m.studentNo,
        姓名: m.name,
        队伍: t.teamName,
        队内角色: m.teamRole === 'leader' ? '组长' : '组员',
        同伴互评分: t.peer.score === null ? '' : t.peer.score,
        助教过程分: t.ta.score === null ? '' : t.ta.score,
        教师评分: t.teacher.score === null ? '' : t.teacher.score,
        团队总分: t.total === null ? '' : t.total,
        贡献系数: m.factor,
        个人最终分: m.final === null ? '' : m.final,
        成绩状态: t.published ? '已发布' : '未发布',
        备注: t.missing.length ? '缺：' + t.missing.join('/') : ''
      });
    }
  }
  return rows;
}

module.exports = {
  DEFAULT_WEIGHTS,
  round,
  scoreAgainstRubric,
  projectWeights,
  computeTeamGrade,
  computeProjectGrades,
  gradesForStudent,
  buildExportRows,
  latestSubmissionsOfTeam
};
