/* 乌龟(2026-10-03):第一种非鱼生物 —— 验证"生物 kind"这条扩展线的正确样板。
 *
 * 挂在 kois 列表里( creatures 层、按 depth 排序),有 circle 碰撞描述符 ——
 * 鱼会把它当成一坨慢吞吞的大石头绕着走/被它挤开(collisions.js 的
 * circle↔capsule / circle↔circle 路径现成,一行没改)。
 *
 * 行为:慢悠悠巡游 —— 转向偏置(锦鲤独游那套的极简版)+ 离边 90px 柔和转回
 * (乌龟笨,不用反射);速度只有鱼的 1/8。不追食、不躲鼠标 —— 它是池塘里
 * 最有资历的住户,什么都不怕。
 *
 * 实例契约(creature-registry 校验):update / draw / depth / translate。
 */
export function createTurtleCreature({ viewport }) {

class Turtle {
    constructor(type, opts = {}) {
        this.type = type;
        this.origin = opts.origin || 'spawned';
        this.x = viewport.width * (0.3 + Math.random() * 0.4);
        this.y = viewport.height * (0.3 + Math.random() * 0.4);
        this.heading = Math.random() * Math.PI * 2;
        this.angle = this.heading;
        this.speed = 0.13 + Math.random() * 0.06;             // px/frame@60 ≈ 8~11 px/s,慢但"在爬"
        this.depth = 0.42 + Math.random() * 0.18;
        this.sizeMul = 1.4 + Math.random() * 0.5;
        /* mass = 碰撞体量(远大于鱼的 sizeMul):鱼被推开,乌龟几乎不动 ——
         * 没有它,80 条鱼每帧从四面推它,位置抖成抽搐 */
        this.collision = { shape: 'circle', r: 22, mass: 16 };
        this.turnBias = 0;
        this.turnBiasTarget = 0;
        this.turnBiasTimer = 2 + Math.random() * 3;
        this.paddle = Math.random() * Math.PI * 2;            // 划水相位
    }

    update(dt) {
        const dtMult = dt * 60;
        // 有记忆的巡游偏向(幅度只有锦鲤的 1/5 —— 乌龟不赶时间)
        this.turnBiasTimer -= dt;
        if (this.turnBiasTimer <= 0) {
            this.turnBiasTarget = (Math.random() - 0.5) * 0.24;
            this.turnBiasTimer = 4 + Math.random() * 5;
        }
        this.turnBias += (this.turnBiasTarget - this.turnBias) * Math.min(1, dt / 2);
        this.heading += this.turnBias * dt;

        // 离边 90px 柔和转回池心(缓转,不反射 —— 反射是鱼的敏捷,不是龟的)
        const m = 90, cx = viewport.width / 2, cy = viewport.height / 2;
        if (this.x < m || this.x > viewport.width - m || this.y < m || this.y > viewport.height - m) {
            const want = Math.atan2(cy - this.y, cx - this.x);
            this.heading += Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading)) * Math.min(1, dt * 1.4);
        }

        const surge = 0.86 + 0.14 * Math.sin(this.paddle * 0.5);
        this.x += Math.cos(this.heading) * this.speed * surge * dtMult;
        this.y += Math.sin(this.heading) * this.speed * surge * dtMult;
        this.x = Math.max(40, Math.min(viewport.width - 40, this.x));
        this.y = Math.max(40, Math.min(viewport.height - 40, this.y));
        this.paddle += dt * 1.1;                              // 趴行节奏(原来是急促的 1.7)
        this.angle = this.heading;
    }

    translate(dx, dy) { this.x += dx; this.y += dy; }

    draw(g) {
        const L = 46 * this.sizeMul;                          // 壳长
        const W = L * 0.72;
        g.save();
        g.translate(this.x, this.y);
        g.rotate(this.heading);

        /* 影子:和鱼同一套光感(右下偏移),浅浅一片 */
        g.fillStyle = 'rgba(10,30,28,0.16)';
        g.beginPath();
        g.ellipse(4, 6, L * 0.52, W * 0.52, 0, 0, Math.PI * 2);
        g.fill();

        /* 四条腿(画在壳底下):前划后蹬,两两反相 */
        const paddle = Math.sin(this.paddle);
        g.fillStyle = '#5e7050';
        for (const sgn of [-1, 1]) {
            for (const [front, ph] of [[1, paddle], [-1, -paddle * 0.7]]) {
                g.save();
                g.translate(front * L * 0.30, sgn * W * 0.44);
                g.rotate(sgn * (0.7 + ph * 0.35));
                g.beginPath();
                g.ellipse(front * L * 0.10, 0, L * 0.15, L * 0.055, 0, 0, Math.PI * 2);
                g.fill();
                g.restore();
            }
        }

        /* 尾 */
        g.beginPath();
        g.moveTo(-L * 0.42, 0);
        g.lineTo(-L * 0.56, W * 0.08);
        g.lineTo(-L * 0.56, -W * 0.08);
        g.closePath();
        g.fill();

        /* 壳:橄榄绿 + 中央亮、边缘暗的径向渐变 */
        const shell = g.createRadialGradient(-L * 0.08, -W * 0.08, L * 0.05, 0, 0, L * 0.5);
        shell.addColorStop(0, '#5b7442');
        shell.addColorStop(0.7, '#48603a');
        shell.addColorStop(1, '#38502c');
        g.fillStyle = shell;
        g.beginPath();
        g.ellipse(0, 0, L * 0.48, W * 0.48, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#2c4022';
        g.lineWidth = 1.4;
        g.stroke();
        /* 内圈缘盾 */
        g.strokeStyle = 'rgba(28,44,22,0.55)';
        g.lineWidth = 1;
        g.beginPath();
        g.ellipse(0, 0, L * 0.40, W * 0.38, 0, 0, Math.PI * 2);
        g.stroke();

        /* 中央三块椎盾 + 两侧肋盾(几何感的六边形,别太密) */
        g.fillStyle = 'rgba(44,64,34,0.85)';
        g.strokeStyle = 'rgba(120,150,95,0.5)';
        for (const [sx, r] of [[-0.22, 0.10], [0, 0.115], [0.22, 0.10]]) {
            g.beginPath();
            for (let k = 0; k < 6; k++) {
                const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
                const px = sx * L + Math.cos(a) * L * r, py = Math.sin(a) * L * r * 0.9;
                if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
            }
            g.closePath();
            g.fill();
            g.stroke();
        }

        /* 头 + 眼 */
        g.fillStyle = '#6b7d52';
        g.beginPath();
        g.ellipse(L * 0.50, 0, L * 0.13, L * 0.10, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#1d2416';
        g.beginPath();
        g.arc(L * 0.53, -W * 0.075, 1.6, 0, Math.PI * 2);
        g.arc(L * 0.53, W * 0.075, 1.6, 0, Math.PI * 2);
        g.fill();

        g.restore();
    }
}

    return { create: (type, opts) => new Turtle(type, opts), Turtle };
}
