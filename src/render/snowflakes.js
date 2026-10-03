import { mulberry32 } from '../shared/math.js';

/**
 * 雪片(2026-10-03):雪天的"空中雪花"。与雨丝(rain-streaks.js)同一套纪律:
 *
 *   ① **池化 + 上限**:预分配固定数量对象循环复用,零每帧分配(壁纸是常驻的)。
 *   ② **各自的"水面深度"**:每片有自己的 target(落点纵深),造成前后层次,
 *      不是所有人都在同一行化掉。
 *   ③ **落水即化,不是消失**:到 target 后进入 melt 渐隐(原地坐着淡出去),
 *      雪落水无声 —— 不起雨坑,也不撞出涟漪。
 *   ④ 随机流由调用方注入(environment.rng,固定种子),绝不碰共享 Math.random。
 *   ⑤ **大小不一的真雪花**:启动时烘焙 6 张晶形贴图(点 → 六枝晶盘,细节递增),
 *      运行时按雪片大小选档 —— 越大越细致,小远处就是圆点;带慢速自转。
 *      每帧只有 drawImage,零路径重描。Node 测试环境没有 document,
 *      贴图为空时 draw() 自动退回圆点路径(行为同旧版,测试不破)。
 */
const SPRITE_S = 64;
let sprites = null;
function bakeSprites() {
    if (sprites || typeof document === 'undefined') return sprites;
    const R = mulberry32(0x5E51);          // 固定种子:晶形逐次运行一致
    const make = detail => {
        const c = document.createElement('canvas');
        c.width = c.height = SPRITE_S;
        const g = c.getContext('2d');
        const cx = SPRITE_S / 2, maxR = SPRITE_S * 0.46;
        g.strokeStyle = 'rgba(255,255,255,0.92)';
        g.fillStyle = 'rgba(255,255,255,0.92)';
        g.lineCap = 'round';
        g.shadowColor = 'rgba(255,255,255,0.8)';   // 轻微泛光,贴在水上才不生硬
        g.shadowBlur = 2;
        if (detail === 0) {                        // 点:远处的小雪
            g.beginPath(); g.arc(cx, cx, SPRITE_S * 0.10, 0, Math.PI * 2); g.fill();
            return c;
        }
        for (let i = 0; i < 6; i++) {
            g.save();
            g.translate(cx, cx);
            g.rotate((i / 6) * Math.PI * 2 + (R() - 0.5) * 0.06);   // 枝间微小不齐,才像真雪晶
            const L = maxR * (0.82 + R() * 0.18);
            g.lineWidth = Math.max(1.6, SPRITE_S * 0.035);
            g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -L); g.stroke();
            if (detail >= 2) {                     // 中档:两级侧枝
                g.lineWidth = Math.max(1.2, SPRITE_S * 0.025);
                for (const [t, bl] of [[0.45, 0.30], [0.72, 0.20]]) {
                    for (const s of [-1, 1]) {
                        const y0 = -L * t;
                        const bx = Math.sin(Math.PI / 3) * L * bl * s;
                        const by = y0 - Math.cos(Math.PI / 3) * L * bl;
                        g.beginPath(); g.moveTo(0, y0); g.lineTo(bx, by); g.stroke();
                    }
                }
            }
            if (detail >= 3) {                     // 高档:枝端小六边形盘
                const pr = L * 0.13;
                g.lineWidth = Math.max(1.1, SPRITE_S * 0.022);
                g.beginPath();
                for (let k = 0; k < 6; k++) {
                    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
                    const px = Math.cos(a) * pr, py = -L - Math.sin(a) * pr;
                    if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
                }
                g.closePath(); g.stroke();
            }
            g.restore();
        }
        g.beginPath(); g.arc(cx, cx, SPRITE_S * (0.05 + detail * 0.012), 0, Math.PI * 2); g.fill();
        return c;
    };
    sprites = [make(0), make(1), make(2), make(2), make(3), make(3)];   // 点/简星/中×2/高×2
    return sprites;
}

export function createSnowflakes({ viewport, snow = {}, rng = Math.random }) {
    const cap = Math.max(1, snow.maxLive || 180);
    const sizeR = snow.size || [8, 26];
    const vyR = snow.vy || [26, 60];
    const freqR = snow.swayFreq || [0.5, 1.3];
    const ampR = snow.swayAmp || [6, 20];
    const alphaR = snow.alpha || [0.30, 0.75];
    const meltR = snow.melt || [0.7, 1.5];

    const pool = new Array(cap);
    const pick = (r) => r[0] + rng() * (r[1] - r[0]);
    for (let i = 0; i < cap; i++) {
        pool[i] = { x: 0, y: 0, d: 0, vy: 0, freq: 0, amp: 0, ph: 0, a: 0,
                    target: 0, melt: 0, meltT: 0, melting: false, live: false,
                    rot: 0, spin: 0, si: 0 };
    }

    let created = 0, melted = 0;

    /** 从画面上方飘下来。far = 视差:远的小/慢/淡 —— 顺带决定晶形档位(小=点,大=枝晶) */
    function respawn(f, anywhere) {
        const far = rng();
        f.d = pick(sizeR) * (0.55 + 0.75 * far);
        f.vy = pick(vyR) * (0.55 + 0.75 * far);
        f.freq = pick(freqR);
        f.amp = pick(ampR) * (0.55 + 0.75 * far);
        f.ph = rng() * Math.PI * 2;
        f.a = pick(alphaR) * (0.45 + 0.9 * far);
        f.rot = rng() * Math.PI * 2;
        f.spin = (rng() - 0.5) * 1.6;              // 慢速自转:雪花翻着落
        // 晶形按大小选档:0=点(<6px) 1=简星(<11px) 2..5=中/高细节
        f.si = f.d < 6 ? 0 : f.d < 11 ? 1 : 2 + ((rng() * 4) | 0);
        f.x = rng() * viewport.width * 1.25 - viewport.width * 0.125;
        f.target = viewport.height * (0.05 + 0.95 * rng());
        f.y = anywhere ? rng() * f.target : -f.d - rng() * viewport.height * 0.3;
        f.melt = pick(meltR);
        f.meltT = 0; f.melting = false;
        f.live = true;
        created++;
    }

    return {
        get count() { return pool.reduce((n, f) => n + (f.live ? 1 : 0), 0); },
        get cap() { return cap; },
        get created() { return created; },
        get melted() { return melted; },

        /** 把数量凑到 target(不足就补;多了不动,等它们自己化完) */
        fill(target) {
            let live = this.count;
            for (let i = 0; i < cap && live < target; i++) {
                if (!pool[i].live) { respawn(pool[i], true); live++; }
            }
        },

        /**
         * @param dt 秒
         * @param target 当前该有多少片在场(天晴/关天气时传 0 ⇒ 飘完就退休)
         */
        update(dt, target = cap) {
            for (let i = 0; i < cap; i++) {
                const f = pool[i];
                if (!f.live) continue;
                if (!f.melting) {
                    f.y += f.vy * dt;
                    f.ph += f.freq * dt;
                    f.x += Math.sin(f.ph) * f.amp * dt;      // 横向摆动:雪不是直线掉下来的
                    f.rot += f.spin * dt;
                    if (f.y >= f.target) {
                        // 超过目标数量就退休(雪停/切晴);否则落水开始融化
                        if (this.count > target) { f.live = false; continue; }
                        f.melting = true; f.meltT = 0;
                    }
                } else {
                    f.meltT += dt;
                    if (f.meltT >= f.melt) {
                        melted++;
                        if (this.count > target) { f.live = false; } else respawn(f, false);
                    }
                }
            }
        },

        draw(g) {
            const wasOp = g.globalCompositeOperation, wasA = g.globalAlpha;
            g.globalCompositeOperation = 'screen';
            g.fillStyle = 'rgb(240,248,252)';
            const sp = bakeSprites();
            for (let i = 0; i < cap; i++) {
                const f = pool[i];
                if (!f.live) continue;
                let a = f.a;
                if (f.melting) a *= 1 - f.meltT / f.melt;    // 落水渐隐 = "化掉"
                if (sp) {
                    g.save();
                    g.translate(f.x, f.y);
                    g.rotate(f.rot);
                    g.globalAlpha = a;
                    g.drawImage(sp[f.si], -f.d / 2, -f.d / 2, f.d, f.d);
                    g.restore();
                } else {                                     // 无 DOM(单测)的圆点回退
                    g.globalAlpha = a;
                    g.beginPath();
                    g.arc(f.x, f.y, Math.max(0.6, f.d / 2), 0, Math.PI * 2);
                    g.fill();
                }
            }
            g.globalAlpha = wasA;
            g.globalCompositeOperation = wasOp;
        },

        clear() { for (let i = 0; i < cap; i++) pool[i].live = false; },
        inspect: () => ({ cap, created, melted, sprites: sprites ? sprites.length : 0,
                          count: pool.reduce((n, f) => n + (f.live ? 1 : 0), 0) })
    };
}
