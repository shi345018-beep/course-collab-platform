'use strict';
const repo = require('./repository');
const tokens = require('../../infra/tokens');
const { need } = require('../../shared/errors');

function login(input) {
  const user = repo.findByUsername(input.username);
  need(user && tokens.verifyPassword(input.password, user.password), 401, '账号或密码错误');
  const token = tokens.issueToken(user.id);
  return {
    token: token,
    user: tokens.publicUser(user),
    memberships: repo.listMemberships(user.id)
  };
}

function logout(token) {
  tokens.revokeToken(token);
  return { ok: true };
}

function currentUserByToken(token) {
  return tokens.userFromToken(token) || null;
}

module.exports = { login, logout, currentUserByToken, publicUser: tokens.publicUser };
