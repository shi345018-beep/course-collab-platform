'use strict';
/**
 * 过渡期数据适配器：复用 v1 的 JSON 存储，只允许仓储层引用。
 * TODO(v2): 替换为 SQLite 仓储实现，保持接口不变。
 */
const store = require('../../../lib/store');

module.exports = {
  all: function (collection) { return store.all(collection); },
  find: function (collection, id) { return store.find(collection, id); },
  where: function (collection, predicate) { return store.where(collection, predicate); },
  insert: function (collection, object) { return store.insert(collection, object); },
  update: function (collection, id, patch) { return store.update(collection, id, patch); },
  save: function () { return store.save(); },
  findUsers: function () { return store.all('users'); },
  findUserById: function (id) { return store.find('users', id); },
  findMembershipsByUser: function (userId) {
    return store.where('members', function (m) { return m.userId === userId; });
  },
  findCourse: function (id) { return store.find('courses', id); },
  now: function () { return new Date().toISOString(); }
};
