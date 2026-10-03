import { KOI_SHAPE } from '../shared/legacy-assets.js';
export function noseColorOf(img) {
    try {
        const c = document.createElement('canvas');
        c.width = 6; c.height = 24;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0, 6, img.naturalHeight, 0, 0, 6, 24);
        const d = x.getImageData(0, 0, 6, 24).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 40) continue;
            r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        }
        if (!n) return '#ffffff';
        return 'rgb(' + Math.round(r / n) + ',' + Math.round(g / n) + ',' + Math.round(b / n) + ')';
    } catch (e) { return '#ffffff'; }
}

/* 平滑法线的工作缓冲(2026-10-03 提到模块级复用)。
 * 原来每条鱼每帧在 buildSmoothNormals 里新建 6 个 Float64Array(201) + 一个闭包,
 * 80 条鱼 ≈ 每帧 770KB 临时对象,纯 GC 债(壁纸常驻,GC 抖动会被看见)。
 * 用法是同步的:一次 drawSkinOnBody 内建一次、用完即走,单线程下复用安全。
 * 超过容量的 N 会自动回退为现场分配(保险丝,正常调用 N=200)。 */
const NRM_CAP = 201;
const nrmPX = new Float64Array(NRM_CAP), nrmPY = new Float64Array(NRM_CAP);
const nrmSX = new Float64Array(NRM_CAP), nrmSY = new Float64Array(NRM_CAP);
const nrmNX = new Float64Array(NRM_CAP), nrmNY = new Float64Array(NRM_CAP);

export function buildSmoothNormals(at, N, win) {
    const shared = N + 1 <= NRM_CAP;
    const px = shared ? nrmPX : new Float64Array(N + 1);
    const py = shared ? nrmPY : new Float64Array(N + 1);
    const sx = shared ? nrmSX : new Float64Array(N + 1);
    const sy = shared ? nrmSY : new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) { const p = at(i / N); px[i] = p.x; py[i] = p.y; }
    for (let i = 0; i <= N; i++) {
        let ax = 0, ay = 0, c = 0;
        for (let k = -win; k <= win; k++) {
            const j = i + k < 0 ? 0 : (i + k > N ? N : i + k);
            ax += px[j]; ay += py[j]; c++;
        }
        sx[i] = ax / c; sy[i] = ay / c;
    }
    const nx = shared ? nrmNX : new Float64Array(N + 1);
    const ny = shared ? nrmNY : new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) {
        const a = i - 2 < 0 ? 0 : i - 2, b = i + 2 > N ? N : i + 2;
        const dx = sx[b] - sx[a], dy = sy[b] - sy[a];
        const m = Math.hypot(dx, dy) || 1;
        nx[i] = -dy / m; ny[i] = dx / m;
    }
    return function (u) {                       // u ∈ [0,1] 沿脊柱
        const f = u <= 0 ? 0 : (u >= 1 ? N : u * N);
        const i = Math.floor(f), t = f - i, j = i + 1 > N ? N : i + 1;
        return { nx: nx[i] + (nx[j] - nx[i]) * t, ny: ny[i] + (ny[j] - ny[i]) * t };
    };
}

export function drawSkinOnBody(ctx, at, BS, W, maxHalf, img, nose, noseW, capDepth) {
    const TW = img.naturalWidth, TH = img.naturalHeight;

    const K = 40;

    const OVER_MIN_PX = 1.4, OVER_MAX_T = 8;
    // 法线走平滑版本(见 buildSmoothNormals 的注释:不平滑就是一道道横带)
    const nrm = buildSmoothNormals(at, 200, 6);

    if (nose) {
        const XCAP = Math.min(TW, 14), NC = 4;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(nose.x - nose.nx * noseW, nose.y - nose.ny * noseW);
        for (let j = 1; j <= 5; j++) {
            const a = -Math.PI / 2 + Math.PI * (j / 6);
            ctx.lineTo(nose.x + nose.nx * Math.sin(a) * noseW - nose.tx * Math.cos(a) * capDepth,
                       nose.y + nose.ny * Math.sin(a) * noseW - nose.ty * Math.cos(a) * capDepth);
        }
        ctx.closePath();
        ctx.clip();
        for (let i2 = 0; i2 < NC; i2++) {
            const r0 = i2 / NC, r1 = (i2 + 1) / NC;      // 0=鼻尖, 1=与身体相接处
            const x0 = XCAP * r0, x1 = XCAP * r1;
            // 进深系数:鼻尖 1、底部 0
            const f0 = 1 - r0, f1 = 1 - r1;
            const Ax = nose.x - nose.nx * noseW - nose.tx * f0 * capDepth, Ay = nose.y - nose.ny * noseW - nose.ty * f0 * capDepth;
            const Bx = nose.x - nose.nx * noseW - nose.tx * f1 * capDepth, By = nose.y - nose.ny * noseW - nose.ty * f1 * capDepth;
            const Cx = nose.x + nose.nx * noseW - nose.tx * f0 * capDepth, Cy = nose.y + nose.ny * noseW - nose.ty * f0 * capDepth;
            const yA = 0, yC = TH;
            const ax = (Bx - Ax) / (x1 - x0), ay = (By - Ay) / (x1 - x0);
            const bx = (Cx - Ax) / (yC - yA), by = (Cy - Ay) / (yC - yA);
            const ox = Ax - ax * x0 - bx * yA, oy = Ay - ay * x0 - by * yA;
            ctx.save();
            ctx.transform(ax, ay, bx, by, ox, oy);
            ctx.drawImage(img, x0, 0, x1 - x0, TH, x0, 0, x1 - x0, TH);
            ctx.restore();
        }
        ctx.restore();
    }
    for (let i = 0; i < K; i++) {
        const u0 = i / K, u1 = (i + 1) / K;
        const bw0 = KOI_SHAPE.bwAtU(u0), bw1 = KOI_SHAPE.bwAtU(u1);
        const p0 = at(bw0 * BS), p1 = at(bw1 * BS);
        const n0 = nrm(bw0 * BS), n1 = nrm(bw1 * BS);
        const w0 = W(bw0) * maxHalf, w1 = W(bw1) * maxHalf;

        let mnx = n0.nx + n1.nx, mny = n0.ny + n1.ny;
        const mn = Math.hypot(mnx, mny) || 1;
        mnx /= mn; mny /= mn;
        const wm = w0 > w1 ? w0 : w1;
        const Ax = p0.x - mnx * wm, Ay = p0.y - mny * wm;   // (u0, v=+1) ← 纹理 y=0
        const Bx = p1.x - mnx * wm, By = p1.y - mny * wm;   // (u1, v=+1)
        const Cx = p0.x + mnx * wm, Cy = p0.y + mny * wm;   // (u0, v=-1) ← 纹理 y=TH
        const xA = u0 * TW, xB = u1 * TW, yA = 0, yC = TH;
        const ax = (Bx - Ax) / (xB - xA), ay = (By - Ay) / (xB - xA);
        const bx = (Cx - Ax) / (yC - yA), by = (Cy - Ay) / (yC - yA);
        const ox = Ax - ax * xA - bx * yA, oy = Ay - ay * xA - by * yA;
        ctx.save();
        ctx.transform(ax, ay, bx, by, ox, oy);
        const ov = Math.min(OVER_MAX_T, OVER_MIN_PX / Math.max(0.05, Math.abs(ax)));
        const sx0 = Math.max(0, xA - ov), sx1 = Math.min(TW, xB + ov);
        if (sx1 > sx0) ctx.drawImage(img, sx0, 0, sx1 - sx0, TH, sx0, 0, sx1 - sx0, TH);
        ctx.restore();
    }
}
