'use strict';
const { need } = require('../../shared/errors');

function createBody(body) {
  need(body && body.courseId, 400, '缺少课程 ID');
  need(body && body.title && String(body.title).trim(), 400, '项目标题必填');
  return {
    courseId: String(body.courseId),
    title: String(body.title).trim(),
    description: body.description ? String(body.description) : '',
    startDate: body.startDate || new Date().toISOString().slice(0, 10),
    dueDate: body.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    teamMin: Number(body.teamMin) || 3,
    teamMax: Number(body.teamMax) || 5
  };
}

function iterationBody(body) {
  need(body && body.name && String(body.name).trim(), 400, '迭代名称必填');
  need(body && body.dueDate, 400, '迭代截止时间必填');
  return {
    name: String(body.name).trim(),
    goal: body.goal ? String(body.goal) : '',
    startDate: body.startDate || new Date().toISOString().slice(0, 10),
    dueDate: body.dueDate,
    deliverables: Array.isArray(body.deliverables) ? body.deliverables : []
  };
}

module.exports = { createBody: createBody, iterationBody: iterationBody };
