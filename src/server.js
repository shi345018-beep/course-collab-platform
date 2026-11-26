'use strict';
/**
 * v2 开发入口（迁移期与 v1 并存）。
 * 启动：node src/server.js  默认端口 8098，避免与 v1 的 8099 冲突。
 */
const os = require('os');
const { Router } = require('./http/router');
const { createServer } = require('./http/server');
const config = require('./config');
const authService = require('./modules/auth/service');
const registerAuthRoutes = require('./modules/auth/router');
const registerCourseRoutes = require('./modules/courses/router');
const registerProjectRoutes = require('./modules/projects/router');

const router = new Router();
registerAuthRoutes(router);
registerCourseRoutes(router);
registerProjectRoutes(router);

const server = createServer({
  router: router,
  publicDir: config.publicDir,
  resolveUser: authService.currentUserByToken
});

const BASE_PORT = Number(process.env.V2_PORT) || 8098;

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
    console.log('  v2 开发服务已启动（当前模块：auth、courses、projects）');
    console.log('  本机访问: http://localhost:' + actual);
    console.log('  已注册模块: auth、courses、projects（其余模块迁移中）');
    console.log('');
  });
}

start(BASE_PORT, 0);
