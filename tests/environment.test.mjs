import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installKoiShared } from './helpers/koi-shared.mjs';

installKoiShared();
const { createEnvironment } = await import('../src/core/environment.js');

/* environment 的两条硬约定:
 *   ① 默认晴 = 中性(causticAlpha 1、色罩 alpha 0)—— "不开天气等于没接"
 *   ② 两道 multiply 色罩精确合成一道(等效系数 = 两道系数的乘积) */

function makeEnv() {
    return createEnvironment({ config: { weather: 0 }, seed: 1 });
}

test('默认晴:光感 ×1,色罩 alpha 0', () => {
    const env = makeEnv();
    assert.ok(Math.abs(env.causticAlpha - 1) < 1e-9, 'causticAlpha=' + env.causticAlpha);
    assert.equal(env.grade.alpha, 0);
    assert.equal(env.name, 'clear');
});

test('composeGrade:单道时精确退化为那道本身', () => {
    const onlyWeather = createEnvironment({ config: { weather: 0 } }).composeGrade(1, '#808080', 0, '#ffffff');
    assert.equal(onlyWeather.color, '#808080');
    assert.equal(onlyWeather.alpha, 1);

    const onlyDay = createEnvironment({ config: { weather: 0 } }).composeGrade(0, '#ffffff', 1, '#404040');
    assert.equal(onlyDay.color, '#404040');
    assert.equal(onlyDay.alpha, 1);
});

test('composeGrade:双道合成的等效 multiply 系数 = 两道系数的乘积', () => {
    const composeGrade = createEnvironment({ config: { weather: 0 } }).composeGrade;
    const aw = 0.6, cw = '#8844aa', ad = 0.35, cd = '#22cc66';
    const r = composeGrade(aw, cw, ad, cd);
    const chan = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
    const W = chan(cw), D = chan(cd), R = chan(r.color);
    for (let i = 0; i < 3; i++) {
        const expect = ((1 - aw) + aw * W[i]) * ((1 - ad) + ad * D[i]);
        const actual = (1 - r.alpha) + r.alpha * R[i];
        /* 结果色要经 rgb2hex 的 8-bit 量化(±0.5/255),再乘回 alpha(0.74)——
         * 1e-6 那种浮点容差在这里必然失败,给到量化误差的两倍有余。 */
        assert.ok(Math.abs(expect - actual) < 0.01, '通道' + i + ': ' + expect + ' vs ' + actual);
    }
});

test('切到雨:过渡收敛后光感/雨量到达预设值', () => {
    const env = makeEnv();
    env.setWeather(1);
    for (let i = 0; i < 400; i++) env.update(0.05);   // 20s:transition=1、rainFade=1 早就收敛
    assert.ok(env.settled, 'index 未收敛');
    assert.equal(env.name, 'rain');
    assert.ok(Math.abs(env.causticAlpha - 0.3) < 1e-9, 'causticAlpha=' + env.causticAlpha);
    assert.equal(env.rainSpawnCount(), 100);          // perSec=100,rainAmount 已满
    assert.equal(env.snowSpawnCount(), 0);            // 雨档不该出雪
});

test('切到雪:雨丝归零,雪片按预设计数', () => {
    const env = makeEnv();
    env.setWeather(2);
    for (let i = 0; i < 400; i++) env.update(0.05);
    assert.equal(env.name, 'snow');
    assert.equal(env.rainSpawnCount(), 0);
    assert.equal(env.snowSpawnCount(), 50);
});

test('orderLength 与范围钳制', () => {
    const env = makeEnv();
    assert.equal(env.orderLength, 3);
    assert.equal(env.setWeather(99), 2);       // 越界钳到最后一位
    assert.equal(env.setWeather('snow'), 2);   // 名字查找
    assert.equal(env.setWeather('nope'), -1 === -1 ? 0 : -1);   // 未知名字回退晴(且不抛)
});

test('snapTo:立即落档,不走过渡(启动等真实天气用)', () => {
    const env = makeEnv();
    env.snapTo(2);
    assert.equal(env.index, 2);
    assert.equal(env.targetIndex, 2);
    assert.equal(env.name, 'snow');
    assert.ok(env.settled);
    env.snapTo('rain');
    assert.equal(env.index, 1);
    assert.equal(env.name, 'rain');
});
