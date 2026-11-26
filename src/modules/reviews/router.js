'use strict';
const controller = require('./controller');

module.exports = function registerReviewRoutes(router) {
  router.post('/api/projects/:id/assign-reviews', controller.assign);
  router.get('/api/reviews/todo', controller.todo);
  router.post('/api/assignments/:id/review', controller.submit);
  router.post('/api/teams/:id/internal-reviews', controller.internal);
};
