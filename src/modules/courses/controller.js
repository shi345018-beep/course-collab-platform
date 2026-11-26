'use strict';
const service = require('./service');
const schema = require('./schema');

function list(ctx) { return service.listMine(ctx.user); }
function detail(ctx) { return service.detail(ctx.user, ctx.params.id); }
function create(ctx) { return service.create(ctx.user, schema.createBody(ctx.body)); }
function join(ctx) { return service.join(ctx.user, ctx.params.id, schema.joinBody(ctx.body)); }
function addMember(ctx) { return service.addMember(ctx.user, ctx.params.id, schema.memberBody(ctx.body)); }

module.exports = { list: list, detail: detail, create: create, join: join, addMember: addMember };
