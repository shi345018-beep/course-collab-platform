'use strict';
const service = require('./service');
const schema = require('./schema');

function summary(ctx) { return service.summary(ctx.user, ctx.params.id); }
function teacherGrade(ctx) { return service.teacherGrade(ctx.user, ctx.params.id, schema.teacherGradeBody(ctx.body)); }
function publish(ctx) { return service.publish(ctx.user, ctx.params.id); }
function exportCsv(ctx) { return service.exportCsv(ctx.user, ctx.params.id); }
function myGrades(ctx) { return service.myGrades(ctx.user); }
function createAppeal(ctx) { return service.createAppeal(ctx.user, ctx.params.id, schema.appealBody(ctx.body)); }
function listAppeals(ctx) { return service.listAppeals(ctx.user, ctx.params.id); }
function resolveAppeal(ctx) { return service.resolveAppeal(ctx.user, ctx.params.id, schema.resolveBody(ctx.body)); }

module.exports = {
  summary: summary,
  teacherGrade: teacherGrade,
  publish: publish,
  exportCsv: exportCsv,
  myGrades: myGrades,
  createAppeal: createAppeal,
  listAppeals: listAppeals,
  resolveAppeal: resolveAppeal
};
