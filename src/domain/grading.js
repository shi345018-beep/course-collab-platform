'use strict';
/**
 * 评分领域规则（纯函数，无 I/O）。
 * 对应 BR-19、BR-20、BR-22、BR-23 与 lib/grades.js 的既有算法，
 * 迁移后数值必须与 v1 保持一致。
 */
const DEFAULT_WEIGHTS = { peer: 20, ta: 20, teacher: 60 };
const DEFAULT_FACTOR_RANGE = { min: 0.6, max: 1.4 };

function round(value, digits) {
  const p = Math.pow(10, digits === undefined ? 1 : digits);
  return Math.round(value * p) / p;
}

/** 维度得分折算为 0–100。 */
function scoreAgainstRubric(rubric, scores) {
  if (!Array.isArray(scores) || !Array.isArray(rubric) || rubric.length === 0) return null;
  let weightSum = 0;
  let got = 0;
  rubric.forEach(function (item) {
    const found = scores.find(function (s) {
      return String(s.rubricId) === String(item.id) || s.rubricId === item.name;
    });
    if (!found || found.score === null || found.score === undefined || found.score === '') return;
    const max = Number(item.max) || 10;
    const weight = Number(item.weight) || 1;
    const raw = Math.max(0, Math.min(max, Number(found.score)));
    got += (raw / max) * weight;
    weightSum += weight;
  });
  if (!weightSum) return null;
  return round((got / weightSum) * 100, 1);
}

function normalizeWeights(weights) {
  const w = Object.assign({}, DEFAULT_WEIGHTS, weights || {});
  const peer = Number(w.peer) || 0;
  const ta = Number(w.ta) || 0;
  const teacher = Number(w.teacher) || 0;
  const sum = peer + ta + teacher;
  if (!sum) return Object.assign({}, DEFAULT_WEIGHTS, { sum: 100 });
  return { peer: peer, ta: ta, teacher: teacher, sum: sum };
}

/** 只对已有分项按其权重重归一化；缺项不按 0 分处理（BR-23）。 */
function weightedTotal(parts) {
  const present = parts.filter(function (p) { return p.score !== null && p.score !== undefined; });
  const weightSum = present.reduce(function (sum, p) { return sum + p.weight; }, 0);
  if (!weightSum) return null;
  const total = present.reduce(function (sum, p) { return sum + p.score * p.weight; }, 0) / weightSum;
  return round(total, 1);
}

/** 每个迭代取版本号最大的提交。 */
function pickLatestByIteration(submissions) {
  const latest = new Map();
  submissions.forEach(function (s) {
    const current = latest.get(s.iterationId);
    if (!current || (s.version || 1) > (current.version || 1)) latest.set(s.iterationId, s);
  });
  return Array.from(latest.values());
}

function average(values) {
  const list = values.filter(function (v) { return typeof v === 'number' && !isNaN(v); });
  if (!list.length) return null;
  return list.reduce(function (a, b) { return a + b; }, 0) / list.length;
}

/**
 * 组内互评 → 贡献系数。
 * 系数 = 个人得分 / 队内平均分，夹在 [min,max]；无数据按 1。
 */
function contributionFactors(members, internalReviews, range) {
  const limits = Object.assign({}, DEFAULT_FACTOR_RANGE, range || {});
  const byUser = new Map();
  members.forEach(function (m) {
    const values = internalReviews
      .filter(function (r) { return r.targetUserId === m.userId; })
      .map(function (r) { return r.total; });
    byUser.set(m.userId, average(values));
  });
  const present = Array.from(byUser.values()).filter(function (v) { return v !== null; });
  const teamAverage = present.length ? average(present) : 100;
  const factors = new Map();
  members.forEach(function (m) {
    const raw = byUser.get(m.userId);
    if (raw === null || !teamAverage) {
      factors.set(m.userId, { factor: 1, rawScore: null, reviewsReceived: 0 });
      return;
    }
    const factor = Math.max(limits.min, Math.min(limits.max, raw / teamAverage));
    factors.set(m.userId, {
      factor: round(factor, 3),
      rawScore: round(raw, 1),
      reviewsReceived: internalReviews.filter(function (r) { return r.targetUserId === m.userId; }).length
    });
  });
  return { factors: factors, average: round(teamAverage, 1), hasData: present.length > 0 };
}

function personalScore(teamTotal, factor) {
  if (teamTotal === null || teamTotal === undefined) return null;
  return Math.min(100, round(teamTotal * factor, 1));
}

module.exports = {
  DEFAULT_WEIGHTS: DEFAULT_WEIGHTS,
  round: round,
  scoreAgainstRubric: scoreAgainstRubric,
  normalizeWeights: normalizeWeights,
  weightedTotal: weightedTotal,
  pickLatestByIteration: pickLatestByIteration,
  average: average,
  contributionFactors: contributionFactors,
  personalScore: personalScore
};
