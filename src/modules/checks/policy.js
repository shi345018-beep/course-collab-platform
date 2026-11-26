'use strict';
function canCheck(membership, team, actorId) {
  if (!membership) return false;
  if (membership.role === 'teacher' || membership.role === 'admin') return true;
  if (membership.role !== 'ta') return false;
  return !team.taId || team.taId === actorId;
}

function canView(membership, isMember) {
  if (!membership) return false;
  if (['teacher', 'ta', 'admin'].indexOf(membership.role) >= 0) return true;
  return !!isMember;
}

module.exports = { canCheck: canCheck, canView: canView };
