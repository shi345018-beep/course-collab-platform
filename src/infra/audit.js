'use strict';
/**
 * 过程记录与通知的过渡适配器。
 * TODO(v2): activity 模块迁移完成后改为调用 modules/activity/service。
 */
const legacy = require('../../lib/activity');

module.exports = {
  log: legacy.log,
  notify: legacy.notify
};
