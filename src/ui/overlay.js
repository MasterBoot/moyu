
export function createOverlay({ kois, mouse }) {
function customBtnRectCss() {
    const g = window.__koiGeom;
    if (!g || !g.btn || !g.vw) return null;
    const k = window.innerWidth / g.vw;
    return { x: (g.btn.x - g.vx) * k, y: (g.btn.y - g.vy) * k,
             w: g.btn.w * k, h: g.btn.h * k };
}
function drawRoundRect(g, x, y, w, h, r) {
    g.beginPath();
    if (g.roundRect) { g.roundRect(x, y, w, h, r); return; }
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}

function drawCustomOverlay(g) {
    // ① 鱼名:鼠标靠近才显示。常驻会像水印,而壁纸不该有水印
    if (mouse.active) {
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (let i = 0; i < kois.length; i++) {
            const k = kois[i];
            if (!k.custom || !k.name) continue;
            const hx = k.segments[0].x, hy = k.segments[0].y;
            const d = Math.hypot(mouse.x - hx, mouse.y - hy);
            if (d > 160) continue;
            const a = Math.min(1, (160 - d) / 70);
            g.font = '600 15px system-ui,sans-serif';
            const w = g.measureText(k.name).width + 22;
            const by = hy - 56;
            g.globalAlpha = a * 0.85;
            g.fillStyle = 'rgba(8,20,18,0.62)';
            drawRoundRect(g, hx - w / 2, by, w, 25, 12.5); g.fill();
            g.globalAlpha = a * 0.95;
            g.fillStyle = '#eef7f2';
            g.fillText(k.name, hx, by + 13);
            g.globalAlpha = 1;
        }
    }
    // ② 右上角入口
    const r = customBtnRectCss();
    if (!r || !mouse.active) return;
    const pad = 54;                      // 命中范围比按钮大一圈,不然很难对准角落
    const dx = Math.max(r.x - mouse.x, 0, mouse.x - (r.x + r.w));
    const dy = Math.max(r.y - mouse.y, 0, mouse.y - (r.y + r.h));
    const dist = Math.hypot(dx, dy);
    if (dist > pad) return;              // 离得远就完全不画 —— 壁纸上不该常年挂个按钮
    g.globalAlpha = 0.30 + 0.70 * (1 - dist / pad);
    g.fillStyle = 'rgba(10,26,24,0.66)';
    drawRoundRect(g, r.x, r.y, r.w, r.h, r.h / 2); g.fill();
    g.strokeStyle = 'rgba(210,235,225,0.42)';
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = '#eaf5ef';
    g.font = '600 ' + Math.round(r.h * 0.40) + 'px system-ui,sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('+ Custom Fish', r.x + r.w / 2, r.y + r.h / 2 + 0.5);
    g.globalAlpha = 1;
}

return { draw: drawCustomOverlay };
}
