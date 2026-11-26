'use strict';
const controller = require('./controller');
module.exports = function registerDashboardRoutes(router) {
  router.get('/api/dashboard', controller.dashboard);
};
