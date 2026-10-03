import { mulberry32 } from '../shared/math.js';

/**
 * 雾(2026-10-03):清晨薄雾 —— 一群缓慢漂移的柔雾团,画在 weather 层。
 *
 *   ① **一次性烘焙**一张 256px 的径向柔雾贴图,运行时每帧只有 N 次 drawImage;
 *   ② 每团有自己的漂移速度(横向为主,极缓上浮)、大小(短边的 0.3~0.7)、相位
 *      (呼吸:alpha ±25% 慢摆),出界环绕 —— 永不重生的常驻群体;
 *   ③ 可见度 = 调用方传进来的"大气量"(environment.rainAmount,雾档淡入淡出与雨雪同曲线);
 *   ④ 固定种子 ⇒ 布局逐次运行一致;无 DOM(Node 单测)时 draw 直接返回。
 * 混合用 screen:雾是把远处的池面"提亮变灰",不是往上糊白。
 */
export function createFog({ viewport, fog = {} }) {
    const rng = mulberry32(fog.seed ?? 0xF06);
    const count = Math.max(1, fog.puffs || 12);
    const tint = fog.tint || '214,228,235';

    let sprite = null;
    function bake() {
        if (sprite || typeof document === 'undefined') return sprite;
        const S = 256;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const g = c.getContext('2d');
        const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
        gr.addColorStop(0, 'rgba(' + tint + ',0.9)');
        gr.addColorStop(0.45, 'rgba(' + tint + ',0.42)');
        gr.addColorStop(1, 'rgba(' + tint + ',0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, S, S);
        sprite = c;
        return sprite;
    }

    const puffs = [];
    for (let i = 0; i < count; i++) {
        puffs.push({
            x: rng() * 1.4 - 0.2,                    // 画宽的比例(允许出界 20%)
            y: rng() * 0.9 - 0.05,                   // 画高的比例
            s: 0.30 + rng() * 0.40,                  // 团直径 = 短边的比例
            vx: (4 + rng() * 10) * (rng() < 0.5 ? -1 : 1),   // px/s,横向漂移
            vy: -(0.6 + rng() * 1.6),                // 极缓上浮
            a: 0.06 + rng() * 0.07,
            ph: rng() * Math.PI * 2
        });
    }

    return {
        get count() { return count; },

        update(dt) {
            for (const p of puffs) {
                p.x += p.vx * dt / Math.max(1, viewport.width);
                p.y += p.vy * dt / Math.max(1, viewport.height);
                p.ph += dt * 0.15;
                if (p.x < -0.35) p.x += 1.7; else if (p.x > 1.35) p.x -= 1.7;   // 横向环绕
                if (p.y < -0.45) p.y += 1.0; else if (p.y > 0.55) p.y -= 1.0;   // 纵向环绕
            }
        },

        /** amount = 大气量 0~1(雾档的淡入淡出) */
        draw(g, amount) {
            const sp = bake();
            if (!sp) return;                          // 无 DOM(单测)
            if (amount <= 0.003) return;
            const w = Math.max(2, viewport.width), h = Math.max(2, viewport.height);
            const short = Math.min(w, h);
            const wasOp = g.globalCompositeOperation, wasA = g.globalAlpha;
            g.globalCompositeOperation = 'screen';
            for (let i = 0; i < puffs.length; i++) {
                const p = puffs[i];
                const a = p.a * amount * (0.75 + 0.25 * Math.sin(p.ph));
                const d = p.s * short;
                g.globalAlpha = Math.max(0, Math.min(1, a));
                g.drawImage(sp, p.x * w - d / 2, p.y * h - d / 2, d, d);
            }
            g.globalAlpha = wasA;
            g.globalCompositeOperation = wasOp;
        },

        clear() { /* 雾团常驻,无生命周期;可见度由 amount 管 */ },
        inspect: () => ({ count, sprite: !!sprite })
    };
}
