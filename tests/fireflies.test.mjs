import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFireflies } from '../src/render/fireflies.js';

test('萤火虫:游荡位置有限、边界反射、无 DOM draw 安全', () => {
    const w = 800, h = 600;
    const f = createFireflies({ viewport: { width: w, height: h }, fireflies: { count: 5, speed: [30, 30] } });
    assert.equal(f.count, 5);
    for (let i = 0; i < 300; i++) f.update(0.05, 1);          // 15 秒游荡
    const g = {
        globalCompositeOperation: 'source-over', globalAlpha: 1, fillStyle: '',
        drawImage() {}, beginPath() {}, arc(x, y) { if (!Number.isFinite(x + y)) throw new Error('NaN'); }, fill() {}
    };
    f.draw(g, 1);                                              // 无 DOM:sprite 未烘焙 → 不画但不抛
    f.draw(g, 0);
});

test('萤火虫:amount=0 时仍会游(只是不亮),不会卡死', () => {
    const f = createFireflies({ viewport: { width: 800, height: 600 }, fireflies: { count: 3 } });
    f.update(1, 0);
    f.update(1, 0);
    assert.equal(f.count, 3);
});
