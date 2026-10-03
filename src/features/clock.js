import { THEME } from '../shared/legacy-assets.js';
/* ★ 光向【每帧现读】,不再在加载时解构。
 *   原来是 `const [lx(), ly()] = THEME.light.dir` —— 加载时固化,
 *   之后运行时光向转了也【完全不动】(影子/涟漪/时钟偏移全都不跟),典型的"改了没反应"。
 *   这是"光随时间走"(experiments/day-phase)的前提。
 *   ⚠️ THEME.light.dir 必须保持【单位向量】:多处拿它做投影与偏移量。 */
const lx = () => THEME.light.dir[0];
const ly = () => THEME.light.dir[1];

export function createClock({ viewport }) {
let clockTime = '', clockDate = '', clockStamp = '';
function refreshClockText() {
    const d = new Date();
    const stamp = d.getFullYear() + '/' + d.getMonth() + '/' + d.getDate() + ' ' + d.getHours() + ':' + d.getMinutes();
    if (stamp === clockStamp) return;          // 一分钟才重算一次,别每帧都格式化
    clockStamp = stamp;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    clockTime = hh + ':' + mm;
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    clockDate = (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + weekdays[d.getDay()];
}

function drawClock(g) {
    const T = THEME.clock;
    if (!T.show) return;
    refreshClockText();
    const short = Math.min(viewport.width, viewport.height);
    const tSize = short * T.timeSize;
    const dSize = tSize * T.dateSize;
    const gap = tSize * T.gap;
    // anchor 的写法是【纵向-横向】(top-center = 靠上 + 居中)
    const [vert, horiz] = T.anchor.split('-');
    const mx = viewport.width * T.marginX, my = viewport.height * T.marginY;

    g.save();
    g.textBaseline = 'middle';
    g.textAlign = horiz === 'left' ? 'left' : (horiz === 'right' ? 'right' : 'center');
    const cx = horiz === 'left' ? mx : (horiz === 'right' ? viewport.width - mx : viewport.width / 2);

    // 时间在上、日期在下;整块的高度用来做垂直锚点
    const blockH = tSize + gap + dSize;
    const top = vert === 'top' ? my : viewport.height - my - blockH;
    const timeY = top + tSize / 2;
    const dateY = top + tSize + gap + dSize / 2;

    // 影子沿全局光向偏移 + 模糊 —— 和鱼的影子同一套光,才会像"在这个场景里"
    const off = short * T.shadowOffset;
    g.shadowColor = T.shadow + T.shadowAlpha + ')';
    g.shadowBlur = short * T.shadowBlur;
    g.shadowOffsetX = -lx() * off;      // 光从左上来 → 影子往右下
    g.shadowOffsetY = -ly() * off;

    const rf = short * 0.0022;
    g.save();
    g.shadowColor = 'transparent';
    g.fillStyle = 'rgba(150,220,215,0.20)';
    g.font = '600 ' + Math.round(tSize) + 'px ' + T.font;
    g.fillText(clockTime, cx - lx() * rf, timeY - ly() * rf);
    g.font = '400 ' + Math.round(dSize) + 'px ' + T.font;
    g.fillText(clockDate, cx - lx() * rf, dateY - ly() * rf);
    g.restore();

    g.fillStyle = T.color;
    g.font = '600 ' + Math.round(tSize) + 'px ' + T.font;
    g.fillText(clockTime, cx, timeY);
    g.font = '400 ' + Math.round(dSize) + 'px ' + T.font;
    g.fillText(clockDate, cx, dateY);
    g.restore();
}

return { draw: drawClock };
}
