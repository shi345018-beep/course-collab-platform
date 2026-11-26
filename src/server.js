'use strict';
/**
 * 系统入口：装配路由并启动 HTTP 服务。
 * 启动：node server.js（或 node src/server.js），默认端口 8099，被占用时自动顺延。
 */
const os = require('os');
const { Router } = require('./http/router');
const { createServer } = require('./http/server');
const config = require('./config');
const authService = require('./modules/auth/service');
const registerAuthRoutes = require('./modules/auth/router');
const registerCourseRoutes = require('./modules/courses/router');
const registerProjectRoutes = require('./modules/projects/router');
const registerSubmissionRoutes = require('./modules/submissions/router');
const registerGradeRoutes = require('./modules/grades/router');
const registerTeamRoutes = require('./modules/teams/router');
const registerReviewRoutes = require('./modules/reviews/router');
const registerCheckRoutes = require('./modules/checks/router');
const registerActivityRoutes = require('./modules/activity/router');
const registerDashboardRoutes = require('./modules/dashboard/router');

const router = new Router();
registerAuthRoutes(router);
registerCourseRoutes(router);
registerProjectRoutes(router);
registerSubmissionRoutes(router);
registerGradeRoutes(router);
registerTeamRoutes(router);
registerReviewRoutes(router);
registerCheckRoutes(router);
registerActivityRoutes(router);
registerDashboardRoutes(router);

const server = createServer({
  router: router,
  publicDir: config.publicDir,
  resolveUser: authService.currentUserByToken
});

const BASE_PORT = Number(process.env.PORT) || Number(process.env.V2_PORT) || 8099;

function start(port, attempt) {
  const tries = attempt || 0;
  server.once('error', function (err) {
    if (err.code === 'EADDRINUSE' && tries < 20) {
      setTimeout(function () { start(port + 1, tries + 1); }, 120);
      return;
    }
    console.error('启动失败：', err.message);
    process.exit(1);
  });
  server.listen(port, '0.0.0.0', function () {
    const actual = server.address().port;
    console.log('');
    console.log('  高校课程协作与评审平台已启动');
    console.log('  本机访问: http://localhost:' + actual);
    const nets = os.networkInterfaces();
    let lanCount = 0;
    Object.values(nets).forEach(function (list) {
      (list || []).forEach(function (item) {
        if (item.family === 'IPv4' && !item.internal) {
          console.log('  局域网:   http://' + item.address + ':' + actual);
          lanCount++;
        }
      });
    });
    if (!lanCount) console.log('  局域网:   未检测到可用网卡（请确认已连接网络）');
    console.log('  已注册模块: auth、courses、projects、submissions、grades、teams、reviews、checks、activity');
    console.log('');
  });
}

start(BASE_PORT, 0);
