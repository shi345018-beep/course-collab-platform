'use strict';
const controller = require('./controller');

module.exports = function registerCheckRoutes(router) {
  router.post('/api/checks', controller.create);
  router.get('/api/checks', controller.list);
};
