'use strict';
const { need } = require('../../shared/errors');

function createBody(body) {
  need(body && body.code && String(body.code).trim(), 400, '课程编号必填');
  need(body && body.name && String(body.name).trim(), 400, '课程名称必填');
  return {
    code: String(body.code).trim(),
    name: String(body.name).trim(),
    term: body.term ? String(body.term) : '2026 秋',
    description: body.description ? String(body.description) : ''
  };
}

function joinBody(body) {
  need(body && body.inviteCode, 400, '请输入邀请码');
  return { inviteCode: String(body.inviteCode).trim() };
}

function memberBody(body) {
  need(body && body.identifier, 400, '请输入账号或学号');
  return {
    identifier: String(body.identifier).trim(),
    role: ['student', 'ta', 'teacher'].indexOf(body.role) >= 0 ? body.role : 'student'
  };
}

module.exports = { createBody: createBody, joinBody: joinBody, memberBody: memberBody };
