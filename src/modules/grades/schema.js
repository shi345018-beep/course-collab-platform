'use strict';
const { need } = require('../../shared/errors');

function teacherGradeBody(body) {
  need(body && body.teamId, 400, '缺少小组 ID');
  need(Array.isArray(body.scores), 400, '评分数据不完整');
  return {
    teamId: String(body.teamId),
    scores: body.scores,
    comment: body.comment ? String(body.comment) : ''
  };
}

function appealBody(body) {
  need(body && body.reason && String(body.reason).trim(), 400, '请填写申诉理由');
  return { reason: String(body.reason).trim() };
}

function resolveBody(body) {
  need(body && ['keep', 'adjust'].indexOf(body.decision) >= 0, 400, '请选择处理结果');
  return { decision: body.decision, comment: body.comment ? String(body.comment) : '' };
}

module.exports = { teacherGradeBody: teacherGradeBody, appealBody: appealBody, resolveBody: resolveBody };
