import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonWeights, seasonBlend, seasonCached } from '../src/core/season.js';

const d = (m, day) => new Date(2026, m - 1, day);

test('中心日:单季权重为 1', () => {
    assert.equal(seasonWeights(d(4, 15)).spring, 1);     // 4/15 春分点
    assert.equal(seasonWeights(d(7, 15)).summer, 1);
    assert.equal(seasonWeights(d(10, 15)).autumn, 1);
    assert.equal(seasonWeights(d(1, 15)).winter, 1);
});

test('跨年冬天:12 月底靠近冬季中心(1/15),环形距离正确', () => {
    const w = seasonWeights(d(12, 25));
    assert.ok(w.winter > 0.5, 'winter=' + w.winter);
    assert.ok(Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test('季节交界:两个相邻季各占一半,权重和为 1', () => {
    const w = seasonWeights(d(5, 30));                   // 春中心 4/15 与夏中心 7/15 的中点
    assert.ok(Math.abs(w.spring - w.summer) < 0.05, JSON.stringify(w));
    assert.ok(Math.abs(w.spring + w.summer - 1) < 1e-9);
});

test('blend:深秋落叶勤、花瓣稀;夏夜萤火虫最盛', () => {
    const autumn = seasonBlend(d(10, 15));
    assert.ok(Math.abs(autumn.leaf - 2.2) < 1e-9);
    assert.ok(Math.abs(autumn.petal - 0.35) < 1e-9);
    const summer = seasonBlend(d(7, 15));
    assert.ok(Math.abs(summer.firefly - 1.3) < 1e-9);
    const winter = seasonBlend(d(1, 15));
    assert.ok(winter.leaf < 0.5 && winter.petal < 0.3);
});

test('缓存:同一分钟内返回同一对象(不每帧重算日期)', () => {
    const s = seasonCached();
    assert.equal(s(), s());
});
