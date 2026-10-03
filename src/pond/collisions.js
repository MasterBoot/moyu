
// 碰撞 —— 只认实例上的 `collision` 描述符,不再假设对方是 12 节锦鲤(2026-09-26 第二轮)
//   胶囊(脊柱一段 + 身体半宽):鱼这类长条身体
//   圆:乌龟/螺/漂浮物这类小生物或道具
//   不声明 collision:不参与碰撞(荷花、蜻蜓这种不该被推开的)
// 锦鲤之间的计算与第一轮**逐行一致**(同一套 segSegDist + 8 轮松弛 + 按体量分摊)。
import { capsuleEnds, bodyCenter } from './shape.js';

/** 两线段最近距离与法线(纯几何,不依赖工厂闭包;导出供单测) */
export function segSegDist(ax, ay, bx, by, cx, cy, dx, dy) {
    const ux = bx - ax, uy = by - ay;
    const vx = dx - cx, vy = dy - cy;
    const wx = ax - cx, wy = ay - cy;
    const a = ux * ux + uy * uy, b = ux * vx + uy * vy, c = vx * vx + vy * vy;
    const d = ux * wx + uy * wy, e = vx * wx + vy * wy;
    const D = a * c - b * b;
    let sc, tc;
    if (D < 1e-9) { sc = 0; tc = c > 1e-9 ? e / c : 0; }
    else { sc = (b * e - c * d) / D; tc = (a * e - b * d) / D; }
    sc = Math.max(0, Math.min(1, sc));
    tc = Math.max(0, Math.min(1, tc));
    tc = c > 1e-9 ? Math.max(0, Math.min(1, (b * sc + e) / c)) : 0;
    sc = a > 1e-9 ? Math.max(0, Math.min(1, (b * tc - d) / a)) : 0;
    const px = ax + ux * sc, py = ay + uy * sc;
    const qx = cx + vx * tc, qy = cy + vy * tc;
    return { d: Math.hypot(px - qx, py - qy), nx: px - qx, ny: py - qy };
}

/** 点到线段的最近距离(圆 ↔ 胶囊用) */
function pointSegDist(px, py, ax, ay, bx, by) {
    const ux = bx - ax, uy = by - ay;
    const L = ux * ux + uy * uy;
    let t = L > 1e-9 ? ((px - ax) * ux + (py - ay) * uy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + ux * t, qy = ay + uy * t;
    return { d: Math.hypot(px - qx, py - qy), nx: px - qx, ny: py - qy };
}

export function createCollisions({ kois, config }) {
const COLLIDE_RELAX = 14;      // 收敛速率(1/s)

/**
 * 一对生物的最近距离与法线;任一形状不支持就返回 null。
 * 法线约定:nx/ny 指向 A(与第一轮一致 —— 由 px-qx 得出)。
 */
function contact(A, B) {
    const ca = A.collision, cb = B.collision;
    if (!ca || !cb) return null;
    const ea = capsuleEnds(A), eb = capsuleEnds(B);
    if (ca.shape === 'capsule' && cb.shape === 'capsule') {
        if (!ea || !eb) return null;
        return segSegDist(...ea, ...eb);
    }
    if (ca.shape === 'capsule' && cb.shape === 'circle') {
        if (!ea) return null;
        return pointSegDist(B.x, B.y, ...ea);
    }
    if (ca.shape === 'circle' && cb.shape === 'capsule') {
        if (!eb) return null;
        const r = pointSegDist(A.x, A.y, ...eb);
        return { d: r.d, nx: -r.nx, ny: -r.ny };   // 反过来,法线仍指向 A
    }
    if (ca.shape === 'circle' && cb.shape === 'circle') {
        return { d: Math.hypot(A.x - B.x, A.y - B.y), nx: A.x - B.x, ny: A.y - B.y };
    }
    return null;
}

    /* ---- broad-phase 空间哈希(2026-10-03)----
     * 原来 8 轮松弛每轮都对全池做 O(n²) 两两扫描:设置上限 300 条鱼时
     * 每帧 36 万次距离检查。现在每帧做一次 broad-phase:
     *   · 每条鱼按【中心点】落进一个哈希格(链表用 nextIdx 串,零每帧对象分配)
     *   · 对每条鱼只扫它周围 (reach+最大半径) 覆盖到的格子 → 候选对列表
     *   · 8 轮松弛都在这份候选对上做(reach/contact/体量分摊逐行同旧版)。
     * 代价:本轮被推开、新撞上的"第二环"邻居要等下一帧进列表 —— 16ms 后才
     * 级联到,肉眼不可见;换来复杂度从 O(n²)×8 降到 O(n·k)(k=格内邻居数)。 */
    const grid = new Map();          // key = gx*100000+gy(gx/gy 格坐标;|gy| 远小于 5 万,key 无碰撞)
    let nextIdx = null;              // 格内链表(fish 下标 → 同格的下一个)
    let pairA = null, pairB = null, pairCap = 0;

    function resolveFishCollisions(dt) {
        if (kois.length < 2) return;
        const n = kois.length;

        // 碰撞包围半径(胶囊按"半宽*2 + 半径",同旧版 reach 的量纲),取全池最大
        let maxR = 0;
        for (let i = 0; i < n; i++) {
            const ca = kois[i].collision;
            if (ca) { const R = ca.r + (ca.half || 0) * 2; if (R > maxR) maxR = R; }
        }
        if (!(maxR > 0)) return;
        const cell = Math.max(48, maxR * 2);

        if (!nextIdx || nextIdx.length < n) nextIdx = new Int32Array(n);
        grid.clear();
        for (let i = 0; i < n; i++) {
            const A = kois[i];
            if (!A.collision) continue;
            const key = Math.floor(A.x / cell) * 100000 + Math.floor(A.y / cell);
            const head = grid.get(key);
            nextIdx[i] = (head === undefined) ? -1 : head;
            grid.set(key, i);
        }

        // 候选对(去重靠 j>i;同格链表天然只含一次)
        let pairCount = 0;
        for (let i = 0; i < n; i++) {
            const A = kois[i], ca = A.collision;
            if (!ca) continue;
            const ra = ca.r, halfA = ca.half || 0;
            const lookR = halfA * 2 + ra + maxR;   // 覆盖任何可能重叠的邻居
            const gx0 = Math.floor((A.x - lookR) / cell), gx1 = Math.floor((A.x + lookR) / cell);
            const gy0 = Math.floor((A.y - lookR) / cell), gy1 = Math.floor((A.y + lookR) / cell);
            for (let gx = gx0; gx <= gx1; gx++) {
                for (let gy = gy0; gy <= gy1; gy++) {
                    for (let j = grid.get(gx * 100000 + gy) ?? -1; j !== -1; j = nextIdx[j]) {
                        if (j <= i || !kois[j].collision) continue;
                        const B = kois[j], cb = B.collision;
                        const reach = (halfA + (cb.half || 0)) * 2 + ra + cb.r;
                        const hx = A.x - B.x, hy = A.y - B.y;
                        if (hx * hx + hy * hy > reach * reach) continue;
                        if (pairCount === pairCap) {           // 复用缓冲,不够再翻倍
                            const cap2 = Math.max(256, pairCap * 2);
                            const a2 = new Int32Array(cap2), b2 = new Int32Array(cap2);
                            if (pairCount) { a2.set(pairA); b2.set(pairB); }
                            pairA = a2; pairB = b2; pairCap = cap2;
                        }
                        pairA[pairCount] = i; pairB[pairCount] = j; pairCount++;
                    }
                }
            }
        }
        if (!pairCount) return;

        const relax = Math.min(1, 1 - Math.exp(-COLLIDE_RELAX * dt));
        // 迭代 8 轮:成对松弛会把 A 推给 C,密集处需要多轮级联才收敛
        for (let iter = 0; iter < 8; iter++) {
            for (let p = 0; p < pairCount; p++) {
                const A = kois[pairA[p]], B = kois[pairB[p]];
                const ca = A.collision, cb = B.collision;
                if (!ca || !cb) continue;
                const ra = ca.r;

                const res = contact(A, B);
                if (!res) continue;
                let dMin = res.d, nx, ny;
                if (dMin > 1e-4) {
                    nx = res.nx / dMin; ny = res.ny / dMin;
                } else {
                    // 完全重合:沿双方身体轴线(没有脊柱就用中心点)分开
                    const [ax, ay] = bodyCenter(A);
                    const [bx, by] = bodyCenter(B);
                    let ex = ax - bx, ey = ay - by;
                    let el = Math.hypot(ex, ey);
                    if (el < 1e-4) { ex = -Math.sin(A.heading || 0); ey = Math.cos(A.heading || 0); el = 1; }
                    nx = ex / el; ny = ey / el;
                    dMin = 0;
                }
                const overlap = ra + cb.r - dMin;
                if (overlap <= 0) continue;
                const corr = overlap * relax;
                // 按体量分摊:大鱼少动、小鱼多让
                const mA = A.sizeMul, mB = B.sizeMul, ms = mA + mB;
                const wA = mB / ms, wB = mA / ms;

                A.translate( nx * corr * wA,  ny * corr * wA);
                B.translate(-nx * corr * wB, -ny * corr * wB);
            }
        }
    }

return { resolveFishCollisions };
}
