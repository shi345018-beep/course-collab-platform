'use strict';
const db = require('../../infra/db/json-db');

module.exports = {
  findTeam: function (id) { return db.find('teams', id); },
  findProject: function (id) { return db.find('projects', id); },
  listChecks: function (teamId) {
    return db.where('checks', function (c) { return !teamId || c.teamId === teamId; })
      .sort(function (a, b) { return String(b.checkDate).localeCompare(String(a.checkDate)); });
  },
  createCheck: function (data) { return db.insert('checks', data); },
  listMembers: function (teamId) {
    return db.where('teamMembers', function (m) {
      return m.teamId === teamId && m.active !== false;
    }).map(function (m) { return m.userId; });
  },
  teamsOfUser: function (userId) {
    return db.where('teamMembers', function (m) {
      return m.userId === userId && m.active !== false;
    }).map(function (m) { return m.teamId; });
  },
  save: function () { return db.save(); }
};
