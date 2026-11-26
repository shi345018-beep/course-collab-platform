'use strict';
const repo = require('./repository');

function notifications(actor) {
  return repo.notificationsOfUser(actor.id);
}

function markRead(actor) {
  return { read: repo.markAllRead(actor.id) };
}

function logs(actor, filters) {
  let list = repo.allLogs();
  if (filters.courseId) list = list.filter(function (l) { return l.courseId === filters.courseId; });
  if (filters.projectId) list = list.filter(function (l) { return l.projectId === filters.projectId; });
  if (filters.teamId) list = list.filter(function (l) { return l.teamId === filters.teamId; });
  if (actor.role === 'student') {
    const myTeams = repo.teamsOfUser(actor.id);
    list = list.filter(function (l) { return !l.teamId || myTeams.indexOf(l.teamId) >= 0; });
  }
  return list.slice(-80).reverse();
}

module.exports = { notifications: notifications, markRead: markRead, logs: logs };
