import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installKoiShared } from './helpers/koi-shared.mjs';

/* fish-mood 的 mood 参数在 tests/helpers/koi-shared.mjs 的 stub THEME.weather 里:
 *   clear {speed:1, band:0.4} / rain {speed:1.12, band:0.5} / snow {speed:0.85, band:0.66}
 * (stub 里没配 pull 的档位走默认 0.25 —— 顺带覆盖了缺 mood 键的兜底路径) */

installKoiShared();
const { createFishMood } = await import('../src/features/fish-mood.js');

function make() {
    const kois = [{}, {}, {}];
    let schoolMood = null;
    const schoolSystem = { setMoodSpeed(m) { schoolMood = m; } };
    const env = { index: 0 };
    const f = createFishMood({ kois, environment: env, schoolSystem, viewport: { width: 1000, height: 800 } });
    return { kois, env, f, get schoolMood() { return schoolMood; } };
}

test('晴天(index 0):心情写满全池,领头鱼速度同步', () => {
    const t = make();
    for (let i = 0; i < 30; i++) t.f.update(1);    // 心情是指数收敛,跑到稳态再断言
    assert.equal(t.schoolMood, 1);
    for (const k of t.kois) {
        assert.equal(k.moodSpeedMul, 1);
        assert.ok(Math.abs(k.moodBandY - 800 * 0.4) < 0.5, 'bandY=' + k.moodBandY);   // 晴:偏上晒背
        assert.ok(k.moodBandPull > 0);
    }
});

test('雪档:速度变慵懒、垂直带沉到偏下', () => {
    const t = make();
    t.env.index = 2;
    for (let i = 0; i < 30; i++) t.f.update(1);    // 心情 2.5s 内收敛
    assert.ok(Math.abs(t.kois[0].moodSpeedMul - 0.85) < 1e-3, 'speed=' + t.kois[0].moodSpeedMul);
    assert.ok(Math.abs(t.kois[0].moodBandY - 800 * 0.66) < 0.5, 'bandY=' + t.kois[0].moodBandY);
});

test('过渡中(index=0.5)速度在两档之间插值,不跳变', () => {
    const t = make();
    t.env.index = 0.5;
    for (let i = 0; i < 30; i++) t.f.update(1);
    const s = t.kois[0].moodSpeedMul;
    assert.ok(s > 1.0 && s < 1.12, 'speed=' + s);
});

test('预设缺 mood 键时回退中性值,不炸', () => {
    const weather = globalThis.KoiShared.THEME.weather;
    const saved = weather.snow.mood;
    delete weather.snow.mood;                      // 临时摘掉,走兜底路径
    try {
        const t = make();
        t.env.index = 2;
        for (let i = 0; i < 30; i++) t.f.update(1);
        assert.equal(t.kois[0].moodSpeedMul, 1);
        assert.ok(Math.abs(t.kois[0].moodBandY - 800 * 0.5) < 0.5);
    } finally {
        if (saved) weather.snow.mood = saved;
    }
});

test('没有 schoolSystem 也不炸(可选依赖)', () => {
    const f = createFishMood({ kois: [{}], environment: { index: 1 }, viewport: { width: 100, height: 100 } });
    f.update(1);
});
