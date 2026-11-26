'use strict';
const controller = require('./controller');

module.exports = function registerActivityRoutes(router) {
  router.get('/api/notifications', controller.notifications);
  router.post('/api/notifications/read', controller.markRead);
  router.get('/api/logs', controller.logs);
};
