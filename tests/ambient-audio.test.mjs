import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nightnessFromDim, rainGainFor, createAmbientAudio } from '../src/features/ambient-audio.js';

/* ambient-audio 的两个纯函数。合成图本身要 AudioContext(Node 里没有),
 * 但 createAmbientAudio 在无 DOM 环境下 update 应该是安全的空跑 —— 也测掉。 */

test('nightnessFromDim:正午 0,夜间(dim≥0.5)1,线性过渡', () => {
    assert.equal(nightnessFromDim(0), 0);
    assert.equal(nightnessFromDim(0.15), 0);
    assert.equal(nightnessFromDim(0.5), 1);
    assert.equal(nightnessFromDim(0.65), 1);
    assert.ok(Math.abs(nightnessFromDim(0.325) - 0.5) < 1e-9);
    assert.equal(nightnessFromDim(undefined), 0);
    assert.equal(nightnessFromDim(NaN), 0);
});

test('rainGainFor:小雨线性,大雨 ×1.35 且封顶 1', () => {
    assert.equal(rainGainFor(0, false), 0);
    assert.equal(rainGainFor(0.5, false), 0.5);
    assert.equal(rainGainFor(1, false), 1);
    assert.equal(rainGainFor(0.5, true), 0.675);
    assert.equal(rainGainFor(0.8, true), 1);       // 0.8×1.35=1.08 → 封顶
    assert.equal(rainGainFor(-0.2, false), 0);
    assert.equal(rainGainFor(undefined, true), 0);
});

test('无 DOM 环境:update 是安全空跑', () => {
    const f = createAmbientAudio({ config: { ambientVolume: 0.5 }, environment: { index: 0, name: 'clear', rainAmount: 0, dayPhase: null } });
    f.update(0.016);
    f.update(0.016);
    const ins = f.inspect();
    assert.equal(ins.ctxState, 'no-ctx');
    assert.equal(ins.voices, 0);
    f.setEnabled(false);       // 没 ctx 时也不能炸
    f.dispose();
});
