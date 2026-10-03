/**
 * 软件版的"设置"存储(2026-09-26)。
 *
 * 为什么用 localStorage 而不是加一套 IPC:
 *   设置窗口和壁纸窗口**同源**,localStorage 本来就是共享的;而 `storage` 事件是**同源跨窗口广播**的 ——
 *   于是壁纸窗口不需要任何 IPC 就能实时收到改动(自定义鱼的同步走的也是这条通道)。
 *   结果:WE / Lively 走宿主属性面板,自有软件走这里,**两边最终都写进同一个 config**,
 *   玩法和渲染一行条件分支都不用加(vision:一个 config 是唯一真源)。
 *
 * 值就是**属性名 → 属性值**的平铺对象(和宿主属性的 key 完全同名):
 *   { dayCycle: true, nightDim: 0.8, fishCount: 60, ... }
 * 所以它可以直接喂给 platform/properties.js 的那套应用逻辑(那里已经把类型/范围/取整都管了)。
 */
export const SETTINGS_KEY = 'koi.settings.v1';

export function readSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        const o = raw ? JSON.parse(raw) : null;
        return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch (e) { return {}; }
}

/** 合并写入(只传改动的键);返回写入后的完整设置,失败返回 null */
export function writeSettings(patch) {
    try {
        const next = { ...readSettings(), ...(patch || {}) };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
        return next;
    } catch (e) { return null; }
}

/** 清空 = 回到"出厂默认"(默认值在 core/settings.js 与 project.json 的 value) */
export function clearSettings() {
    try { localStorage.removeItem(SETTINGS_KEY); return true; } catch (e) { return false; }
}

/** 监听别的窗口对设置的改动(storage 事件只在**别的**窗口写时触发,所以本窗口要自己应用一次) */
export function onSettingsChange(cb) {
    const handler = e => { if (e.key === SETTINGS_KEY) cb(readSettings()); };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
}
