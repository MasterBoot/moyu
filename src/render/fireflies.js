import { mulberry32 } from '../shared/math.js';

/**
 * 萤火虫(2026-10-03):池边游荡的小光点,各自独立呼吸明灭。
 *
 *   ① 光点贴图一次性烘焙(暖黄绿光晕 + 亮芯),每帧 N 次 drawImage + 1 次小圆;
 *   ② 明灭 = sin 相位的平方(亮约 40% 时间),频率各不相同 —— 一齐闪就是圣诞树;
 *   ③ 游荡:方向缓慢随机漂 + 边界反射;活跃度随夜度(白天它们"不存在");
 *   ④ 固定种子;无 DOM(Node 单测)时 draw 直接返回。
 */
export function createFireflies({ viewport, fireflies = {} }) {
    const rng = mulberry32(fireflies.seed ?? 0xF1E5);
    const count = Math.max(1, fireflies.count || 8);
    const speedR = fireflies.speed || [8, 20];
    const blinkR = fireflies.blink || [2.2, 4.2];
    const pick = (r) => r[0] + rng() * (r[1] - r[0]);

    let sprite = null;
    function bake() {
        if (sprite || typeof document === 'undefined') return sprite;
        const S = 32;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const g = c.getContext('2d');
        const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
        gr.addColorStop(0, 'rgba(238,255,192,1)');
        gr.addColorStop(0.35, 'rgba(202,236,132,0.4)');
        gr.addColorStop(1, 'rgba(180,225,110,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, S, S);
        sprite = c;
        return sprite;
    }

    const pool = [];
    for (let i = 0; i < count; i++) {
        pool.push({
            x: 30 + rng() * Math.max(1, viewport.width - 60),
            y: 30 + rng() * Math.max(1, viewport.height - 60),
            ang: rng() * Math.PI * 2,
            spd: pick(speedR),
            ph: rng() * Math.PI * 2,
            fq: pick(blinkR)
        });
    }

    return {
        get count() { return count; },

        /** amount = 夜度 0~1(白天萤火虫不存在) */
        update(dt, amount) {
            const w = Math.max(1, viewport.width), h = Math.max(1, viewport.height);
            for (const f of pool) {
                f.ang += (rng() - 0.5) * 1.6 * dt;                       // 游荡:方向缓漂
                const spd = f.spd * (0.3 + 0.7 * amount);
                f.x += Math.cos(f.ang) * spd * dt;
                f.y += Math.sin(f.ang) * spd * dt;
                if (f.x < 24) { f.x = 24; f.ang = Math.PI - f.ang; }     // 边界反射
                if (f.x > w - 24) { f.x = w - 24; f.ang = Math.PI - f.ang; }
                if (f.y < 24) { f.y = 24; f.ang = -f.ang; }
                if (f.y > h - 24) { f.y = h - 24; f.ang = -f.ang; }
                f.ph += f.fq * dt;
            }
        },

        draw(g, amount) {
            const sp = bake();
            if (!sp || amount <= 0.01) return;
            const wasOp = g.globalCompositeOperation, wasA = g.globalAlpha;
            g.globalCompositeOperation = 'screen';
            for (let i = 0; i < pool.length; i++) {
                const f = pool[i];
                const pulse = Math.max(0, Math.sin(f.ph));
                const a = pulse * pulse * amount;                        // 平方:亮得干脆、灭得干净
                if (a < 0.02) continue;
                g.globalAlpha = a * 0.55;
                g.drawImage(sp, f.x - 8, f.y - 8, 16, 16);
                g.globalAlpha = a;
                g.fillStyle = 'rgba(244,255,208,1)';
                g.beginPath();
                g.arc(f.x, f.y, 1.3, 0, Math.PI * 2);
                g.fill();
            }
            g.globalAlpha = wasA;
            g.globalCompositeOperation = wasOp;
        },

        clear() { /* 位置常驻,无生命周期 */ },
        inspect: () => ({ count, lit: pool.reduce((n, f) => n + (Math.sin(f.ph) > 0.3 ? 1 : 0), 0) })
    };
}
