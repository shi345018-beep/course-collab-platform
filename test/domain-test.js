'use strict';
/**
 * 领域规则单元测试（不启动服务、不读写数据文件）。
 * 运行：node test/domain-test.js
 */
const assert = require('assert');
const grading = require('../src/domain/grading');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('  PASS  ' + name);
}

const rubric = [
  { id: 'r1', name: '功能', max: 10, weight: 40 },
  { id: 'r2', name: '质量', max: 10, weight: 30 },
  { id: 'r3', name: '文档', max: 10, weight: 20 },
  { id: 'r4', name: '过程', max: 10, weight: 10 }
];

check('满分折算为 100', function () {
  const score = grading.scoreAgainstRubric(rubric, [
    { rubricId: 'r1', score: 10 }, { rubricId: 'r2', score: 10 },
    { rubricId: 'r3', score: 10 }, { rubricId: 'r4', score: 10 }
  ]);
  assert.strictEqual(score, 100);
});

check('缺项不按 0 分处理，按已有权重重归一化', function () {
  const total = grading.weightedTotal([
    { score: 80, weight: 20 },
    { score: 90, weight: 20 },
    { score: null, weight: 60 }
  ]);
  assert.strictEqual(total, 85);
});

check('全部缺项返回 null', function () {
  assert.strictEqual(grading.weightedTotal([{ score: null, weight: 60 }]), null);
});

check('每个迭代只保留最新版本', function () {
  const latest = grading.pickLatestByIteration([
    { id: 's1', iterationId: 'it1', version: 1 },
    { id: 's2', iterationId: 'it1', version: 2 },
    { id: 's3', iterationId: 'it2', version: 1 }
  ]);
  const ids = latest.map(function (s) { return s.id; }).sort();
  assert.deepStrictEqual(ids, ['s2', 's3']);
});

check('贡献系数以队内平均为 1', function () {
  const members = [{ userId: 'u1' }, { userId: 'u2' }];
  const reviews = [
    { targetUserId: 'u1', total: 90 },
    { targetUserId: 'u2', total: 110 }
  ];
  const result = grading.contributionFactors(members, reviews);
  assert.strictEqual(result.average, 100);
  assert.strictEqual(result.factors.get('u1').factor, 0.9);
  assert.strictEqual(result.factors.get('u2').factor, 1.1);
});

check('个人分不超过 100', function () {
  assert.strictEqual(grading.personalScore(96, 1.4), 100);
});

console.log('\n结果：' + passed + ' 通过，0 失败');
