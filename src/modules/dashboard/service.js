'use strict';
const repo = require('./repository');
const reviews = require('../reviews/service');
const grades = require('../grades/service');

function build(actor) {
  const memberships = repo.memberships(actor.id);
  const courseIds = memberships.map(function (m) { return m.courseId; });
  const projects = repo.projectsOfCourses(courseIds);
  const projectIds = projects.map(function (p) { return p.id; });
  const out = {
    role: actor.role,
    courses: memberships.length,
    projects: projects.length,
    unread: repo.unreadCount(actor.id)
  };

  if (actor.role === 'teacher') {
    const teams = repo.teamsOfProjects(projectIds);
    out.teams = teams.length;
    out.pendingGrades = teams.filter(function (t) { return !repo.hasTeacherGrade(t.id); }).length;
    out.recentLogs = repo.recentLogs(courseIds, []);
  } else if (actor.role === 'ta') {
    const teams = repo.teamsOfTa(actor.id);
    out.teams = teams.length;
    out.checks = repo.countChecksBy(actor.id);
    out.recentLogs = repo.recentLogs(courseIds, []);
  } else {
    const teams = repo.teamsOfUser(actor.id);
    out.teams = teams.length;
    out.todoReviews = reviews.todo(actor).length;
    out.myGrades = grades.myGrades(actor);
    out.recentLogs = repo.recentLogs(courseIds, teams.map(function (t) { return t.id; }));
  }
  return out;
}

module.exports = { build: build };
