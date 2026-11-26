'use strict';
const db = require('../../infra/db/json-db');

function userBrief(id) {
  const u = db.find('users', id);
  if (!u) return { id: id, name: id, username: '', role: '', studentNo: '' };
  return { id: u.id, name: u.name, username: u.username, role: u.role, studentNo: u.studentNo || '' };
}

module.exports = {
  listByUser: function (userId) {
    const memberships = db.where('members', function (m) { return m.userId === userId; });
    return memberships.map(function (m) { return db.find('courses', m.courseId); }).filter(Boolean);
  },
  findById: function (id) { return db.find('courses', id); },
  findMembership: function (userId, courseId) {
    return db.where('members', function (m) { return m.userId === userId && m.courseId === courseId; })[0] || null;
  },
  listMembers: function (courseId) {
    return db.where('members', function (m) { return m.courseId === courseId; })
      .map(function (m) { return Object.assign(userBrief(m.userId), { role: m.role }); });
  },
  listProjects: function (courseId) {
    return db.where('projects', function (p) { return p.courseId === courseId; });
  },
  countMembers: function (courseId) {
    return db.where('members', function (m) { return m.courseId === courseId; }).length;
  },
  countProjects: function (courseId) {
    return db.where('projects', function (p) { return p.courseId === courseId; }).length;
  },
  findByCode: function (code) {
    return db.where('courses', function (c) { return c.code === code; })[0] || null;
  },
  findUserByIdentifier: function (identifier) {
    return db.where('users', function (u) {
      return u.username === identifier || u.studentNo === identifier;
    })[0] || null;
  },
  create: function (data) {
    return db.insert('courses', data);
  },
  addMember: function (data) {
    return db.insert('members', data);
  },
  save: function () { return db.save(); }
};
