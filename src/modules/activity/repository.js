'use strict';
const db = require('../../infra/db/json-db');

module.exports = {
  notificationsOfUser: function (userId) {
    return db.where('notifications', function (n) { return n.userId === userId; })
      .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  },
  markAllRead: function (userId) {
    const list = db.where('notifications', function (n) { return n.userId === userId && !n.read; });
    list.forEach(function (n) { db.update('notifications', n.id, { read: true }); });
    db.save();
    return list.length;
  },
  allLogs: function () { return db.all('logs'); },
  teamsOfUser: function (userId) {
    return db.where('teamMembers', function (m) {
      return m.userId === userId && m.active !== false;
    }).map(function (m) { return m.teamId; });
  }
};
