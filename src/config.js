'use strict';
/**
 * v2 运行配置。端口默认 8099，被占用时由 HTTP 层顺延。
 */
const path = require('path');

module.exports = {
  port: Number(process.env.PORT) || 8099,
  dataDir: process.env.CP_DATA_DIR || path.join(__dirname, '..', 'data'),
  publicDir: path.join(__dirname, '..', 'public')
};
