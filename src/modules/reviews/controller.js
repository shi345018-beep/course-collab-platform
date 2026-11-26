'use strict';
const service = require('./service');
const schema = require('./schema');

function assign(ctx) { return service.assign(ctx.user, ctx.params.id, schema.assignBody(ctx.body)); }
function todo(ctx) { return service.todo(ctx.user); }
function submit(ctx) { return service.submit(ctx.user, ctx.params.id, schema.reviewBody(ctx.body)); }
function internal(ctx) { return service.internal(ctx.user, ctx.params.id, schema.internalBody(ctx.body)); }

module.exports = { assign: assign, todo: todo, submit: submit, internal: internal };
