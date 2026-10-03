import { createRainRipples } from '../render/ripples.js';
import { createRainStreaks } from '../render/rain-streaks.js';
import { createSnowflakes } from '../render/snowflakes.js';
import { createFog } from '../render/fog.js';
import { createFrost } from '../render/frost.js';
import { THEME } from '../shared/legacy-assets.js';

/* ---- WMO 天气码 → 我们的四档(2026-10-03)----
 * Open-Meteo 的 weather_code 是 WMO 标准码。映射原则:
 *   晴/多云/雾 → 晴(0);雨/毛毛雨/阵雨 → 雨(1);大雨/强阵雨/雷暴 → 大雨(2);
 *   各类雪 → 雪(3)。有降水量数据时,雨档按 2.5mm/h 分界升到大雨。导出供单测。 */
export function mapWeatherCode(code, precipitation = 0) {
    const c = Number(code) | 0;
    if (!Number.isFinite(c)) return 0;
    if (c === 0 || (c >= 1 && c <= 3) || c === 45 || c === 48) return 0;
    if (c === 65 || c === 67 || c === 82) return 2;      // 大雨/强冻雨/强阵雨:码本身已是大
    if ((c >= 51 && c <= 64) || c === 66 || c === 80 || c === 81) return (precipitation >= 2.5) ? 2 : 1;
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 3;
    if (c >= 95 && c <= 99) return 2;
    return 0;
}

/**
 * 天气玩法(2026-09-26 建,2026-10-03 扩):晴 / 雨 / 大雨 / 雪 + 定时轮动 + 真实天气。
 *
 * 它做五件事,且只做这五件:
 *   ① 每帧把 config.weather(宿主属性的数字下标)同步进 environment(状态 + 平滑过渡)
 *   ② realWeather 开着(默认)时:启动经 IP 定位 + Open-Meteo 拿真实天气写进 config,
 *      每 30 分钟刷新;拿到数据期间接管,轮动暂停
 *   ③ realWeather 关/失败时:weatherAuto 开着就按 weatherAutoMinutes 定时把
 *      config.weather 顺时针拨一格(晴→雨→大雨→雪→晴)。只写 config.weather —— 它是唯一真源
 *   ④ 降水时生成粒子:雨=雨坑(水面)+雨丝(空中),雪=晶形雪片(飘落即化),都画在 weather 层
 *   ⑤ 自己被 setFeature('weather', ...) 关掉时停止生成,粒子自然落完(不硬清屏)
 *
 * 光与色罩不在这里 —— render/renderer.js 每帧读 environment 施加(它才知道画布)。
 *
 * 不冲突的三条(与原版同一套纪律):
 *   · 晴 = 与基线逐帧一致(不生成粒子、光感 alpha ×1、色罩 alpha 0)
 *   · 雨坑用**自己的数组 + 自己的上限**,再大的雨也挤不掉鼠标涟漪;且只走 Canvas 路径
 *   · 粒子位置用 environment 的**独立随机流**,绝不碰共享 Math.random(否则会改掉鱼的随机序列)
 *
 * ★ 粒子系统按【目标预设】重建(2026-10-03):雨有两档剖面、雪是另一套粒子,
 *   target 一变就把雨坑/雨丝/雪片按新参数重建(池子分配是 O(cap),一次切换一次,可忽略)。
 *   原版从 theme.weather.rain 固定取参数,而且只挑了 5 个键 —— ridgeFrac/arcFloor
 *   实际没传进剖面;现在整包 spread,预设里那套"小坑"参数真正生效。
 */
export function createWeather({ config, viewport, environment, time }) {
    // 雨坑剖面 = 鼠标涟漪那套参数(THEME.water.ripple)打底,预设覆盖自己的键
    const T = THEME.water.ripple;
    let enabled = true;
    let spawned = 0;                     // 诊断用:累计生成的水坑数
    let rotT = 0;                        // 轮动计时器(秒)

    /* ---- 霜冻边框(雪档专属,2026-10-03)----
     * 雪天屏幕四周结一圈冰霜:雪档时 ~5s 长满,离开雪档慢慢退。纹理一次性烘焙
     * (视口大小,resize 重建),每帧只有一张 drawImage + globalAlpha。 */
    const frostCfg = (THEME.weather && THEME.weather.snow && THEME.weather.snow.snow && THEME.weather.snow.snow.frost) || {};
    const frost = createFrost({ viewport, frost: frostCfg });
    let frostAmt = 0;

    /* ---- 闪电(雷暴档专属,2026-10-03)----
     * 8~26s 随机一次,亮→暗的双闪(第二道比第一道弱,真实的闪电经常这么闪)。
     * 画在 farTint 层、screen 加亮 —— 雷声(audio 玩法)与闪电各自独立计时:
     * 真实的雷本来就和闪电不同步,这样反而自然。 */
    let flash = 0, flashSecond = false, lightningTimer = 10;

    /* ---- 真实天气(2026-10-03)----
     * config.realWeather 默认开:启动时经 IP 定位(免权限弹窗,三个免 key 源依次兜底)
     * 拿经纬度,再查 Open-Meteo(免 key)的当前天气,映射到我们的四档后写 config.weather。
     * 每 30 分钟刷新一次 —— 壁纸一开好几天,天要跟现实走。轮动在真实天气生效期间暂停
     * (两者语义冲突);获取失败(离线/CORS/超时)静默回退"手动/轮动"原行为,只 warn 一次。
     * fetch 全程异步,绝不阻塞首帧。 */
    const REAL_REFRESH = 30 * 60 * 1000;
    const FETCH_TIMEOUT = 8000;
    let realState = 'idle';              // idle|loading|ok|failed
    let realResolved = false;            // 第一次真实天气是否已经落地(成功或失败都算)
    let realNextAt = 0;                  // 下次刷新时间戳(ms)
    let realWarned = false;
    let realMapped = -1;                 // 诊断用:最近一次映射出的档位
    let bootSnap = false;                // 已做过"启动钳回晴"
    let pendingSnap = false;             // 真实天气首次落地时用 snap 落档(不再走 3.5s 过渡)

    function fetchJson(url) {
        const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const timer = ctl ? setTimeout(() => ctl.abort(), FETCH_TIMEOUT) : null;
        return fetch(url, ctl ? { signal: ctl.signal } : undefined)
            .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .finally(() => { if (timer) clearTimeout(timer); });
    }
    async function getGeo() {
        const srcs = [
            ['https://ipwho.is/', j => [Number(j.latitude), Number(j.longitude)]],
            ['https://get.geojs.io/v1/ip/geo.json', j => [parseFloat(j.latitude), parseFloat(j.longitude)]],
            ['https://ipapi.co/json/', j => [Number(j.latitude), Number(j.longitude)]]
        ];
        for (const [url, pick] of srcs) {
            try {
                const j = await fetchJson(url);
                const c = pick(j || {});
                if (Number.isFinite(c[0]) && Number.isFinite(c[1])) return c;
            } catch (e) { /* 换下一个源 */ }
        }
        throw new Error('all geo sources failed');
    }
    async function doSyncReal() {
        const [lat, lon] = await getGeo();
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
                    '&current=weather_code,precipitation&timezone=auto';
        const j = await fetchJson(url);
        const cur = j && j.current;
        const idx = mapWeatherCode(cur && cur.weather_code, Number(cur && cur.precipitation));
        realMapped = idx;
        /* 落地时【再查一次】realWeather:fetch 在天上的几秒里,用户可能已经在面板
         * 关掉了"跟随真实天气"或手动选了天气 —— 迟到的结果不能盖掉他的选择。 */
        if (enabled && config.realWeather) config.weather = idx;
    }
    function syncRealWeather() {
        realState = 'loading';
        /* 整链 10s 硬上限:三个 geo 源逐个兜底最坏能拖 30s+,启动"等真实天气"不能等那么久 */
        const deadline = new Promise((_, rej) => setTimeout(() => rej(new Error('整体超时(10s)')), 10000));
        Promise.race([doSyncReal(), deadline]).then(() => {
            realState = 'ok';
            realResolved = true;
            realNextAt = Date.now() + REAL_REFRESH;
        }).catch(e => {
            realState = 'failed';
            realResolved = true;
            realNextAt = Date.now() + REAL_REFRESH;  // 失败也按周期重试,网络回来就自动跟上
            if (!realWarned) {
                realWarned = true;
                console.warn('[koi] 真实天气获取失败,回退手动/轮动(30 分钟后重试):', e && e.message);
            }
        });
    }

    let field = null, streaks = null, flakes = null, fogR = null;
    let builtFor = -1;                   // 粒子系统是为哪个目标下标配的

    function ensureSystems() {
        if (environment.targetIndex === builtFor) return;
        builtFor = environment.targetIndex;
        if (field) field.clear();
        if (streaks) streaks.clear();
        if (flakes) flakes.clear();
        const rain = environment.rainSpec;
        const snow = environment.snowSpec;
        const fog = environment.fogSpec;
        field = rain ? createRainRipples({ viewport, config, profile: { ...T, ...rain } }) : null;
        streaks = createRainStreaks({ viewport, streak: (rain && rain.streak) || {}, rng: environment.rng });
        flakes = createSnowflakes({ viewport, snow: snow || {}, rng: environment.rng });
        fogR = fog ? createFog({ viewport, fog }) : null;
    }

    /** 雨丝撞到水面 → 原地起一个坑(半径/寿命由雨滴剖面决定) */
    function onImpact(x, y) {
        const p = (environment.rainSpec && environment.rainSpec.power) || [0.10, 0.25];
        field.spawn(x, y, environment.range(p[0], p[1]));
        spawned++;
    }

    return {
        /** 宿主属性(wallpaperPropertyListener / livelyPropertyListener)只写 config,**每帧在这里同步** */
        /** 禁用后还要把雨收完(见 core/feature-registry.js 的 settleWhileDisabled) */
        settleWhileDisabled: true,

        update(dt) {
            // ── 真实天气(默认开):到点就刷新;拿到数据期间接管 config.weather ──
            if (enabled && config.realWeather && realState !== 'loading' && Date.now() >= realNextAt) syncRealWeather();
            // ── 启动等待:第一次真实天气没落地前,画面先停在晴(中性)——
            //    否则会先把"上次的/默认的"天气画出来,几秒后才过渡成实况,像出了 bug。
            //    落地后用 snapTo 直接落准,不再走 3.5s 过渡(等也等了,落就落准)。
            if (enabled && config.realWeather && !realResolved && !bootSnap) {
                bootSnap = true; pendingSnap = true;
                environment.snapTo(0);
            }
            const holdForReal = enabled && config.realWeather && !realResolved;
            const realWins = enabled && config.realWeather && realState === 'ok';
            // ── 定时轮动(真实天气接管/启动等待期间暂停)──
            // 只写 config.weather(唯一真源)。手动改天气/宿主推值都会走到下面那句
            // "want !== targetIndex" 分支,轮动计时器随之清零重新数。
            if (enabled && !holdForReal && !realWins && config.weatherAuto) {
                rotT += dt;
                const interval = Math.max(60, (Number(config.weatherAutoMinutes) || 5) * 60);
                if (rotT >= interval) {
                    rotT = 0;
                    config.weather = ((Number(config.weather) || 0) + 1) % environment.orderLength;
                }
            }
            const want = holdForReal ? 0 : (enabled ? (Number(config.weather) || 0) : 0);
            if (want !== environment.targetIndex) {
                if (pendingSnap) { environment.snapTo(want); pendingSnap = false; }
                else environment.setWeather(want);
                rotT = 0;
            }
            environment.update(dt);
            ensureSystems();

            // ── 霜冻边框:雪档时 ~5s 长出来,离开雪档慢慢退 ──
            const frostTarget = (enabled && environment.snowSpec) ? 1 : 0;
            const frostStep = dt / 5;
            frostAmt += Math.max(-frostStep, Math.min(frostStep, frostTarget - frostAmt));
            if (frostAmt < 0.003) frostAmt = 0;

            // ── 闪电:雷暴档 8~26s 一次的双闪;离开雷暴档立即熄灭 ──
            if (enabled && environment.isStorm) {
                lightningTimer -= dt;
                if (lightningTimer <= 0) {
                    flash = 0.62; flashSecond = false;
                    lightningTimer = 8 + environment.rng() * 18;
                }
            } else if (flash > 0) {
                flash = 0;   // 切档瞬间熄,不留残光
            }
            if (flash > 0) {
                flash -= dt * 3.2;
                if (!flashSecond && flash <= 0.36) { flashSecond = true; flash = 0.45; }   // 回闪更弱
                if (flash < 0) flash = 0;
            }
            if (fogR) fogR.update(dt);

            // 雨丝/雪片的"在场数量"由环境给(晴=0 ⇒ 落完就退休);关掉玩法时连水坑也不再生成
            const wantStreaks = (enabled && field) ? environment.rainSpawnCount() : 0;
            if (streaks) {
                streaks.fill(wantStreaks);
                streaks.update(dt, wantStreaks, (enabled && field) ? onImpact : null);
            }
            if (field) field.update(dt);
            const wantFlakes = enabled ? environment.snowSpawnCount() : 0;
            if (flakes) { flakes.fill(wantFlakes); flakes.update(dt, wantFlakes); }
        },
        layers: {
            // 雾在最底下(它是"空气"),再雨坑(水面),再雨丝(空气),最后雪片 —— 全在 weather 层
            weather: g => {
                if (fogR) fogR.draw(g, environment.rainAmount);
                if (field) field.draw(g);
                if (streaks) streaks.draw(g);
                if (flakes) flakes.draw(g);
            },
            // 闪电画在 farTint 层(天色那一层):screen 加亮整幅 —— 在雨丝/涟漪之下,
            // 所以闪电照亮"天",雨还是黑的剪影,层次才对
            farTint: g => {
                if (flash > 0.003) {
                    g.save();
                    g.globalCompositeOperation = 'screen';
                    g.globalAlpha = flash;
                    g.fillStyle = '#cfe4ff';
                    g.fillRect(0, 0, viewport.width, viewport.height);
                    g.restore();
                }
            },
            // 霜冻画在 ui 层(最上面):它是"结在玻璃上"的,压在鱼/涟漪/粒子之上,鱼名字之下
            ui: g => { if (frostAmt > 0) frost.draw(g, frostAmt, time); }
        },
        setEnabled(on) {
            enabled = !!on;
            // 关掉 = 回到晴(不是"冻在当前天色");重新打开 = 回到选中的那档
            environment.setWeather(enabled ? (Number(config.weather) || 0) : 0);
        },
        dispose() {
            if (field) field.clear();
            if (streaks) streaks.clear();
            if (flakes) flakes.clear();
            frost.dispose();
        },
        inspect: () => ({ field, streaks, flakes, fog: fogR, spawned, enabled, builtFor, rotT, frost: frostAmt, flash,
                          real: { state: realState, resolved: realResolved, mapped: realMapped,
                                  nextInMin: Math.max(0, Math.round((realNextAt - Date.now()) / 60000)) } })
    };
}
