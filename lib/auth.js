'use strict';
/**
 * 认证：口令用 scrypt 加盐哈希存储，会话用随机 token（存库，重启后仍有效）。
 */
const crypto = require('crypto');
const store = require('./store');

function hashPassword(plain, salt) {
  const s = salt || crypto.randomBytes(8).toString('hex');
  const hash = crypto.scryptSync(String(plain), s, 32).toString('hex');
  return `scrypt$${s}$${hash}`;
}

function verifyPassword(plain, stored) {
  if (!stored) return false;
  const parts = String(stored).split('$');
  if (parts.length !== 3) return false;
  const [, salt, hash] = parts;
  const calc = crypto.scryptSync(String(plain), salt, 32).toString('hex');
  const a = Buffer.from(calc, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function issueToken(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  store.db().tokens[token] = { userId, issuedAt: new Date().toISOString() };
  store.save();
  return token;
}

function revokeToken(token) {
  if (token && store.db().tokens[token]) {
    delete store.db().tokens[token];
    store.save();
  }
}

function userFromToken(token) {
  if (!token) return null;
  const session = store.db().tokens[token];
  if (!session) return null;
  return store.find('users', session.userId);
}

function publicUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
}

module.exports = { hashPassword, verifyPassword, issueToken, revokeToken, userFromToken, publicUser };
