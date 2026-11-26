'use strict';
/**
 * 过渡期数据适配器：复用 v1 的 JSON 存储，只允许仓储层引用。
 * TODO(v2): 替换为 SQLite 仓储实现，保持接口不变。
 */
const store = require('../../../lib/store');

module.exports = {
  findUsers: function () { return store.all('users'); },
  findUserById: function (id) { return store.find('users', id); },
  findMembershipsByUser: function (userId) {
    return store.where('members', function (m) { return m.userId === userId; });
  },
  findCourse: function (id) { return store.find('courses', id); }
};
