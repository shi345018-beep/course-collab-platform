'use strict';
/**
 * BR-12：普通成员可保存草稿，只有组长可以正式提交。
 * BR-01：学生只能看到本组提交物。
 */
function canSubmit(actor, team, membership) {
  if (!actor || !team || !membership) return false;
  if (membership.role === 'teacher' || membership.role === 'admin') return true;
  return membership.role === 'student' && team.leaderId === actor.id;
}

function canViewTeam(userId, teamId, isMember, membership) {
  if (membership && (membership.role === 'teacher' || membership.role === 'ta' || membership.role === 'admin')) return true;
  return !!isMember;
}

module.exports = { canSubmit: canSubmit, canViewTeam: canViewTeam };
