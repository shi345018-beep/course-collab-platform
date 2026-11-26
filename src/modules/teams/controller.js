'use strict';
const service = require('./service');
const schema = require('./schema');

function list(ctx) { return service.list(ctx.user, ctx.params.id); }
function create(ctx) { return service.create(ctx.user, ctx.params.id, schema.createBody(ctx.body)); }
function join(ctx) { return service.join(ctx.user, ctx.params.id); }
function detail(ctx) { return service.detail(ctx.user, ctx.params.id); }
function progress(ctx) { return service.progress(ctx.user, ctx.params.id, schema.progressBody(ctx.body)); }
function removeMember(ctx) { return service.removeMember(ctx.user, ctx.params.id, ctx.params.userId, ctx.body && ctx.body.reason); }
function initiateTransfer(ctx) { return service.initiateTransfer(ctx.user, ctx.params.id, schema.transferBody(ctx.body)); }
function voteTransfer(ctx) { return service.voteTransfer(ctx.user, ctx.params.id); }
function listTransfers(ctx) { return service.listTransfers(ctx.user, ctx.params.id); }
function confirmTransfer(ctx) { return service.confirmTransfer(ctx.user, ctx.params.id); }
function rejectTransfer(ctx) { return service.rejectTransfer(ctx.user, ctx.params.id); }

module.exports = {
  list: list,
  create: create,
  join: join,
  detail: detail,
  progress: progress,
  removeMember: removeMember,
  initiateTransfer: initiateTransfer,
  voteTransfer: voteTransfer,
  listTransfers: listTransfers,
  confirmTransfer: confirmTransfer,
  rejectTransfer: rejectTransfer
};
