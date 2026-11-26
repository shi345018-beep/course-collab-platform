'use strict';
const { need } = require('../../shared/errors');

function createBody(body) {
  need(body && body.teamId, 400, '请选择小组');
  need(body && body.score !== undefined && body.score !== '' && !isNaN(Number(body.score)), 400, '过程得分必填');
  return {
    teamId: String(body.teamId),
    iterationId: body.iterationId ? String(body.iterationId) : null,
    checkDate: body.checkDate || new Date().toISOString().slice(0, 10),
    items: Array.isArray(body.items) ? body.items : [],
    findings: body.findings ? String(body.findings) : '',
    score: Number(body.score),
    comment: body.comment ? String(body.comment) : ''
  };
}

module.exports = { createBody: createBody };
