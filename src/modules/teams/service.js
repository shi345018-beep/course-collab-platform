'use strict';
const repo = require('./repository');
const policy = require('./policy');
const projects = require('../projects/service');
const courses = require('../courses/service');
const audit = require('../../infra/audit');
const { need } = require('../../shared/errors');

function view(team, iterations) {
  const members = repo.listMembers(team.id);
  const progress = repo.listProgress(team.id);
  const submissions = repo.submissionsOfTeam(team.id);
  return Object.assign({}, team, {
    leaderName: repo.userBrief(team.leaderId).name,
    members: members,
    memberCount: members.length,
    iterations: iterations.map(function (iteration) {
      const status = progress.filter(function (p) { return p.iterationId === iteration.id; })[0];
      const list = submissions.filter(function (s) { return s.iterationId === iteration.id; })
        .sort(function (a, b) { return b.version - a.version; });
      const latest = list[0] || null;
      return {
        id: iteration.id,
        seq: iteration.seq,
        name: iteration.name,
        dueDate: iteration.dueDate,
        deliverables: iteration.deliverables,
        status: status ? status.status : (list.length ? 'done' : 'not_started'),
        note: status ? status.note : (list.length ? '有提交记录，自动标记为已完成' : ''),
        submissionCount: list.length,
        latest: latest ? { id: latest.id, version: latest.version, title: latest.title, submittedAt: latest.submittedAt } : null,
        overdue: !latest && iteration.dueDate ? new Date(iteration.dueDate) < new Date() : false
      };
    })
  });
}

function projectContext(projectId) {
  const project = projects.projectOf(projectId);
  need(project, 404, '项目不存在');
  return { project: project, iterations: projects.iterationsOf(projectId) };
}

function list(actor, projectId) {
  const ctx = projectContext(projectId);
  const membership = courses.membershipOf(actor.id, ctx.project.courseId);
  need(membership, 403, '你不是该课程成员');
  return repo.listByProject(projectId).map(function (t) { return view(t, ctx.iterations); });
}

function create(actor, projectId, input) {
  const ctx = projectContext(projectId);
  const membership = courses.membershipOf(actor.id, ctx.project.courseId);
  need(membership && membership.role === 'student', 403, '只有学生可以创建小组');
  need(repo.teamsOfUser(actor.id, projectId).length === 0, 400, '你已加入本项目的一个小组');
  const duplicated = repo.listByProject(projectId).some(function (t) { return t.name === input.name; });
  need(!duplicated, 400, '小组名称重复');
  const team = repo.createTeam({
    projectId: projectId,
    courseId: ctx.project.courseId,
    name: input.name,
    leaderId: actor.id,
    taId: null,
    openJoin: true,
    status: 'forming'
  });
  repo.addMember({ teamId: team.id, userId: actor.id, role: 'leader', joinedAt: new Date().toISOString(), active: true });
  audit.log({ courseId: ctx.project.courseId, projectId: projectId, teamId: team.id, actorId: actor.id, action: 'team_create', detail: input.name });
  repo.save();
  return view(team, ctx.iterations);
}

function join(actor, teamId) {
  const team = repo.findTeam(teamId);
  need(team, 404, '小组不存在');
  const ctx = projectContext(team.projectId);
  const membership = courses.membershipOf(actor.id, ctx.project.courseId);
  need(membership && membership.role === 'student', 403, '只有学生可以加入小组');
  const count = repo.countMembers(teamId);
  need(policy.canJoin(membership, team, count, ctx.project.teamMax), 400, '小组人数已达上限或已关闭加入');
  need(!repo.findMember(teamId, actor.id), 400, '你已在该小组');
  repo.addMember({ teamId: teamId, userId: actor.id, role: 'member', joinedAt: new Date().toISOString(), active: true });
  audit.log({ courseId: ctx.project.courseId, projectId: team.projectId, teamId: teamId, actorId: actor.id, action: 'team_join', detail: actor.name });
  if (team.leaderId) {
    audit.notify([team.leaderId], { type: 'team', title: '有同学加入你的小组', body: actor.name, courseId: ctx.project.courseId, projectId: team.projectId });
  }
  repo.save();
  return view(team, ctx.iterations);
}

function detail(actor, teamId) {
  const team = repo.findTeam(teamId);
  need(team, 404, '小组不存在');
  const ctx = projectContext(team.projectId);
  const membership = courses.membershipOf(actor.id, ctx.project.courseId);
  const isMember = !!repo.findMember(teamId, actor.id);
  need(policy.canView(membership, isMember), 403, '无权查看其他小组（BR-01）');
  return { team: view(team, ctx.iterations), role: membership.role, isMember: isMember };
}

function progress(actor, teamId, input) {
  const team = repo.findTeam(teamId);
  need(team, 404, '小组不存在');
  const ctx = projectContext(team.projectId);
  const membership = courses.membershipOf(actor.id, ctx.project.courseId);
  const isMember = !!repo.findMember(teamId, actor.id);
  need(isMember || policy.isStaff(membership), 403, '无权更新该小组进度');
  repo.upsertProgress(teamId, input.iterationId, input.status, input.note);
  audit.log({ courseId: ctx.project.courseId, projectId: team.projectId, teamId: teamId, actorId: actor.id, action: 'team_progress', detail: input.status });
  repo.save();
  return view(team, ctx.iterations);
}

function removeMember(actor, teamId, userId, reason) {
  const team = repo.findTeam(teamId);
  need(team, 404, '小组不存在');
  const ctx = projectContext(team.projectId);
  const membership = courses.membershipOf(actor.id, ctx.project.courseId);
  const member = repo.findMember(teamId, userId);
  need(member, 404, '成员不存在');
  const self = userId === actor.id;
  need(policy.canManage(membership, team, actor.id) || self, 403, '无权移除该成员');
  need(userId !== team.leaderId || (membership && (membership.role === 'teacher' || membership.role === 'admin')), 400, '组长需先移交后才能退出');
  repo.updateMember(member.id, { active: false, leftAt: new Date().toISOString(), reason: reason || (self ? '主动退出' : '组长移除') });
  audit.log({ courseId: ctx.project.courseId, projectId: team.projectId, teamId: teamId, actorId: actor.id, action: 'team_remove_member', detail: repo.userBrief(userId).name });
  repo.save();
  return view(team, ctx.iterations);
}

function evaluateTransfer(transfer) {
  const team = repo.findTeam(transfer.teamId);
  const members = repo.listMembers(team.id);
  const required = Math.floor(members.length / 2) + 1;
  if (transfer.status === 'collecting' && transfer.votes.length >= required) {
    const updated = repo.updateTransfer(transfer.id, { status: 'pending_teacher', requiredVotes: required });
    const project = projects.projectOf(team.projectId);
    audit.notify([repo.userBrief(project.createdBy).id], {
      type: 'transfer', title: '组长移交待确认',
      body: team.name + ' 已达到 ' + required + ' 票', courseId: project.courseId, projectId: project.id
    });
    return updated;
  }
  return transfer;
}

function initiateTransfer(actor, teamId, input) {
  const team = repo.findTeam(teamId);
  need(team, 404, '小组不存在');
  const ctx = projectContext(team.projectId);
  const membership = courses.membershipOf(actor.id, ctx.project.courseId);
  need(membership && membership.role === 'student', 403, '只有学生可以发起移交');
  need(repo.findMember(teamId, actor.id), 403, '你不是该组成员');
  need(input.targetUserId !== team.leaderId && repo.findMember(teamId, input.targetUserId), 400, '请选择组长之外的本组成员');
  const active = repo.listTransfers(team.projectId).filter(function (t) {
    return t.teamId === teamId && ['collecting', 'pending_teacher'].indexOf(t.status) >= 0;
  });
  need(active.length === 0, 400, '已有进行中的移交申请');
  let transfer = repo.createTransfer({
    teamId: teamId,
    projectId: team.projectId,
    fromLeaderId: team.leaderId,
    toUserId: input.targetUserId,
    initiatorId: actor.id,
    votes: [actor.id],
    status: 'collecting',
    reason: input.reason,
    createdAt: new Date().toISOString()
  });
  transfer = evaluateTransfer(transfer);
  audit.log({ courseId: ctx.project.courseId, projectId: team.projectId, teamId: teamId, actorId: actor.id, action: 'team_progress', detail: '发起组长移交' });
  repo.save();
  return transfer;
}

function voteTransfer(actor, transferId) {
  let transfer = repo.findTransfer(transferId);
  need(transfer, 404, '移交申请不存在');
  const team = repo.findTeam(transfer.teamId);
  const ctx = projectContext(team.projectId);
  const membership = courses.membershipOf(actor.id, ctx.project.courseId);
  need(membership && membership.role === 'student' && repo.findMember(team.id, actor.id), 403, '你不是该组成员');
  need(transfer.status === 'collecting', 400, '该申请已进入教师确认或已结束');
  if (transfer.votes.indexOf(actor.id) < 0) {
    transfer = repo.updateTransfer(transfer.id, { votes: transfer.votes.concat([actor.id]) });
  }
  transfer = evaluateTransfer(transfer);
  repo.save();
  return transfer;
}

function listTransfers(actor, projectId) {
  const ctx = projectContext(projectId);
  const membership = courses.membershipOf(actor.id, ctx.project.courseId);
  need(membership, 403, '你不是该课程成员');
  let list = repo.listTransfers(projectId);
  if (membership.role === 'student') {
    const mine = repo.teamsOfUser(actor.id, projectId).map(function (t) { return t.id; });
    list = list.filter(function (t) { return mine.indexOf(t.teamId) >= 0; });
  }
  return list.map(function (t) {
    const team = repo.findTeam(t.teamId);
    return Object.assign({}, t, {
      teamName: team ? team.name : t.teamId,
      fromName: repo.userBrief(t.fromLeaderId).name,
      toName: repo.userBrief(t.toUserId).name
    });
  });
}

function confirmTransfer(actor, transferId) {
  const transfer = repo.findTransfer(transferId);
  need(transfer, 404, '移交申请不存在');
  const team = repo.findTeam(transfer.teamId);
  const ctx = projectContext(team.projectId);
  const membership = courses.membershipOf(actor.id, ctx.project.courseId);
  need(membership && (membership.role === 'teacher' || membership.role === 'admin'), 403, '只有教师可以确认移交');
  need(transfer.status === 'pending_teacher', 400, '该申请尚未达到表决门槛');
  repo.updateTeam(team.id, { leaderId: transfer.toUserId });
  repo.listMembers(team.id).forEach(function (m) {
    const raw = repo.findMember(team.id, m.id);
    if (raw) repo.updateMember(raw.id, { role: m.id === transfer.toUserId ? 'leader' : 'member' });
  });
  repo.updateTransfer(transfer.id, { status: 'approved', decidedAt: new Date().toISOString(), decidedBy: actor.id });
  audit.log({ courseId: ctx.project.courseId, projectId: team.projectId, teamId: team.id, actorId: actor.id, action: 'team_update', detail: '组长移交生效：' + repo.userBrief(transfer.toUserId).name });
  audit.notify(repo.listMembers(team.id).map(function (m) { return m.id; }), {
    type: 'transfer', title: '组长移交已生效', body: repo.userBrief(transfer.toUserId).name + ' 成为新组长',
    courseId: ctx.project.courseId, projectId: team.projectId
  });
  repo.save();
  return view(repo.findTeam(team.id), ctx.iterations);
}

function rejectTransfer(actor, transferId) {
  const transfer = repo.findTransfer(transferId);
  need(transfer, 404, '移交申请不存在');
  const team = repo.findTeam(transfer.teamId);
  const ctx = projectContext(team.projectId);
  const membership = courses.membershipOf(actor.id, ctx.project.courseId);
  need(membership && (membership.role === 'teacher' || membership.role === 'admin'), 403, '只有教师可以驳回');
  repo.updateTransfer(transfer.id, { status: 'rejected', decidedAt: new Date().toISOString(), decidedBy: actor.id });
  repo.save();
  return { ok: true };
}

module.exports = {
  list: list,
  create: create,
  join: join,
  detail: detail,
  progress: progress,
  removeMember: removeMember,
  initiateTransfer: initiateTransfer,
  voteTransfer: voteTransfer,
  listTransfers: listTransfers,
  confirmTransfer: confirmTransfer,
  rejectTransfer: rejectTransfer
};
