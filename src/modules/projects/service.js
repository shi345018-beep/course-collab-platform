'use strict';
const repo = require('./repository');
const policy = require('./policy');
const courses = require('../courses/service');
const audit = require('../../infra/audit');
const { need } = require('../../shared/errors');

const DEFAULT_RUBRIC = [
  { id: 'r1', name: '功能完成度', max: 10, weight: 40 },
  { id: 'r2', name: '工程质量', max: 10, weight: 30 },
  { id: 'r3', name: '文档与演示', max: 10, weight: 20 },
  { id: 'r4', name: '过程规范', max: 10, weight: 10 }
];

const DEFAULT_INTERNAL = [
  { id: 'i1', name: '贡献', max: 10, weight: 50 },
  { id: 'i2', name: '沟通配合', max: 10, weight: 25 },
  { id: 'i3', name: '产出质量', max: 10, weight: 25 }
];

function view(project) {
  const iterations = repo.listIterations(project.id);
  return Object.assign({}, project, {
    iterationCount: iterations.length,
    iterations: iterations,
    teamCount: repo.countTeams(project.id),
    memberCount: repo.countTeamMembers(project.id)
  });
}

function listForCourse(actor, courseId) {
  const membership = courses.membershipOf(actor.id, courseId);
  need(policy.canView(membership), 403, '你不是该课程成员');
  return repo.listByCourse(courseId)
    .filter(function (p) { return membership.role !== 'student' || p.status === 'published'; })
    .map(view);
}

function detail(actor, projectId) {
  const project = repo.findById(projectId);
  need(project, 404, '项目不存在');
  const membership = courses.membershipOf(actor.id, project.courseId);
  need(policy.canView(membership), 403, '你不是该课程成员');
  return {
    project: view(project),
    role: membership.role,
    iterations: repo.listIterations(projectId)
  };
}

function create(actor, input) {
  const membership = courses.membershipOf(actor.id, input.courseId);
  need(policy.canManage(membership), 403, '只有教师可以创建项目任务');
  const project = repo.create({
    courseId: input.courseId,
    title: input.title,
    description: input.description,
    requirements: [],
    status: 'draft',
    startDate: input.startDate,
    dueDate: input.dueDate,
    teamMin: input.teamMin,
    teamMax: input.teamMax,
    weights: { peer: 20, ta: 20, teacher: 60 },
    rubric: DEFAULT_RUBRIC,
    internalRubric: DEFAULT_INTERNAL,
    review: { crossTeam: true, internal: true, anonymous: true, reviewersPerSubmission: 3 },
    createdBy: actor.id
  });
  audit.log({ courseId: input.courseId, projectId: project.id, actorId: actor.id, action: 'project_create', detail: project.title });
  repo.save();
  return view(project);
}

function publish(actor, projectId) {
  const project = repo.findById(projectId);
  need(project, 404, '项目不存在');
  const membership = courses.membershipOf(actor.id, project.courseId);
  need(policy.canManage(membership), 403, '只有教师可以发布项目任务');
  need(repo.listIterations(projectId).length > 0, 400, '请先设置至少一个迭代阶段');
  const updated = repo.update(projectId, { status: 'published', publishedAt: new Date().toISOString() });
  audit.log({ courseId: project.courseId, projectId: projectId, actorId: actor.id, action: 'project_publish', detail: project.title });
  repo.save();
  return view(updated);
}

function addIteration(actor, projectId, input) {
  const project = repo.findById(projectId);
  need(project, 404, '项目不存在');
  const membership = courses.membershipOf(actor.id, project.courseId);
  need(policy.canManage(membership), 403, '只有教师可以设置迭代阶段');
  const seq = repo.listIterations(projectId).length + 1;
  const iteration = repo.addIteration({
    projectId: projectId,
    seq: seq,
    name: input.name,
    goal: input.goal,
    startDate: input.startDate,
    dueDate: input.dueDate,
    deliverables: input.deliverables,
    status: 'open'
  });
  audit.log({ courseId: project.courseId, projectId: projectId, actorId: actor.id, action: 'iteration_create', detail: input.name });
  repo.save();
  return iteration;
}

module.exports = {
  listForCourse: listForCourse,
  detail: detail,
  create: create,
  publish: publish,
  addIteration: addIteration
};
