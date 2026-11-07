'use strict';
/**
 * 演示数据：1 门课程、1 个项目、3 个迭代、4 个小组、教师 / 助教 / 13 名学生。
 * 运行：node seed.js（会覆盖 data/db.json）
 */
const store = require('./lib/store');
const auth = require('./lib/auth');
const act = require('./lib/activity');

function iso(daysFromNow, hour) {
  const d = new Date(Date.now() + daysFromNow * 86400000);
  if (hour !== undefined) d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}
const date = (days) => iso(days).slice(0, 10);
const pwd = auth.hashPassword('123456');

store.reset(() => {
  const teacher = store.insert('users', {
    username: 'teacher', name: '王建民', role: 'teacher', password: pwd, email: 'teacher@example.edu'
  });
  const ta = store.insert('users', {
    username: 'ta', name: '李思远', role: 'ta', password: pwd, email: 'ta@example.edu'
  });
  const names = ['石尚', '吕柯锋', '裘文涛', '呼垚彬', '陈子航', '周雨桐', '林嘉禾',
    '赵一鸣', '钱思远', '孙可欣', '李文博', '吴忻怡', '郑天宇'];
  const students = names.map((name, i) => store.insert('users', {
    username: 'student' + (i + 1), name, role: 'student', password: pwd,
    studentNo: '2023' + String(1001 + i), email: 'student' + (i + 1) + '@example.edu'
  }));

  const course = store.insert('courses', {
    code: 'CS302', name: '软件工程', term: '2026 秋',
    description: '项目制课程：以小组为单位完成一个完整的 Web 系统，按迭代交付并开展同伴互评。',
    teacherId: teacher.id, inviteCode: 'SE2026', status: 'active'
  });
  store.insert('members', { courseId: course.id, userId: teacher.id, role: 'teacher', joinedAt: iso(-60) });
  store.insert('members', { courseId: course.id, userId: ta.id, role: 'ta', joinedAt: iso(-60) });
  students.forEach((s) => store.insert('members', { courseId: course.id, userId: s.id, role: 'student', joinedAt: iso(-55) }));

  const project = store.insert('projects', {
    courseId: course.id, title: '校园二手交易平台',
    description: '面向校内学生的二手交易 Web 应用，按三个迭代分阶段交付。',
    requirements: ['用户注册与登录', '商品发布与检索', '订单与模拟支付', '后台管理与统计'],
    status: 'published', startDate: date(-45), dueDate: date(28),
    teamMin: 3, teamMax: 5,
    weights: { peer: 20, ta: 20, teacher: 60 },
    rubric: [
      { id: 'r1', name: '功能完成度', max: 10, weight: 40 },
      { id: 'r2', name: '工程质量', max: 10, weight: 30 },
      { id: 'r3', name: '文档与演示', max: 10, weight: 20 },
      { id: 'r4', name: '过程规范', max: 10, weight: 10 }
    ],
    internalRubric: [
      { id: 'i1', name: '贡献', max: 10, weight: 50 },
      { id: 'i2', name: '沟通配合', max: 10, weight: 25 },
      { id: 'i3', name: '产出质量', max: 10, weight: 25 }
    ],
    review: { crossTeam: true, internal: true, anonymous: true, reviewersPerSubmission: 3 },
    createdBy: teacher.id, publishedAt: iso(-45)
  });

  const it1 = store.insert('iterations', {
    projectId: project.id, seq: 1, name: '需求与原型', goal: '完成需求文档与可点击原型',
    startDate: date(-45), dueDate: iso(-10, 18), deliverables: ['需求文档', '原型链接'], status: 'open'
  });
  const it2 = store.insert('iterations', {
    projectId: project.id, seq: 2, name: '核心功能开发', goal: '完成商品、订单与支付主流程',
    startDate: date(-9), dueDate: iso(3, 18), deliverables: ['可运行系统', '接口文档'], status: 'open'
  });
  store.insert('iterations', {
    projectId: project.id, seq: 3, name: '测试与交付', goal: '完成测试、文档与答辩材料',
    startDate: date(4), dueDate: date(28), deliverables: ['测试报告', '演示视频'], status: 'open'
  });

  const teamDefs = [
    { name: '第一组', ids: [0, 1, 2, 3], taId: ta.id },
    { name: '第二组', ids: [4, 5, 6], taId: ta.id },
    { name: '第三组', ids: [7, 8, 9], taId: null },
    { name: '第四组', ids: [10, 11, 12], taId: null }
  ];
  const teams = teamDefs.map((def) => {
    const leader = students[def.ids[0]];
    const t = store.insert('teams', {
      projectId: project.id, courseId: course.id, name: def.name,
      leaderId: leader.id, taId: def.taId, openJoin: true, status: 'active'
    });
    def.ids.forEach((idx, k) => store.insert('teamMembers', {
      teamId: t.id, userId: students[idx].id, role: k === 0 ? 'leader' : 'member',
      joinedAt: iso(-40), active: true
    }));
    return t;
  });

  teams.forEach((t, i) => {
    store.insert('submissions', {
      teamId: t.id, iterationId: it1.id, projectId: project.id,
      title: '迭代1：需求文档与原型 v1', summary: '完成需求规格说明与可点击原型。',
      repoUrl: 'https://github.com/team6/project' + (i + 1),
      attachmentUrl: '', version: 1, status: 'submitted',
      submittedById: t.leaderId, submittedAt: iso(-12, 20)
    });
  });
  teams.forEach((t) => {
    store.insert('teamIterations', { teamId: t.id, iterationId: it1.id, status: 'done', note: '迭代1已交付' });
  });

  const it1Subs = store.where('submissions', (s) => s.iterationId === it1.id);
  const rub = [
    [{ rubricId: 'r1', score: 9 }, { rubricId: 'r2', score: 8 }, { rubricId: 'r3', score: 9 }, { rubricId: 'r4', score: 8 }],
    [{ rubricId: 'r1', score: 8 }, { rubricId: 'r2', score: 8 }, { rubricId: 'r3', score: 7 }, { rubricId: 'r4', score: 8 }],
    [{ rubricId: 'r1', score: 9 }, { rubricId: 'r2', score: 7 }, { rubricId: 'r3', score: 8 }, { rubricId: 'r4', score: 9 }]
  ];
  const gradesLib = require('./lib/grades');
  it1Subs.forEach((s, si) => {
    const reviewers = teams.filter((t) => t.id !== s.teamId).slice(0, 3);
    reviewers.forEach((rt, ri) => {
      const a = store.insert('assignments', {
        projectId: project.id, submissionId: s.id, reviewerTeamId: rt.id,
        assignedById: teacher.id, assignedAt: iso(-11), status: 'pending',
        dueDate: iso(-5)
      });
      const scores = rub[(si + ri) % rub.length];
      const total = gradesLib.scoreAgainstRubric(project.rubric, scores);
      store.insert('reviews', {
        type: 'cross', assignmentId: a.id, submissionId: s.id, projectId: project.id,
        reviewerTeamId: rt.id, reviewerId: rt.leaderId, scores, total,
        comment: '功能覆盖较完整，异常处理与文档可再补充。', anonymous: true, submittedAt: iso(-6)
      });
      store.update('assignments', a.id, { status: 'submitted', submittedAt: iso(-6) });
    });
  });

  const lens = [78, 86, 92, 70];
  teams.forEach((t, ti) => {
    const members = store.where('teamMembers', (m) => m.teamId === t.id);
    members.forEach((m, mi) => {
      members.forEach((target, mi2) => {
        if (m.userId === target.userId) return;
        const v = Math.max(60, Math.min(100, lens[mi2] + (mi - 1) * 4));
        store.insert('reviews', {
          type: 'internal', teamId: t.id, projectId: project.id,
          reviewerId: m.userId, targetUserId: target.userId,
          scores: [{ rubricId: 'i1', score: v / 10 }, { rubricId: 'i2', score: v / 10 }, { rubricId: 'i3', score: v / 10 }],
          total: v, comment: '协作正常。', anonymous: true, submittedAt: iso(-6)
        });
      });
    });
    store.insert('checks', {
      projectId: project.id, teamId: t.id, iterationId: it1.id, checkerId: ta.id,
      checkDate: date(-8), items: [
        { name: '迭代计划与进度', result: 'pass', note: '与计划一致' },
        { name: '文档完整性', result: ti === 0 ? 'pass' : 'warn', note: ti === 0 ? '文档齐全' : '接口文档缺失' }
      ],
      findings: '整体推进正常。', score: [88, 85, 82, 80][ti], comment: '继续保持。', status: 'ok'
    });
  });

  [0, 1].forEach((ti) => {
    store.insert('teacherGrades', {
      projectId: project.id, teamId: teams[ti].id,
      scores: [{ rubricId: 'r1', score: 9 }, { rubricId: 'r2', score: 9 }, { rubricId: 'r3', score: 8 }, { rubricId: 'r4', score: 9 }],
      total: 88.5, comment: '功能完整，建议补充异常流程说明。',
      graderId: teacher.id, gradedAt: iso(-2)
    });
  });

  const t1 = teams[0];
  store.insert('submissions', {
    teamId: t1.id, iterationId: it2.id, projectId: project.id,
    title: '迭代2：商品与订单模块', summary: '完成商品发布、检索、下单与订单状态流转。',
    repoUrl: 'https://github.com/team6/project1', attachmentUrl: '',
    version: 1, status: 'submitted', submittedById: t1.leaderId, submittedAt: iso(-1, 21)
  });
  store.insert('teamIterations', { teamId: t1.id, iterationId: it2.id, status: 'in_progress', note: '支付模块开发中' });
  teams.slice(1).forEach((t) => store.insert('teamIterations', { teamId: t.id, iterationId: it2.id, status: 'in_progress', note: '' }));

  act.notify([t1.leaderId], { type: 'review', title: '有 3 份互评任务待完成', body: '截止 2026-11-12', courseId: course.id, projectId: project.id });
  act.notify([t1.leaderId], { type: 'check', title: '助教已提交过程检查', body: '第一组 · 88 分', courseId: course.id, projectId: project.id });
  act.log({ courseId: course.id, projectId: project.id, teamId: t1.id, actorId: t1.leaderId, action: 'submission_create', detail: '迭代2 v1', at: iso(-1, 21) });
  act.log({ courseId: course.id, projectId: project.id, actorId: teacher.id, action: 'project_publish', detail: project.title, at: iso(-45) });
});

console.log('演示数据已生成：data/db.json');
console.log('账号：teacher / ta / student1 .. student13，密码均为 123456');
