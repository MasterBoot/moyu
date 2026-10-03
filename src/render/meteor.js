import { mulberry32 } from '../shared/math.js';

/**
 * 流星(2026-10-03):深夜低频划过的一道,落点回调给调用方(起涟漪)。
 *
 *   ① 同一时刻最多一颗;间隔 45~110s,且夜度过了门槛(minNight)才开始倒计时;
 *   ② 从上方 22% 区域切入,与水平成 28°~50° 向下,左向右向各半;
 *   ③ 拖尾 = 头亮尾透的线性渐变(每帧仅一颗,渐变成本可忽略);亮度 sin 淡入淡出;
 *   ④ 落地瞬间回调 onLand(x, y) —— night-sky 在那里起涟漪(水面倒影熄灭处起澜);
 *   ⑤ 固定种子;纯 Canvas 2D,无 DOM 依赖(单测可直接跑)。
 */
export function createMeteor({ viewport, meteor = {}, onLand }) {
    const rng = mulberry32(meteor.seed ?? 0x5EED);
    const minNight = Number.isFinite(meteor.minNight) ? meteor.minNight : 0.55;
    const everyR = meteor.every || [45, 110];
    const speedR = meteor.speed || [900, 1300];
    const lenR = meteor.len || [90, 150];
    const lifeR = meteor.life || [0.45, 0.75];
    const pick = (r) => r[0] + rng() * (r[1] - r[0]);

    let m = null;                        // { x, y, vx, vy, len, life, t }
    /* 首次间隔可由主题/测试单独给(meteor.first);不设则默认 12~32s,开场别太快 */
    let timer = Number.isFinite(meteor.first) ? meteor.first : 12 + rng() * 20;

    function spawn() {
        const w = Math.max(1, viewport.width), h = Math.max(1, viewport.height);
        const dir = rng() < 0.5 ? -1 : 1;
        const ang = (Math.PI / 180) * (28 + rng() * 22);         // 与水平的下俯角
        const spd = pick(speedR);
        m = {
            x: w * (0.15 + rng() * 0.7),
            y: h * rng() * 0.22,
            vx: Math.cos(ang) * spd * dir,
            vy: Math.sin(ang) * spd,
            len: pick(lenR),
            life: pick(lifeR),
            t: 0
        };
    }

    return {
        /** night = 夜度 0~1(过门槛才倒计时) */
        update(dt, night) {
            if (m) {
                m.t += dt;
                m.x += m.vx * dt;
                m.y += m.vy * dt;
                if (m.t >= m.life) {
                    const lx = m.x, ly = m.y;
                    m = null;
                    timer = pick(everyR);
                    if (onLand) onLand(lx, ly);
                }
            } else if (night > minNight) {
                timer -= dt;
                if (timer <= 0) spawn();
            }
        },

        draw(g) {
            if (!m) return;
            const fade = Math.sin(Math.PI * Math.min(1, m.t / m.life));
            const sp = Math.hypot(m.vx, m.vy) || 1;
            const tx = m.x - (m.vx / sp) * m.len, ty = m.y - (m.vy / sp) * m.len;
            g.save();
            g.globalCompositeOperation = 'screen';
            if (typeof g.createLinearGradient === 'function') {
                const grad = g.createLinearGradient(m.x, m.y, tx, ty);
                grad.addColorStop(0, 'rgba(255,255,255,' + (0.85 * fade).toFixed(3) + ')');
                grad.addColorStop(1, 'rgba(255,255,255,0)');
                g.strokeStyle = grad;
            } else {
                g.strokeStyle = 'rgba(255,255,255,' + (0.6 * fade).toFixed(3) + ')';
            }
            g.lineWidth = 1.8;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(m.x, m.y);
            g.lineTo(tx, ty);
            g.stroke();
            g.fillStyle = 'rgba(255,255,255,' + (0.95 * fade).toFixed(3) + ')';
            g.beginPath();
            g.arc(m.x, m.y, 1.6, 0, Math.PI * 2);
            g.fill();
            g.restore();
        },

        clear() { m = null; },
        inspect: () => ({ live: !!m, timer: Math.round(timer), progress: m ? +(m.t / m.life).toFixed(2) : null })
    };
}
