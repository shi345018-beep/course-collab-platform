'use strict';
const repo = require('./repository');
const policy = require('./policy');
const courses = require('../courses/service');
const grading = require('../../domain/grading');
const audit = require('../../infra/audit');
const { need } = require('../../shared/errors');

function assign(actor, projectId, input) {
  const project = repo.findProject(projectId);
  need(project, 404, '项目不存在');
  const membership = courses.membershipOf(actor.id, project.courseId);
  need(policy.canAssign(membership), 403, '只有教师可以分配互评');
  const teams = repo.listTeams(projectId);
  need(teams.length >= 2, 400, '至少需要 2 个小组才能分配互评');
  const per = Math.min(input.reviewersPerSubmission || 3, teams.length - 1);

  const latestByKey = new Map();
  repo.listSubmissions(projectId).forEach(function (s) {
    const key = s.teamId + ':' + s.iterationId;
    const current = latestByKey.get(key);
    if (!current || (s.version || 1) > (current.version || 1)) latestByKey.set(key, s);
  });

  let created = 0;
  latestByKey.forEach(function (submission) {
    teams.filter(function (t) { return t.id !== submission.teamId; })
      .slice(0, per)
      .forEach(function (team) {
        if (repo.findExistingAssignment(submission.id, team.id)) return;
        repo.createAssignment({
          projectId: projectId,
          submissionId: submission.id,
          reviewerTeamId: team.id,
          assignedById: actor.id,
          assignedAt: new Date().toISOString(),
          status: 'pending',
          dueDate: input.dueDate
        });
        created++;
      });
  });
  audit.log({ courseId: project.courseId, projectId: projectId, actorId: actor.id, action: 'review_assign', detail: created + ' 个任务' });
  repo.save();
  return { created: created, reviewersPerSubmission: per, teams: teams.length };
}

function todo(actor) {
  const myTeams = repo.teamsOfUser(actor.id);
  return repo.pendingForTeams(myTeams).map(function (assignment) {
    const submission = repo.findSubmission(assignment.submissionId);
    const team = submission ? repo.findTeam(submission.teamId) : null;
    const project = repo.findProject(assignment.projectId);
    return {
      id: assignment.id,
      status: assignment.status,
      dueDate: assignment.dueDate,
      submission: submission ? {
        id: submission.id, title: submission.title, version: submission.version,
        summary: submission.summary, repoUrl: submission.repoUrl
      } : null,
      targetTeam: team ? team.name : '',
      rubric: project ? project.rubric : []
    };
  });
}

function submit(actor, assignmentId, input) {
  const assignment = repo.findAssignment(assignmentId);
  need(assignment, 404, '评审任务不存在');
  const myTeams = repo.teamsOfUser(actor.id);
  need(policy.canSubmit(assignment, myTeams), 403, '该任务不属于你的小组');
  need(assignment.status === 'pending', 400, '任务已完成或已逾期');
  need(!assignment.dueDate || new Date(assignment.dueDate) >= new Date(), 400, '已超过评审截止时间，状态保持待评审（ST-05）');
  const project = repo.findProject(assignment.projectId);
  const total = grading.scoreAgainstRubric(project.rubric, input.scores);
  need(total !== null, 400, '评分不完整');
  const review = repo.createCrossReview({
    type: 'cross', assignmentId: assignment.id, submissionId: assignment.submissionId,
    projectId: assignment.projectId, reviewerTeamId: assignment.reviewerTeamId,
    reviewerId: actor.id, scores: input.scores, total: total,
    comment: input.comment, anonymous: true, submittedAt: new Date().toISOString()
  });
  repo.updateAssignment(assignment.id, { status: 'submitted', submittedAt: new Date().toISOString() });
  audit.log({
    courseId: project.courseId, projectId: project.id, teamId: assignment.reviewerTeamId,
    actorId: actor.id, action: 'review_submit', detail: '得分 ' + total
  });
  repo.save();
  return review;
}

function internal(actor, teamId, input) {
  const team = repo.findTeam(teamId);
  need(team, 404, '小组不存在');
  const project = repo.findProject(team.projectId);
  const membership = courses.membershipOf(actor.id, project.courseId);
  need(membership && membership.role === 'student', 403, '只有学生可以提交组内互评');
  need(repo.isTeamMember(teamId, actor.id), 403, '你不是该组成员');
  need(input.targetUserId !== actor.id, 400, '不能评价自己（BR-19）');
  need(repo.isTeamMember(teamId, input.targetUserId), 400, '被评人不在本组');
  const total = grading.scoreAgainstRubric(project.internalRubric, input.scores);
  need(total !== null, 400, '评分不完整');
  const old = repo.findInternalReview(teamId, actor.id, input.targetUserId);
  if (old) repo.updateInternalReview(old.id, { scores: input.scores, total: total, comment: input.comment });
  else {
    repo.createInternalReview({
      type: 'internal', teamId: teamId, projectId: project.id,
      reviewerId: actor.id, targetUserId: input.targetUserId,
      scores: input.scores, total: total, comment: input.comment,
      anonymous: true, submittedAt: new Date().toISOString()
    });
  }
  audit.log({
    courseId: project.courseId, projectId: project.id, teamId: teamId,
    actorId: actor.id, action: 'internal_review_submit', detail: input.targetUserId
  });
  repo.save();
  return { ok: true };
}

module.exports = { assign: assign, todo: todo, submit: submit, internal: internal };
