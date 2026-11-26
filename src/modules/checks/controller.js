'use strict';
const service = require('./service');
const schema = require('./schema');

function create(ctx) { return service.create(ctx.user, schema.createBody(ctx.body)); }
function list(ctx) { return service.list(ctx.user, ctx.query.teamId); }

module.exports = { create: create, list: list };
