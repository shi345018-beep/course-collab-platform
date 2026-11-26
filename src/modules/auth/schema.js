'use strict';
const { need } = require('../../shared/errors');

function loginBody(body) {
  need(body && body.username, 400, '请输入账号');
  need(body && body.password, 400, '请输入密码');
  return { username: String(body.username).trim(), password: String(body.password) };
}

module.exports = { loginBody };
