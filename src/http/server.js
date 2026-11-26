'use strict';
/**
 * v2 HTTP 接入层：只负责请求解析、认证、路由分发与统一响应。
 * 不包含任何业务规则。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { ApiError } = require('./errors');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function readBody(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    let size = 0;
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > 1024 * 1024) { reject(new ApiError(413, '请求体过大')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', function () {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new ApiError(400, '请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function serveStatic(res, publicDir, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = path.join(publicDir, rel);
  fs.readFile(target, function (err, data) {
    if (err) { sendJson(res, 404, { code: 404, message: 'Not Found' }); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

function createServer(options) {
  const router = options.router;
  const publicDir = options.publicDir;
  const resolveUser = options.resolveUser || function () { return null; };

  return http.createServer(async function (req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    if (!pathname.startsWith('/api/')) return serveStatic(res, publicDir, pathname);

    try {
      const found = router.match(req.method, pathname);
      if (!found) throw new ApiError(404, '接口不存在：' + req.method + ' ' + pathname);
      const query = {};
      url.searchParams.forEach(function (value, key) { query[key] = value; });
      const body = ['POST', 'PUT', 'PATCH', 'DELETE'].indexOf(req.method) >= 0 ? await readBody(req) : {};
      const header = req.headers.authorization || '';
      const token = header.indexOf('Bearer ') === 0 ? header.slice(7) : null;
      const user = token ? resolveUser(token) : null;
      if (!found.route.publicRoute && !user) throw new ApiError(401, '请先登录');
      const result = found.route.handler({
        body: body, query: query, params: found.params, token: token, user: user
      });
      if (result && result.raw !== undefined) {
        res.writeHead(200, {
          'Content-Type': result.contentType || 'text/plain; charset=utf-8',
          'Content-Disposition': 'attachment; filename="' + (result.filename || 'export.csv') + '"'
        });
        return res.end(result.raw);
      }
      sendJson(res, 200, { code: 0, data: result === undefined ? {} : result });
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error('[v2]', err);
      sendJson(res, status, { code: err.code || status, message: err.message || '服务器内部错误' });
    }
  });
}

module.exports = { createServer };
