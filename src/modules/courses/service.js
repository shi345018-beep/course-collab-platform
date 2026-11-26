'use strict';
const repo = require('./repository');
const policy = require('./policy');
const audit = require('../../infra/audit');
const { need } = require('../../shared/errors');

function view(course) {
  const teacher = repo.listMembers(course.id).find(function (m) { return m.role === 'teacher'; });
  return Object.assign({}, course, {
    teacherName: teacher ? teacher.name : '',
    memberCount: repo.countMembers(course.id),
    projectCount: repo.countProjects(course.id)
  });
}

function listMine(actor) {
  return repo.listByUser(actor.id).map(view);
}

function detail(actor, courseId) {
  const course = repo.findById(courseId);
  need(course, 404, '课程不存在');
  const membership = repo.findMembership(actor.id, courseId);
  need(policy.canView(membership), 403, '你不是该课程成员');
  return {
    course: view(course),
    role: membership.role,
    members: repo.listMembers(courseId),
    projects: repo.listProjects(courseId)
  };
}

function create(actor, input) {
  need(policy.canCreateCourse(actor), 403, '只有教师可以创建课程');
  need(!repo.findByCode(input.code), 400, '课程编号已存在');
  const course = repo.create({
    code: input.code,
    name: input.name,
    term: input.term,
    description: input.description,
    teacherId: actor.id,
    inviteCode: 'SE' + Math.random().toString(36).slice(2, 6).toUpperCase(),
    status: 'active'
  });
  repo.addMember({ courseId: course.id, userId: actor.id, role: 'teacher', joinedAt: new Date().toISOString() });
  audit.log({ courseId: course.id, actorId: actor.id, action: 'course_create', detail: course.name });
  repo.save();
  return view(course);
}

function join(actor, courseId, input) {
  const course = repo.findById(courseId);
  need(course, 404, '课程不存在');
  need(input.inviteCode === course.inviteCode, 400, '邀请码错误');
  need(!repo.findMembership(actor.id, courseId), 400, '你已加入该课程');
  repo.addMember({ courseId: courseId, userId: actor.id, role: 'student', joinedAt: new Date().toISOString() });
  audit.log({ courseId: courseId, actorId: actor.id, action: 'course_join', detail: actor.name });
  repo.save();
  return { ok: true };
}

function addMember(actor, courseId, input) {
  const course = repo.findById(courseId);
  need(course, 404, '课程不存在');
  const membership = repo.findMembership(actor.id, courseId);
  need(policy.canManage(membership), 403, '无权管理该课程成员');
  const user = repo.findUserByIdentifier(input.identifier);
  need(user, 404, '未找到该账号');
  need(!repo.findMembership(user.id, courseId), 400, '该用户已是课程成员');
  repo.addMember({ courseId: courseId, userId: user.id, role: input.role, joinedAt: new Date().toISOString() });
  audit.log({ courseId: courseId, actorId: actor.id, action: 'member_add', detail: user.name });
  repo.save();
  return { ok: true };
}

function membershipOf(userId, courseId) {
  return repo.findMembership(userId, courseId);
}

module.exports = {
  listMine: listMine,
  detail: detail,
  create: create,
  join: join,
  addMember: addMember,
  membershipOf: membershipOf
};
