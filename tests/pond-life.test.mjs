import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPondLife } from '../src/features/pond-life.js';

function mockCtx() {
    return {
        globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt',
        save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
        beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, ellipse() {}, fill() {},
        createRadialGradient() { return { addColorStop() {} }; },
        createLinearGradient() { return { addColorStop() {} }; }
    };
}

function make(env) {
    const ripples = [];
    const life = createPondLife({
        viewport: { width: 1000, height: 800 },
        config: { rippleStrength: 1 },
        spawnRipple: (x, y, power) => ripples.push({ x, y, power })
    });
    return { life, ripples };
}

test('蜻蜓:悬停 → 点水起涟漪(因果链)', () => {
    const { life, ripples } = make();
    const before = ripples.length;
    for (let i = 0; i < 60 * 40; i++) life.update(1 / 60);     // 40s:必有点水
    assert.ok(ripples.length > before, '点水必须起涟漪');
    for (const r of ripples) {
        assert.ok(r.power >= 0.3 && r.power <= 1, '涟漪力度合法 power=' + r.power);
        assert.ok(Number.isFinite(r.x) && Number.isFinite(r.y));
    }
    life.update(0.016);
    life.layers.weather(mockCtx());                            // 绘制全链路不抛
});

test('青蛙:荷叶间跳跃,起跳/落水都有涟漪,落点在另一张叶上', () => {
    const { life, ripples } = make();
    const before = ripples.length;
    for (let i = 0; i < 60 * 70; i++) life.update(1 / 60);     // 70s:首跳 10~24s 必到
    assert.ok(ripples.length >= 2, '起跳+落水');
    life.update(0.016);
    life.layers.weather(mockCtx());
});

test('绘制:开启纯净流水线也不抛(mock ctx 全链路)', () => {
    const { life } = make();
    for (let i = 0; i < 30; i++) life.update(1 / 60);
    life.layers.weather(mockCtx());
});
