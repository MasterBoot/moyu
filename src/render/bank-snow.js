import { mulberry32 } from '../shared/math.js';

/**
 * 池边积雪(2026-10-03):下雪时池岸慢慢积起一圈雪,停雪后化得慢。
 *
 * 与霜冻(frost.js,结在"玻璃"上、画在 ui 层)不同:积雪是**落在岸上**的,
 * 画在 floor 层(池底之上、鱼之下)—— 鱼从雪边游过,雪不会盖住鱼。
 *
 * 纹理一次性烘焙(视口大小,resize 重建):
 *   ① 四边白色渐变打底(上缘略厚);
 *   ② 内缘用一圈随机半圆"咬"出起伏 —— 积雪的边不是直线;
 *   ③ 撒雪粒(小点,入深指数衰减)出颗粒感;少量亮斑提体积。
 * 可见度由调用方驱动(积雪 45s 慢慢积、化雪 150s 慢慢退,见 features/weather.js)。
 * 无 DOM(Node 单测)时 draw 直接返回。
 */
export function createBankSnow({ viewport, bankSnow = {} }) {
    const rng = mulberry32(bankSnow.seed ?? 0x51ED);
    const edgeAlpha = bankSnow.edgeAlpha ?? 0.55;
    const insetTop = bankSnow.insetTop ?? 0.16;
    const insetSide = bankSnow.insetSide ?? 0.12;
    const grains = bankSnow.grains ?? 260;

    let tex = null, texW = 0, texH = 0;

    function build() {
        const w = Math.max(2, viewport.width | 0), h = Math.max(2, viewport.height | 0);
        const short = Math.min(w, h);
        const top = short * insetTop, bottom = short * insetTop * 0.7, side = short * insetSide;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        const R = mulberry32(rng());

        /* ① 四边雪底 */
        const band = (gx0, gy0, gx1, gy1, rect, a0) => {
            const gr = g.createLinearGradient(gx0, gy0, gx1, gy1);
            gr.addColorStop(0, 'rgba(255,255,255,' + a0 + ')');
            gr.addColorStop(0.55, 'rgba(250,252,255,' + (a0 * 0.5).toFixed(3) + ')');
            gr.addColorStop(1, 'rgba(250,252,255,0)');
            g.fillStyle = gr;
            g.fillRect(rect[0], rect[1], rect[2], rect[3]);
        };
        band(0, 0, 0, top, [0, 0, w, top], edgeAlpha);
        band(0, h, 0, h - bottom, [0, h - bottom, w, bottom], edgeAlpha * 0.85);
        band(0, 0, side, 0, [0, 0, side, h], edgeAlpha * 0.9);
        band(w, 0, w - side, 0, [w - side, 0, side, h], edgeAlpha * 0.9);

        /* ② 内缘起伏:沿每条边放一串随机大小的半圆"雪堆",往里顶出不规则边界 */
        g.fillStyle = 'rgba(252,253,255,0.5)';
        const lobes = Math.round((w + h) / 90);
        for (let i = 0; i < lobes; i++) {
            let t = R() * (w + h);
            let x, y, depth;
            if (t < w) { x = t; y = 0; depth = top; }
            else if ((t -= w) < h) { x = w; y = t; depth = side; }
            else if ((t -= h) < w) { x = w - t; y = h; depth = bottom; }
            else { t -= w; x = 0; y = h - t; depth = side; }
            const r = short * (0.02 + R() * 0.035);
            g.beginPath();
            g.arc(x, y, r, 0, Math.PI * 2);
            g.fill();
        }

        /* ③ 雪粒 + 亮斑(颗粒感;入深指数衰减,靠边密) */
        for (let i = 0; i < grains; i++) {
            const perim = 2 * (w + h);
            let t = R() * perim, x, y, nx, ny, inset;
            if (t < w) { x = t; y = 0; nx = 0; ny = 1; inset = top; }
            else if ((t -= w) < h) { x = w; y = t; nx = -1; ny = 0; inset = side; }
            else if ((t -= h) < w) { x = w - t; y = h; nx = 0; ny = -1; inset = bottom; }
            else { t -= w; x = 0; y = h - t; nx = 1; ny = 0; inset = side; }
            const depth = Math.min(1, -Math.log(1 - R() * 0.999) / 2.6);
            const bright = R();
            g.globalAlpha = 0.12 + bright * 0.3;
            g.fillStyle = bright > 0.82 ? 'rgba(255,255,255,1)' : 'rgba(244,248,252,1)';
            g.beginPath();
            g.arc(x + nx * depth * inset, y + ny * depth * inset, 0.8 + R() * 1.8, 0, Math.PI * 2);
            g.fill();
        }
        g.globalAlpha = 1;

        tex = c; texW = w; texH = h;
    }

    function draw(g, amount) {
        if (typeof document === 'undefined') return;          // 无 DOM(单测)
        if (!tex || texW !== viewport.width || texH !== viewport.height) build();
        if (!tex) return;
        g.save();
        g.globalAlpha = Math.max(0, Math.min(1, amount));
        g.drawImage(tex, 0, 0);
        g.restore();
    }

    return {
        draw,
        dispose() { tex = null; },
        inspect: () => ({ built: !!tex, w: texW, h: texH })
    };
}
