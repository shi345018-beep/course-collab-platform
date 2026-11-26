'use strict';
/**
 * 跨层共享的错误类型。放在 shared/ 而非 http/，
 * 使 service 与 domain 不必依赖 HTTP 层。
 */
class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status || 500;
    this.code = code || this.status;
  }
}

function need(condition, status, message) {
  if (!condition) throw new ApiError(status, message);
}

module.exports = { ApiError, need };
