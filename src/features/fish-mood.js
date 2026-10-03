import { THEME } from '../shared/legacy-assets.js';

/**
 * 天气"心情"(2026-10-03):让鱼知道外面是什么天。
 *
 *   晴 — 偏上游、慢悠悠地"晒背";雨 — 更欢快(+12%);大雨 — 最欢(+20%),略避表层;
 *   雪 — 慢半拍(×0.85),整池沉到偏下的深度带避寒。
 *
 * 实现:每帧把 mood 参数写到每条鱼身上(fish.moodSpeedMul / moodBandY / moodBandPull),
 * 消费点在 pond/behavior.js(游速 × mood、垂直带弱转向)。参数真源在 theme.js
 * 各天气预设的 mood 键,按 environment.index 在相邻预设间插值 —— 天色怎么过渡,
 * 心情就怎么过渡,不会跳变。领头鱼的速度经 schoolSystem.setMoodSpeed 调制。
 *
 * 这是个纯"观感"玩法:关掉它(setFeature('fishMood', false))鱼就回到无心情状态
 * (moodSpeedMul 残留最后一次的值,但不再更新 —— 下一档天气也不生效)。
 */
export function createFishMood({ kois, environment, schoolSystem, viewport }) {
    const W = THEME.weather || {};
    const order = W.order || ['clear'];
    const presets = order.map(n => (W[n] && W[n].mood) || { speed: 1, band: 0.5, pull: 0.25 });
    let cur = { speed: 1, band: 0.5, pull: 0.25 };

    /** 按 environment.index 在相邻预设间插值(与 environment.lerped 同一口径) */
    function targetMood() {
        const i = Math.max(0, Math.min(presets.length - 1, environment.index || 0));
        const i0 = Math.floor(i), i1 = Math.min(presets.length - 1, i0 + 1), f = i - i0;
        const a = presets[i0], b = presets[i1];
        return {
            speed: a.speed + (b.speed - a.speed) * f,
            band: a.band + (b.band - a.band) * f,
            pull: a.pull + (b.pull - a.pull) * f
        };
    }

    return {
        update(dt) {
            const t = targetMood();
            const k = Math.min(1, dt / 2.5);           // 心情比天色(3.5s)稍快一点到位
            cur.speed += (t.speed - cur.speed) * k;
            cur.band += (t.band - cur.band) * k;
            cur.pull += (t.pull - cur.pull) * k;

            const bandY = viewport.height * cur.band;
            for (let i = 0; i < kois.length; i++) {
                const f = kois[i];
                f.moodSpeedMul = cur.speed;
                f.moodBandY = bandY;
                f.moodBandPull = cur.pull;
            }
            if (schoolSystem && schoolSystem.setMoodSpeed) schoolSystem.setMoodSpeed(cur.speed);
        },
        inspect: () => ({ ...cur, bandY: viewport.height * cur.band })
    };
}
