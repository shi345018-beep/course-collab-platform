'use strict';
const { need } = require('../../shared/errors');

function createBody(body) {
  need(body && body.teamId, 400, '缺少小组 ID');
  need(body && body.iterationId, 400, '请选择迭代阶段');
  need(body && body.title && String(body.title).trim(), 400, '成果标题必填');
  return {
    teamId: String(body.teamId),
    iterationId: String(body.iterationId),
    title: String(body.title).trim(),
    summary: body.summary ? String(body.summary) : '',
    repoUrl: body.repoUrl ? String(body.repoUrl) : '',
    attachmentUrl: body.attachmentUrl ? String(body.attachmentUrl) : ''
  };
}

module.exports = { createBody: createBody };
