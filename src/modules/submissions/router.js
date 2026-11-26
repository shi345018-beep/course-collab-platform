'use strict';
const controller = require('./controller');
const { need } = require('../../shared/errors');

module.exports = function registerSubmissionRoutes(router) {
  router.post('/api/submissions', controller.create);
  router.get('/api/submissions', function (ctx) {
    need(ctx.query.teamId, 400, '缺少 teamId 参数');
    return controller.listByTeam(ctx);
  });
  router.get('/api/projects/:id/submissions', controller.listByProject);
};
