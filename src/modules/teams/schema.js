'use strict';
const { need } = require('../../shared/errors');

function createBody(body) {
  need(body && body.name && String(body.name).trim(), 400, '小组名称必填');
  return { name: String(body.name).trim() };
}

function progressBody(body) {
  need(body && body.iterationId, 400, '请选择迭代阶段');
  need(['not_started', 'in_progress', 'done', 'blocked'].indexOf(body.status) >= 0, 400, '进度状态非法');
  return { iterationId: body.iterationId, status: body.status, note: body.note ? String(body.note) : '' };
}

function transferBody(body) {
  need(body && body.targetUserId, 400, '请选择候选组长');
  return { targetUserId: body.targetUserId, reason: body.reason ? String(body.reason) : '' };
}

module.exports = { createBody: createBody, progressBody: progressBody, transferBody: transferBody };
