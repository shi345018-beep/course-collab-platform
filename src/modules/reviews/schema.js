'use strict';
const { need } = require('../../shared/errors');

function assignBody(body) {
  return {
    reviewersPerSubmission: body && body.reviewersPerSubmission ? Number(body.reviewersPerSubmission) : 3,
    dueDate: body && body.dueDate ? body.dueDate : new Date(Date.now() + 5 * 86400000).toISOString()
  };
}

function reviewBody(body) {
  need(body && Array.isArray(body.scores), 400, '评分数据不完整');
  return { scores: body.scores, comment: body.comment ? String(body.comment) : '' };
}

function internalBody(body) {
  need(body && body.targetUserId, 400, '请选择被评成员');
  need(body && Array.isArray(body.scores), 400, '评分数据不完整');
  return {
    targetUserId: body.targetUserId,
    scores: body.scores,
    comment: body.comment ? String(body.comment) : ''
  };
}

module.exports = { assignBody: assignBody, reviewBody: reviewBody, internalBody: internalBody };
