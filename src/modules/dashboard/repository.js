'use strict';
const db = require('../../infra/db/json-db');

module.exports = {
  memberships: function (userId) {
    return db.where('members', function (m) { return m.userId === userId; });
  },
  projectsOfCourses: function (courseIds) {
    return db.where('projects', function (p) {
      return courseIds.indexOf(p.courseId) >= 0 && p.status === 'published';
    });
  },
  teamsOfProjects: function (projectIds) {
    return db.where('teams', function (t) { return projectIds.indexOf(t.projectId) >= 0; });
  },
  teamsOfTa: function (taId) {
    return db.where('teams', function (t) { return t.taId === taId; });
  },
  teamsOfUser: function (userId) {
    return db.where('teamMembers', function (m) {
      return m.userId === userId && m.active !== false;
    }).map(function (m) { return db.find('teams', m.teamId); }).filter(Boolean);
  },
  hasTeacherGrade: function (teamId) {
    return db.where('teacherGrades', function (g) { return g.teamId === teamId; }).length > 0;
  },
  countChecksBy: function (checkerId) {
    return db.where('checks', function (c) { return c.checkerId === checkerId; }).length;
  },
  unreadCount: function (userId) {
    return db.where('notifications', function (n) { return n.userId === userId && !n.read; }).length;
  },
  recentLogs: function (courseIds, teamIds) {
    return db.where('logs', function (l) {
      if (courseIds.indexOf(l.courseId) < 0) return false;
      return !l.teamId || teamIds.indexOf(l.teamId) >= 0;
    }).slice(-8).reverse();
  }
};
