'use strict';
const legacyAuth = require('../../lib/auth');

module.exports = {
  verifyPassword: legacyAuth.verifyPassword,
  issueToken: legacyAuth.issueToken,
  revokeToken: legacyAuth.revokeToken,
  userFromToken: legacyAuth.userFromToken,
  publicUser: legacyAuth.publicUser
};
