'use strict';
/**
 * 高校课程协作与评审平台 —— REST API（零依赖）
 * 业务规则编号与《需求规格说明书 v2.0》一致。
 */
const store = require('./store');
const auth = require('./auth');
const act = require('./activity');
const grades = require('./grades');

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function need(cond, status, message) { if (!cond) throw new ApiError(status, message); }
const now = () => new Date().toISOString();
const dayMs = 86400000;

function userBrief(id) {
  const u = store.find('users', id);
  return u ? { id: u.id, name: u.name, username: u.username, role: u.role, studentNo: u.studentNo || '' } : null;
}

function membership(userId, courseId) {
  return store.first('members', (m) => m.userId === userId && m.courseId === courseId) || null;
}

function requireMembership(ctx, courseId, roles) {
  const m = membership(ctx.user.id, courseId);
  need(m, 403, '你不是该课程成员');
  if (roles) need(roles.includes(m.role), 403, '当前角色无权执行该操作');
  return m;
}

function courseView(c) {
  return Object.assign({}, c, {
    teacherName: (userBrief(c.teacherId) || {}).name || '',
    memberCount: store.where('members', (m) => m.courseId === c.id).length,
    projectCount: store.where('projects', (p) => p.courseId === c.id).length
  });
}

function projectView(p) {
  const its = store.where('iterations', (i) => i.projectId === p.id).sort((a, b) => a.seq - b.seq);
  const teams = store.where('teams', (t) => t.projectId === p.id);
  return Object.assign({}, p, {
    iterations: its,
    teamCount: teams.length,
    memberCount: teams.reduce((n, t) => n + store.where('teamMembers', (m) => m.teamId === t.id && m.active !== false).length, 0)
  });
}

function teamView(t) {
  const members = store.where('teamMembers', (m) => m.teamId === t.id && m.active !== false)
    .map((m) => Object.assign({}, userBrief(m.userId), { teamRole: m.role, joinedAt: m.joinedAt }));
  const its = store.where('iterations', (i) => i.projectId === t.projectId).sort((a, b) => a.seq - b.seq);
  const subs = store.where('submissions', (s) => s.teamId === t.id);
  return Object.assign({}, t, {
    members,
    memberCount: members.length,
    iterations: its.map((it) => {
      const st = store.first('teamIterations', (r) => r.teamId === t.id && r.iterationId === it.id);
      const list = subs.filter((s) => s.iterationId === it.id).sort((a, b) => b.version - a.version);
      const latest = list[0] || null;
      return {
        id: it.id, seq: it.seq, name: it.name, dueDate: it.dueDate, deliverables: it.deliverables,
        status: st ? st.status : (list.length ? 'done' : 'not_started'),
        note: st ? st.note : (list.length ? '有提交记录，自动标记为已完成' : ''),
        submissionCount: list.length,
        latest: latest ? { id: latest.id, version: latest.version, title: latest.title, submittedAt: latest.submittedAt } : null,
        overdue: !latest && new Date(it.dueDate) < new Date()
      };
    })
  });
}

/* ---------------------------------------------------------------- 路由表 */
const routes = [];

function route(method, pattern, handler, publicRoute) {
  const keys = [];
  const source = '^' + pattern.replace(/:[a-zA-Z]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '/?$';
  routes.push({ method, re: new RegExp(source), keys, handler, publicRoute: !!publicRoute });
}

const get = (p, h, pub) => route('GET', p, h, pub);
const post = (p, h, pub) => route('POST', p, h, pub);
const del = (p, h) => route('DELETE', p, h);

/* ------------------------------------------------------------------ 认证 */
post('/api/login', (ctx) => {
  const user = store.first('users', (u) => u.username === ctx.body.username);
  need(user && auth.verifyPassword(ctx.body.password, user.password), 401, '账号或密码错误');
  const token = auth.issueToken(user.id);
  const memberships = store.where('members', (m) => m.userId === user.id).map((m) => {
    const c = store.find('courses', m.courseId);
    return { courseId: m.courseId, role: m.role, courseName: c ? c.name : '', courseCode: c ? c.code : '' };
  });
  return { token, user: auth.publicUser(user), memberships };
}, true);

post('/api/logout', (ctx) => { auth.revokeToken(ctx.token); return { ok: true }; });
get('/api/me', (ctx) => ({ user: auth.publicUser(ctx.user) }));

/* ------------------------------------------------------------------ 仪表盘 */
get('/api/dashboard', (ctx) => {
  const u = ctx.user;
  const ms = store.where('members', (m) => m.userId === u.id);
  const courseIds = ms.map((m) => m.courseId);
  const projects = store.where('projects', (p) => courseIds.includes(p.courseId) && p.status === 'published');
  const out = { role: u.role, courses: ms.length, projects: projects.length };
  if (u.role === 'teacher') {
    const teamIds = store.where('teams', (t) => projects.some((p) => p.id === t.projectId)).map((t) => t.id);
    out.teams = teamIds.length;
    out.pendingGrades = teamIds.filter((id) => !store.first('teacherGrades', (g) => g.teamId === id)).length;
    out.recentLogs = store.where('logs', (l) => courseIds.includes(l.courseId)).slice(-8).reverse();
  } else if (u.role === 'ta') {
    const teams = store.where('teams', (t) => t.taId === u.id);
    out.teams = teams.length;
    out.checks = store.where('checks', (c) => c.checkerId === u.id).length;
    out.recentLogs = store.where('logs', (l) => courseIds.includes(l.courseId)).slice(-8).reverse();
  } else {
    const tm = store.where('teamMembers', (m) => m.userId === u.id && m.active !== false);
    out.teams = tm.length;
    out.todoReviews = store.where('assignments', (a) => a.status === 'pending'
      && tm.some((m) => m.teamId === a.reviewerTeamId)).length;
    out.myGrades = grades.gradesForStudent(u.id);
    const myTeamIds = tm.map((m) => m.teamId);
    out.recentLogs = store.where('logs', (l) => courseIds.includes(l.courseId)
      && (!l.teamId || myTeamIds.includes(l.teamId))).slice(-8).reverse();
  }
  out.unread = store.where('notifications', (n) => n.userId === u.id && !n.read).length;
  return out;
});

/* -------------------------------------------------------------------- 课程 */
get('/api/courses', (ctx) => {
  const ids = store.where('members', (m) => m.userId === ctx.user.id).map((m) => m.courseId);
  return store.where('courses', (c) => ids.includes(c.id)).map(courseView);
});

post('/api/courses', (ctx) => {
  need(ctx.user.role === 'teacher' || ctx.user.role === 'admin', 403, '只有教师可以创建课程');
  const b = ctx.body;
  need(b.code && b.name, 400, '课程编号与名称必填');
  need(!store.first('courses', (c) => c.code === b.code), 400, '课程编号已存在');
  const c = store.insert('courses', {
    code: b.code, name: b.name, term: b.term || '2026 秋', description: b.description || '',
    teacherId: ctx.user.id, inviteCode: 'SE' + Math.random().toString(36).slice(2, 6).toUpperCase(), status: 'active'
  });
  store.insert('members', { courseId: c.id, userId: ctx.user.id, role: 'teacher', joinedAt: now() });
  act.log({ courseId: c.id, actorId: ctx.user.id, action: 'course_create', detail: b.name });
  store.save();
  return courseView(c);
});

post('/api/courses/:id/join', (ctx) => {
  const c = store.find('courses', ctx.params.id);
  need(c, 404, '课程不存在');
  need(ctx.body.inviteCode === c.inviteCode, 400, '邀请码错误');
  need(!membership(ctx.user.id, c.id), 400, '你已加入该课程');
  store.insert('members', { courseId: c.id, userId: ctx.user.id, role: 'student', joinedAt: now() });
  act.log({ courseId: c.id, actorId: ctx.user.id, action: 'course_join', detail: ctx.user.name });
  store.save();
  return { ok: true };
});

get('/api/courses/:id', (ctx) => {
  const c = store.find('courses', ctx.params.id);
  need(c, 404, '课程不存在');
  const m = requireMembership(ctx, c.id);
  return {
    course: courseView(c),
    role: m.role,
    members: store.where('members', (x) => x.courseId === c.id).map((x) => Object.assign({}, userBrief(x.userId), { role: x.role })),
    projects: store.where('projects', (p) => p.courseId === c.id).map(projectView)
  };
});

post('/api/courses/:id/members', (ctx) => {
  const c = store.find('courses', ctx.params.id);
  need(c, 404, '课程不存在');
  requireMembership(ctx, c.id, ['teacher', 'admin']);
  const u = store.first('users', (x) => x.username === ctx.body.identifier || x.studentNo === ctx.body.identifier);
  need(u, 404, '未找到该账号');
  need(!membership(u.id, c.id), 400, '该用户已是课程成员');
  store.insert('members', { courseId: c.id, userId: u.id, role: ctx.body.role || 'student', joinedAt: now() });
  act.log({ courseId: c.id, actorId: ctx.user.id, action: 'member_add', detail: u.name });
  store.save();
  return { ok: true };
});

/* ---------------------------------------------------------------- 项目任务 */
get('/api/courses/:id/projects', (ctx) => {
  const c = store.find('courses', ctx.params.id);
  need(c, 404, '课程不存在');
  const m = requireMembership(ctx, c.id);
  return store.where('projects', (p) => p.courseId === c.id
    && (m.role === 'student' ? p.status === 'published' : true)).map(projectView);
});

post('/api/projects', (ctx) => {
  const b = ctx.body;
  const c = store.find('courses', b.courseId);
  need(c, 404, '课程不存在');
  requireMembership(ctx, b.courseId, ['teacher', 'admin']);
  need(b.title, 400, '项目标题必填');
  const p = store.insert('projects', {
    courseId: b.courseId,
    title: b.title,
    description: b.description || '',
    requirements: b.requirements || [],
    status: 'draft',
    startDate: b.startDate || now().slice(0, 10),
    dueDate: b.dueDate || new Date(Date.now() + 30 * dayMs).toISOString().slice(0, 10),
    teamMin: Number(b.teamMin) || 3,
    teamMax: Number(b.teamMax) || 5,
    weights: b.weights || { peer: 20, ta: 20, teacher: 60 },
    rubric: b.rubric || [
      { id: 'r1', name: '功能完成度', max: 10, weight: 40 },
      { id: 'r2', name: '工程质量', max: 10, weight: 30 },
      { id: 'r3', name: '文档与演示', max: 10, weight: 20 },
      { id: 'r4', name: '过程规范', max: 10, weight: 10 }
    ],
    internalRubric: b.internalRubric || [
      { id: 'i1', name: '贡献', max: 10, weight: 50 },
      { id: 'i2', name: '沟通配合', max: 10, weight: 25 },
      { id: 'i3', name: '产出质量', max: 10, weight: 25 }
    ],
    review: b.review || { crossTeam: true, internal: true, anonymous: true, reviewersPerSubmission: 3 },
    createdBy: ctx.user.id
  });
  act.log({ courseId: b.courseId, projectId: p.id, actorId: ctx.user.id, action: 'project_create', detail: b.title });
  store.save();
  return projectView(p);
});

get('/api/projects/:id', (ctx) => {
  const p = store.find('projects', ctx.params.id);
  need(p, 404, '项目不存在');
  const m = requireMembership(ctx, p.courseId);
  const teams = store.where('teams', (t) => t.projectId === p.id);
  const mine = store.first('teamMembers', (tm) => tm.userId === ctx.user.id && tm.active !== false
    && teams.some((t) => t.id === tm.teamId));
  return {
    project: projectView(p),
    role: m.role,
    myTeamId: mine ? mine.teamId : null,
    teams: teams.map(teamView)
  };
});

post('/api/projects/:id/publish', (ctx) => {
  const p = store.find('projects', ctx.params.id);
  need(p, 404, '项目不存在');
  requireMembership(ctx, p.courseId, ['teacher', 'admin']);
  need(store.where('iterations', (i) => i.projectId === p.id).length > 0, 400, '请先设置至少一个迭代阶段');
  store.update('projects', p.id, { status: 'published', publishedAt: now() });
  act.log({ courseId: p.courseId, projectId: p.id, actorId: ctx.user.id, action: 'project_publish', detail: p.title });
  const ids = store.where('members', (m) => m.courseId === p.courseId && m.role === 'student').map((m) => m.userId);
  act.notify(ids, { type: 'project', title: '新项目任务已发布', body: p.title, courseId: p.courseId, projectId: p.id });
  store.save();
  return projectView(store.find('projects', p.id));
});

post('/api/projects/:id/iterations', (ctx) => {
  const p = store.find('projects', ctx.params.id);
  need(p, 404, '项目不存在');
  requireMembership(ctx, p.courseId, ['teacher', 'admin']);
  const b = ctx.body;
  need(b.name && b.dueDate, 400, '阶段名称与截止时间必填');
  const seq = store.where('iterations', (i) => i.projectId === p.id).length + 1;
  const it = store.insert('iterations', {
    projectId: p.id, seq, name: b.name, goal: b.goal || '',
    startDate: b.startDate || p.startDate, dueDate: b.dueDate,
    deliverables: b.deliverables || [], status: 'open'
  });
  act.log({ courseId: p.courseId, projectId: p.id, actorId: ctx.user.id, action: 'iteration_create', detail: b.name });
  store.save();
  return it;
});

/* -------------------------------------------------------------------- 小组 */
get('/api/projects/:id/teams', (ctx) => {
  const p = store.find('projects', ctx.params.id);
  need(p, 404, '项目不存在');
  requireMembership(ctx, p.courseId);
  return store.where('teams', (t) => t.projectId === p.id).map(teamView);
});

post('/api/projects/:id/teams', (ctx) => {
  const p = store.find('projects', ctx.params.id);
  need(p, 404, '项目不存在');
  requireMembership(ctx, p.courseId, ['student']);
  const name = String(ctx.body.name || '').trim();
  need(name, 400, '小组名称必填');
  need(!store.first('teams', (t) => t.projectId === p.id && t.name === name), 400, '小组名称重复');
  const mine = store.where('teamMembers', (tm) => tm.userId === ctx.user.id && tm.active !== false)
    .map((tm) => store.find('teams', tm.teamId)).filter((t) => t && t.projectId === p.id);
  need(mine.length === 0, 400, '你已加入本项目的一个小组');
  const t = store.insert('teams', {
    projectId: p.id, courseId: p.courseId, name, leaderId: ctx.user.id,
    taId: null, openJoin: true, status: 'forming'
  });
  store.insert('teamMembers', { teamId: t.id, userId: ctx.user.id, role: 'leader', joinedAt: now(), active: true });
  act.log({ courseId: p.courseId, projectId: p.id, teamId: t.id, actorId: ctx.user.id, action: 'team_create', detail: name });
  store.save();
  return teamView(t);
});

post('/api/teams/:id/join', (ctx) => {
  const t = store.find('teams', ctx.params.id);
  need(t, 404, '小组不存在');
  const p = store.find('projects', t.projectId);
  requireMembership(ctx, p.courseId, ['student']);
  need(t.openJoin !== false, 400, '该小组已关闭加入');
  const count = store.where('teamMembers', (m) => m.teamId === t.id && m.active !== false).length;
  need(count < p.teamMax, 400, '小组人数已达上限（' + p.teamMax + ' 人）');
  need(!store.first('teamMembers', (m) => m.teamId === t.id && m.userId === ctx.user.id && m.active !== false), 400, '你已在该小组');
  store.insert('teamMembers', { teamId: t.id, userId: ctx.user.id, role: 'member', joinedAt: now(), active: true });
  act.log({ courseId: p.courseId, projectId: p.id, teamId: t.id, actorId: ctx.user.id, action: 'team_join', detail: ctx.user.name });
  if (t.leaderId) act.notify([t.leaderId], { type: 'team', title: '有同学加入你的小组', body: ctx.user.name, courseId: p.courseId });
  store.save();
  return teamView(t);
});

get('/api/teams/:id', (ctx) => {
  const t = store.find('teams', ctx.params.id);
  need(t, 404, '小组不存在');
  const p = store.find('projects', t.projectId);
  const m = requireMembership(ctx, p.courseId);
  const isMember = !!store.first('teamMembers', (tm) => tm.teamId === t.id && tm.userId === ctx.user.id && tm.active !== false);
  if (m.role === 'student' && !isMember) {
    const allowed = store.where('assignments', (a) => a.reviewerTeamId
      && store.where('teamMembers', (tm) => tm.teamId === a.reviewerTeamId && tm.userId === ctx.user.id && tm.active !== false).length
      && store.where('submissions', (s) => s.id === a.submissionId && s.teamId === t.id).length);
    need(allowed.length > 0, 403, '无权查看其他小组（BR-01）');
  }
  return { team: teamView(t), role: m.role, isMember };
});

post('/api/teams/:id/progress', (ctx) => {
  const t = store.find('teams', ctx.params.id);
  need(t, 404, '小组不存在');
  const p = store.find('projects', t.projectId);
  const m = requireMembership(ctx, p.courseId);
  const isMember = !!store.first('teamMembers', (tm) => tm.teamId === t.id && tm.userId === ctx.user.id && tm.active !== false);
  need(isMember || m.role === 'teacher' || m.role === 'ta', 403, '无权更新该小组进度');
  need(['not_started', 'in_progress', 'done', 'blocked'].includes(ctx.body.status), 400, '进度状态非法');
  const old = store.first('teamIterations', (x) => x.teamId === t.id && x.iterationId === ctx.body.iterationId);
  if (old) store.update('teamIterations', old.id, { status: ctx.body.status, note: ctx.body.note || '' });
  else store.insert('teamIterations', { teamId: t.id, iterationId: ctx.body.iterationId, status: ctx.body.status, note: ctx.body.note || '' });
  act.log({ courseId: p.courseId, projectId: p.id, teamId: t.id, actorId: ctx.user.id, action: 'team_progress', detail: ctx.body.status });
  store.save();
  return teamView(t);
});

del('/api/teams/:id/members/:userId', (ctx) => {
  const t = store.find('teams', ctx.params.id);
  need(t, 404, '小组不存在');
  const p = store.find('projects', t.projectId);
  const m = requireMembership(ctx, p.courseId);
  const self = ctx.params.userId === ctx.user.id;
  need(t.leaderId === ctx.user.id || self || m.role === 'teacher', 403, '无权移除该成员');
  need(ctx.params.userId !== t.leaderId || m.role === 'teacher', 400, '组长需先移交后才能退出');
  const tm = store.first('teamMembers', (x) => x.teamId === t.id && x.userId === ctx.params.userId && x.active !== false);
  need(tm, 404, '成员不存在');
  store.update('teamMembers', tm.id, { active: false, leftAt: now(), reason: ctx.body && ctx.body.reason || (self ? '主动退出' : '组长移除') });
  act.log({ courseId: p.courseId, projectId: p.id, teamId: t.id, actorId: ctx.user.id, action: 'team_remove_member', detail: (userBrief(ctx.params.userId) || {}).name || ctx.params.userId });
  store.save();
  return teamView(t);
});

/* ---------------------------------------------------------------- 组长移交 */
function evaluateTransfer(tr) {
  const t = store.find('teams', tr.teamId);
  const members = store.where('teamMembers', (x) => x.teamId === t.id && x.active !== false);
  const required = Math.floor(members.length / 2) + 1;
  if (tr.status === 'collecting' && tr.votes.length >= required) {
    store.update('transfers', tr.id, { status: 'pending_teacher', requiredVotes: required });
    const p = store.find('projects', t.projectId);
    const course = store.find('courses', p.courseId);
    if (course) {
      act.notify([course.teacherId], {
        type: 'transfer', title: '组长移交待确认',
        body: t.name + ' 已达到 ' + required + ' 票，请教师确认',
        courseId: course.id, projectId: p.id
      });
    }
    return store.find('transfers', tr.id);
  }
  return tr;
}

/** V-08：组内半数以上成员发起/同意，教师确认后生效。 */
post('/api/teams/:id/leader-transfer', (ctx) => {
  const t = store.find('teams', ctx.params.id);
  need(t, 404, '小组不存在');
  const p = store.find('projects', t.projectId);
  requireMembership(ctx, p.courseId, ['student']);
  const members = store.where('teamMembers', (x) => x.teamId === t.id && x.active !== false);
  need(members.some((x) => x.userId === ctx.user.id), 403, '你不是该组成员');
  need(ctx.body.targetUserId && ctx.body.targetUserId !== t.leaderId, 400, '请选择组长之外的成员');
  need(members.some((x) => x.userId === ctx.body.targetUserId), 400, '目标成员不在本组');
  need(!store.first('transfers', (x) => x.teamId === t.id && ['collecting', 'pending_teacher'].includes(x.status)), 400, '已有进行中的移交申请');
  let tr = store.insert('transfers', {
    teamId: t.id, projectId: p.id, fromLeaderId: t.leaderId, toUserId: ctx.body.targetUserId,
    initiatorId: ctx.user.id, votes: [ctx.user.id], status: 'collecting',
    reason: ctx.body.reason || '', createdAt: now()
  });
  tr = evaluateTransfer(tr);
  act.log({ courseId: p.courseId, projectId: p.id, teamId: t.id, actorId: ctx.user.id, action: 'team_progress', detail: '发起组长移交' });
  store.save();
  return tr;
});

post('/api/transfers/:id/vote', (ctx) => {
  let tr = store.find('transfers', ctx.params.id);
  need(tr, 404, '移交申请不存在');
  const t = store.find('teams', tr.teamId);
  const p = store.find('projects', t.projectId);
  requireMembership(ctx, p.courseId, ['student']);
  need(store.first('teamMembers', (x) => x.teamId === t.id && x.userId === ctx.user.id && x.active !== false), 403, '你不是该组成员');
  need(tr.status === 'collecting', 400, '该申请已进入教师确认或已结束');
  if (!tr.votes.includes(ctx.user.id)) tr = store.update('transfers', tr.id, { votes: tr.votes.concat([ctx.user.id]) });
  tr = evaluateTransfer(tr);
  store.save();
  return tr;
});

get('/api/projects/:id/transfers', (ctx) => {
  const p = store.find('projects', ctx.params.id);
  need(p, 404, '项目不存在');
  const m = requireMembership(ctx, p.courseId);
  let list = store.where('transfers', (x) => x.projectId === p.id);
  if (m.role === 'student') {
    const myTeams = store.where('teamMembers', (x) => x.userId === ctx.user.id && x.active !== false).map((x) => x.teamId);
    list = list.filter((x) => myTeams.includes(x.teamId));
  }
  return list.map((x) => Object.assign({}, x, {
    teamName: (store.find('teams', x.teamId) || {}).name || '',
    toName: (userBrief(x.toUserId) || {}).name || '',
    fromName: (userBrief(x.fromLeaderId) || {}).name || ''
  }));
});

post('/api/transfers/:id/confirm', (ctx) => {
  const tr = store.find('transfers', ctx.params.id);
  need(tr, 404, '移交申请不存在');
  const t = store.find('teams', tr.teamId);
  const p = store.find('projects', t.projectId);
  requireMembership(ctx, p.courseId, ['teacher', 'admin']);
  need(tr.status === 'pending_teacher', 400, '该申请尚未达到表决门槛');
  store.update('teams', t.id, { leaderId: tr.toUserId });
  store.where('teamMembers', (x) => x.teamId === t.id && x.active !== false).forEach((x) => {
    store.update('teamMembers', x.id, { role: x.userId === tr.toUserId ? 'leader' : 'member' });
  });
  store.update('transfers', tr.id, { status: 'approved', decidedAt: now(), decidedBy: ctx.user.id });
  act.log({ courseId: p.courseId, projectId: p.id, teamId: t.id, actorId: ctx.user.id, action: 'team_update', detail: '组长移交生效：' + ((userBrief(tr.toUserId) || {}).name || '') });
  act.notify(store.where('teamMembers', (x) => x.teamId === t.id && x.active !== false).map((x) => x.userId), {
    type: 'transfer', title: '组长移交已生效', body: (userBrief(tr.toUserId) || {}).name + ' 成为新组长', courseId: p.courseId, projectId: p.id
  });
  store.save();
  return teamView(store.find('teams', t.id));
});

post('/api/transfers/:id/reject', (ctx) => {
  const tr = store.find('transfers', ctx.params.id);
  need(tr, 404, '移交申请不存在');
  const t = store.find('teams', tr.teamId);
  const p = store.find('projects', t.projectId);
  requireMembership(ctx, p.courseId, ['teacher', 'admin']);
  store.update('transfers', tr.id, { status: 'rejected', decidedAt: now(), decidedBy: ctx.user.id });
  act.log({ courseId: p.courseId, projectId: p.id, teamId: t.id, actorId: ctx.user.id, action: 'team_update', detail: '驳回组长移交' });
  store.save();
  return { ok: true };
});

/* ---------------------------------------------------------------- 成绩申诉 */
post('/api/projects/:id/appeals', (ctx) => {
  const p = store.find('projects', ctx.params.id);
  need(p, 404, '项目不存在');
  const m = requireMembership(ctx, p.courseId, ['student']);
  const myTeams = store.where('teamMembers', (x) => x.userId === ctx.user.id && x.active !== false).map((x) => x.teamId);
  const team = store.first('teams', (t) => myTeams.includes(t.id) && t.projectId === p.id);
  need(team, 400, '你还没有加入本项目的小组');
  const grade = store.first('grades', (g) => g.projectId === p.id && g.teamId === team.id);
  need(grade && grade.published, 400, '成绩尚未发布');
  need(new Date(grade.publishedAt).getTime() + 7 * dayMs >= Date.now(), 400, '已超过 7 天申诉窗口（BR-09）');
  need(!store.first('appeals', (a) => a.teamId === team.id && a.projectId === p.id && a.status === 'submitted'), 400, '该组已有待处理的申诉');
  need(ctx.body.reason, 400, '请填写申诉理由');
  const a = store.insert('appeals', {
    projectId: p.id, teamId: team.id, studentId: ctx.user.id,
    reason: ctx.body.reason, status: 'submitted', decision: null,
    createdAt: now(), resolvedAt: null
  });
  store.update('grades', grade.id, { frozen: true });
  const course = store.find('courses', p.courseId);
  if (course) act.notify([course.teacherId], { type: 'appeal', title: '收到成绩申诉', body: team.name + '：' + ctx.body.reason.slice(0, 40), courseId: p.courseId, projectId: p.id });
  act.log({ courseId: p.courseId, projectId: p.id, teamId: team.id, actorId: ctx.user.id, action: 'grade_publish', detail: '提交成绩申诉' });
  store.save();
  return a;
});

get('/api/projects/:id/appeals', (ctx) => {
  const p = store.find('projects', ctx.params.id);
  need(p, 404, '项目不存在');
  const m = requireMembership(ctx, p.courseId);
  let list = store.where('appeals', (a) => a.projectId === p.id);
  if (m.role === 'student') {
    const myTeams = store.where('teamMembers', (x) => x.userId === ctx.user.id && x.active !== false).map((x) => x.teamId);
    list = list.filter((a) => myTeams.includes(a.teamId));
  }
  return list.map((a) => Object.assign({}, a, {
    teamName: (store.find('teams', a.teamId) || {}).name || '',
    studentName: (userBrief(a.studentId) || {}).name || ''
  }));
});

post('/api/appeals/:id/resolve', (ctx) => {
  const a = store.find('appeals', ctx.params.id);
  need(a, 404, '申诉不存在');
  const p = store.find('projects', a.projectId);
  requireMembership(ctx, p.courseId, ['teacher', 'admin']);
  need(a.status === 'submitted', 400, '该申诉已处理');
  need(['keep', 'adjust'].includes(ctx.body.decision), 400, '请选择处理结果');
  store.update('appeals', a.id, {
    status: 'resolved', decision: ctx.body.decision,
    teacherComment: ctx.body.comment || '', resolvedAt: now(), resolvedBy: ctx.user.id
  });
  const g = store.first('grades', (x) => x.projectId === a.projectId && x.teamId === a.teamId);
  if (g) store.update('grades', g.id, { frozen: false });
  act.log({ courseId: p.courseId, projectId: p.id, teamId: a.teamId, actorId: ctx.user.id, action: 'grade_publish', detail: ctx.body.decision === 'adjust' ? '申诉调整为重新评分' : '申诉维持原成绩' });
  store.save();
  return { ok: true };
});

/* ---------------------------------------------------------------- 成果提交 */
post('/api/submissions', (ctx) => {
  const t = store.find('teams', ctx.body.teamId);
  need(t, 404, '小组不存在');
  const p = store.find('projects', t.projectId);
  const m = requireMembership(ctx, p.courseId);
  need(m.role !== 'student' || t.leaderId === ctx.user.id, 403, '仅组长可正式提交成果（BR-12）');
  const it = store.find('iterations', ctx.body.iterationId);
  need(it && it.projectId === p.id, 404, '迭代阶段不存在');
  need(new Date(it.dueDate) >= new Date(), 400, '迭代已截止，提交被拒绝（ST-09），状态保持已锁定');
  need(ctx.body.title, 400, '成果标题必填');
  const old = store.where('submissions', (s) => s.teamId === t.id && s.iterationId === it.id);
  const s = store.insert('submissions', {
    teamId: t.id, iterationId: it.id, projectId: p.id,
    title: ctx.body.title, summary: ctx.body.summary || '',
    repoUrl: ctx.body.repoUrl || '', attachmentUrl: ctx.body.attachmentUrl || '',
    version: old.length + 1, status: 'submitted',
    submittedById: ctx.user.id, submittedAt: now()
  });
  act.log({ courseId: p.courseId, projectId: p.id, teamId: t.id, actorId: ctx.user.id,
    action: 'submission_create', detail: 'v' + s.version + ' ' + s.title });
  store.save();
  return s;
});

get('/api/submissions', (ctx) => {
  const list = store.where('submissions', (s) => !ctx.query.teamId || s.teamId === ctx.query.teamId);
  return list.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
});

/**
 * 项目下全部提交物（教师 / 助教查看；学生只能看到本组）。
 * 对应 FR-4.6：教师与助教可查看提交物列表、版本与提交时间。
 */
get('/api/projects/:id/submissions', (ctx) => {
  const p = store.find('projects', ctx.params.id);
  need(p, 404, '项目不存在');
  const m = requireMembership(ctx, p.courseId);
  let list = store.where('submissions', (s) => s.projectId === p.id);
  if (m.role === 'student') {
    const myTeams = store.where('teamMembers', (tm) => tm.userId === ctx.user.id && tm.active !== false).map((tm) => tm.teamId);
    list = list.filter((s) => myTeams.includes(s.teamId));
  }
  return list.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt))).map((s) => {
    const t = store.find('teams', s.teamId);
    const it = store.find('iterations', s.iterationId);
    return Object.assign({}, s, {
      teamName: t ? t.name : s.teamId,
      iterationName: it ? it.name : '',
      iterationSeq: it ? it.seq : '',
      submitterName: (userBrief(s.submittedById) || {}).name || ''
    });
  });
});

/* ---------------------------------------------------------------- 互评分配 */
post('/api/projects/:id/assign-reviews', (ctx) => {
  const p = store.find('projects', ctx.params.id);
  need(p, 404, '项目不存在');
  requireMembership(ctx, p.courseId, ['teacher', 'admin']);
  const teams = store.where('teams', (t) => t.projectId === p.id);
  need(teams.length >= 2, 400, '至少需要 2 个小组才能分配互评');
  const per = Math.min(Number(ctx.body.reviewersPerSubmission) || 3, teams.length - 1);
  let created = 0;
  for (const s of store.where('submissions', (x) => x.projectId === p.id)) {
    for (const t of teams.filter((x) => x.id !== s.teamId).slice(0, per)) {
      if (store.first('assignments', (a) => a.submissionId === s.id && a.reviewerTeamId === t.id)) continue;
      store.insert('assignments', {
        projectId: p.id, submissionId: s.id, reviewerTeamId: t.id,
        assignedById: ctx.user.id, assignedAt: now(), status: 'pending',
        dueDate: ctx.body.dueDate || new Date(Date.now() + 5 * dayMs).toISOString()
      });
      created++;
    }
  }
  act.log({ courseId: p.courseId, projectId: p.id, actorId: ctx.user.id, action: 'review_assign', detail: created + ' 个任务' });
  store.save();
  return { created, reviewersPerSubmission: per, teams: teams.length };
});

get('/api/reviews/todo', (ctx) => {
  const myTeams = store.where('teamMembers', (m) => m.userId === ctx.user.id && m.active !== false).map((m) => m.teamId);
  return store.where('assignments', (a) => a.status === 'pending' && myTeams.includes(a.reviewerTeamId)).map((a) => {
    const s = store.find('submissions', a.submissionId);
    const t = s ? store.find('teams', s.teamId) : null;
    const p = store.find('projects', a.projectId);
    return {
      id: a.id, status: a.status, dueDate: a.dueDate,
      submission: s ? { id: s.id, title: s.title, version: s.version, summary: s.summary, repoUrl: s.repoUrl } : null,
      targetTeam: t ? t.name : '',
      rubric: p ? p.rubric : []
    };
  });
});

post('/api/assignments/:id/review', (ctx) => {
  const a = store.find('assignments', ctx.params.id);
  need(a, 404, '评审任务不存在');
  const myTeams = store.where('teamMembers', (m) => m.userId === ctx.user.id && m.active !== false).map((m) => m.teamId);
  need(myTeams.includes(a.reviewerTeamId), 403, '该任务不属于你的小组');
  need(a.status === 'pending', 400, '任务已完成或已逾期');
  need(!a.dueDate || new Date(a.dueDate) >= new Date(), 400, '已超过评审截止时间，状态保持待评审（ST-05）');
  const p = store.find('projects', a.projectId);
  const total = grades.scoreAgainstRubric(p.rubric, ctx.body.scores);
  need(total !== null, 400, '评分不完整');
  const r = store.insert('reviews', {
    type: 'cross', assignmentId: a.id, submissionId: a.submissionId, projectId: a.projectId,
    reviewerTeamId: a.reviewerTeamId, reviewerId: ctx.user.id,
    scores: ctx.body.scores, total, comment: ctx.body.comment || '',
    anonymous: true, submittedAt: now()
  });
  store.update('assignments', a.id, { status: 'submitted', submittedAt: now() });
  act.log({ courseId: p.courseId, projectId: p.id, teamId: a.reviewerTeamId, actorId: ctx.user.id,
    action: 'review_submit', detail: '得分 ' + total });
  store.save();
  return r;
});

post('/api/teams/:id/internal-reviews', (ctx) => {
  const t = store.find('teams', ctx.params.id);
  need(t, 404, '小组不存在');
  const p = store.find('projects', t.projectId);
  requireMembership(ctx, p.courseId, ['student']);
  need(store.first('teamMembers', (m) => m.teamId === t.id && m.userId === ctx.user.id && m.active !== false), 403, '你不是该组成员');
  need(ctx.body.targetUserId && ctx.body.targetUserId !== ctx.user.id, 400, '不能评价自己（BR-19）');
  need(store.first('teamMembers', (m) => m.teamId === t.id && m.userId === ctx.body.targetUserId && m.active !== false), 400, '被评人不在本组');
  const total = grades.scoreAgainstRubric(p.internalRubric, ctx.body.scores);
  need(total !== null, 400, '评分不完整');
  const old = store.first('reviews', (r) => r.type === 'internal' && r.teamId === t.id
    && r.reviewerId === ctx.user.id && r.targetUserId === ctx.body.targetUserId);
  if (old) store.update('reviews', old.id, { scores: ctx.body.scores, total, comment: ctx.body.comment || '' });
  else store.insert('reviews', {
    type: 'internal', teamId: t.id, projectId: p.id, reviewerId: ctx.user.id,
    targetUserId: ctx.body.targetUserId, scores: ctx.body.scores, total,
    comment: ctx.body.comment || '', anonymous: true, submittedAt: now()
  });
  act.log({ courseId: p.courseId, projectId: p.id, teamId: t.id, actorId: ctx.user.id,
    action: 'internal_review_submit', detail: (userBrief(ctx.body.targetUserId) || {}).name || '' });
  store.save();
  return { ok: true };
});

/* -------------------------------------------------------------- 过程检查 */
post('/api/checks', (ctx) => {
  const t = store.find('teams', ctx.body.teamId);
  need(t, 404, '小组不存在');
  const p = store.find('projects', t.projectId);
  const m = requireMembership(ctx, p.courseId, ['ta', 'teacher', 'admin']);
  need(m.role !== 'ta' || !t.taId || t.taId === ctx.user.id, 403, '该小组不由你负责（BR-11）');
  need(ctx.body.score !== undefined && ctx.body.score !== '' && !isNaN(Number(ctx.body.score)), 400, '过程得分必填');
  const c = store.insert('checks', {
    projectId: p.id, teamId: t.id, iterationId: ctx.body.iterationId || null,
    checkerId: ctx.user.id, checkDate: ctx.body.checkDate || now().slice(0, 10),
    items: ctx.body.items || [], findings: ctx.body.findings || '',
    score: Number(ctx.body.score), comment: ctx.body.comment || '', status: 'ok'
  });
  act.log({ courseId: p.courseId, projectId: p.id, teamId: t.id, actorId: ctx.user.id,
    action: 'check_create', detail: ctx.body.score + ' 分' });
  const ids = store.where('teamMembers', (x) => x.teamId === t.id && x.active !== false).map((x) => x.userId);
  act.notify(ids, { type: 'check', title: '助教已提交过程检查', body: '本次得分 ' + ctx.body.score, courseId: p.courseId, projectId: p.id });
  store.save();
  return c;
});

get('/api/checks', (ctx) => store.where('checks', (c) => !ctx.query.teamId || c.teamId === ctx.query.teamId)
  .sort((a, b) => String(b.checkDate).localeCompare(String(a.checkDate))));

/* ------------------------------------------------------------------ 成绩 */
get('/api/projects/:id/grades', (ctx) => {
  const p = store.find('projects', ctx.params.id);
  need(p, 404, '项目不存在');
  requireMembership(ctx, p.courseId);
  return grades.computeProjectGrades(p.id);
});

post('/api/projects/:id/teacher-grade', (ctx) => {
  const p = store.find('projects', ctx.params.id);
  need(p, 404, '项目不存在');
  requireMembership(ctx, p.courseId, ['teacher', 'admin']);
  need(store.find('teams', ctx.body.teamId), 404, '小组不存在');
  const total = grades.scoreAgainstRubric(p.rubric, ctx.body.scores);
  need(total !== null, 400, '评分不完整');
  const g = store.insert('teacherGrades', {
    projectId: p.id, teamId: ctx.body.teamId, scores: ctx.body.scores, total,
    comment: ctx.body.comment || '', graderId: ctx.user.id, gradedAt: now()
  });
  act.log({ courseId: p.courseId, projectId: p.id, teamId: ctx.body.teamId, actorId: ctx.user.id,
    action: 'grade_teacher', detail: String(total) });
  store.save();
  return g;
});

post('/api/projects/:id/grades/publish', (ctx) => {
  const p = store.find('projects', ctx.params.id);
  need(p, 404, '项目不存在');
  requireMembership(ctx, p.courseId, ['teacher', 'admin']);
  const data = grades.computeProjectGrades(p.id);
  need(data.teams.some((t) => t.total !== null), 400, '暂无可用成绩');
  let n = 0;
  for (const t of data.teams) {
    if (t.total === null) continue;
    const old = store.first('grades', (g) => g.projectId === p.id && g.teamId === t.teamId);
    const payload = { projectId: p.id, teamId: t.teamId, total: t.total, members: t.members, published: true, publishedAt: now() };
    if (old) store.update('grades', old.id, payload); else store.insert('grades', payload);
    n++;
    act.notify(t.members.map((m) => m.userId), { type: 'grade', title: '成绩已发布', body: p.title + ' · ' + t.teamName, courseId: p.courseId, projectId: p.id });
  }
  act.log({ courseId: p.courseId, projectId: p.id, actorId: ctx.user.id, action: 'grade_publish', detail: n + ' 个小组' });
  store.save();
  return { published: n };
});

get('/api/my/grades', (ctx) => grades.gradesForStudent(ctx.user.id));

get('/api/projects/:id/export.csv', (ctx) => {
  const p = store.find('projects', ctx.params.id);
  need(p, 404, '项目不存在');
  requireMembership(ctx, p.courseId, ['teacher', 'ta', 'admin']);
  const rows = grades.buildExportRows(p.id) || [];
  const head = ['学号', '姓名', '队伍', '队内角色', '同伴互评分', '助教过程分', '教师评分', '团队总分', '贡献系数', '个人最终分', '成绩状态', '备注'];
  const csv = [head.join(',')].concat(rows.map((r) => head.map((h) => {
    const v = r[h] === undefined ? '' : String(r[h]);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }).join(','))).join('\n');
  act.log({ courseId: p.courseId, projectId: p.id, actorId: ctx.user.id, action: 'grade_export', detail: rows.length + ' 行' });
  store.save();
  return { raw: '\ufeff' + csv, contentType: 'text/csv; charset=utf-8', filename: encodeURIComponent(p.title + '_成绩汇总.csv') };
});

/* -------------------------------------------------------------- 通知/日志 */
get('/api/notifications', (ctx) => store.where('notifications', (n) => n.userId === ctx.user.id)
  .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));

post('/api/notifications/read', (ctx) => {
  const list = store.where('notifications', (n) => n.userId === ctx.user.id && !n.read);
  list.forEach((n) => store.update('notifications', n.id, { read: true }));
  store.save();
  return { read: list.length };
});

get('/api/logs', (ctx) => {
  let list = store.all('logs');
  if (ctx.query.courseId) list = list.filter((l) => l.courseId === ctx.query.courseId);
  if (ctx.query.projectId) list = list.filter((l) => l.projectId === ctx.query.projectId);
  if (ctx.query.teamId) list = list.filter((l) => l.teamId === ctx.query.teamId);
  if (ctx.user.role === 'student') {
    const myTeams = store.where('teamMembers', (m) => m.userId === ctx.user.id).map((m) => m.teamId);
    list = list.filter((l) => !l.teamId || myTeams.includes(l.teamId));
  }
  return list.slice(-80).reverse();
});

/* ------------------------------------------------------------------ 分发器 */
function handle(method, pathname, ctx) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.re.exec(pathname);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    const merged = Object.assign({}, ctx, { params });
    if (!r.publicRoute) {
      const header = ctx.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      const user = auth.userFromToken(token);
      need(user, 401, '请先登录');
      merged.user = user;
      merged.token = token;
    }
    return r.handler(merged);
  }
  throw new ApiError(404, '接口不存在：' + method + ' ' + pathname);
}

module.exports = { handle, ApiError };
