'use strict';
const repo = require('./repository');
const policy = require('./policy');
const courses = require('../courses/service');
const audit = require('../../infra/audit');
const { need } = require('../../shared/errors');

function create(actor, input) {
  const team = repo.findTeam(input.teamId);
  need(team, 404, '小组不存在');
  const project = repo.findProject(team.projectId);
  need(project, 404, '项目不存在');
  const membership = courses.membershipOf(actor.id, project.courseId);
  need(membership, 403, '你不是该课程成员');
  const isMember = repo.isTeamMember(team.id, actor.id);
  need(policy.canSubmit(actor, team, membership), 403, '仅组长可正式提交成果（BR-12）');
  const iteration = repo.findIteration(input.iterationId);
  need(iteration && iteration.projectId === project.id, 404, '迭代阶段不存在');
  need(new Date(iteration.dueDate) >= new Date(), 400, '迭代已截止，提交被拒绝（ST-09），状态保持已锁定');

  const submission = repo.create({
    teamId: team.id,
    iterationId: iteration.id,
    projectId: project.id,
    title: input.title,
    summary: input.summary,
    repoUrl: input.repoUrl,
    attachmentUrl: input.attachmentUrl,
    version: repo.countVersions(team.id, iteration.id) + 1,
    status: 'submitted',
    submittedById: actor.id,
    submittedAt: new Date().toISOString()
  });
  audit.log({
    courseId: project.courseId,
    projectId: project.id,
    teamId: team.id,
    actorId: actor.id,
    action: 'submission_create',
    detail: 'v' + submission.version + ' ' + submission.title
  });
  repo.save();
  return submission;
}

function listByTeam(actor, teamId) {
  const team = repo.findTeam(teamId);
  need(team, 404, '小组不存在');
  const project = repo.findProject(team.projectId);
  const membership = courses.membershipOf(actor.id, project.courseId);
  need(membership, 403, '你不是该课程成员');
  const isMember = repo.isTeamMember(teamId, actor.id);
  need(policy.canViewTeam(actor.id, teamId, isMember, membership), 403, '无权查看其他小组（BR-01）');
  return repo.listByTeam(teamId);
}

function listByProject(actor, projectId) {
  const project = repo.findProject(projectId);
  need(project, 404, '项目不存在');
  const membership = courses.membershipOf(actor.id, project.courseId);
  need(membership, 403, '你不是该课程成员');
  let list = repo.listByProject(projectId);
  if (membership.role === 'student') {
    const mine = repo.teamsOfUser(actor.id);
    list = list.filter(function (s) { return mine.indexOf(s.teamId) >= 0; });
  }
  return list.map(function (s) {
    const iteration = repo.findIteration(s.iterationId);
    return Object.assign({}, s, {
      teamName: repo.teamName(s.teamId),
      iterationName: iteration ? iteration.name : '',
      iterationSeq: iteration ? iteration.seq : ''
    });
  });
}

module.exports = { create: create, listByTeam: listByTeam, listByProject: listByProject };
