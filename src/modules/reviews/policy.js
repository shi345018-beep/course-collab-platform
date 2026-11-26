'use strict';
function canAssign(membership) {
  return !!membership && (membership.role === 'teacher' || membership.role === 'admin');
}

function canSubmit(assignment, myTeamIds) {
  return !!assignment && myTeamIds.indexOf(assignment.reviewerTeamId) >= 0;
}

module.exports = { canAssign: canAssign, canSubmit: canSubmit };
