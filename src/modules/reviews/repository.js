'use strict';
const db = require('../../infra/db/json-db');

module.exports = {
  findProject: function (id) { return db.find('projects', id); },
  listTeams: function (projectId) {
    return db.where('teams', function (t) { return t.projectId === projectId; });
  },
  findTeam: function (id) { return db.find('teams', id); },
  listSubmissions: function (projectId) {
    return db.where('submissions', function (s) { return s.projectId === projectId; });
  },
  findSubmission: function (id) { return db.find('submissions', id); },
  findAssignment: function (id) { return db.find('assignments', id); },
  findExistingAssignment: function (submissionId, reviewerTeamId) {
    return db.where('assignments', function (a) {
      return a.submissionId === submissionId && a.reviewerTeamId === reviewerTeamId;
    })[0] || null;
  },
  createAssignment: function (data) { return db.insert('assignments', data); },
  updateAssignment: function (id, patch) { return db.update('assignments', id, patch); },
  pendingForTeams: function (teamIds) {
    return db.where('assignments', function (a) {
      return a.status === 'pending' && teamIds.indexOf(a.reviewerTeamId) >= 0;
    });
  },
  listReviews: function (submissionId) {
    return db.where('reviews', function (r) {
      return r.type === 'cross' && r.submissionId === submissionId;
    });
  },
  createCrossReview: function (data) { return db.insert('reviews', data); },
  findInternalReview: function (teamId, reviewerId, targetUserId) {
    return db.where('reviews', function (r) {
      return r.type === 'internal' && r.teamId === teamId
        && r.reviewerId === reviewerId && r.targetUserId === targetUserId;
    })[0] || null;
  },
  createInternalReview: function (data) { return db.insert('reviews', data); },
  updateInternalReview: function (id, patch) { return db.update('reviews', id, patch); },
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
  save: function () { return db.save(); }
};
