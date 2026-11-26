'use strict';
const service = require('./service');
const schema = require('./schema');

function login(ctx) {
  return service.login(schema.loginBody(ctx.body));
}

function logout(ctx) {
  return service.logout(ctx.token);
}

function me(ctx) {
  return { user: service.publicUser(ctx.user) };
}

module.exports = { login, logout, me };
