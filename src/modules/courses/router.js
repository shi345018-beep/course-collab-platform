'use strict';
const controller = require('./controller');

module.exports = function registerCourseRoutes(router) {
  router.get('/api/courses', controller.list);
  router.post('/api/courses', controller.create);
  router.get('/api/courses/:id', controller.detail);
  router.post('/api/courses/:id/join', controller.join);
  router.post('/api/courses/:id/members', controller.addMember);
};
