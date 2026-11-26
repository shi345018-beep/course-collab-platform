'use strict';
function canView(membership) {
  return !!membership;
}

function canGrade(membership) {
  return !!membership && (membership.role === 'teacher' || membership.role === 'admin');
}

function canExport(membership) {
  return !!membership && (membership.role === 'teacher' || membership.role === 'ta' || membership.role === 'admin');
}

function canAppeal(membership, isTeamMember) {
  return !!membership && membership.role === 'student' && !!isTeamMember;
}

module.exports = { canView: canView, canGrade: canGrade, canExport: canExport, canAppeal: canAppeal };
