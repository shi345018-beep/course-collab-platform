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
  const membership = courses.membershipOf(actor.id, project.courseId);
  need(policy.canCheck(membership, team, actor.id), 403, '该小组不由你负责（BR-11）');
  const check = repo.createCheck({
    projectId: project.id,
    teamId: team.id,
    iterationId: input.iterationId,
    checkerId: actor.id,
    checkDate: input.checkDate,
    items: input.items,
    findings: input.findings,
    score: input.score,
    comment: input.comment,
    status: 'ok'
  });
  audit.log({
    courseId: project.courseId, projectId: project.id, teamId: team.id,
    actorId: actor.id, action: 'check_create', detail: input.score + ' 分'
  });
  audit.notify(repo.listMembers(team.id), {
    type: 'check', title: '助教已提交过程检查', body: '本次得分 ' + input.score,
    courseId: project.courseId, projectId: project.id
  });
  repo.save();
  return check;
}

function list(actor, teamId) {
  if (teamId) {
    const team = repo.findTeam(teamId);
    need(team, 404, '小组不存在');
    const project = repo.findProject(team.projectId);
    const membership = courses.membershipOf(actor.id, project.courseId);
    const isMember = repo.teamsOfUser(actor.id).indexOf(teamId) >= 0;
    need(policy.canView(membership, isMember), 403, '无权查看该小组的检查记录');
    return repo.listChecks(teamId).filter(function (c) {
      return membership.role !== 'ta' || !team.taId || team.taId === actor.id;
    });
  }
  const all = repo.listChecks(null);
  if (actor.role === 'teacher' || actor.role === 'admin') return all;
  const teamIds = repo.teamsOfUser(actor.id);
  if (actor.role === 'ta') return all.filter(function (c) { return c.checkerId === actor.id; });
  return all.filter(function (c) { return teamIds.indexOf(c.teamId) >= 0; });
}

module.exports = { create: create, list: list };
