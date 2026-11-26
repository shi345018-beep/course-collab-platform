'use strict';
const repo = require('./repository');
const policy = require('./policy');
const courses = require('../courses/service');
const grading = require('../../domain/grading');
const audit = require('../../infra/audit');
const { need } = require('../../shared/errors');

function computeGrades(projectId) {
  const project = repo.findProject(projectId);
  need(project, 404, '项目不存在');
  const weights = grading.normalizeWeights(project.weights);
  const teams = repo.listTeams(projectId);

  const rows = teams.map(function (team) {
    const members = repo.listMembers(team.id);
    const latest = grading.pickLatestByIteration(repo.listSubmissions(team.id));
    const latestIds = latest.map(function (s) { return s.id; });
    const crossReviews = repo.listCrossReviews(latestIds);

    const peerDetails = [];
    const peerTotals = [];
    latest.forEach(function (submission) {
      const received = crossReviews.filter(function (r) { return r.submissionId === submission.id; });
      if (!received.length) return;
      const avg = grading.average(received.map(function (r) { return r.total; }));
      if (avg === null) return;
      peerTotals.push(avg);
      peerDetails.push({
        submissionId: submission.id,
        iterationId: submission.iterationId,
        reviewCount: received.length,
        avg: grading.round(avg, 1)
      });
    });
    const peerScore = peerTotals.length ? grading.round(grading.average(peerTotals), 1) : null;

    const checks = repo.listChecks(team.id).filter(function (c) { return typeof c.score === 'number'; });
    const taScore = checks.length ? grading.round(grading.average(checks.map(function (c) { return c.score; })), 1) : null;

    const teacherRecord = repo.latestTeacherGrade(projectId, team.id);
    const teacherScore = teacherRecord ? teacherRecord.total : null;

    const contribution = grading.contributionFactors(
      members, repo.listInternalReviews(team.id), project.factorRange
    );

    const total = grading.weightedTotal([
      { score: peerScore, weight: weights.peer },
      { score: taScore, weight: weights.ta },
      { score: teacherScore, weight: weights.teacher }
    ]);

    const missing = [];
    if (peerScore === null) missing.push('同伴互评');
    if (taScore === null) missing.push('助教过程检查');
    if (teacherScore === null) missing.push('教师终评');

    const published = repo.findGrade(projectId, team.id);
    const memberRows = members.map(function (m) {
      const c = contribution.factors.get(m.userId) || { factor: 1, rawScore: null, reviewsReceived: 0 };
      return {
        userId: m.userId,
        name: m.name,
        studentNo: m.studentNo,
        teamRole: m.teamRole,
        factor: c.factor,
        internalScore: c.rawScore,
        internalReviewsReceived: c.reviewsReceived,
        final: grading.personalScore(total, c.factor)
      };
    });

    return {
      teamId: team.id,
      teamName: team.name,
      taId: team.taId || null,
      memberCount: members.length,
      peer: { score: peerScore, reviewCount: peerDetails.reduce(function (n, d) { return n + d.reviewCount; }, 0), details: peerDetails },
      ta: { score: taScore, checkCount: checks.length, lastCheckAt: checks.length ? checks[checks.length - 1].checkDate : null, checks: checks },
      teacher: {
        score: teacherScore,
        comment: teacherRecord ? teacherRecord.comment : '',
        gradedAt: teacherRecord ? teacherRecord.gradedAt : null,
        record: teacherRecord || null
      },
      contribution: { average: contribution.average, hasData: contribution.hasData },
      weights: weights,
      total: total,
      missing: missing,
      complete: missing.length === 0,
      published: !!(published && published.published),
      publishedAt: published ? published.publishedAt : null,
      frozen: !!(published && published.frozen),
      members: memberRows,
      submissions: latest.map(function (s) {
        return {
          submissionId: s.id,
          iterationId: s.iterationId,
          title: s.title,
          version: s.version,
          submittedAt: s.submittedAt
        };
      })
    };
  });

  const scored = rows.filter(function (r) { return r.total !== null; }).map(function (r) { return r.total; });
  return {
    project: { id: project.id, title: project.title, courseId: project.courseId },
    weights: weights,
    teams: rows,
    stats: {
      teamCount: rows.length,
      gradedTeams: scored.length,
      completeTeams: rows.filter(function (r) { return r.complete; }).length,
      publishedTeams: rows.filter(function (r) { return r.published; }).length,
      average: scored.length ? grading.round(grading.average(scored), 1) : null,
      max: scored.length ? Math.max.apply(null, scored) : null,
      min: scored.length ? Math.min.apply(null, scored) : null
    }
  };
}

function summary(actor, projectId) {
  const project = repo.findProject(projectId);
  need(project, 404, '项目不存在');
  const membership = courses.membershipOf(actor.id, project.courseId);
  need(policy.canView(membership), 403, '你不是该课程成员');
  return computeGrades(projectId);
}

function teacherGrade(actor, projectId, input) {
  const project = repo.findProject(projectId);
  need(project, 404, '项目不存在');
  const membership = courses.membershipOf(actor.id, project.courseId);
  need(policy.canGrade(membership), 403, '只有教师可以终评');
  const team = repo.listTeams(projectId).filter(function (t) { return t.id === input.teamId; })[0];
  need(team, 404, '小组不存在');
  const total = grading.scoreAgainstRubric(project.rubric, input.scores);
  need(total !== null, 400, '评分不完整');
  const record = repo.insertTeacherGrade({
    projectId: projectId,
    teamId: team.id,
    scores: input.scores,
    total: total,
    comment: input.comment,
    graderId: actor.id,
    gradedAt: new Date().toISOString()
  });
  audit.log({
    courseId: project.courseId, projectId: projectId, teamId: team.id,
    actorId: actor.id, action: 'grade_teacher', detail: String(total)
  });
  repo.save();
  return record;
}

function publish(actor, projectId) {
  const project = repo.findProject(projectId);
  need(project, 404, '项目不存在');
  const membership = courses.membershipOf(actor.id, project.courseId);
  need(policy.canGrade(membership), 403, '只有教师可以发布成绩');
  const data = computeGrades(projectId);
  need(data.teams.some(function (t) { return t.total !== null; }), 400, '暂无可用成绩');

  let published = 0;
  data.teams.forEach(function (team) {
    if (team.total === null) return;
    const old = repo.findGrade(projectId, team.teamId);
    repo.upsertGrade({
      projectId: projectId,
      teamId: team.teamId,
      total: team.total,
      members: team.members,
      published: true,
      publishedAt: new Date().toISOString(),
      frozen: old ? !!old.frozen : false
    });
    published++;
    audit.notify(team.members.map(function (m) { return m.userId; }), {
      type: 'grade', title: '成绩已发布', body: project.title + ' · ' + team.teamName,
      courseId: project.courseId, projectId: projectId
    });
  });
  audit.log({ courseId: project.courseId, projectId: projectId, actorId: actor.id, action: 'grade_publish', detail: published + ' 个小组' });
  repo.save();
  return { published: published };
}

function exportCsv(actor, projectId) {
  const project = repo.findProject(projectId);
  need(project, 404, '项目不存在');
  const membership = courses.membershipOf(actor.id, project.courseId);
  need(policy.canExport(membership), 403, '无权导出成绩');
  const data = computeGrades(projectId);
  const head = ['学号', '姓名', '队伍', '队内角色', '同伴互评分', '助教过程分', '教师评分', '团队总分', '贡献系数', '个人最终分', '成绩状态', '备注'];
  const rows = [];
  data.teams.forEach(function (team) {
    team.members.forEach(function (m) {
      rows.push([
        m.studentNo, m.name, team.teamName, m.teamRole === 'leader' ? '组长' : '组员',
        team.peer.score === null ? '' : team.peer.score,
        team.ta.score === null ? '' : team.ta.score,
        team.teacher.score === null ? '' : team.teacher.score,
        team.total === null ? '' : team.total,
        m.factor,
        m.final === null ? '' : m.final,
        team.frozen ? '申诉中（冻结）' : (team.published ? '已发布' : '未发布'),
        team.missing.length ? '缺：' + team.missing.join('/') : ''
      ]);
    });
  });
  const csv = [head.join(',')].concat(rows.map(function (row) {
    return row.map(function (value) {
      const text = String(value === undefined ? '' : value);
      return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }).join(',');
  })).join('\n');
  audit.log({ courseId: project.courseId, projectId: projectId, actorId: actor.id, action: 'grade_export', detail: rows.length + ' 行' });
  repo.save();
  return {
    raw: '\ufeff' + csv,
    contentType: 'text/csv; charset=utf-8',
    filename: encodeURIComponent(project.title + '_成绩汇总.csv')
  };
}

function myGrades(actor) {
  const teamIds = repo.teamsOfUser(actor.id);
  const allTeams = [];
  teamIds.forEach(function (teamId) {
    const team = repo.findTeamById(teamId);
    if (team) allTeams.push(team);
  });
  const seen = new Set();
  const out = [];
  allTeams.forEach(function (team) {
    if (seen.has(team.projectId)) return;
    seen.add(team.projectId);
    const data = computeGrades(team.projectId);
    const row = data.teams.filter(function (t) { return t.teamId === team.id; })[0];
    if (!row) return;
    const mine = row.members.filter(function (m) { return m.userId === actor.id; })[0];
    out.push({
      projectId: team.projectId,
      projectTitle: data.project.title,
      courseId: data.project.courseId,
      teamId: row.teamId,
      teamName: row.teamName,
      teamTotal: row.total,
      published: row.published,
      publishedAt: row.publishedAt,
      frozen: row.frozen,
      breakdown: { peer: row.peer.score, ta: row.ta.score, teacher: row.teacher.score },
      weights: row.weights,
      factor: mine ? mine.factor : 1,
      final: mine ? mine.final : null,
      missing: row.missing
    });
  });
  return out;
}

function createAppeal(actor, projectId, input) {
  const project = repo.findProject(projectId);
  need(project, 404, '项目不存在');
  const membership = courses.membershipOf(actor.id, project.courseId);
  const myTeamIds = repo.teamsOfUser(actor.id);
  const team = repo.listTeams(projectId).filter(function (t) { return myTeamIds.indexOf(t.id) >= 0; })[0];
  need(team, 400, '你还没有加入本项目的小组');
  need(policy.canAppeal(membership, true), 403, '只有学生可以申诉');
  const grade = repo.findGrade(projectId, team.id);
  need(grade && grade.published, 400, '成绩尚未发布');
  need(new Date(grade.publishedAt).getTime() + 7 * 86400000 >= Date.now(), 400, '已超过 7 天申诉窗口（BR-09）');
  need(!repo.findPendingAppeal(projectId, team.id), 400, '该组已有待处理的申诉');

  const appeal = repo.insertAppeal({
    projectId: projectId,
    teamId: team.id,
    studentId: actor.id,
    reason: input.reason,
    status: 'submitted',
    decision: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null
  });
  repo.updateGrade(grade.id, { frozen: true });
  audit.log({ courseId: project.courseId, projectId: projectId, teamId: team.id, actorId: actor.id, action: 'grade_publish', detail: '提交成绩申诉' });
  repo.save();
  return appeal;
}

function listAppeals(actor, projectId) {
  const project = repo.findProject(projectId);
  need(project, 404, '项目不存在');
  const membership = courses.membershipOf(actor.id, project.courseId);
  need(policy.canView(membership), 403, '你不是该课程成员');
  let list = repo.listAppeals(projectId);
  if (membership.role === 'student') {
    const mine = repo.teamsOfUser(actor.id);
    list = list.filter(function (a) { return mine.indexOf(a.teamId) >= 0; });
  }
  return list.map(function (a) {
    const team = repo.listTeams(projectId).filter(function (t) { return t.id === a.teamId; })[0];
    return Object.assign({}, a, { teamName: team ? team.name : a.teamId });
  });
}

function resolveAppeal(actor, appealId, input) {
  const appeal = repo.findAppealById(appealId);
  need(appeal, 404, '申诉不存在');
  const project = repo.findProject(appeal.projectId);
  const membership = courses.membershipOf(actor.id, project.courseId);
  need(policy.canGrade(membership), 403, '只有教师可以处理申诉');
  need(appeal.status === 'submitted', 400, '该申诉已处理');
  repo.updateAppeal(appealId, {
    status: 'resolved',
    decision: input.decision,
    teacherComment: input.comment,
    resolvedAt: new Date().toISOString(),
    resolvedBy: actor.id
  });
  const grade = repo.findGrade(appeal.projectId, appeal.teamId);
  if (grade) repo.updateGrade(grade.id, { frozen: false });
  audit.log({
    courseId: project.courseId, projectId: project.id, teamId: appeal.teamId,
    actorId: actor.id, action: 'grade_publish',
    detail: input.decision === 'adjust' ? '申诉调整为重新评分' : '申诉维持原成绩'
  });
  repo.save();
  return { ok: true };
}

module.exports = {
  computeGrades: computeGrades,
  summary: summary,
  teacherGrade: teacherGrade,
  publish: publish,
  exportCsv: exportCsv,
  myGrades: myGrades,
  createAppeal: createAppeal,
  listAppeals: listAppeals,
  resolveAppeal: resolveAppeal
};
