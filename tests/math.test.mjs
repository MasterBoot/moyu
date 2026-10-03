import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, mixHex, hexRgba, varyHexColor, shadeColor, smooth01 } from '../src/shared/math.js';

test('mulberry32:同种子序列可复现,不同种子序列不同', () => {
    const a1 = mulberry32(1234), a2 = mulberry32(1234), b = mulberry32(1235);
    const s1 = [a1(), a1(), a1()];
    const s2 = [a2(), a2(), a2()];
    const s3 = [b(), b(), b()];
    assert.deepEqual(s1, s2);
    assert.notDeepEqual(s1, s3);
    for (const v of s1) assert.ok(v >= 0 && v < 1, '输出必须在 [0,1)');
});

test('mixHex:端点精确,中点是线性混合', () => {
    assert.equal(mixHex('#000000', '#ffffff', 0), '#000000');
    assert.equal(mixHex('#000000', '#ffffff', 1), '#ffffff');
    assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');   // Math.round(127.5) = 128
    assert.equal(mixHex('#102030', '#102030', 0.7), '#102030');
});

test('hexRgba:hex + alpha 拼 rgba 字符串', () => {
    assert.equal(hexRgba('#102030', 0.5), 'rgba(16,32,48,0.5)');
    assert.equal(hexRgba('#000000', 1), 'rgba(0,0,0,1)');
});

test('varyHexColor:提亮/压暗并钳到 [0,255]', () => {
    assert.equal(varyHexColor('#000000', 1), '#ffffff');
    assert.equal(varyHexColor('#ffffff', -1), '#000000');
    assert.equal(varyHexColor('#0000ff', 1), '#ffffff');   // 蓝+1 → 全部钳到 255
    assert.equal(varyHexColor('#808080', 0), '#808080');
});

test('shadeColor:正量向白靠,负量向黑靠', () => {
    const up = shadeColor('#404040', 1);
    const down = shadeColor('#404040', -1);
    assert.equal(up, 'rgb(255,255,255)');
    assert.equal(down, 'rgb(0,0,0)');
});

test('smooth01:端点为 0/1,中点对称', () => {
    assert.equal(smooth01(0), 0);
    assert.equal(smooth01(1), 1);
    assert.equal(smooth01(0.5), 0.5);
    assert.equal(smooth01(-0.3), 0);   // 越界钳制
    assert.equal(smooth01(1.3), 1);
});
