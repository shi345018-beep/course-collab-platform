'use strict';
/**
 * 接口与业务规则测试（独立数据目录，不影响演示数据）
 * 运行：node test/api-test.js
 */
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-test-'));
const PORT = 3100;
let server = null;
let passed = 0;
let failed = 0;

function check(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')); }
}

function request(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request({
      host: '127.0.0.1', port: PORT, path: url, method,
      headers: Object.assign(
        { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        token ? { Authorization: 'Bearer ' + token } : {}
      )
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch (e) { /* csv */ }
        resolve({ status: res.statusCode, json, raw });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function waitReady(tries) {
  return new Promise((resolve, reject) => {
    const tick = (n) => {
      request('GET', '/api/courses').then(() => resolve())
        .catch(() => (n <= 0 ? reject(new Error('server not ready')) : setTimeout(() => tick(n - 1), 200)));
    };
    tick(tries || 40);
  });
}

async function login(username) {
  const r = await request('POST', '/api/login', { username, password: '123456' });
  return r.json && r.json.data ? r.json.data.token : null;
}

async function main() {
  console.log('准备测试数据目录：' + DATA);
  const seed = spawnSync(process.execPath, ['seed.js'], {
    cwd: ROOT, env: Object.assign({}, process.env, { CP_DATA_DIR: DATA }), encoding: 'utf8'
  });
  if (seed.status !== 0) throw new Error('seed 失败: ' + seed.stderr);

  server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: Object.assign({}, process.env, { CP_DATA_DIR: DATA, PORT: String(PORT) }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await waitReady();
  console.log('\n接口测试：');

  const tTeacher = await login('teacher');
  const tStudent = await login('student1');
  const tStudent2 = await login('student5');
  const tTa = await login('ta');
  check('教师登录', !!tTeacher);
  check('学生登录', !!tStudent);
  check('助教登录', !!tTa);
  check('错误密码被拒绝', (await request('POST', '/api/login', { username: 'teacher', password: 'x' })).status === 401);

  let r = await request('GET', '/api/projects/p1', null, tTeacher);
  check('项目详情可读取', r.status === 200 && r.json.data.project.title.includes('校园'));
  check('项目含 3 个迭代', r.json.data.project.iterations.length === 3);

  r = await request('POST', '/api/submissions', {
    teamId: 't1', iterationId: 'it2', title: '接口测试提交', summary: '测试', repoUrl: 'https://example.com/r'
  }, tStudent);
  check('组长可提交未截止迭代', r.status === 200 && r.json.data.version >= 2, r.json && r.json.message);

  r = await request('POST', '/api/submissions', {
    teamId: 't2', iterationId: 'it2', title: '非组长提交', summary: '', repoUrl: ''
  }, tStudent);
  check('非本组组长提交被拒绝', r.status === 403);

  r = await request('POST', '/api/projects/p1/assign-reviews', { reviewersPerSubmission: 3 }, tTeacher);
  check('分配互评任务', r.status === 200 && r.json.data.created > 0, r.json && r.json.message);

  r = await request('GET', '/api/reviews/todo', null, tStudent2);
  const todo = r.json.data || [];
  check('评审方学生存在待评任务', todo.length > 0);
  if (todo.length) {
    const a = todo[0];
    const scores = (a.rubric || []).map((x) => ({ rubricId: x.id, score: 8 }));
    r = await request('POST', '/api/assignments/' + a.id + '/review', { scores, comment: '测试评语' }, tStudent2);
    check('提交组间互评', r.status === 200, r.json && r.json.message);
  }

  r = await request('POST', '/api/checks', { teamId: 't1', score: 90, findings: '测试检查' }, tTa);
  check('助教记录过程检查', r.status === 200, r.json && r.json.message);
  r = await request('POST', '/api/checks', { teamId: 't1', score: 60, findings: '越权' }, tStudent);
  check('学生记录检查被拒绝', r.status === 403);

  r = await request('GET', '/api/projects/p1/grades', null, tTeacher);
  check('成绩汇总可读取', r.status === 200 && r.json.data.teams.length === 4);

  r = await request('POST', '/api/projects/p1/teacher-grade', {
    teamId: 't1',
    scores: [{ rubricId: 'r1', score: 9 }, { rubricId: 'r2', score: 9 }, { rubricId: 'r3', score: 9 }, { rubricId: 'r4', score: 9 }],
    comment: '测试终评'
  }, tTeacher);
  check('教师提交终评', r.status === 200 && r.json.data.total === 90);
  r = await request('POST', '/api/projects/p1/teacher-grade', { teamId: 't1', scores: [] }, tStudent);
  check('学生提交终评被拒绝', r.status === 403);

  r = await request('POST', '/api/projects/p1/grades/publish', {}, tTeacher);
  check('发布成绩', r.status === 200 && r.json.data.published > 0, r.json && r.json.message);

  r = await request('GET', '/api/my/grades', null, tStudent);
  check('学生可查看本人成绩', r.status === 200 && r.json.data.length > 0 && r.json.data[0].final !== null);

  r = await request('GET', '/api/projects/p1/export.csv', null, tTeacher);
  check('导出 CSV 含学号表头', r.status === 200 && r.raw.includes('学号') && r.raw.includes('个人最终分'));
  r = await request('GET', '/api/projects/p1/export.csv', null, tStudent);
  check('学生导出被拒绝', r.status === 403);

  console.log('\n结果：' + passed + ' 通过，' + failed + ' 失败');
  return failed === 0 ? 0 : 1;
}

main().then((code) => {
  if (server) server.kill();
  setTimeout(() => process.exit(code), 300);
}).catch((e) => {
  console.error('测试异常：', e.message);
  if (server) server.kill();
  process.exit(1);
});
