'use strict';
const controller = require('./controller');

module.exports = function registerAuthRoutes(router) {
  router.post('/api/login', controller.login, { publicRoute: true });
  router.post('/api/logout', controller.logout);
  router.get('/api/me', controller.me);
};
