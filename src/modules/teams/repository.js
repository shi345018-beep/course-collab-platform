'use strict';
const db = require('../../infra/db/json-db');

function userBrief(id) {
  const u = db.find('users', id);
  return u ? { id: u.id, name: u.name, username: u.username, studentNo: u.studentNo || '' } : { id: id, name: id };
}

module.exports = {
  userBrief: userBrief,
  listByProject: function (projectId) {
    return db.where('teams', function (t) { return t.projectId === projectId; });
  },
  findTeam: function (id) { return db.find('teams', id); },
  listMembers: function (teamId) {
    return db.where('teamMembers', function (m) {
      return m.teamId === teamId && m.active !== false;
    }).map(function (m) {
      return Object.assign(userBrief(m.userId), { teamRole: m.role, joinedAt: m.joinedAt });
    });
  },
  findMember: function (teamId, userId) {
    return db.where('teamMembers', function (m) {
      return m.teamId === teamId && m.userId === userId && m.active !== false;
    })[0] || null;
  },
  countMembers: function (teamId) {
    return db.where('teamMembers', function (m) {
      return m.teamId === teamId && m.active !== false;
    }).length;
  },
  listProgress: function (teamId) {
    return db.where('teamIterations', function (r) { return r.teamId === teamId; });
  },
  submissionsOfTeam: function (teamId) {
    return db.where('submissions', function (s) { return s.teamId === teamId; });
  },
  teamsOfUser: function (userId, projectId) {
    return db.where('teamMembers', function (m) {
      return m.userId === userId && m.active !== false;
    }).map(function (m) { return m.teamId; })
      .map(function (id) { return db.find('teams', id); })
      .filter(function (t) { return t && (!projectId || t.projectId === projectId); });
  },
  createTeam: function (data) { return db.insert('teams', data); },
  updateTeam: function (id, patch) { return db.update('teams', id, patch); },
  addMember: function (data) { return db.insert('teamMembers', data); },
  updateMember: function (id, patch) { return db.update('teamMembers', id, patch); },
  upsertProgress: function (teamId, iterationId, status, note) {
    const old = db.where('teamIterations', function (r) {
      return r.teamId === teamId && r.iterationId === iterationId;
    })[0];
    if (old) return db.update('teamIterations', old.id, { status: status, note: note });
    return db.insert('teamIterations', { teamId: teamId, iterationId: iterationId, status: status, note: note });
  },
  listTransfers: function (projectId) {
    return db.where('transfers', function (x) { return x.projectId === projectId; });
  },
  findTransfer: function (id) { return db.find('transfers', id); },
  createTransfer: function (data) { return db.insert('transfers', data); },
  updateTransfer: function (id, patch) { return db.update('transfers', id, patch); },
  save: function () { return db.save(); }
};
