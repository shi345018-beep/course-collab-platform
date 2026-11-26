'use strict';
/**
 * 课程访问策略（纯函数，不读写数据）。
 * BR-10：教师只能管理本人课程；管理员可全局管理。
 */
function canView(membership) {
  return !!membership;
}

function canManage(membership) {
  return !!membership && (membership.role === 'teacher' || membership.role === 'admin');
}

function canCreateCourse(actor) {
  return !!actor && (actor.role === 'teacher' || actor.role === 'admin');
}

module.exports = { canView: canView, canManage: canManage, canCreateCourse: canCreateCourse };
