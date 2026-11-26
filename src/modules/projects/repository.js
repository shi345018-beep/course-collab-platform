'use strict';
const db = require('../../infra/db/json-db');

module.exports = {
  listByCourse: function (courseId) {
    return db.where('projects', function (p) { return p.courseId === courseId; });
  },
  findById: function (id) { return db.find('projects', id); },
  listIterations: function (projectId) {
    return db.where('iterations', function (i) { return i.projectId === projectId; })
      .sort(function (a, b) { return a.seq - b.seq; });
  },
  countTeams: function (projectId) {
    return db.where('teams', function (t) { return t.projectId === projectId; }).length;
  },
  countTeamMembers: function (projectId) {
    const teamIds = db.where('teams', function (t) { return t.projectId === projectId; })
      .map(function (t) { return t.id; });
    return db.where('teamMembers', function (m) {
      return m.active !== false && teamIds.indexOf(m.teamId) >= 0;
    }).length;
  },
  create: function (data) { return db.insert('projects', data); },
  update: function (id, patch) { return db.update('projects', id, patch); },
  addIteration: function (data) { return db.insert('iterations', data); },
  save: function () { return db.save(); }
};
