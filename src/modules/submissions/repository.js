'use strict';
const db = require('../../infra/db/json-db');

module.exports = {
  findTeam: function (id) { return db.find('teams', id); },
  findIteration: function (id) { return db.find('iterations', id); },
  findProject: function (id) { return db.find('projects', id); },
  isTeamMember: function (teamId, userId) {
    return db.where('teamMembers', function (m) {
      return m.teamId === teamId && m.userId === userId && m.active !== false;
    }).length > 0;
  },
  teamsOfUser: function (userId) {
    return db.where('teamMembers', function (m) {
      return m.userId === userId && m.active !== false;
    }).map(function (m) { return m.teamId; });
  },
  listByTeam: function (teamId) {
    return db.where('submissions', function (s) { return s.teamId === teamId; })
      .sort(function (a, b) { return String(b.submittedAt).localeCompare(String(a.submittedAt)); });
  },
  listByProject: function (projectId) {
    return db.where('submissions', function (s) { return s.projectId === projectId; })
      .sort(function (a, b) { return String(b.submittedAt).localeCompare(String(a.submittedAt)); });
  },
  countVersions: function (teamId, iterationId) {
    return db.where('submissions', function (s) {
      return s.teamId === teamId && s.iterationId === iterationId;
    }).length;
  },
  create: function (data) { return db.insert('submissions', data); },
  teamName: function (teamId) {
    const team = db.find('teams', teamId);
    return team ? team.name : teamId;
  },
  save: function () { return db.save(); }
};
