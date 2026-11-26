'use strict';
/**
 * v2 组合根。Phase 0 仅暴露配置与装配入口，
 * 后续在此装配仓储、服务与路由，避免模块之间互相 import。
 */
const config = require('./config');

function createApp(options) {
  const settings = Object.assign({}, config, options || {});
  return {
    config: settings,
    startedAt: new Date().toISOString(),
    // TODO: 装配 infra/db、modules/*/service、http/router
    modules: []
  };
}

module.exports = { createApp };
