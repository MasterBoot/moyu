import { THEME, WaterGL } from '../shared/legacy-assets.js';
/* ★ 光向【每帧现读】,不再在加载时解构。
 *   原来是 `const [lx(), ly()] = THEME.light.dir` —— 加载时固化,
 *   之后运行时光向转了也【完全不动】(影子/涟漪/时钟偏移全都不跟),典型的"改了没反应"。
 *   这是"光随时间走"(experiments/day-phase)的前提。
 *   ⚠️ THEME.light.dir 必须保持【单位向量】:多处拿它做投影与偏移量。 */
const lx = () => THEME.light.dir[0];
const ly = () => THEME.light.dir[1];

class Ripple {

    /** profile 默认 = 鼠标涟漪那套(THEME.water.ripple);雨滴传自己的(同一套参数的派生) */
    constructor(x, y, power, profile, deps) {
        const T = this.T = profile || THEME.water.ripple;
        // 依赖从外面注入(而不是闭包):这样同一个类既能给鼠标涟漪用,也能给雨滴场用
        this.viewport = (deps && deps.viewport) || { width: 1, height: 1 };
        this.config = (deps && deps.config) || {};
        this.x = x; this.y = y;
        this.power = power;
        this.age = 0;
        this.dead = false;
        this.life = T.life[0] + power * T.life[1];
        this.speed = T.speed[0] + power * T.speed[1];
        // ★ 波长不在这里定死:λ = lamRatio × 当前半径(见 draw()),这样环永远是"细线"。
        // ★ amp/扩散衰减已经不需要了 —— 现在是"画"出来的环,不是物理高度场。
        //   留着会让人以为调它能改涟漪强度(实际只影响 fade 之外的空数据)。
        // 角向包络的抖动种子:每个涟漪不同,环才不会长得一模一样。
        this.seed = (x * 0.0131 + y * 0.0217 + power * 1.7) % (Math.PI * 2);
    }
    update(dt) {
        this.age += dt;
        if (this.age >= this.life) this.dead = true;
    }
    get radius() { return this.speed * this.age; }

    get fade() {
        const T = this.T;
        return 1 - Math.pow(Math.min(1, this.age / this.life), T.fadePower);
    }

    intensity() {
        const T = this.T;
        const spread = T.spread / (this.radius + T.spread);

        const L = Math.max(1, Math.hypot(this.viewport.width, this.viewport.height) * 0.5);
        const proj = ((this.x - this.viewport.width * 0.5) * lx() + (this.y - this.viewport.height * 0.5) * ly()) / L;
        const lightDist = 1 - T.lightDistDim * (1 - proj) * 0.5;
        return this.fade * spread * Math.max(0, lightDist);
    }
    draw(ctx) {
        const T = this.T;
        const R = this.radius;
        if (R < 2) return;

        // 雨滴强制走 Canvas 路径:GPU 那条路是给"主角级"鼠标涟漪的,几十上百个雨环挤上去
        // 会把它的容量吃光(而且 GPU 分支不支持低配剖面)。见 createRainRipples()。
        if (this.useGpu !== false && this.config.useGpuRipples && typeof WaterGL !== 'undefined' && WaterGL.init()) {
            const a0 = this.intensity();
            if (a0 < 0.035) return;
            const crest = WaterGL.rippleCanvas(this, 0);
            if (crest) {
                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                ctx.globalAlpha = T.crestAlpha;
                ctx.drawImage(crest.canvas, crest.x, crest.y, crest.size, crest.size);
                ctx.restore();
            }
            const trough = T.troughAlpha > 0 ? WaterGL.rippleCanvas(this, 1) : null;
            if (trough) {
                ctx.save();
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = T.troughAlpha;
                ctx.drawImage(trough.canvas, trough.x, trough.y, trough.size, trough.size);
                ctx.restore();
            }
            return;
        }
        const lam = R * T.lamRatio;               // ★ λ ∝ 半径:细环比例在任何大小都成立
        const hwRidge = lam * T.ridgeFrac;        // 亮脊半宽(剖面是 Hann → FWHM = 半宽)
        const hwFlank = lam * T.flankFrac;        // 暗带半宽(同上)
        const a = this.intensity();
        if (a < 0.035) return;

        rippleGeomCheck();
        const ridges = [], flanks = [];
        let rmin = Infinity, rmax = 0;
        for (let k = 0; k < T.crests; k++) {
            const rc = R - k * lam;
            if (rc < 3) break;
            const damp = 1 / (1 + k * 0.45);
            const ar = T.ridgeAmp * damp, af = T.flankAmp * damp;
            ridges.push([rc, hwRidge, ar]);
            rmin = Math.min(rmin, rc - hwRidge); rmax = Math.max(rmax, rc + hwRidge);
            for (let s = -1; s <= 1; s += 2) {        // ★ 两侧都要有暗带(原来只有内侧)
                const rt = rc + s * lam * T.flankOffset;
                if (rt > 3) {
                    flanks.push([rt, hwFlank, af]);
                    rmin = Math.min(rmin, rt - hwFlank); rmax = Math.max(rmax, rt + hwFlank);
                }
            }
        }
        if (!ridges.length) return;
        const rin = Math.max(0, rmin - 2);
        const rout = rmax + 2;
        const size = Math.ceil(rout * 2) + 4;
        const sc = ensureRippleScratch(size, this.viewport);
        if (!sc) return;
        const g = sc.g, S = sc.c.width, cx = S / 2, cy = S / 2;

        // ---- 第一趟:亮脊(screen 加光) ----
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'source-over';
        g.clearRect(0, 0, S, S);
        rippleProfile(g, S, rin, rout, ridges, T);
        g.globalCompositeOperation = 'source-in';
        g.fillStyle = rippleArcGradient(g, cx, cy, rout, T.crest, T.crestAlpha * a, this.seed, T.arcFloor, T);
        g.fillRect(0, 0, S, S);
        g.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.drawImage(sc.c, 0, 0, S, S, this.x - cx, this.y - cy, S, S);
        ctx.restore();

        // ---- 第二趟:两侧暗带(压暗),同一条包络 ----
        if (flanks.length && T.troughAlpha > 0) {          // 雨滴剖面 troughAlpha=0 → 这一趟整段省掉(省一半成本)
            g.clearRect(0, 0, S, S);
            rippleProfile(g, S, rin, rout, flanks, T);
            g.globalCompositeOperation = 'source-in';
            g.fillStyle = rippleArcGradient(g, cx, cy, rout, T.trough, T.troughAlpha * a, this.seed, T.flankFloor, T);
            g.fillRect(0, 0, S, S);
            g.globalCompositeOperation = 'source-over';
            ctx.drawImage(sc.c, 0, 0, S, S, this.x - cx, this.y - cy, S, S);
        }
    }
}

function rippleArcGradient(g, cx, cy, rout, head, full, seed, floor, profile) {
    const T = profile || THEME.water.ripple;
    const floorA = Math.max(0, Math.min(0.9, floor));
    const env = (d) => {                              // d = 离光夹角(弧度)
        let c = Math.cos(d);
        if (c < 0) c = 0;                             // 暗带和亮线同形状,只是地板不同
        return floorA + (1 - floorA) * Math.pow(c, T.arcPower);
    };
    const a0 = Math.atan2(ly(), lx());
    if (typeof g.createConicGradient === 'function') {
        const N = Math.max(12, T.arcStops | 0);
        const gr = g.createConicGradient(a0, cx, cy);
        for (let i = 0; i <= N; i++) {
            const f = i / N;                          // 绕一整圈的进度
            let e = env(f * Math.PI * 2) * (1 + T.arcJitter * Math.sin(f * Math.PI * 6 + seed));
            if (e < 0) e = 0;
            gr.addColorStop(f, head + Math.min(1, full * e).toFixed(4) + ')');
        }
        return gr;
    }

    const x0 = cx - lx() * rout, y0 = cy - ly() * rout;
    const x1 = cx + lx() * rout, y1 = cy + ly() * rout;
    const gl = g.createLinearGradient(x0, y0, x1, y1);
    gl.addColorStop(0, head + Math.min(1, full * floorA).toFixed(4) + ')');
    gl.addColorStop(0.5, head + Math.min(1, full * floorA).toFixed(4) + ')');
    for (let i = 1; i <= 5; i++) {
        const t = 0.5 + 0.5 * i / 5;
        gl.addColorStop(t, head + Math.min(1, full * env(Math.acos(Math.max(-1, Math.min(1, 2 * t - 1))))).toFixed(4) + ')');
    }
    return gl;
}

const HANN_D = [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1];
const HANN_V = [0, 0.25, 0.75, 1, 0.75, 0.25, 0];
function rippleProfile(g, S, rin, rout, bands, profile) {
    const T = profile || THEME.water.ripple;
    const cx = S / 2, cy = S / 2, span = Math.max(1, rout - rin);
    const stops = [[0, 0]];
    for (let i = 0; i < bands.length; i++) {
        const r = bands[i][0], hw = bands[i][1], amp = bands[i][2] === undefined ? 1 : bands[i][2];
        const o = (v) => (v - rin) / span;
        for (let k = 0; k < HANN_D.length; k++) {
            const v = o(r + HANN_D[k] * hw);
            if (v > 0 && v < 1) stops.push([v, amp * HANN_V[k]]);
        }
    }
    stops.push([1, 0]);
    stops.sort((a, b) => a[0] - b[0]);
    const rg = g.createRadialGradient(cx, cy, rin, cx, cy, rout);
    for (let i = 0; i < stops.length; i++) {
        rg.addColorStop(Math.max(0, Math.min(1, stops[i][0])), 'rgba(255,255,255,' + stops[i][1] + ')');
    }
    g.fillStyle = rg;
    g.beginPath();
    g.arc(cx, cy, rout, 0, Math.PI * 2);
    g.fill();
}

let rippleGeomWarned = false;
function rippleGeomCheck() {
    const T = THEME.water.ripple;
    if (rippleGeomWarned) return;

    const gap = T.flankOffset - T.flankFrac - T.ridgeFrac;
    if (gap > 0.05 || gap < -0.30) {
        rippleGeomWarned = true;
        console.warn('[koi] 涟漪几何:亮脊和暗带之间 ' + (gap > 0 ? '留了 ' + gap.toFixed(2) : '重叠了 ' + (-gap).toFixed(2)) +
                     'λ(flankOffset ' + T.flankOffset + ' − flankFrac ' + T.flankFrac + ' − ridgeFrac ' + T.ridgeFrac +
                     ')—— 交点应当刚好搭上(±0.05λ 内)。');
    }
}

let rippleScratch = null;
function ensureRippleScratch(size, viewport) {
    const max = Math.ceil(Math.max(viewport.width, viewport.height) * 1.7);
    if (size > max) return null;
    if (!rippleScratch) {
        const c = document.createElement('canvas');
        rippleScratch = { c: c, g: c.getContext('2d'), size: 0 };
    }
    if (rippleScratch.c.width < size) {
        rippleScratch.c.width = size;
        rippleScratch.c.height = size;
    }
    return rippleScratch;
}

export function createRipples({ config, viewport }) {
const ripples = [];
function spawnRipple(x, y, power) {
    const T = THEME.water.ripple;
    // ① 总数上限:超了顶掉【最老】的(它本来也最淡、最接近消失)
    while (ripples.length >= T.maxLive) ripples.shift();
    // ② 同处叠加抑制:刚冒出来、强度接近、位置几乎重合的,不重复冒
    for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        if (r.age > T.mergeAge) break;
        const dx = r.x - x, dy = r.y - y;
        if (Math.abs(r.power - power) < T.mergePower &&
            dx * dx + dy * dy < T.mergeDist * T.mergeDist) return;
    }
    ripples.push(new Ripple(x, y, power, undefined, { viewport, config }));   // ★ 这里必须是真的 push:按行替换曾把它改成自调用
}


return { ripples, spawnRipple, update(dt) { for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].update(dt); if (ripples[i].dead) ripples.splice(i, 1); } }, draw(g) { for (let i = ripples.length - 1; i >= 0; i--) ripples[i].draw(g); } };
}

/**
 * 雨滴场(2026-09-26):和鼠标涟漪**同一个 Ripple 类、同一套剖面参数**(profile 由
 * theme.weather.*.rain 派生自 THEME.water.ripple)—— 所以雨点和水面是"同一种水",
 * 不会出现两种圈。区别只有三处:
 *   ① 独立数组 + 独立上限(雨再大也挤不掉鼠标涟漪)
 *   ② 强制 Canvas 路径(不抢 GPU 涟漪容量)
 *   ③ 自己的随机流由调用方给(天气用 environment.rng,绝不碰共享 Math.random)
 * 绘制层由调用方决定:天气投稿在 weather 层(鼠标涟漪之上还是之下由层表说了算)。
 */
export function createRainRipples({ viewport, config, profile }) {
    const P = profile || THEME.water.ripple;
    const list = [];
    const cap = P.maxLive || 140;
    return {
        get count() { return list.length; },
        get cap() { return cap; },
        spawn(x, y, power) {
            while (list.length >= cap) list.shift();      // 超了顶掉最老的(它最淡)
            const r = new Ripple(x, y, power, P, { viewport, config });
            r.useGpu = false;                             // 雨滴不走 GPU 路径
            list.push(r);
        },
        update(dt) {
            for (let i = list.length - 1; i >= 0; i--) { list[i].update(dt); if (list[i].dead) list.splice(i, 1); }
        },
        draw(g) { for (let i = list.length - 1; i >= 0; i--) list[i].draw(g); },
        clear() { list.length = 0; }
    };
}
