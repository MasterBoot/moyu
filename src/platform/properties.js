import { readSettings, onSettingsChange } from '../storage/settings-store.js';

/** 把 { key: value } 包成宿主属性的形状({ key: { value } }),两套来源共用下面同一段应用逻辑 */
function asProperties(flat) {
    const out = {};
    for (const [k, v] of Object.entries(flat || {})) out[k] = { value: v };
    return out;
}

export function attachProperties(config, syncKois) {
    const previous = window.wallpaperPropertyListener, previousLively = window.livelyPropertyListener;
    /* 范围与 project.json 的声明对齐(2026-10-03)。原来这里比声明宽(fishCount [0,300]
     * vs 10-200 等),localStorage/软件面板这条路能写进 UI 不允许的值 ——
     * 比如 0 条鱼的空池塘(core/settings.js 注释里防的就是它)。 */
    const numeric = { fishCount: [10, 200], fishSpeed: [0.5, 3], fishSize: [0.5, 3], rippleStrength: [0.1, 5], waterHue: [0, 360], weather: [0, 5], nightDim: [0, 1.3], weatherAutoMinutes: [1, 60], ambientVolume: [0, 1] };
    const applyUserProperties = properties => {
        for (const [key, property] of Object.entries(properties || {})) {
            if (!(key in config) || !property || !('value' in property)) continue;
            let value = property.value;
            if (numeric[key]) {
                value = Number(value);
                if (!Number.isFinite(value)) continue;
                const [min, max] = numeric[key];
                value = Math.max(min, Math.min(max, value));
                if (key === 'fishCount' || key === 'weather' || key === 'weatherAutoMinutes') value = Math.round(value);
            } else if (typeof config[key] === 'boolean') {
                if (typeof value !== 'boolean') continue;
            } else continue;
            config[key] = value;
            if (key === 'fishCount') syncKois();
            if (key === 'waterHue') document.body.style.backgroundColor = 'hsl(' + value + ',75%,18%)';
        }
    };
    /* ── 通用属性(WE 在壁纸加载时、以及用户改性能设置时推)──
     * 官方 FPS Limiter 要求壁纸自己遵守用户设的帧率上限;不接这个事件,我们就等于无视了它。 */
    const applyGeneralProperties = properties => {
        const fps = Number(properties && properties.fps);
        if (Number.isFinite(fps) && fps >= 0) config.fps = fps;
    };
    window.wallpaperPropertyListener = { applyUserProperties, applyGeneralProperties };
    window.livelyPropertyListener = (name, value) => applyUserProperties({ [name]: { value } });

    /* ── 自有软件那一路(2026-09-26)──
     * 软件版没有宿主属性面板,所以设置窗口把值写进 localStorage;
     * 这里在启动时应用一次,并监听后续改动(storage 事件 = 同源跨窗口广播)。
     * 于是"设置面板"和"WE/Lively 面板"最终走的是同一段应用逻辑,不会出现两套行为。 */
    applyUserProperties(asProperties(readSettings()));
    const offStore = onSettingsChange(next => applyUserProperties(asProperties(next)));

    return () => {
        window.wallpaperPropertyListener = previous;
        window.livelyPropertyListener = previousLively;
        offStore();
    };
}
