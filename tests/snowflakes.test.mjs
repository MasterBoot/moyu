import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/shared/math.js';
import { createSnowflakes } from '../src/render/snowflakes.js';

/* 雪片系统的池化/退休/融化约定(纯逻辑,不碰 DOM):
 *   fill(target) 把在场数凑到 target;target 掉到 0 后粒子飘完/化完就退休;
 *   落到自己的水面深度后进入 melt 渐隐,不参与计数外的生命周期。 */

const VP = { width: 800, height: 600 };
const CONF = { maxLive: 10, size: [1, 2], vy: [100, 100], melt: [0.1, 0.1], alpha: [0.5, 0.5] };

test('fill 凑数,clear 清场', () => {
    const f = createSnowflakes({ viewport: VP, snow: CONF, rng: mulberry32(1) });
    f.fill(10);
    assert.equal(f.count, 10);
    assert.equal(f.cap, 10);
    f.clear();
    assert.equal(f.count, 0);
});

test('飘完/化完即退休:target 归 0 后 count 收敛到 0', () => {
    const f = createSnowflakes({ viewport: VP, snow: CONF, rng: mulberry32(2) });
    f.fill(10);
    f.update(999, 0);            // 一大步:全部落地 → 场上超员 → 直接退休
    assert.equal(f.count, 0);
});

test('target 不变时:落地进入融化并循环补充,melted 计数增长', () => {
    const f = createSnowflakes({ viewport: VP, snow: CONF, rng: mulberry32(3) });
    f.fill(10);
    const before = f.melted;
    f.update(999, 10);           // 落地 → 融化 → 回到天上继续
    assert.ok(f.count > 0, 'target>0 时场上有雪');
    assert.ok(f.melted >= before, 'melted 只增不减');
    assert.ok(f.count <= 10, '不超过上限');
});

test('update/draw 全链路无 NaN(坐标有限,数量守恒)', () => {
    const f = createSnowflakes({ viewport: VP, snow: { ...CONF, vy: [26, 60] }, rng: mulberry32(4) });
    f.fill(10);
    for (let i = 0; i < 50; i++) f.update(1 / 60, 10);
    let arcs = 0;
    const g = {
        globalCompositeOperation: 'source-over', globalAlpha: 1, fillStyle: '',
        beginPath() {},
        arc(x, y, r) { arcs++; if (!Number.isFinite(x + y + r)) throw new Error('NaN 坐标'); },
        fill() {}
    };
    f.draw(g);
    assert.equal(f.count, 10);
    assert.equal(arcs, 10);
});
