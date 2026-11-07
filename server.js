'use strict';
/**
 * HTTP 服务：静态资源 + JSON API。
 * 零依赖，直接 `node server.js` 即可运行。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const api = require('./lib/api');

const BASE_PORT = Number(process.env.PORT) || 8099;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1024 * 1024) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, rel);
  const safe = path.resolve(file).startsWith(path.resolve(PUBLIC_DIR));
  const target = safe ? file : path.join(PUBLIC_DIR, 'index.html');
  fs.readFile(target, (err, data) => {
    if (err) {
      if (pathname.startsWith('/api/')) return sendJson(res, 404, { code: 404, message: '接口不存在' });
      return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
        if (e2) { res.writeHead(404); res.end('Not Found'); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(html);
      });
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}

const app = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

  try {
    const body = ['POST', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : {};
    const query = {};
    url.searchParams.forEach((v, k) => { query[k] = v; });
    const result = api.handle(req.method, pathname, { body, query, headers: req.headers });
    if (result && result.raw !== undefined) {
      res.writeHead(200, {
        'Content-Type': result.contentType || 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="' + (result.filename || 'export.csv') + '"'
      });
      return res.end(result.raw);
    }
    sendJson(res, 200, { code: 0, data: result });
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error('[server]', err);
    sendJson(res, status, { code: status, message: err.message || '服务器内部错误' });
  }
});

/** 端口被占用时自动顺延，最多尝试 20 个端口。 */
function start(port, attempt) {
  const n = attempt || 0;
  app.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && n < 20) {
      console.log('  端口 ' + port + ' 已被占用，尝试 ' + (port + 1) + ' ...');
      setTimeout(() => start(port + 1, n + 1), 120);
      return;
    }
    console.error('启动失败：', err.message);
    process.exit(1);
  });
  app.listen(port, '0.0.0.0', () => {
    const actual = app.address().port;
    const nets = os.networkInterfaces();
    const ips = [];
    Object.values(nets).forEach((list) => (list || []).forEach((it) => {
      if (it.family === 'IPv4' && !it.internal) ips.push(it.address);
    }));
    console.log('');
    console.log('  高校课程协作与评审平台已启动');
    console.log('  ------------------------------------');
    console.log('  本机访问: http://localhost:' + actual);
    ips.forEach((ip) => console.log('  局域网:   http://' + ip + ':' + actual));
    console.log('  按 Ctrl+C 停止');
    console.log('');
  });
}

start(BASE_PORT, 0);

process.on('SIGINT', () => { console.log('\n已停止。'); process.exit(0); });
