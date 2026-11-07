'use strict';
/**
 * 通知与项目过程记录（审计日志）。
 * 平台里任何有意义的动作都调用 log()，构成「项目过程记录」模块的数据来源；
 * 需要提醒人的动作再调 notify()。
 */
const store = require('./store');

const ACTION_TEXT = {
  course_create: '创建课程',
  course_join: '加入课程',
  member_add: '添加成员',
  member_remove: '移除成员',
  project_create: '创建项目任务',
  project_update: '修改项目任务',
  project_publish: '发布项目任务',
  iteration_create: '创建迭代阶段',
  iteration_update: '修改迭代阶段',
  team_create: '组建队伍',
  team_join: '申请加入队伍',
  team_approve: '通过入队申请',
  team_invite: '邀请成员入队',
  team_leave: '退出队伍',
  team_remove_member: '移出队伍成员',
  team_update: '修改队伍信息',
  team_progress: '更新迭代进度',
  submission_create: '提交项目成果',
  submission_revise: '重新提交成果',
  submission_review: '查看成果提交',
  review_submit: '提交同伴互评',
  review_assign: '分配互评任务',
  internal_review_submit: '提交组内互评',
  check_create: '提交过程检查记录',
  check_update: '修改过程检查记录',
  grade_teacher: '提交教师评分',
  grade_publish: '发布成绩',
  grade_export: '导出成绩'
};

function log(entry) {
  const actor = entry.actorId ? store.find('users', entry.actorId) : null;
  return store.insert('logs', {
    courseId: entry.courseId || null,
    projectId: entry.projectId || null,
    teamId: entry.teamId || null,
    targetType: entry.targetType || null,
    targetId: entry.targetId || null,
    action: entry.action,
    actionText: ACTION_TEXT[entry.action] || entry.action,
    actorId: entry.actorId || null,
    actorName: actor ? actor.name : (entry.actorName || '系统'),
    actorRole: actor ? actor.role : null,
    detail: entry.detail || '',
    visibleTo: entry.visibleTo || null,
    at: entry.at || new Date().toISOString()
  });
}

function notify(userIds, payload) {
  const ids = [].concat(userIds || []).filter(Boolean);
  const unique = Array.from(new Set(ids));
  const created = [];
  for (const userId of unique) {
    created.push(store.insert('notifications', {
      userId,
      type: payload.type || 'info',
      title: payload.title,
      body: payload.body || '',
      link: payload.link || null,
      courseId: payload.courseId || null,
      projectId: payload.projectId || null,
      read: false
    }));
  }
  return created;
}

/** 取某队伍的全部成员用户 id（含组长）。 */
function teamMemberIds(teamId) {
  return store.where('teamMembers', (m) => m.teamId === teamId && m.active !== false).map((m) => m.userId);
}

/** 取某课程内指定角色的全部用户 id。 */
function courseUserIds(courseId, role) {
  return store
    .where('members', (m) => m.courseId === courseId && (!role || m.role === role))
    .map((m) => m.userId);
}

/** 取某课程助教 id 列表。 */
function courseTaIds(courseId) {
  return courseUserIds(courseId, 'ta');
}

module.exports = { log, notify, teamMemberIds, courseUserIds, courseTaIds, ACTION_TEXT };
