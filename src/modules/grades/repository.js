'use strict';
const db = require('../../infra/db/json-db');

function userBrief(id) {
  const u = db.find('users', id);
  return u ? { name: u.name, studentNo: u.studentNo || '' } : { name: id, studentNo: '' };
}

module.exports = {
  findProject: function (id) { return db.find('projects', id); },
  findTeamById: function (id) { return db.find('teams', id); },
  listTeams: function (projectId) {
    return db.where('teams', function (t) { return t.projectId === projectId; });
  },
  listMembers: function (teamId) {
    return db.where('teamMembers', function (m) {
      return m.teamId === teamId && m.active !== false;
    }).map(function (m) {
      return Object.assign({ userId: m.userId, teamRole: m.role }, userBrief(m.userId));
    });
  },
  teamsOfUser: function (userId) {
    return db.where('teamMembers', function (m) {
      return m.userId === userId && m.active !== false;
    }).map(function (m) { return m.teamId; });
  },
  listSubmissions: function (teamId) {
    return db.where('submissions', function (s) { return s.teamId === teamId; });
  },
  listCrossReviews: function (submissionIds) {
    return db.where('reviews', function (r) {
      return r.type === 'cross' && submissionIds.indexOf(r.submissionId) >= 0;
    });
  },
  listInternalReviews: function (teamId) {
    return db.where('reviews', function (r) {
      return r.type === 'internal' && r.teamId === teamId;
    });
  },
  listChecks: function (teamId) {
    return db.where('checks', function (c) { return c.teamId === teamId; })
      .sort(function (a, b) { return String(a.checkDate).localeCompare(String(b.checkDate)); });
  },
  latestTeacherGrade: function (projectId, teamId) {
    const list = db.where('teacherGrades', function (g) {
      return g.projectId === projectId && g.teamId === teamId;
    }).sort(function (a, b) { return String(a.gradedAt).localeCompare(String(b.gradedAt)); });
    return list.length ? list[list.length - 1] : null;
  },
  insertTeacherGrade: function (data) { return db.insert('teacherGrades', data); },
  findGrade: function (projectId, teamId) {
    return db.where('grades', function (g) {
      return g.projectId === projectId && g.teamId === teamId;
    })[0] || null;
  },
  upsertGrade: function (data) {
    const old = module.exports.findGrade(data.projectId, data.teamId);
    if (old) return db.update('grades', old.id, data);
    return db.insert('grades', data);
  },
  listGrades: function (projectId) {
    return db.where('grades', function (g) { return g.projectId === projectId; });
  },
  findAppealById: function (id) { return db.find('appeals', id); },
  findPendingAppeal: function (projectId, teamId) {
    return db.where('appeals', function (a) {
      return a.projectId === projectId && a.teamId === teamId && a.status === 'submitted';
    })[0] || null;
  },
  latestAppeal: function (projectId, teamId) {
    const list = db.where('appeals', function (a) {
      return a.projectId === projectId && a.teamId === teamId;
    }).sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); });
    return list.length ? list[list.length - 1] : null;
  },
  listAppeals: function (projectId) {
    return db.where('appeals', function (a) { return a.projectId === projectId; });
  },
  insertAppeal: function (data) { return db.insert('appeals', data); },
  updateAppeal: function (id, patch) { return db.update('appeals', id, patch); },
  updateGrade: function (id, patch) { return db.update('grades', id, patch); },
  save: function () { return db.save(); }
};
