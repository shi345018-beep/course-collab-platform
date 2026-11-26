'use strict';
const controller = require('./controller');

module.exports = function registerGradeRoutes(router) {
  router.get('/api/projects/:id/grades', controller.summary);
  router.post('/api/projects/:id/teacher-grade', controller.teacherGrade);
  router.post('/api/projects/:id/grades/publish', controller.publish);
  router.get('/api/projects/:id/export.csv', controller.exportCsv);
  router.get('/api/my/grades', controller.myGrades);
  router.post('/api/projects/:id/appeals', controller.createAppeal);
  router.get('/api/projects/:id/appeals', controller.listAppeals);
  router.post('/api/appeals/:id/resolve', controller.resolveAppeal);
};
