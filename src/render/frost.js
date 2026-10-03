import { mulberry32 } from '../shared/math.js';

/**
 * 霜冻边框(2026-10-03):下雪天屏幕四周结一圈冰霜,像呵在玻璃上的哈气结了晶。
 *
 * 做法:把霜**一次性烘焙**到视口大小的离屏画布 ——
 *   ① 四边冰白渐变打底(上边最厚、左右次之、下边最薄:水汽受重力往下淌,顶缘最先结晶);
 *   ② 沿周长撒"晶斑":入深按指数分布(靠边密、往内指数稀),带模糊,是霜的"雾面";
 *   ③ 少量清晰的六向小枝晶,只落在很靠边的位置,是霜的"晶感";
 *   ④ 最外缘一道更亮的窄高光,读出"冰缘"。
 * 固定种子 ⇒ 纹理逐次运行一致。运行时每帧只有【一张 drawImage + globalAlpha】,
 * 霜量由天气玩法驱动(雪档 5s 长满、离开慢慢退),外加 ±4% 的缓慢呼吸。
 * Node 测试环境没有 document,draw() 直接返回(不画)。
 */
export function createFrost({ viewport, frost = {} }) {
    const seed = frost.seed ?? 0x5EED;
    const edgeAlpha = frost.edgeAlpha ?? 0.42;
    const insetTop = frost.insetTop ?? 0.17;      // 相对短边:霜往里长多深(上缘)
    const insetSide = frost.insetSide ?? 0.13;    // 左右与下缘
    const blobCount = frost.blobCount ?? 220;
    const crystalCount = frost.crystalCount ?? 70;
    const tint = frost.tint || '225,242,248';     // 冰白偏青

    let tex = null, texW = 0, texH = 0;

    function edgePoint(R, w, h) {
        // 沿周长均匀取一点,返回坐标与"向内"法线
        const perim = 2 * (w + h);
        let t = R() * perim;
        if (t < w) return { x: t, y: 0, nx: 0, ny: 1, side: 'h' };
        if ((t -= w) < h) return { x: w, y: t, nx: -1, ny: 0, side: 'v' };
        if ((t -= h) < w) return { x: w - t, y: h, nx: 0, ny: -1, side: 'h' };
        t -= w;
        return { x: 0, y: h - t, nx: 1, ny: 0, side: 'v' };
    }

    function build() {
        const w = Math.max(2, viewport.width | 0), h = Math.max(2, viewport.height | 0);
        const short = Math.min(w, h);
        const top = short * insetTop, bottom = short * insetTop * 0.62, side = short * insetSide;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        const R = mulberry32(seed);

        /* ① 四边冰白底 */
        const band = (gx0, gy0, gx1, gy1, rect, a0) => {
            const gr = g.createLinearGradient(gx0, gy0, gx1, gy1);
            gr.addColorStop(0, 'rgba(' + tint + ',' + a0 + ')');
            gr.addColorStop(0.5, 'rgba(' + tint + ',' + (a0 * 0.45).toFixed(3) + ')');
            gr.addColorStop(1, 'rgba(' + tint + ',0)');
            g.fillStyle = gr;
            g.fillRect(rect[0], rect[1], rect[2], rect[3]);
        };
        band(0, 0, 0, top, [0, 0, w, top], edgeAlpha);
        band(0, h, 0, h - bottom, [0, h - bottom, w, bottom], edgeAlpha * 0.8);
        band(0, 0, side, 0, [0, 0, side, h], edgeAlpha * 0.9);
        band(w, 0, w - side, 0, [w - side, 0, side, h], edgeAlpha * 0.9);

        /* ② 晶斑(雾面,带模糊,入深指数衰减) */
        g.filter = 'blur(' + Math.max(2, short * 0.006).toFixed(1) + 'px)';
        g.fillStyle = 'rgba(' + tint + ',1)';
        for (let i = 0; i < blobCount; i++) {
            const p = edgePoint(R, w, h);
            const inset = p.side === 'h' ? top : side;
            const depth = Math.min(1, -Math.log(1 - R() * 0.999) / 3.2);   // 指数向内
            const r = 1.5 + R() * short * 0.018;
            g.globalAlpha = 0.05 + R() * 0.16;
            g.beginPath();
            g.arc(p.x + p.nx * depth * inset, p.y + p.ny * depth * inset, r, 0, Math.PI * 2);
            g.fill();
        }

        /* ③ 六向小枝晶(清晰,只贴边) + ④ 冰缘高光 */
        g.filter = 'none';
        g.strokeStyle = 'rgba(255,255,255,0.9)';
        g.lineWidth = 1;
        for (let i = 0; i < crystalCount; i++) {
            const p = edgePoint(R, w, h);
            const inset = p.side === 'h' ? top : side;
            const depth = R() * 0.4;
            const x = p.x + p.nx * depth * inset, y = p.y + p.ny * depth * inset;
            const r = short * (0.006 + R() * 0.012);
            const rot = R() * Math.PI;
            g.globalAlpha = 0.10 + R() * 0.20;
            g.beginPath();
            for (let k = 0; k < 3; k++) {
                const an = rot + k * Math.PI / 3;
                g.moveTo(x - Math.cos(an) * r, y - Math.sin(an) * r);
                g.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r);
            }
            g.stroke();
        }
        g.globalAlpha = 1;
        const hi = Math.max(2, short * 0.012);
        band(0, 0, 0, hi, [0, 0, w, hi], edgeAlpha * 0.9);
        band(0, h, 0, h - hi, [0, h - hi, w, hi], edgeAlpha * 0.7);
        band(0, 0, hi, 0, [0, 0, hi, h], edgeAlpha * 0.8);
        band(w, 0, w - hi, 0, [w - hi, 0, hi, h], edgeAlpha * 0.8);

        tex = c; texW = w; texH = h;
    }

    function draw(g, amount, time) {
        if (typeof document === 'undefined') return;          // 单测环境
        if (!tex || texW !== viewport.width || texH !== viewport.height) build();
        if (!tex) return;
        const breathe = 1 + 0.04 * Math.sin((time ? time.elapsed : 0) * 0.35);
        g.save();
        g.globalAlpha = Math.max(0, Math.min(1, amount * breathe));
        g.drawImage(tex, 0, 0);
        g.restore();
    }

    return {
        draw,
        dispose() { tex = null; },
        inspect: () => ({ built: !!tex, w: texW, h: texH })
    };
}
