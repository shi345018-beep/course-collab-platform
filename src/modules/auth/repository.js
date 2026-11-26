'use strict';
const db = require('../../infra/db/json-db');

module.exports = {
  findByUsername: function (username) {
    return db.findUsers().find(function (u) { return u.username === username; }) || null;
  },
  findById: function (id) {
    return db.findUserById(id);
  },
  listMemberships: function (userId) {
    return db.findMembershipsByUser(userId).map(function (m) {
      const course = db.findCourse(m.courseId);
      return {
        courseId: m.courseId,
        role: m.role,
        courseName: course ? course.name : '',
        courseCode: course ? course.code : ''
      };
    });
  }
};
