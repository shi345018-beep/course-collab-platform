'use strict';
function canView(membership) {
  return !!membership;
}

function canManage(membership) {
  return !!membership && (membership.role === 'teacher' || membership.role === 'admin');
}

module.exports = { canView: canView, canManage: canManage };
