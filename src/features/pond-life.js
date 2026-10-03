import { mulberry32 } from '../shared/math.js';

/**
 * 池塘小住户(2026-10-03):蜻蜓点水 + 荷叶上的青蛙。
 *
 * 和乌龟(生物 kind,进 kois 列表参与碰撞)不同,这三位**不进碰撞体系**:
 * 蜻蜓在天上飞、青蛙坐在水面浮叶上 —— 都在水面之上,画在 weather 层
 * (鱼/涟漪之上,霜冻之下)。俯视视角下它们是"贴着水面"的小事件。
 *
 *   蜻蜓 ×2 — 悬停(李萨如微抖)+ 偶尔快速转移到新锚点;悬停时每 6~14s
 *             下来点一次水:身体压低 + 一圈小涟漪("蜻蜓点水"的因果链)
 *   荷叶 ×3 — 岸边三个固定位,轻晃;radial 渐变 + 缺口 + 叶脉
 *   青蛙 ×1 — 坐在荷叶上,鼓喉鸣叫(纯视觉);每 25~60s 跳去另一张叶:
 *             起跳小涟漪、抛物线腾空、落水中涟漪
 *
 * 随机走独立种子流;无 DOM 依赖(单测直接跑)。
 */
export function createPondLife({ viewport, config, spawnRipple }) {
    const rng = mulberry32(0xD1CE);
    const pick = (r) => r[0] + rng() * (r[1] - r[0]);
    const rippleStrength = () => Number(config.rippleStrength) || 1;

    /* ── 蜻蜓 ── */
    const flies = [];
    for (const [fx, fy] of [[0.32, 0.30], [0.68, 0.62]]) {
        const f = {
            ax: viewport.width * fx, ay: viewport.height * fy,   // 锚点
            x: viewport.width * fx, y: viewport.height * fy,
            ang: rng() * Math.PI * 2,
            ph1: rng() * 6.28, ph2: rng() * 6.28, wing: rng() * 6.28,
            hoverT: 0, mode: 'hover',
            t: 0, dur: 0, fx0: 0, fy0: 0, fx1: 0, fy1: 0,
            dipT: 0, dipping: 0, dipped: false
        };
        enterHover(f);
        flies.push(f);
    }
    function newAnchor(f) {
        f.fx0 = f.ax; f.fy0 = f.ay;
        f.fx1 = viewport.width * (0.2 + rng() * 0.6);
        f.fy1 = viewport.height * (0.2 + rng() * 0.6);
        f.mode = 'dart'; f.t = 0;
        f.dur = Math.hypot(f.fx1 - f.fx0, f.fy1 - f.fy0) / pick([420, 700]);
    }
    function enterHover(f) {
        /* 进入悬停:悬停时长先定,点水安排在窗口内(dip 0.55s + 前后余量)
         * —— 原来两个计时器独立重掷,点水窗口经常被跳过(实测 40s 一次都没点)。 */
        f.mode = 'hover';
        f.hoverT = pick([4, 9]);
        f.dipT = 1.5 + rng() * Math.max(0.3, f.hoverT - 2.5);
        f.dipped = false;
    }
    function stepFlies(dt) {
        for (const f of flies) {
            f.wing += dt * 42;                                   // 翅膀频率(视觉上是"振翅模糊")
            f.ph1 += dt * 1.7; f.ph2 += dt * 1.13;
            if (f.mode === 'hover') {
                f.x = f.ax + Math.sin(f.ph1) * 9 + Math.sin(f.ph2 * 0.7) * 5;
                f.y = f.ay + Math.cos(f.ph2) * 8 + Math.sin(f.ph1 * 0.6) * 5;
                f.ang = Math.sin(f.ph2 * 0.5) * 0.6;             // 悬停时缓缓摆头
                f.hoverT -= dt;
                f.dipT -= dt;
                if (f.dipT <= 0 && f.hoverT > 1) {               // 点水(留足 1s 余量,别在转移前夕)
                    f.mode = 'dip'; f.t = 0; f.dur = 0.55; f.dipping = 0; f.dipped = false;
                } else if (f.hoverT <= 0) {
                    newAnchor(f);
                }
            } else if (f.mode === 'dart') {
                f.t += dt;
                const p = Math.min(1, f.t / f.dur);
                f.x = f.fx0 + (f.fx1 - f.fx0) * p;
                f.y = f.fy0 + (f.fy1 - f.fy0) * p;
                f.ang = Math.atan2(f.fy1 - f.fy0, f.fx1 - f.fx0);
                if (p >= 1) { f.ax = f.fx1; f.ay = f.fy1; enterHover(f); }
            } else {                                             // dip:点水
                f.t += dt;
                f.dipping = Math.sin(Math.PI * Math.min(1, f.t / f.dur));   // 0→1→0
                if (f.dipping > 0.9 && !f.dipped) {              // 最低点起一圈小涟漪
                    f.dipped = true;
                    spawnRipple(f.x, f.y, 0.5 * rippleStrength());
                }
                if (f.t >= f.dur) { f.mode = 'hover'; f.dipping = 0; f.dipped = false; f.dipT = 1e9; }
            }
        }
    }

    /* ── 荷叶 + 青蛙 ── */
    const leaves = [];
    for (const [fx, fy, r] of [[0.13, 0.72, 34], [0.88, 0.26, 30], [0.46, 0.10, 28]]) {
        leaves.push({
            x: viewport.width * fx, y: viewport.height * fy, r,
            notch: rng() * Math.PI * 2, ph: rng() * 6.28
        });
    }
    const frog = {
        leaf: 0, x: leaves[0].x, y: leaves[0].y,
        hopT: pick([10, 24]), jump: null,                       // { from, to, t, dur }
        croakT: pick([5, 14]), croaking: 0
    };
    function stepFrog(dt) {
        for (const l of leaves) l.ph += dt * 0.6;
        if (frog.jump) {
            const j = frog.jump;
            j.t += dt;
            const p = Math.min(1, j.t / j.dur);
            frog.x = j.x0 + (j.x1 - j.x0) * p;
            frog.y = j.y0 + (j.y1 - j.y0) * p;
            frog.air = Math.sin(Math.PI * p);                    // 腾空高度(画的时候放大 + 偏移影子)
            if (p >= 1) {
                frog.jump = null; frog.air = 0; frog.leaf = j.to;
                spawnRipple(frog.x, frog.y, 0.9 * rippleStrength());
                frog.hopT = pick([25, 60]);
                frog.croakT = pick([3, 8]);
            }
            return;
        }
        const l = leaves[frog.leaf];
        frog.x = l.x + Math.sin(l.ph) * 2;
        frog.y = l.y + Math.cos(l.ph * 0.8) * 2;
        frog.hopT -= dt;
        if (frog.hopT <= 0) {
            const to = (frog.leaf + 1 + Math.floor(rng() * (leaves.length - 1))) % leaves.length;
            spawnRipple(frog.x, frog.y, 0.4 * rippleStrength());   // 起跳蹬叶
            frog.jump = { x0: frog.x, y0: frog.y, x1: leaves[to].x, y1: leaves[to].y, to, t: 0, dur: 0.65 };
            frog.air = 0;
            return;
        }
        frog.croakT -= dt;
        if (frog.croakT <= 0) { frog.croaking = 1; frog.croakT = pick([6, 16]); }
        if (frog.croaking > 0) frog.croaking = Math.max(0, frog.croaking - dt * 2.2);
    }

    return {
        update(dt) {
            stepFlies(dt);
            stepFrog(dt);
        },
        layers: {
            weather: g => {
                drawLeaves(g, leaves);
                drawFrog(g, frog);
                for (const f of flies) drawDragonfly(g, f);
            }
        },
        clear() {},
        inspect: () => ({
            flies: flies.map(f => ({ mode: f.mode, x: Math.round(f.x), y: Math.round(f.y) })),
            frog: { leaf: frog.leaf, jumping: !!frog.jump, croaking: frog.croaking > 0 }
        })
    };

    /* ── 绘制 ── */
    function drawLeaves(g, ls) {
        for (const l of ls) {
            g.save();
            g.translate(l.x, l.y + Math.sin(l.ph) * 1.5);
            /* 影子 */
            g.fillStyle = 'rgba(10,30,28,0.14)';
            g.beginPath(); g.ellipse(3, 4, l.r * 1.02, l.r * 0.96, 0, 0, Math.PI * 2); g.fill();
            /* 叶面(radial:中心深、边缘亮) */
            const gr = g.createRadialGradient(0, 0, l.r * 0.1, 0, 0, l.r);
            gr.addColorStop(0, '#3f7038');
            gr.addColorStop(0.75, '#356230');
            gr.addColorStop(1, '#2a5226');
            g.fillStyle = gr;
            g.beginPath(); g.arc(0, 0, l.r, 0, Math.PI * 2); g.fill();
            /* 缺口(荷叶经典的 1/8 楔形,各叶方向不同) */
            g.globalCompositeOperation = 'destination-out';
            g.beginPath();
            g.moveTo(0, 0);
            g.arc(0, 0, l.r + 1, l.notch, l.notch + 0.42);
            g.closePath(); g.fill();
            g.globalCompositeOperation = 'source-over';
            /* 叶脉 */
            g.strokeStyle = 'rgba(190,220,170,0.25)';
            g.lineWidth = 1;
            for (let k = 0; k < 6; k++) {
                const a = l.notch + 0.5 + (k / 6) * (Math.PI * 2 - 0.6);
                g.beginPath(); g.moveTo(0, 0);
                g.lineTo(Math.cos(a) * l.r * 0.92, Math.sin(a) * l.r * 0.92);
                g.stroke();
            }
            g.strokeStyle = 'rgba(200,230,180,0.3)';
            g.beginPath(); g.arc(0, 0, l.r, 0, Math.PI * 2); g.stroke();
            g.restore();
        }
    }

    function drawFrog(g, f) {
        const onLeaf = !f.jump;
        g.save();
        g.translate(f.x, f.y - (f.air || 0) * 22);               // 腾空时整体上移
        g.rotate(onLeaf ? Math.sin(leaves[f.leaf].ph) * 0.05 : Math.atan2(f.jump.y1 - f.jump.y0, f.jump.x1 - f.jump.x0) - Math.PI / 2);
        const sc = 1 + (f.air || 0) * 0.28;                      // 腾空放大(离水面近了)
        g.scale(sc, sc);
        /* 影子:腾空时影子留在叶面(缩小),坐定时贴身 */
        const shadowAlpha = onLeaf ? 0.2 : 0.2 * (1 - (f.air || 0));
        g.fillStyle = 'rgba(10,30,28,' + shadowAlpha + ')';
        g.beginPath(); g.ellipse(2, 3 + (f.air || 0) * 20, 13, 9, 0, 0, Math.PI * 2); g.fill();
        /* 后腿(折叠,画在身体下) */
        g.fillStyle = '#4d7a33';
        for (const sgn of [-1, 1]) {
            g.beginPath();
            g.ellipse(sgn * 10, 7, 6.5, 4, sgn * 0.7, 0, Math.PI * 2);
            g.fill();
        }
        /* 身体 */
        const body = g.createRadialGradient(-2, -4, 2, 0, 0, 15);
        body.addColorStop(0, '#6d9a48');
        body.addColorStop(1, '#48702f');
        g.fillStyle = body;
        g.beginPath(); g.ellipse(0, 0, 12, 9.5, 0, 0, Math.PI * 2); g.fill();
        /* 背部斑纹 */
        g.fillStyle = 'rgba(46,74,30,0.7)';
        g.beginPath(); g.ellipse(-3, -1, 4.5, 2.6, 0.4, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(4, 2, 3, 1.8, -0.5, 0, Math.PI * 2); g.fill();
        /* 鼓喉(鸣叫时下颌鼓起的小泡) */
        if (f.croaking > 0) {
            const c = Math.sin(Math.min(1, f.croaking) * Math.PI);
            g.fillStyle = 'rgba(214,232,168,' + (0.75 * c).toFixed(2) + ')';
            g.beginPath(); g.ellipse(0, -9, 4.5 * c + 1, 3.5 * c + 1, 0, 0, Math.PI * 2); g.fill();
        }
        /* 眼睛:两颗鼓在头前侧 */
        for (const sgn of [-1, 1]) {
            g.fillStyle = '#cfe3a8';
            g.beginPath(); g.arc(sgn * 5.5, -7.5, 3.4, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#1d2416';
            g.beginPath(); g.arc(sgn * 5.5, -8, 1.7, 0, Math.PI * 2); g.fill();
        }
        /* 前脚 */
        g.fillStyle = '#4d7a33';
        for (const sgn of [-1, 1]) {
            g.beginPath(); g.ellipse(sgn * 7, -4, 3, 2, sgn * 0.5, 0, Math.PI * 2); g.fill();
        }
        g.restore();
    }

    function drawDragonfly(g, f) {
        const dip = f.dipping || 0;
        g.save();
        g.translate(f.x, f.y + dip * 4);                          // 点水时身体压低
        g.rotate(f.ang + Math.PI / 2);                            // 画布坐标:身体沿 -y 朝前
        const s = 1 - dip * 0.12;
        g.scale(s, s);
        /* 四片翅(画在身下):alpha 快速振 → "振翅模糊" */
        g.fillStyle = 'rgba(225,240,250,0.34)';
        for (const sgn of [-1, 1]) {
            for (const [front, wl] of [[1, 15], [-1, 13]]) {
                g.save();
                g.translate(front * 3.5, sgn * 3.2);
                g.rotate(sgn * (0.85 + Math.sin(f.wing + front * 2) * 0.18));
                g.beginPath();
                g.ellipse(0, -wl * 0.45, 2.6, wl * 0.55, 0, 0, Math.PI * 2);
                g.fill();
                g.restore();
            }
        }
        /* 腹(细长,末端微翘)+ 胸 + 复眼 */
        g.strokeStyle = '#3f7fae';
        g.lineWidth = 2.2;
        g.lineCap = 'round';
        g.beginPath(); g.moveTo(0, 2); g.lineTo(0, 13); g.stroke();
        g.fillStyle = '#2f628c';
        g.beginPath(); g.ellipse(0, 0, 3.4, 4.4, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#24507a';
        g.beginPath(); g.arc(-2.2, -4.2, 2.4, 0, Math.PI * 2); g.arc(2.2, -4.2, 2.4, 0, Math.PI * 2); g.fill();
        g.restore();
    }
}
