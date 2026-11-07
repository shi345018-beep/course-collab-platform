'use strict';

const S = {
  token: localStorage.getItem('cp_token') || '',
  user: null,
  memberships: [],
  course: null,
  project: null,
  teams: [],
  view: 'dashboard',
  notif: []
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s === undefined || s === null ? '' : s)
  .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (t) => t ? String(t).replace('T', ' ').slice(0, 16) : '';
const statusText = { not_started: '未开始', in_progress: '进行中', done: '已完成', blocked: '受阻' };
const badge = (text, kind) => `<span class="badge b-${kind || 'muted'}">${esc(text)}</span>`;

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

async function api(path, opts) {
  const init = Object.assign({ headers: {} }, opts || {});
  init.headers = Object.assign({ 'Content-Type': 'application/json' }, init.headers);
  if (S.token) init.headers.Authorization = 'Bearer ' + S.token;
  if (init.body && typeof init.body !== 'string') init.body = JSON.stringify(init.body);
  const res = await fetch(path, init);
  const json = await res.json().catch(() => ({ code: res.status, message: '响应解析失败' }));
  if (!res.ok || json.code !== 0) {
    if (res.status === 401) { logout(true); }
    throw new Error(json.message || ('请求失败 (' + res.status + ')'));
  }
  return json.data;
}

/* ------------------------------------------------------------------ 登录 */
async function doLogin() {
  const err = $('#loginErr');
  err.textContent = '';
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: { username: $('#username').value.trim(), password: $('#password').value }
    });
    S.token = data.token;
    localStorage.setItem('cp_token', data.token);
    S.user = data.user;
    S.memberships = data.memberships;
    await boot();
  } catch (e) {
    err.textContent = e.message;
  }
}

function logout(silent) {
  if (!silent && S.token) api('/api/logout', { method: 'POST' }).catch(() => {});
  S.token = '';
  S.user = null;
  localStorage.removeItem('cp_token');
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
}

/* ------------------------------------------------------------------ 启动 */
async function boot() {
  if (!S.user) {
    S.user = (await api('/api/me')).user;
    S.memberships = (await api('/api/courses')).map((c) => ({ courseId: c.id, courseName: c.name, role: '' }));
  }
  const courses = await api('/api/courses');
  if (!courses.length) {
    $('#loginErr').textContent = '该账号还没有加入任何课程';
    return;
  }
  S.course = courses[0];
  const projects = await api('/api/courses/' + S.course.id + '/projects');
  S.project = projects[0] || null;
  if (S.project) {
    const detail = await api('/api/projects/' + S.project.id);
    S.project = detail.project;
    S.teams = detail.teams || [];
    S.role = detail.role;
    S.myTeamId = detail.myTeamId;
  }
  await loadNotifications();
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  S.view = 'dashboard';
  renderAll();
}

async function loadNotifications() {
  try {
    S.notif = await api('/api/notifications');
    const unread = S.notif.filter((n) => !n.read).length;
    const b = $('#bellBadge');
    b.textContent = unread;
    b.classList.toggle('hidden', unread === 0);
  } catch (e) { /* ignore */ }
}

/* ------------------------------------------------------------------ 导航 */
function navFor(role) {
  if (role === 'teacher') {
    return [['dashboard', '概览'], ['project', '项目任务'], ['teams', '小组进度'],
      ['grades', '评分与成绩'], ['logs', '过程记录']];
  }
  if (role === 'ta') {
    return [['dashboard', '概览'], ['teams', '小组进度'], ['checks', '过程检查'], ['logs', '过程记录']];
  }
  return [['dashboard', '概览'], ['teams', '我的小组'], ['submit', '迭代提交'],
    ['reviews', '同伴互评'], ['mygrades', '我的成绩']];
}

function renderNav() {
  const role = S.role || S.user.role;
  $('#nav').innerHTML = navFor(role).map(([k, t]) =>
    `<a class="${S.view === k ? 'active' : ''}" onclick="go('${k}')">${t}</a>`).join('');
  $('#whoName').textContent = S.user.name;
  $('#whoRole').textContent = ({ teacher: '教师', ta: '助教', student: '学生', admin: '管理员' })[role] || role;
  $('#userChip').textContent = S.user.name;
  $('#courseChip').textContent = S.course ? (S.course.name + ' · ' + S.course.code) : '';
}

function go(view) {
  S.view = view;
  renderNav();
  renderView();
  window.scrollTo(0, 0);
}

function renderAll() { renderNav(); renderView(); }

/* ------------------------------------------------------------------ 视图 */
async function renderView() {
  const el = $('#view');
  try {
    if (S.view === 'dashboard') return (el.innerHTML = await viewDashboard());
    if (S.view === 'project') return (el.innerHTML = await viewProject());
    if (S.view === 'teams') return (el.innerHTML = await viewTeams());
    if (S.view === 'submit') return (el.innerHTML = await viewSubmit());
    if (S.view === 'reviews') return (el.innerHTML = await viewReviews());
    if (S.view === 'grades') return (el.innerHTML = await viewGrades());
    if (S.view === 'mygrades') return (el.innerHTML = await viewMyGrades());
    if (S.view === 'checks') return (el.innerHTML = await viewChecks());
    if (S.view === 'logs') return (el.innerHTML = await viewLogs());
  } catch (e) {
    el.innerHTML = `<div class="card"><h2>出错了</h2><p>${esc(e.message)}</p></div>`;
  }
}

async function viewDashboard() {
  const d = await api('/api/dashboard');
  const cards = [
    ['课程', d.courses], ['项目', d.projects],
    [S.user.role === 'student' ? '我的小组' : '小组', d.teams || 0],
    [S.user.role === 'teacher' ? '待终评' : S.user.role === 'ta' ? '检查记录' : '待评任务',
      S.user.role === 'teacher' ? (d.pendingGrades || 0) : S.user.role === 'ta' ? (d.checks || 0) : (d.todoReviews || 0)]
  ];
  const recent = (d.recentLogs || []).map((l) => `<tr><td>${fmt(l.at || l.createdAt)}</td><td>${esc(l.actorName)}</td>
    <td>${esc(l.actionText || l.action)}</td><td>${esc(l.detail || '')}</td></tr>`).join('');
  return `<h1>概览</h1><div class="sub">${esc(S.course.name)} · ${esc(S.course.term)} · ${esc(S.course.teacherName || '')}</div>
    <div class="grid c4">${cards.map(([t, v]) => `<div class="stat"><b>${v}</b><span>${t}</span></div>`).join('')}</div>
    ${d.myGrades && d.myGrades.length ? `<div class="card" style="margin-top:14px"><h2>我的成绩</h2>
      <table><thead><tr><th>项目</th><th>团队总分</th><th>贡献系数</th><th>个人最终分</th></tr></thead><tbody>
      ${d.myGrades.map((g) => `<tr><td>${esc(g.projectTitle)}</td><td>${g.teamTotal ?? '—'}</td>
        <td>${g.factor ?? '—'}</td><td><b>${g.final ?? '—'}</b> ${g.published ? badge('已发布', 'ok') : badge('未发布', 'warn')}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
    <div class="card" style="margin-top:14px"><h2>最近动态</h2>
      ${recent ? `<table><thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>详情</th></tr></thead><tbody>${recent}</tbody></table>` : '<div class="empty">暂无记录</div>'}
    </div>`;
}

async function viewProject() {
  if (!S.project) return '<div class="card"><h2>暂无项目任务</h2></div>';
  const p = S.project;
  const its = (p.iterations || []).map((i) => `<tr><td>${i.seq}</td><td>${esc(i.name)}</td>
    <td>${esc(i.goal)}</td><td>${fmt(i.dueDate)}</td><td>${esc((i.deliverables || []).join('、'))}</td></tr>`).join('');
  const isTeacher = S.role === 'teacher' || S.user.role === 'admin';
  return `<h1>项目任务</h1><div class="sub">${esc(p.title)} · ${p.status === 'published' ? badge('已发布', 'ok') : badge('草稿', 'muted')}</div>
    <div class="card"><h2>${esc(p.title)}</h2>
      <dl class="kv"><dt>说明</dt><dd>${esc(p.description)}</dd>
        <dt>周期</dt><dd>${esc(p.startDate)} — ${esc(p.dueDate)}</dd>
        <dt>组队人数</dt><dd>${p.teamMin}—${p.teamMax} 人</dd>
        <dt>成绩权重</dt><dd>互评 ${p.weights.peer}% ｜ 过程 ${p.weights.ta}% ｜ 终评 ${p.weights.teacher}%</dd>
        <dt>互评设置</dt><dd>每份提交由 ${p.review.reviewersPerSubmission || 3} 个小组评审</dd></dl>
      ${isTeacher ? `<div class="row" style="margin-top:12px">
        <button class="btn ghost sm" onclick="openIteration()">新增迭代</button>
        ${p.status !== 'published' ? '<button class="btn sm" onclick="publishProject()">发布项目</button>' : ''}
        <button class="btn ghost sm" onclick="assignReviews()">分配同伴互评</button></div>` : ''}
    </div>
    <div class="card"><h2>迭代阶段</h2>
      <table><thead><tr><th>#</th><th>阶段</th><th>目标</th><th>截止</th><th>应交付</th></tr></thead><tbody>${its}</tbody></table>
    </div>`;
}

async function viewTeams() {
  const role = S.role || S.user.role;
  const teams = await api('/api/projects/' + S.project.id + '/teams');
  S.teams = teams;
  const rows = teams.map((t) => {
    const mine = (t.members || []).some((m) => m.id === S.user.id);
    const canJoin = role === 'student' && !mine && !S.myTeamId && t.openJoin;
    const prog = (t.iterations || []).map((i) => `${i.seq}.${statusText[i.status] || i.status}`).join(' ｜ ');
    return `<tr><td>${esc(t.name)} ${mine ? badge('我的小组', 'info') : ''}</td>
      <td>${t.memberCount} 人</td>
      <td>${esc((t.members || []).map((m) => m.name).join('、'))}</td>
      <td>${esc(prog)}</td>
      <td>${canJoin ? `<button class="btn sm" onclick="joinTeam('${t.id}')">加入</button>` : '—'}</td></tr>`;
  }).join('');
  const canCreate = role === 'student' && !S.myTeamId;
  return `<h1>${role === 'student' ? '我的小组' : '小组进度'}</h1>
    <div class="sub">${esc(S.project.title)} · 共 ${teams.length} 个小组</div>
    <div class="card"><h2>小组列表</h2>
      <table><thead><tr><th>小组</th><th>人数</th><th>成员</th><th>迭代进度</th><th>操作</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="empty">暂无小组</td></tr>'}</tbody></table>
      ${canCreate ? `<div class="row" style="margin-top:12px"><input id="newTeamName" type="text" placeholder="新小组名称" style="max-width:220px">
        <button class="btn sm" onclick="createTeam()">创建小组</button></div>` : ''}
      <div class="note">组队规则：每组 3—5 人；达到上限后不能继续加入。</div>
    </div>`;
}

async function viewSubmit() {
  if (!S.myTeamId) return '<div class="card"><h2>你还没有加入小组</h2><p>请先在"我的小组"中加入或创建小组。</p></div>';
  const team = await api('/api/teams/' + S.myTeamId);
  const t = team.team;
  const its = t.iterations.map((i) => `<option value="${i.id}">${i.seq}. ${esc(i.name)}（截止 ${fmt(i.dueDate)}）</option>`).join('');
  const subs = await api('/api/submissions?teamId=' + t.id);
  const rows = subs.map((s) => `<tr><td>v${s.version}</td><td>${esc(s.title)}</td><td>${fmt(s.submittedAt)}</td>
    <td>${badge('已提交', 'ok')}</td></tr>`).join('');
  return `<h1>迭代提交</h1><div class="sub">${esc(t.name)} · 仅组长可正式提交（BR-12）</div>
    <div class="card"><h2>正式提交</h2>
      <label class="f">迭代阶段</label><select id="subIter">${its}</select>
      <label class="f">成果标题</label><input id="subTitle" type="text" placeholder="如：迭代2 商品与订单模块">
      <label class="f">成果说明</label><textarea id="subSummary" placeholder="完成内容、未完成项、已知问题"></textarea>
      <div class="grid c2">
        <div><label class="f">代码仓库链接</label><input id="subRepo" type="text" placeholder="https://github.com/..."></div>
        <div><label class="f">附件链接（可选）</label><input id="subAttach" type="text"></div>
      </div>
      <div class="row" style="margin-top:12px"><button class="btn" onclick="submitWork()">正式提交</button></div>
      <div class="note">迭代截止后提交会被拒绝（ST-09）；补交须由教师退回后开启（BR-15）。</div>
    </div>
    <div class="card"><h2>版本记录</h2>
      ${rows ? `<table><thead><tr><th>版本</th><th>标题</th><th>提交时间</th><th>状态</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">暂无提交</div>'}
    </div>`;
}

async function viewReviews() {
  const todo = await api('/api/reviews/todo');
  const rows = todo.map((a) => `<tr><td>${esc(a.targetTeam)}</td><td>${esc(a.submission ? a.submission.title : '')}</td>
    <td>${fmt(a.dueDate)}</td><td>${badge('待评审', 'warn')}</td>
    <td><button class="btn sm" onclick='openReview(${JSON.stringify(a).replace(/'/g, "&#39;")})'>去评审</button></td></tr>`).join('');
  let internal = '';
  if (S.myTeamId) {
    const team = (await api('/api/teams/' + S.myTeamId)).team;
    const mates = team.members.filter((m) => m.id !== S.user.id);
    internal = `<div class="card"><h2>组内互评（BR-19）</h2>
      <div class="sub">匿名评价队友的贡献、沟通配合与产出质量</div>
      ${mates.map((m) => `<div class="row" style="justify-content:space-between;border-bottom:1px solid #eef1f5;padding:8px 0">
        <span>${esc(m.name)}</span><button class="btn ghost sm" onclick="openInternal('${m.id}','${esc(m.name)}')">评价</button></div>`).join('')}
      <div class="note">互评对学生匿名，教师可见评审人；对结果有异议可向教师申诉（BR-09）。</div>
    </div>`;
  }
  return `<h1>同伴互评</h1><div class="sub">待评审 ${todo.length} 份</div>
    <div class="card"><h2>组间互评任务</h2>
      ${rows ? `<table><thead><tr><th>被评小组</th><th>提交物</th><th>截止</th><th>状态</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">暂无待评审任务</div>'}
      <div class="note">互评匿名：被评小组看不到评审人；教师可查看评审人。若小组不足 4 个，按实际可用组数分配并标注"互评份数不足"。</div>
    </div>${internal}`;
}

async function viewGrades() {
  const data = await api('/api/projects/' + S.project.id + '/grades');
  const rows = data.teams.map((t) => `<tr><td>${esc(t.teamName)}</td>
    <td>${t.peer.score ?? '—'}</td><td>${t.ta.score ?? '—'}</td><td>${t.teacher.score ?? '—'}</td>
    <td><b>${t.total ?? '—'}</b></td>
    <td>${t.published ? badge('已发布', 'ok') : t.complete ? badge('待发布', 'warn') : badge('未完整', 'warn')}</td>
    <td><button class="btn ghost sm" onclick="openTeacherGrade('${t.teamId}','${esc(t.teamName)}')">终评</button></td></tr>`).join('');
  return `<h1>评分与成绩</h1><div class="sub">权重 ${data.weights.peer}/${data.weights.ta}/${data.weights.teacher} · 缺项按已有权重重归一化</div>
    <div class="grid c4">
      <div class="stat"><b>${data.stats.average ?? '—'}</b><span>平均团队分</span></div>
      <div class="stat"><b>${data.stats.completeTeams}/${data.stats.teamCount}</b><span>分项齐全</span></div>
      <div class="stat"><b>${data.stats.publishedTeams}</b><span>已发布</span></div>
      <div class="stat"><b>${data.stats.gradedTeams}</b><span>已有成绩</span></div>
    </div>
    <div class="card" style="margin-top:14px"><h2>团队成绩</h2>
      <table><thead><tr><th>小组</th><th>同伴互评</th><th>过程检查</th><th>教师终评</th><th>团队总分</th><th>状态</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="row" style="margin-top:12px">
        <button class="btn" onclick="publishGrades()">汇总并发布成绩</button>
        <button class="btn ghost" onclick="exportCsv()">导出成绩（CSV）</button>
      </div>
      <div class="note">发布后学生可见本人最终分与本组团队分；队友个人分不可见（BR-08）。</div>
    </div>`;
}

async function viewMyGrades() {
  const list = await api('/api/my/grades');
  if (!list.length) return '<div class="card"><h2>暂无成绩</h2><p>教师发布后即可查看。</p></div>';
  const rows = list.map((g) => `<tr><td>${esc(g.projectTitle)}</td><td>${esc(g.teamName)}</td>
    <td>${g.teamTotal ?? '—'}</td><td>${g.factor ?? '—'}</td><td><b>${g.final ?? '—'}</b></td>
    <td>${g.published ? badge('已发布', 'ok') : badge('未发布', 'warn')}</td></tr>`).join('');
  return `<h1>我的成绩</h1><div class="sub">仅显示本人最终分与本组团队分</div>
    <div class="card"><table><thead><tr><th>项目</th><th>小组</th><th>团队总分</th><th>贡献系数</th><th>个人最终分</th><th>状态</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

async function viewChecks() {
  const teams = await api('/api/projects/' + S.project.id + '/teams');
  const opts = teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  const checks = await api('/api/checks');
  const rows = checks.map((c) => {
    const t = teams.find((x) => x.id === c.teamId);
    return `<tr><td>${esc(c.checkDate)}</td><td>${esc(t ? t.name : c.teamId)}</td>
      <td>${c.score}</td><td>${esc(c.findings || '')}</td></tr>`;
  }).join('');
  return `<h1>过程检查</h1><div class="sub">助教记录过程检查，作为过程分依据（BR-21）</div>
    <div class="card"><h2>新建检查记录</h2>
      <label class="f">小组</label><select id="chkTeam">${opts}</select>
      <label class="f">整体评价</label><textarea id="chkFindings"></textarea>
      <label class="f">过程得分（0—100）</label><input id="chkScore" type="number" value="85" style="max-width:150px">
      <div class="row" style="margin-top:12px"><button class="btn" onclick="saveCheck()">保存检查记录</button></div>
      <div class="note">助教不能修改教师评分、不能发布成绩（BR-11）。</div>
    </div>
    <div class="card"><h2>检查历史</h2>
      ${rows ? `<table><thead><tr><th>日期</th><th>小组</th><th>得分</th><th>结论</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">暂无记录</div>'}
    </div>`;
}

async function viewLogs() {
  const logs = await api('/api/logs?courseId=' + S.course.id);
  const rows = logs.map((l) => `<tr><td>${fmt(l.at)}</td><td>${esc(l.actorName)}</td>
    <td>${esc(l.actionText || l.action)}</td><td>${esc(l.detail || '')}</td></tr>`).join('');
  return `<h1>项目过程记录</h1><div class="sub">关键操作自动留痕，不可删除、不可修改（BR-26）</div>
    <div class="card">${rows ? `<table><thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>详情</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">暂无记录</div>'}</div>`;
}

/* ------------------------------------------------------------------ 动作 */
async function joinTeam(id) {
  try { await api('/api/teams/' + id + '/join', { method: 'POST' }); toast('已加入小组'); await reloadProject(); go('teams'); }
  catch (e) { toast(e.message); }
}
async function createTeam() {
  try {
    await api('/api/projects/' + S.project.id + '/teams', { method: 'POST', body: { name: document.getElementById('newTeamName').value } });
    toast('小组已创建'); await reloadProject(); go('teams');
  } catch (e) { toast(e.message); }
}
async function submitWork() {
  try {
    await api('/api/submissions', { method: 'POST', body: {
      teamId: S.myTeamId,
      iterationId: document.getElementById('subIter').value,
      title: document.getElementById('subTitle').value,
      summary: document.getElementById('subSummary').value,
      repoUrl: document.getElementById('subRepo').value,
      attachmentUrl: document.getElementById('subAttach').value
    } });
    toast('提交成功'); go('submit');
  } catch (e) { toast(e.message); }
}
async function publishProject() {
  try { await api('/api/projects/' + S.project.id + '/publish', { method: 'POST' }); toast('已发布'); await reloadProject(); go('project'); }
  catch (e) { toast(e.message); }
}
async function assignReviews() {
  try {
    const r = await api('/api/projects/' + S.project.id + '/assign-reviews', { method: 'POST', body: { reviewersPerSubmission: 3 } });
    toast('已生成 ' + r.created + ' 个评审任务（每组 ' + r.reviewersPerSubmission + ' 份）');
  } catch (e) { toast(e.message); }
}
async function publishGrades() {
  try { const r = await api('/api/projects/' + S.project.id + '/grades/publish', { method: 'POST' }); toast('已发布 ' + r.published + ' 个小组的成绩'); go('grades'); }
  catch (e) { toast(e.message); }
}
async function saveCheck() {
  try {
    await api('/api/checks', { method: 'POST', body: {
      teamId: document.getElementById('chkTeam').value,
      findings: document.getElementById('chkFindings').value,
      score: Number(document.getElementById('chkScore').value)
    } });
    toast('检查记录已保存'); go('checks');
  } catch (e) { toast(e.message); }
}

async function reloadProject() {
  const d = await api('/api/projects/' + S.project.id);
  S.project = d.project; S.teams = d.teams; S.myTeamId = d.myTeamId; S.role = d.role;
}

/* -------------------------------------------------------------- 弹窗表单 */
function modal(html) {
  $('#modalRoot').innerHTML = `<div class="modal-mask" onclick="if(event.target===this)closeModal()"><div class="modal">${html}</div></div>`;
}
function closeModal() { $('#modalRoot').innerHTML = ''; }

function openIteration() {
  modal(`<h3>新增迭代阶段</h3>
    <label class="f">名称</label><input id="itName" type="text" placeholder="如：测试与交付">
    <label class="f">目标</label><input id="itGoal" type="text">
    <label class="f">截止时间</label><input id="itDue" type="datetime-local">
    <div class="row" style="margin-top:14px"><button class="btn" onclick="saveIteration()">保存</button>
    <button class="btn ghost" onclick="closeModal()">取消</button></div>`);
}
async function saveIteration() {
  try {
    await api('/api/projects/' + S.project.id + '/iterations', { method: 'POST', body: {
      name: document.getElementById('itName').value,
      goal: document.getElementById('itGoal').value,
      dueDate: new Date(document.getElementById('itDue').value).toISOString()
    } });
    closeModal(); toast('迭代已创建'); await reloadProject(); go('project');
  } catch (e) { toast(e.message); }
}

function rubricForm(rubric, prefix) {
  return rubric.map((r, i) => `<tr><td>${esc(r.name)}</td><td>${r.max}</td>
    <td><input id="${prefix}${i}" type="number" min="0" max="${r.max}" value="${Math.round(r.max * 0.85)}" style="width:76px"></td></tr>`).join('');
}

function openReview(a) {
  window.__review = a;
  modal(`<h3>互评：${esc(a.targetTeam)}</h3>
    <div class="note">提交物：${esc(a.submission.title)}。互评匿名，教师可见评审人。</div>
    <table style="margin-top:10px"><thead><tr><th>维度</th><th>满分</th><th>得分</th></tr></thead>
      <tbody>${rubricForm(a.rubric, 'rv')}</tbody></table>
    <label class="f">评语</label><textarea id="rvComment" placeholder="具体说明优点与问题"></textarea>
    <div class="row" style="margin-top:14px"><button class="btn" onclick="saveReview()">提交互评</button>
    <button class="btn ghost" onclick="closeModal()">取消</button></div>`);
}
async function saveReview() {
  const a = window.__review;
  const scores = a.rubric.map((r, i) => ({ rubricId: r.id, score: Number(document.getElementById('rv' + i).value) }));
  try {
    await api('/api/assignments/' + a.id + '/review', { method: 'POST', body: { scores, comment: document.getElementById('rvComment').value } });
    closeModal(); toast('互评已提交'); go('reviews');
  } catch (e) { toast(e.message); }
}

function openInternal(id, name) {
  modal(`<h3>组内互评：${esc(name)}</h3>
    <div class="note">评价维度：贡献、沟通配合、产出质量；匿名提交，教师可见。</div>
    <table style="margin-top:10px"><thead><tr><th>维度</th><th>满分</th><th>得分</th></tr></thead>
      <tbody><tr><td>贡献</td><td>10</td><td><input id="in0" type="number" value="8" min="0" max="10" style="width:76px"></td></tr>
      <tr><td>沟通配合</td><td>10</td><td><input id="in1" type="number" value="8" min="0" max="10" style="width:76px"></td></tr>
      <tr><td>产出质量</td><td>10</td><td><input id="in2" type="number" value="8" min="0" max="10" style="width:76px"></td></tr></tbody></table>
    <label class="f">说明</label><textarea id="inComment"></textarea>
    <div class="row" style="margin-top:14px"><button class="btn" onclick="saveInternal('${id}')">提交</button>
    <button class="btn ghost" onclick="closeModal()">取消</button></div>`);
}
async function saveInternal(id) {
  const scores = [
    { rubricId: 'i1', score: Number(document.getElementById('in0').value) },
    { rubricId: 'i2', score: Number(document.getElementById('in1').value) },
    { rubricId: 'i3', score: Number(document.getElementById('in2').value) }
  ];
  try {
    await api('/api/teams/' + S.myTeamId + '/internal-reviews', { method: 'POST', body: { targetUserId: id, scores, comment: document.getElementById('inComment').value } });
    closeModal(); toast('组内互评已提交');
  } catch (e) { toast(e.message); }
}

async function openTeacherGrade(teamId, teamName) {
  const p = S.project;
  modal(`<h3>终评：${esc(teamName)}</h3>
    <table><thead><tr><th>维度</th><th>满分</th><th>得分</th></tr></thead><tbody>${rubricForm(p.rubric, 'tg')}</tbody></table>
    <label class="f">评语</label><textarea id="tgComment"></textarea>
    <div class="row" style="margin-top:14px"><button class="btn" onclick="saveTeacherGrade('${teamId}')">提交终评</button>
    <button class="btn ghost" onclick="closeModal()">取消</button></div>`);
}
async function saveTeacherGrade(teamId) {
  const scores = S.project.rubric.map((r, i) => ({ rubricId: r.id, score: Number(document.getElementById('tg' + i).value) }));
  try {
    await api('/api/projects/' + S.project.id + '/teacher-grade', { method: 'POST', body: { teamId, scores, comment: document.getElementById('tgComment').value } });
    closeModal(); toast('终评已提交'); go('grades');
  } catch (e) { toast(e.message); }
}

async function exportCsv() {
  try {
    const res = await fetch('/api/projects/' + S.project.id + '/export.csv', { headers: { Authorization: 'Bearer ' + S.token } });
    if (!res.ok) throw new Error('导出失败');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '成绩汇总.csv';
    a.click();
    toast('已导出成绩文件');
  } catch (e) { toast(e.message); }
}

/* ---------------------------------------------------------------- 通知 */
$('#bell').onclick = async () => {
  await loadNotifications();
  const rows = S.notif.slice(0, 20).map((n) => `<tr><td>${fmt(n.createdAt)}</td><td>${esc(n.title)}</td>
    <td>${esc(n.body || '')}</td><td>${n.read ? badge('已读', 'muted') : badge('未读', 'warn')}</td></tr>`).join('');
  modal(`<h3>通知</h3>${rows ? `<table><thead><tr><th>时间</th><th>标题</th><th>内容</th><th>状态</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">暂无通知</div>'}
    <div class="row" style="margin-top:12px"><button class="btn ghost" onclick="markRead()">全部标为已读</button>
    <button class="btn" onclick="closeModal()">关闭</button></div>`);
};
async function markRead() {
  await api('/api/notifications/read', { method: 'POST' });
  await loadNotifications();
  closeModal();
  toast('已全部标为已读');
}

/* ---------------------------------------------------------------- 绑定 */
$('#loginBtn').onclick = doLogin;
$('#password').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
document.querySelectorAll('.demo span').forEach((s) => {
  s.onclick = () => { $('#username').value = s.dataset.u; $('#password').value = '123456'; };
});
$('#logoutBtn').onclick = () => logout();

(async function init() {
  const demo = new URLSearchParams(location.search).get('demo');
  if (demo && !S.token) {
    $('#username').value = demo;
    $('#password').value = '123456';
    await doLogin();
    return;
  }
  if (S.token) {
    try { await boot(); return; } catch (e) { logout(true); }
  }
})();
