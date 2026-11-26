'use strict';
function isStaff(membership) {
  return !!membership && ['ta', 'teacher', 'admin'].indexOf(membership.role) >= 0;
}

function canView(membership, isMember) {
  return isStaff(membership) || !!isMember;
}

function canManage(membership, team, actorId) {
  if (!membership) return false;
  if (membership.role === 'teacher' || membership.role === 'admin') return true;
  return membership.role === 'student' && team.leaderId === actorId;
}

function canJoin(membership, team, memberCount, teamMax) {
  return !!membership && membership.role === 'student' && team.openJoin !== false && memberCount < teamMax;
}

module.exports = { isStaff: isStaff, canView: canView, canManage: canManage, canJoin: canJoin };
