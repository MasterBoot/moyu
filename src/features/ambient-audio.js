/* 环境音效(2026-10-03):全 WebAudio 合成,仓库里**没有音频文件**。
 *
 *   水声底噪 — 粉噪声循环 → 低通(320Hz ± LFO 起伏)= 缓慢的涟漪感
 *   雨声     — 同一噪声源(加速播放变"沙")→ 高通,音量跟 environment.rainAmount
 *              的平方走(小雨细、大雨猛),大雨档再乘 1.35;水声在雨大时主动让位
 *   夜虫鸣   — 三只合成蛐蛐(不同频率 + 随机声像),夜度(dayPhase.dim)够深才叫,
 *              雨大时闭嘴(听不见也合理);夜间水/雨声自动压到一半
 *   雷声     — 仅大雨档:噪声放慢 + 低通扫频的隆隆,12~40s 随机一次
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
export function rainGainFor(amount, isHeavy) {
    const a = Math.max(0, Number(amount) || 0);
    return Math.min(1, a * (isHeavy ? 1.35 : 1));
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

        /* ── 三只合成蛐蛐 ── */
        const voices = [];
        for (const [freq, pan] of [[4100, -0.55], [4500, 0.1], [3800, 0.6]]) {
            const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
            const g = ctx.createGain(); g.gain.value = 0;
            const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
            if (p) { p.pan.value = pan; osc.connect(g); g.connect(p); p.connect(master); }
            else { osc.connect(g); g.connect(master); }
            osc.start();
            voices.push({ gain: g, timer: 0.4 + rng() * 2 });
        }

        nodes = { waterGain, rainGain, voices, noise };
    }

    /** 一声蛐蛐:一串短脉冲(6~9 个),用 gain 自动化排进音频时间线 */
    function chirp(v, vol) {
        const t0 = ctx.currentTime + 0.05;
        const g = v.gain.gain;
        g.cancelScheduledValues(t0);
        g.setValueAtTime(0, t0);
        const pulses = 6 + Math.floor(rng() * 4);
        for (let j = 0; j < pulses; j++) {
            const p = t0 + j * 0.045;
            g.linearRampToValueAtTime(vol, p + 0.008);
            g.linearRampToValueAtTime(0.0001, p + 0.032);
        }
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
            const rain = rainGainFor(environment.rainAmount, isHeavy);
            const t = ctx.currentTime;
            const duck = 1 - night * 0.5;                     // 夜里水/雨声让一半给安静

            master.gain.setTargetAtTime(vol, t, 0.1);
            nodes.waterGain.gain.setTargetAtTime(0.045 * duck * (1 - rain * 0.4), t, 0.2);
            nodes.rainGain.gain.setTargetAtTime(rain * rain * 0.13 * duck, t, 0.25);

            /* 虫鸣:夜够深且雨不大才叫 */
            const cricketOn = night > 0.45 && rain < 0.5;
            for (const v of nodes.voices) {
                v.timer -= dt;
                if (v.timer <= 0) {
                    if (cricketOn) chirp(v, (0.03 + rng() * 0.03) * night);
                    v.timer = cricketOn ? (0.9 + rng() * 1.8) : (1 + rng());
                }
            }

            /* 雷:仅大雨档,12~40s 一次;出雷暴圈后至少歇 8s,别一进来就响 */
            thunderTimer -= dt;
            if (isHeavy && thunderTimer <= 0) {
                thunder();
                thunderTimer = 12 + rng() * 28;
            } else if (!isHeavy && thunderTimer < 8) {
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
        inspect: () => ({
            ctxState: ctx ? ctx.state : 'no-ctx',
            volume: Number(config.ambientVolume) || 0,
            night: nightnessFromDim((environment.dayPhase && environment.dayPhase.dim) || 0),
            rain: rainGainFor(environment.rainAmount, environment.name === 'heavyrain'),
            thunderIn: Math.round(thunderTimer),
            voices: nodes ? nodes.voices.length : 0
        })
    };
}
