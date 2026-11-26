'use strict';
const service = require('./service');
function dashboard(ctx) { return service.build(ctx.user); }
module.exports = { dashboard: dashboard };
