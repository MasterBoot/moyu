import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFog } from '../src/render/fog.js';

/* 雾渲染器:雾团常驻(无生命周期),可见度由 draw 的 amount 管;
 * 无 DOM(Node)时 draw 是空操作 —— 只验证 update/inspect/不抛。 */

test('雾团常驻:update 漂移不出界、draw 无 DOM 安全', () => {
    const f = createFog({ viewport: { width: 1000, height: 800 }, fog: { puffs: 6 } });
    assert.equal(f.count, 6);
    for (let i = 0; i < 200; i++) f.update(0.1);          // 20 秒漂移
    const g = {
        globalCompositeOperation: 'source-over', globalAlpha: 1,
        drawImage() { throw new Error('无 DOM 不应尝试贴图'); }
    };
    f.draw(g, 1);                                          // 不抛即过(sprite 未烘焙直接返回)
    f.draw(g, 0);
    f.clear();
    f.update(0.1);
});

test('amount 为 0 时 draw 是彻底空操作(不会改混合模式)', () => {
    const f = createFog({ viewport: { width: 800, height: 600 }, fog: { puffs: 3 } });
    const g = { globalCompositeOperation: 'source-over', globalAlpha: 1, drawImage() { throw new Error('should not draw'); } };
    f.draw(g, 0);
    assert.equal(g.globalCompositeOperation, 'source-over');
});
