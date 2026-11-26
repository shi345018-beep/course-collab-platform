'use strict';
/**
 * 端到端功能验收脚本（独立数据目录，不污染演示数据）。
 * 覆盖：课程、项目、迭代、组队、提交、互评、组内互评、过程检查、
 *       终评、发布、申诉、导出、通知、日志、概览、组长移交、权限边界。
 *
 * 运行：node test/functional-test.js
 */
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-func-'));
const PORT = 3210;
const BASE = 'http://127.0.0.1:' + PORT;
let server = null;
let passed = 0;
let failed = 0;

function check(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')); }
}

function request(method, pathname, body, token) {
  return new Promise(function (resolve, reject) {
    const payload = body ? JSON.stringify(body) : '';
    const req = http.request({
      host: '127.0.0.1', port: PORT, path: pathname, method: method,
      headers: Object.assign(
        { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        token ? { Authorization: 'Bearer ' + token } : {}
      )
    }, function (res) {
      let raw = '';
      res.on('data', function (c) { raw += c; });
      res.on('end', function () {
        let json = null;
        try { json = JSON.parse(raw); } catch (e) { /* csv */ }
        resolve({ status: res.statusCode, json: json, raw: raw });
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function api(method, pathname, body, token) {
  const res = await request(method, pathname, body, token);
  if (res.status >= 400) {
    const err = new Error((res.json && res.json.message) || ('HTTP ' + res.status));
    err.status = res.status;
    throw err;
  }
  return res.json ? res.json.data : null;
}

async function expectStatus(method, pathname, body, token, status) {
  const res = await request(method, pathname, body, token);
  return res.status === status;
}

function waitReady(tries) {
  return new Promise(function (resolve, reject) {
    const tick = function (n) {
      http.get(BASE + '/api/courses', function () { resolve(); })
        .on('error', function () {
          if (n <= 0) reject(new Error('服务未就绪'));
          else setTimeout(function () { tick(n - 1); }, 200);
        });
    };
    tick(tries || 50);
  });
}

async function login(username) {
  const data = await api('POST', '/api/login', { username: username, password: '123456' });
  return { token: data.token, user: data.user };
}

async function main() {
  console.log('功能验收测试（独立数据目录）');
  const seed = spawnSync(process.execPath, ['seed.js'], {
    cwd: ROOT, env: Object.assign({}, process.env, { CP_DATA_DIR: DATA }), encoding: 'utf8'
  });
  if (seed.status !== 0) throw new Error('seed 失败: ' + seed.stderr);

  server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { CP_DATA_DIR: DATA, PORT: String(PORT) }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await waitReady();

  const teacher = await login('teacher');
  const ta = await login('ta');
  const s1 = await login('student1');
  const s2 = await login('student2');
  const s3 = await login('student3');
  const s4 = await login('student4');
  const s5 = await login('student5');

  console.log('\n[1] 课程与项目');
  const course = await api('POST', '/api/courses', {
    code: 'FC100', name: '功能验收课程', term: '2027 春'
  }, teacher.token);
  check('教师创建课程并生成邀请码', !!course.inviteCode);

  for (const u of ['student1', 'student2', 'student3', 'student4', 'student5']) {
    await api('POST', '/api/courses/' + course.id + '/members', { identifier: u, role: 'student' }, teacher.token);
  }
  await api('POST', '/api/courses/' + course.id + '/members', { identifier: 'ta', role: 'ta' }, teacher.token);
  const detail = await api('GET', '/api/courses/' + course.id, null, teacher.token);
  check('课程成员导入（5 学生 + 1 助教）', detail.members.length === 7, '实际 ' + detail.members.length);
  check('学生不能创建课程', await expectStatus('POST', '/api/courses', { code: 'X', name: '越权' }, s1.token, 403));

  const project = await api('POST', '/api/projects', {
    courseId: course.id, title: '功能验收项目', teamMin: 2, teamMax: 5
  }, teacher.token);
  check('创建项目任务（草稿）', project.status === 'draft');
  check('无迭代不能发布', await expectStatus('POST', '/api/projects/' + project.id + '/publish', {}, teacher.token, 400));
  const iteration = await api('POST', '/api/projects/' + project.id + '/iterations', {
    name: '迭代 1', dueDate: new Date(Date.now() + 5 * 86400000).toISOString()
  }, teacher.token);
  const published = await api('POST', '/api/projects/' + project.id + '/publish', {}, teacher.token);
  check('发布项目任务', published.status === 'published' && published.iterationCount === 1);

  console.log('\n[2] 组队与进度');
  const teamA = await api('POST', '/api/projects/' + project.id + '/teams', { name: 'A 组' }, s1.token);
  await api('POST', '/api/teams/' + teamA.id + '/join', {}, s2.token);
  await api('POST', '/api/teams/' + teamA.id + '/join', {}, s3.token);
  const teamB = await api('POST', '/api/projects/' + project.id + '/teams', { name: 'B 组' }, s4.token);
  await api('POST', '/api/teams/' + teamB.id + '/join', {}, s5.token);
  const teamAInfo = await api('GET', '/api/teams/' + teamA.id, null, teacher.token);
  check('组队成功且 A 组 3 人', teamAInfo.team.memberCount === 3);
  const progressed = await api('POST', '/api/teams/' + teamA.id + '/progress', {
    iterationId: iteration.id, status: 'in_progress', note: '功能测试'
  }, s1.token);
  check('更新迭代进度', progressed.iterations[0].status === 'in_progress');

  console.log('\n[3] 成果提交与版本');
  const sub1 = await api('POST', '/api/submissions', {
    teamId: teamA.id, iterationId: iteration.id, title: 'A 组成果 v1', summary: '第一版'
  }, s1.token);
  const sub2 = await api('POST', '/api/submissions', {
    teamId: teamA.id, iterationId: iteration.id, title: 'A 组成果 v2', summary: '第二版'
  }, s1.token);
  check('组长连续提交生成 v1 / v2', sub1.version === 1 && sub2.version === 2);
  check('非组长提交被拒绝', await expectStatus('POST', '/api/submissions', {
    teamId: teamA.id, iterationId: iteration.id, title: '越权提交'
  }, s2.token, 403));

  console.log('\n[4] 同伴互评');
  const assigned = await api('POST', '/api/projects/' + project.id + '/assign-reviews', {
    reviewersPerSubmission: 1
  }, teacher.token);
  check('分配互评任务', assigned.created >= 1, 'created=' + assigned.created);
  const todo = await api('GET', '/api/reviews/todo', null, s4.token);
  check('评审方看到待评任务', todo.length >= 1);
  check('互评只针对最新版本 v2', todo[0] && todo[0].submission.version === 2, todo[0] && 'v' + todo[0].submission.version);
  const scores = todo[0].rubric.map(function (r) { return { rubricId: r.id, score: 8 }; });
  await api('POST', '/api/assignments/' + todo[0].id + '/review', { scores: scores, comment: '功能测试评语' }, s4.token);
  check('组间互评提交成功', true);

  console.log('\n[5] 组内互评与过程检查');
  await api('POST', '/api/teams/' + teamA.id + '/internal-reviews', {
    targetUserId: s1.user.id,
    scores: [{ rubricId: 'i1', score: 8 }, { rubricId: 'i2', score: 8 }, { rubricId: 'i3', score: 8 }],
    comment: '贡献稳定'
  }, s2.token);
  check('组内互评提交成功', true);
  await api('POST', '/api/checks', {
    teamId: teamA.id, iterationId: iteration.id, score: 90, findings: '进度正常'
  }, ta.token);
  const checks = await api('GET', '/api/checks?teamId=' + teamA.id, null, teacher.token);
  check('助教过程检查已记录', checks.length === 1 && checks[0].score === 90);
  check('学生不能记录检查', await expectStatus('POST', '/api/checks', { teamId: teamA.id, score: 10 }, s1.token, 403));

  console.log('\n[6] 终评、发布与申诉');
  const rubricScores = [
    { rubricId: 'r1', score: 9 }, { rubricId: 'r2', score: 9 },
    { rubricId: 'r3', score: 9 }, { rubricId: 'r4', score: 9 }
  ];
  const graded = await api('POST', '/api/projects/' + project.id + '/teacher-grade', {
    teamId: teamA.id, scores: rubricScores, comment: '功能验收终评'
  }, teacher.token);
  check('教师终评折算为 90', graded.total === 90);
  const publishedGrades = await api('POST', '/api/projects/' + project.id + '/grades/publish', {}, teacher.token);
  check('发布成绩', publishedGrades.published >= 1);
  const mine = await api('GET', '/api/my/grades', null, s1.token);
  const mineRow = mine.filter(function (g) { return g.projectId === project.id; })[0];
  check('学生查看本人成绩', !!mineRow && mineRow.final !== null && mineRow.published === true);

  const appeal = await api('POST', '/api/projects/' + project.id + '/appeals', {
    reason: '希望核对互评分'
  }, s1.token);
  check('学生提交申诉', appeal.status === 'submitted');
  const appeals = await api('GET', '/api/projects/' + project.id + '/appeals', null, teacher.token);
  await api('POST', '/api/appeals/' + appeals[0].id + '/resolve', { decision: 'keep', comment: '核对无误' }, teacher.token);
  const afterResolution = await api('GET', '/api/projects/' + project.id + '/grades', null, teacher.token);
  check('申诉处理后解冻', afterResolution.teams[0].frozen === false);

  console.log('\n[7] 导出、通知与日志');
  const csv = await request('GET', '/api/projects/' + project.id + '/export.csv', null, teacher.token);
  check('导出 CSV 含学号与最终分', csv.status === 200 && csv.raw.indexOf('学号') >= 0 && csv.raw.indexOf('个人最终分') >= 0);
  check('学生不能导出成绩', await expectStatus('GET', '/api/projects/' + project.id + '/export.csv', null, s1.token, 403));
  const notifications = await api('GET', '/api/notifications', null, s1.token);
  check('学生收到通知', notifications.length >= 1);
  await api('POST', '/api/notifications/read', {}, s1.token);
  const logs = await api('GET', '/api/logs?courseId=' + course.id, null, teacher.token);
  check('过程记录包含提交动作', logs.some(function (l) { return l.action === 'submission_create'; }));

  console.log('\n[8] 概览读模型');
  const dashTeacher = await api('GET', '/api/dashboard', null, teacher.token);
  const dashStudent = await api('GET', '/api/dashboard', null, s1.token);
  const dashTa = await api('GET', '/api/dashboard', null, ta.token);
  check('教师概览', dashTeacher.role === 'teacher' && dashTeacher.projects >= 1);
  check('学生概览含本人成绩', Array.isArray(dashStudent.myGrades) && dashStudent.myGrades.length >= 1);
  check('助教概览', dashTa.role === 'ta' && typeof dashTa.teams === 'number');

  console.log('\n[9] 组长移交与权限边界');
  const transfer = await api('POST', '/api/teams/' + teamA.id + '/leader-transfer', {
    targetUserId: s3.user.id, reason: '功能测试移交'
  }, s2.token);
  await api('POST', '/api/transfers/' + transfer.id + '/vote', {}, s3.token);
  const transferList = await api('GET', '/api/projects/' + project.id + '/transfers', null, teacher.token);
  const pending = transferList.filter(function (t) { return t.id === transfer.id; })[0];
  check('移交达到半数进入待教师确认', pending && pending.status === 'pending_teacher', pending && pending.status);
  const confirmed = await api('POST', '/api/transfers/' + transfer.id + '/confirm', {}, teacher.token);
  check('教师确认后组长变更', confirmed.leaderId === s3.user.id);
  check('学生不能确认移交', await expectStatus('POST', '/api/transfers/' + transfer.id + '/confirm', {}, s2.token, 403));

  console.log('\n结果：' + passed + ' 通过，' + failed + ' 失败');
  return failed === 0 ? 0 : 1;
}

main().then(function (code) {
  if (server) server.kill();
  setTimeout(function () { process.exit(code); }, 300);
}).catch(function (err) {
  console.error('\n测试异常：', err.message);
  if (server) server.kill();
  process.exit(1);
});
