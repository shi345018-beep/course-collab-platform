'use strict';
const service = require('./service');
const schema = require('./schema');

function list(ctx) { return service.listForCourse(ctx.user, ctx.params.id); }
function detail(ctx) { return service.detail(ctx.user, ctx.params.id); }
function create(ctx) { return service.create(ctx.user, schema.createBody(ctx.body)); }
function publish(ctx) { return service.publish(ctx.user, ctx.params.id); }
function addIteration(ctx) { return service.addIteration(ctx.user, ctx.params.id, schema.iterationBody(ctx.body)); }

module.exports = {
  list: list,
  detail: detail,
  create: create,
  publish: publish,
  addIteration: addIteration
};
