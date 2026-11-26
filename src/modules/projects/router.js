'use strict';
const controller = require('./controller');

module.exports = function registerProjectRoutes(router) {
  router.get('/api/courses/:id/projects', controller.list);
  router.post('/api/projects', controller.create);
  router.get('/api/projects/:id', controller.detail);
  router.post('/api/projects/:id/publish', controller.publish);
  router.post('/api/projects/:id/iterations', controller.addIteration);
};
