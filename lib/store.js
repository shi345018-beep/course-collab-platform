'use strict';
/**
 * 轻量数据层：单个 JSON 文件持久化，无任何第三方依赖。
 * 所有写操作走 save()，采用「临时文件 + 原子改名」，避免进程中断写坏数据库。
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.CP_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const COLLECTIONS = [
  'users', 'courses', 'members', 'projects', 'iterations', 'teams', 'teamMembers',
  'teamIterations', 'submissions', 'assignments', 'reviews', 'checks',
  'teacherGrades', 'grades', 'notifications', 'logs'
];

const PREFIX = {
  users: 'u', courses: 'c', members: 'm', projects: 'p', iterations: 'it',
  teams: 't', teamMembers: 'tm', teamIterations: 'ti', submissions: 's',
  assignments: 'as', reviews: 'rv', checks: 'ck', teacherGrades: 'tg',
  grades: 'g', notifications: 'n', logs: 'l'
};

function emptyDb() {
  const db = { meta: { createdAt: new Date().toISOString(), seq: {}, version: 1 }, tokens: {} };
  for (const c of COLLECTIONS) db[c] = [];
  return db;
}

function readDb() {
  if (!fs.existsSync(DB_FILE)) return emptyDb();
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const base = emptyDb();
    const merged = Object.assign(base, parsed);
    merged.meta = Object.assign(base.meta, parsed.meta || {});
    merged.meta.seq = Object.assign({}, parsed.meta && parsed.meta.seq);
    merged.tokens = parsed.tokens || {};
    return merged;
  } catch (err) {
    console.error('[store] 数据库读取失败，已回退为空库：', err.message);
    return emptyDb();
  }
}

const state = { db: readDb() };

function db() {
  return state.db;
}

function save() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state.db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

function nextId(collection) {
  const prefix = PREFIX[collection] || 'x';
  const n = (state.db.meta.seq[prefix] || 0) + 1;
  state.db.meta.seq[prefix] = n;
  return prefix + n;
}

function all(collection) {
  return state.db[collection] || (state.db[collection] = []);
}

function find(collection, id) {
  if (!id) return null;
  return all(collection).find((row) => row.id === id) || null;
}

function where(collection, predicate) {
  return all(collection).filter(predicate);
}

function first(collection, predicate) {
  return all(collection).find(predicate) || null;
}

function insert(collection, obj) {
  const row = Object.assign({ createdAt: new Date().toISOString() }, obj);
  if (!row.id) row.id = nextId(collection);
  all(collection).push(row);
  return row;
}

function update(collection, id, patch) {
  const row = find(collection, id);
  if (!row) return null;
  Object.assign(row, patch, { updatedAt: new Date().toISOString() });
  return row;
}

function remove(collection, id) {
  const list = all(collection);
  const idx = list.findIndex((row) => row.id === id);
  if (idx < 0) return false;
  list.splice(idx, 1);
  return true;
}

function removeWhere(collection, predicate) {
  const list = all(collection);
  let removed = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (predicate(list[i])) {
      list.splice(i, 1);
      removed++;
    }
  }
  return removed;
}

function reset(seed) {
  state.db = emptyDb();
  if (typeof seed === 'function') seed();
  save();
  return state.db;
}

function isEmpty() {
  return all('users').length === 0;
}

module.exports = {
  DATA_DIR, DB_FILE, COLLECTIONS,
  db, save, nextId, all, find, where, first, insert, update, remove, removeWhere, reset, isEmpty
};
