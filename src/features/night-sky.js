import { THEME } from '../shared/legacy-assets.js';
import { createFireflies } from '../render/fireflies.js';
import { createMeteor } from '../render/meteor.js';
import { nightnessFromDim } from './ambient-audio.js';

/**
 * 夜空(2026-10-03):萤火虫 + 流星 —— 夜里的"画面自己发生的事"。
 *
 * 可见度全部由【夜度】驱动(dayPhase.dim,与夜虫鸣同一来源):
 * dayCycle 开着时,入夜渐显、天亮渐隐;dayCycle 关掉 = 恒白昼,这两样自然不出现。
 * 流星落点起涟漪:俯视视角里流星是水面倒影,"倒影熄灭处起澜"才自洽。
 *
 * setFeature('nightSky', false) 时不是硬切,而是随夜度通道淡出(settleWhileDisabled)。
 */
export function createNightSky({ config, viewport, environment, spawnRipple }) {
    const N = THEME.night || {};
    const flies = createFireflies({ viewport, fireflies: N.fireflies || {} });
    const meteor = createMeteor({
        viewport,
        meteor: N.meteor || {},
        onLand: (x, y) => spawnRipple(x, y, 0.7 * (Number(config.rippleStrength) || 1))
    });
    let on = true;
    let amt = 0;                         // 平滑后的夜度(2s 内跟上)

    return {
        settleWhileDisabled: true,       // 关掉也要把萤火虫淡完,别冻在半空

        update(dt) {
            const target = on ? nightnessFromDim((environment.dayPhase && environment.dayPhase.dim) || 0) : 0;
            amt += (target - amt) * Math.min(1, dt / 2);
            flies.update(dt, amt);
            meteor.update(dt, amt);
        },
        layers: {
            weather: g => {
                flies.draw(g, amt);
                meteor.draw(g);
            }
        },
        setEnabled(next) { on = !!next; },
        dispose() { meteor.clear(); },
        inspect: () => ({ night: +amt.toFixed(2), flies: flies.inspect(), meteor: meteor.inspect() })
    };
}
