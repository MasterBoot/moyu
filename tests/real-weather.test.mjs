import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installKoiShared } from './helpers/koi-shared.mjs';

installKoiShared();
const { mapWeatherCode } = await import('../src/features/weather.js');

/* WMO 天气码 → 四档的映射表(真实天气功能的核心纯函数)。
 * Open-Meteo weather_code 语义:0 晴,1-3 多云,45/48 雾,51-67 毛毛雨/雨,
 * 71-77/85/86 雪,80-82 阵雨,95-99 雷暴。 */

test('晴/多云/雾 → 晴(0)', () => {
    for (const c of [0, 1, 2, 3, 45, 48]) assert.equal(mapWeatherCode(c), 0, 'code=' + c);
});

test('雨/毛毛雨/阵雨 → 雨(1);降水量大升大雨', () => {
    for (const c of [51, 53, 55, 56, 57, 61, 63, 66, 80, 81]) {
        assert.equal(mapWeatherCode(c, 0.2), 1, 'code=' + c);
        assert.equal(mapWeatherCode(c, 2.4), 1, 'code=' + c + ' @2.4mm');
    }
    assert.equal(mapWeatherCode(63, 2.5), 2);      // ≥2.5mm/h 升档
    assert.equal(mapWeatherCode(63, 9), 2);
});

test('大雨/强阵雨/雷暴 → 大雨(2)', () => {
    for (const c of [65, 82, 95, 96, 99]) assert.equal(mapWeatherCode(c, 0), 2, 'code=' + c);
});

test('各类雪 → 雪(3),与降水量无关', () => {
    for (const c of [71, 73, 75, 77, 85, 86]) assert.equal(mapWeatherCode(c, 5), 3, 'code=' + c);
});

test('未知码/坏值回退晴,不抛', () => {
    assert.equal(mapWeatherCode(42), 0);
    assert.equal(mapWeatherCode(undefined), 0);
    assert.equal(mapWeatherCode(NaN), 0);
    assert.equal(mapWeatherCode('73'), 3);         // 字符串数字也能吃
});
