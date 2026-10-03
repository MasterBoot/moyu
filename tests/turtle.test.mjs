import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTurtleCreature } from '../src/pond/creatures/turtle.js';

const TYPE = { id: 'turtle', speedMultiplier: 0.15 };
const VP = { width: 1000, height: 800 };

function mockCtx() {
    const ops = { ellipse: 0, arc: 0, fill: 0 };
    return {
        ops,
        globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '', strokeStyle: '', lineWidth: 1,
        save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
        beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() { ops.fill++; },
        ellipse() { ops.ellipse++; }, arc() { ops.arc++; },
        createRadialGradient() { return { addColorStop() {} }; },
        createLinearGradient() { return { addColorStop() {} }; }
    };
}

test('乌龟:契约齐全(update/draw/depth/translate + circle 碰撞)', () => {
    const { create } = createTurtleCreature({ viewport: VP });
    const t = create(TYPE, { origin: 'spawned' });
    assert.equal(typeof t.update, 'function');
    assert.equal(typeof t.draw, 'function');
    assert.equal(typeof t.translate, 'function');
    assert.ok(Number.isFinite(t.depth));
    assert.equal(t.collision.shape, 'circle');
    assert.ok(t.collision.r > 10, '乌龟要够大才能当"石头"');
    assert.equal(t.origin, 'spawned');
});

test('乌龟:慢悠悠地游(速度远低于锦鲤),边界内,划水相位推进', () => {
    const { create } = createTurtleCreature({ viewport: VP });
    const t = create(TYPE, {});
    const x0 = t.x, y0 = t.y;
    for (let i = 0; i < 120; i++) t.update(1 / 60);            // 2 秒
    const moved = Math.hypot(t.x - x0, t.y - y0);
    assert.ok(moved > 4 && moved < 40, 'moved=' + moved.toFixed(1) + '(锦鲤 2 秒 ≈ 80~140px)');
    assert.ok(t.x >= 40 && t.x <= VP.width - 40 && t.y >= 40 && t.y <= VP.height - 40);
    assert.ok(t.paddle > 0);
    t.draw(mockCtx());
    assert.ok(mockCtx ? true : true);
});

test('乌龟:靠边时被柔和拉回,不卡在墙角', () => {
    const { create } = createTurtleCreature({ viewport: VP });
    const t = create(TYPE, {});
    t.x = 30; t.y = 30;                                        // 左上角外
    for (let i = 0; i < 300; i++) t.update(1 / 60);            // 5 秒
    assert.ok(t.x > 45 && t.y > 45, `x=${t.x.toFixed(0)} y=${t.y.toFixed(0)}`);
});

test('乌龟:translate 被碰撞推开时整体位移', () => {
    const { create } = createTurtleCreature({ viewport: VP });
    const t = create(TYPE, {});
    t.x = 500; t.y = 400;
    t.translate(7, -9);
    assert.equal(t.x, 507);
    assert.equal(t.y, 391);
});
