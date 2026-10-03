import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMeteor } from '../src/render/meteor.js';

function mockCtx() {
    return {
        globalCompositeOperation: 'source-over', globalAlpha: 1, strokeStyle: '', fillStyle: '', lineWidth: 1, lineCap: 'butt',
        save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {},
        createLinearGradient() { return { addColorStop() {} }; }
    };
}

test('流星:夜度过门槛才倒计时并发射,寿命尽头回调落点一次', () => {
    let landed = null, landCount = 0;
    const m = createMeteor({
        viewport: { width: 1000, height: 800 },
        meteor: { minNight: 0.5, first: 0.05, every: [30, 60], speed: [500, 500], len: [80, 80], life: [0.3, 0.3] },
        onLand: (x, y) => { landCount++; landed = { x, y }; }
    });
    m.update(1, 0);                                            // 白天:不倒计时
    assert.equal(m.inspect().live, false);
    for (let i = 0; i < 200 && !m.inspect().live; i++) m.update(0.05, 1);   // 夜里:1s 内必发
    assert.equal(m.inspect().live, true);
    const before = m.inspect();
    for (let i = 0; i < 40 && m.inspect().live; i++) {
        m.update(0.02, 1);
        m.draw(mockCtx());                                     // 飞行途中每帧画,坐标必须有限
    }
    assert.equal(m.inspect().live, false);
    assert.equal(landCount, 1);
    assert.ok(Number.isFinite(landed.x) && Number.isFinite(landed.y));
    assert.equal(m.inspect().timer > 0, true, '落地后重置间隔');
});

test('流星:夜度不够时永不发射', () => {
    const m = createMeteor({ viewport: { width: 800, height: 600 }, meteor: { minNight: 0.55, every: [0.05, 0.05] } });
    for (let i = 0; i < 100; i++) m.update(0.1, 0.3);
    assert.equal(m.inspect().live, false);
    m.draw(mockCtx());                                         // 无流星时 draw 是空操作
});
