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

test('rainGainFor:线性封顶,档位倍率不在这一层(在增益曲线后)', () => {
    assert.equal(rainGainFor(0), 0);
    assert.equal(rainGainFor(0.5), 0.5);
    assert.equal(rainGainFor(1), 1);
    assert.equal(rainGainFor(0.8), 0.8);
    assert.equal(rainGainFor(-0.2), 0);
    assert.equal(rainGainFor(undefined), 0);
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
