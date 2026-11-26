'use strict';
const controller = require('./controller');

module.exports = function registerTeamRoutes(router) {
  router.get('/api/projects/:id/teams', controller.list);
  router.post('/api/projects/:id/teams', controller.create);
  router.post('/api/teams/:id/join', controller.join);
  router.get('/api/teams/:id', controller.detail);
  router.post('/api/teams/:id/progress', controller.progress);
  router.add('DELETE', '/api/teams/:id/members/:userId', controller.removeMember);
  router.post('/api/teams/:id/leader-transfer', controller.initiateTransfer);
  router.post('/api/transfers/:id/vote', controller.voteTransfer);
  router.get('/api/projects/:id/transfers', controller.listTransfers);
  router.post('/api/transfers/:id/confirm', controller.confirmTransfer);
  router.post('/api/transfers/:id/reject', controller.rejectTransfer);
};
