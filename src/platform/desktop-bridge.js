export function attachDesktopBridge(router) {
    window.__koiGeom = window.__koiGeom || { vx: 0, vy: 0, vw: 0, vh: 0, btn: null };
    let downBefore = false;
    const bridge = (sx, sy, down, feed) => {
        const g = window.__koiGeom, k = g.vw > 0 ? window.innerWidth / g.vw : 1;
        const x = (sx - g.vx) * k, y = (sy - g.vy) * k;
        router.move(x, y);
        if (down && !downBefore && feed !== false) router.activate(x, y);
        downBefore = down;
    };
    const previous = window.__koiMouse;
    window.__koiMouse = bridge;
    const invoke = window.__TAURI__?.core?.invoke;
    if (invoke) invoke('koi_geom').then(raw => {
        const g = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (g?.btn && g.vw) window.__koiGeom = g;
    }).catch(() => {});
    return () => { if (window.__koiMouse === bridge) window.__koiMouse = previous; };
}
