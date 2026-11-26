'use strict';
const service = require('./service');
const schema = require('./schema');

function create(ctx) { return service.create(ctx.user, schema.createBody(ctx.body)); }
function listByTeam(ctx) { return service.listByTeam(ctx.user, ctx.query.teamId); }
function listByProject(ctx) { return service.listByProject(ctx.user, ctx.params.id); }

module.exports = { create: create, listByTeam: listByTeam, listByProject: listByProject };
