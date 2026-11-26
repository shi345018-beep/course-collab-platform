'use strict';
const service = require('./service');

function notifications(ctx) { return service.notifications(ctx.user); }
function markRead(ctx) { return service.markRead(ctx.user); }
function logs(ctx) { return service.logs(ctx.user, ctx.query); }

module.exports = { notifications: notifications, markRead: markRead, logs: logs };
