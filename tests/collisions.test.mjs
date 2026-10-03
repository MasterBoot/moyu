import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segSegDist } from '../src/pond/collisions.js';

/* segSegDist 是鱼碰撞的核心几何(胶囊↔胶囊),纯函数无依赖。
 * 这些断言钉住的是"松弛求解器吃到的距离/法线"的语义:法线永远指向 A(px-qx)。 */

test('两线段相交 → 距离 0', () => {
    const r = segSegDist(0, 0, 10, 0, 5, -5, 5, 5);
    assert.ok(r.d < 1e-9, 'd=' + r.d);
});

test('平行线 → 距离等于间距,法线垂直指向 A', () => {
    const r = segSegDist(0, 0, 10, 0, 0, 3, 10, 3);
    assert.ok(Math.abs(r.d - 3) < 1e-9, 'd=' + r.d);
    assert.ok(Math.abs(r.nx) < 1e-9 && Math.abs(r.ny + 3) < 1e-9, 'n=' + r.nx + ',' + r.ny);
});

test('共线重叠 → 距离 0(简并分支不 NaN)', () => {
    const r = segSegDist(0, 0, 10, 0, 3, 0, 17, 0);
    assert.ok(r.d < 1e-9, 'd=' + r.d);
    assert.ok(Number.isFinite(r.nx) && Number.isFinite(r.ny));
});

test('不相交的斜线 → 最近点对取端点', () => {
    // A 竖直 (0,0)-(0,10),B 竖直 (7,12)-(7,20):最近 = A 末端 (0,10) ↔ B 始端 (7,12)
    const r = segSegDist(0, 0, 0, 10, 7, 12, 7, 20);
    assert.ok(Math.abs(r.d - Math.sqrt(53)) < 1e-9, 'd=' + r.d);
    assert.ok(Math.abs(r.nx + 7) < 1e-9 && Math.abs(r.ny + 2) < 1e-9);
});

test('零长度线段(退化为点)不 NaN', () => {
    const r = segSegDist(5, 5, 5, 5, 9, 9, 9, 9);
    assert.ok(Math.abs(r.d - Math.sqrt(32)) < 1e-9, 'd=' + r.d);
    assert.ok(Number.isFinite(r.nx) && Number.isFinite(r.ny));
});
