/* 环境音效(2026-10-03):全 WebAudio 合成,仓库里**没有音频文件**。
 *
 *   水声底噪 — 粉噪声循环 → 低通(320Hz ± LFO 起伏)= 缓慢的涟漪感
 *   雨声     — 同一噪声源(加速播放变"沙")→ 高通,音量跟 environment.rainAmount
 *              的平方走(小雨细、大雨猛),大雨/雷暴档再加成;水声在雨大时主动让位
 *   雷声     — 仅大雨/雷暴档:噪声放慢 + 低通扫频的隆隆,12~40s 随机一次
 *   夜间     — 水/雨声自动压到一半(合成虫鸣试过一版,用户嫌吵,已整体移除)
 *
 * 母音量 = config.ambientVolume(设置面板滑杆)。全部节点挂在 master 上,
 * 关玩法(setEnabled(false))时淡出并 suspend,不占 CPU。
 *
 * 自动播放策略:浏览器里 AudioContext 起步是 suspended —— 首次点击/按键时 resume
 * (壁纸宿主 WE/Lively 通常允许自动播放,无需手势)。init 前每帧只是空跑,零开销。
 * 随机全部走独立种子流(mulberry32),不碰共享 Math.random(项目铁律)。
 */
import { mulberry32 } from '../shared/math.js';

/* 纯函数导出供单测 */
export function nightnessFromDim(dim) {
    const d = Number(dim) || 0;
    return Math.max(0, Math.min(1, (d - 0.15) / 0.35));
}
/** 听感雨量 0~1(封顶;档位间的"更猛"由增益曲线后的倍率表达,不在这里封) */
export function rainGainFor(amount) {
    const a = Math.max(0, Number(amount) || 0);
    return Math.min(1, a);
}

export function createAmbientAudio({ config, environment }) {
    let enabled = true;
    let ctx = null, master = null, nodes = null;
    let thunderTimer = 15;
    const rng = mulberry32(0xA0D10);

    /* 粉噪声(Paul Kellet 近似):比白噪声更像"水",低通后不刺耳 */
    function makeNoiseBuffer(c) {
        const len = c.sampleRate * 2;
        const buf = c.createBuffer(1, len, c.sampleRate);
        const d = buf.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < len; i++) {
            const w = rng() * 2 - 1;
            b0 = 0.99886 * b0 + w * 0.0555179;
            b1 = 0.99332 * b1 + w * 0.0750759;
            b2 = 0.96900 * b2 + w * 0.1538520;
            b3 = 0.86650 * b3 + w * 0.3104856;
            b4 = 0.55000 * b4 + w * 0.5329522;
            b5 = -0.7616 * b5 - w * 0.0168980;
            const out = (b0 + b1 + b2 + b3 + b4 + b5 + b6) * 0.11;
            b6 = w * 0.115926;
            d[i] = Math.max(-1, Math.min(1, out * 2.5));
        }
        return buf;
    }

    function init() {
        const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
        if (!AC) return;
        try { ctx = new AC(); } catch (e) { return; }
        master = ctx.createGain();
        master.gain.value = 0;
        master.connect(ctx.destination);
        const noise = makeNoiseBuffer(ctx);

        /* ── 水声底噪 ── */
        const waterSrc = ctx.createBufferSource();
        waterSrc.buffer = noise; waterSrc.loop = true;
        const waterLP = ctx.createBiquadFilter();
        waterLP.type = 'lowpass'; waterLP.frequency.value = 320; waterLP.Q.value = 0.7;
        const waterGain = ctx.createGain(); waterGain.gain.value = 0.045;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;         // 12s 一次的"波浪起伏"
        const lfoGain = ctx.createGain(); lfoGain.gain.value = 90;
        lfo.connect(lfoGain); lfoGain.connect(waterLP.frequency); lfo.start();
        waterSrc.connect(waterLP); waterLP.connect(waterGain); waterGain.connect(master);
        waterSrc.start();

        /* ── 雨声 ── */
        const rainSrc = ctx.createBufferSource();
        rainSrc.buffer = noise; rainSrc.loop = true; rainSrc.playbackRate.value = 1.7;
        const rainHP = ctx.createBiquadFilter(); rainHP.type = 'highpass'; rainHP.frequency.value = 1000;
        const rainLP2 = ctx.createBiquadFilter(); rainLP2.type = 'lowpass'; rainLP2.frequency.value = 7000;
        const rainGain = ctx.createGain(); rainGain.gain.value = 0;
        rainSrc.connect(rainHP); rainHP.connect(rainLP2); rainLP2.connect(rainGain); rainGain.connect(master);
        rainSrc.start();

        nodes = { waterGain, rainGain, noise };
    }

    /** 一声雷:噪声放慢(0.35×)→ 低通从 220Hz 扫到 55Hz,快起慢衰 */
    function thunder() {
        const t0 = ctx.currentTime + 0.1, dur = 2.8;
        const src = ctx.createBufferSource();
        src.buffer = nodes.noise; src.loop = true; src.playbackRate.value = 0.35;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
        lp.frequency.setValueAtTime(220, t0);
        lp.frequency.exponentialRampToValueAtTime(55, t0 + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.12);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(lp); lp.connect(g); g.connect(master);
        src.start(t0); src.stop(t0 + dur + 0.1);
    }

    return {
        update(dt) {
            if (!enabled) return;
            if (!ctx) init();
            if (!ctx) return;
            if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); return; }
            const vol = Math.max(0, Math.min(1, Number(config.ambientVolume) || 0));
            const dim = (environment.dayPhase && environment.dayPhase.dim) || 0;
            const night = nightnessFromDim(dim);
            const isHeavy = environment.name === 'heavyrain';
            const isStorm = environment.name === 'thunder' || (environment.isStorm === true);
            /* ★ 听感雨量(2026-10-03 修):
             *   ① rainAmount 是雨/雪/雾共用的"大气量"通道 —— 雪/雾档它也是 1(雪片和雾
             *      靠它淡入),直接喂雨声 = 雪天一直在下"雨声"。必须先问当前档有没有雨
             *      (rainSpec 非空),没有就归零;切档瞬间雨声随 0.25s 时间常数收掉。
             *   ② 大雨/雷暴的倍率放在【平方曲线之后】,不再被 min(1,…)=1 封顶抹平 ——
             *      否则大雨和雨的增益一模一样(实测听不出区别)。 */
            const rainAudible = environment.rainSpec ? 1 : 0;
            const rainAud = rainGainFor(environment.rainAmount) * rainAudible;
            const rainBoost = isStorm ? 1.55 : isHeavy ? 1.45 : 1;
            const t = ctx.currentTime;
            const duck = 1 - night * 0.5;                     // 夜里水/雨声让一半给安静

            master.gain.setTargetAtTime(vol, t, 0.1);
            nodes.waterGain.gain.setTargetAtTime(0.045 * duck * (1 - rainAud * 0.4), t, 0.2);
            nodes.rainGain.gain.setTargetAtTime(rainAud * rainAud * 0.13 * rainBoost * duck, t, 0.25);

            /* 雷:大雨/雷暴档,12~40s 一次;出圈后至少歇 8s,别一进来就响 */
            thunderTimer -= dt;
            if (isStorm && thunderTimer <= 0) {
                thunder();
                thunderTimer = 12 + rng() * 28;
            } else if (!isStorm && thunderTimer < 8) {
                thunderTimer = 8;
            }
        },
        setEnabled(on) {
            enabled = !!on;
            if (!ctx) return;
            const t = ctx.currentTime;
            master.gain.setTargetAtTime(enabled ? Math.max(0, Math.min(1, Number(config.ambientVolume) || 0)) : 0, t, 0.3);
            if (enabled) ctx.resume().catch(() => {}); else ctx.suspend().catch(() => {});
        },
        dispose() {
            if (ctx) { ctx.close().catch(() => {}); ctx = null; master = null; nodes = null; }
        },
        inspect: () => {
            const dim = (environment.dayPhase && environment.dayPhase.dim) || 0;
            const rainAudible = environment.rainSpec ? 1 : 0;
            const rainAud = rainGainFor(environment.rainAmount) * rainAudible;
            const isStorm = environment.name === 'thunder' || (environment.isStorm === true);
            const rainBoost = isStorm ? 1.55 : environment.name === 'heavyrain' ? 1.45 : 1;
            return {
                ctxState: ctx ? ctx.state : 'no-ctx',
                volume: Number(config.ambientVolume) || 0,
                night: nightnessFromDim(dim),
                rainAud, rainBoost,
                rainGainTarget: +(rainAud * rainAud * 0.13 * rainBoost).toFixed(3),
                thunderIn: Math.round(thunderTimer)
            };
        }
    };
}
