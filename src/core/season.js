/* 季节(2026-10-03):跟着系统日期走的"常新感"。
 *
 * 四季各有一个中心日(春 4/15、夏 7/15、秋 10/15、冬 1/15),权重随"距中心日的
 * 环形天数"线性衰减(60 天到 0)再归一 —— 月份边界不跳变,节令自然过渡。
 * 纯函数、无 DOM;消费方自己决定多久重算一次(参数一天才变一点点,每分钟足矣):
 *   - idle-drift:落叶/花瓣频率(春花秋叶,冬天几乎静)
 *   - night-sky:萤火虫活跃度(夏夜最盛,冬夜几乎无)
 * 参数表 SEASON_PARAMS 是唯一真源(倍率,1 = theme.js 里的基准节奏)。
 */

export const SEASON_PARAMS = Object.freeze({
    spring: { leaf: 0.55, petal: 2.0, firefly: 1.0 },
    summer: { leaf: 0.70, petal: 0.70, firefly: 1.30 },
    autumn: { leaf: 2.20, petal: 0.35, firefly: 0.85 },
    winter: { leaf: 0.30, petal: 0.15, firefly: 0.30 }
});

const SEASONS = Object.keys(SEASON_PARAMS);
const CENTERS = { spring: 105, summer: 196, autumn: 288, winter: 15 };   // day-of-year(1/1 = 1)
const FALLOFF = 60;                                                      // 距中心 60 天衰减到 0

/** 四季权重(和为 1)。跨年的冬天(12 月 ↔ 1 月)走环形距离。 */
export function seasonWeights(date = new Date()) {
    const start = Date.UTC(date.getFullYear(), 0, 0);
    const doy = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86400000);
    const raw = {};
    let sum = 0;
    for (const k of SEASONS) {
        let d = Math.abs(doy - CENTERS[k]);
        if (d > 365 - d) d = 365 - d;
        const w = Math.max(0, 1 - d / FALLOFF);
        raw[k] = w;
        sum += w;
    }
    if (sum <= 0) {                                                   // 理论死角:两个中心正中间
        for (const k of SEASONS) raw[k] = 1 / SEASONS.length;
        return raw;
    }
    for (const k of SEASONS) raw[k] /= sum;
    return raw;
}

/** 按权重混合各季参数;返回值多带一个 weights 供诊断/单测。 */
export function seasonBlend(date = new Date()) {
    const w = seasonWeights(date);
    const out = { leaf: 0, petal: 0, firefly: 0, weights: w };
    for (const k of SEASONS) {
        out.leaf += (w[k] || 0) * SEASON_PARAMS[k].leaf;
        out.petal += (w[k] || 0) * SEASON_PARAMS[k].petal;
        out.firefly += (w[k] || 0) * SEASON_PARAMS[k].firefly;
    }
    return out;
}

/** 每分钟才重算一次的缓存版(消费方直接调用;参数一天才变一点点) */
export function seasonCached() {
    let cache = null, at = 0;
    return function () {
        const now = Date.now();
        if (!cache || now - at > 60000) { cache = seasonBlend(); at = now; }
        return cache;
    };
}
