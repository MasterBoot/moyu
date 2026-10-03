(() => {
  // src/pond/breeds.js
  var KOI_BREEDS = [
    // patches: 多块斑,每块 = { segs:[连续段号], color, pw:相对体宽(0~0.72) }
    //   —— 一块斑是"贴纸",两三块大小不一、颜色微差才是锦鲤
    // net   鳞片网强度(網目/松葉,最能拉开质感的一项)
    // sheen 金属光泽(黄金/孔雀这类亮皮)
    // kuchi 红唇(红白常见)   edge 腹侧红边(浅黄的标志)
    {
      name: "\u7EA2\u767D",
      body: "#f6f3ea",
      w: 0.25,
      net: 0.055,
      kuchi: "#e0562a",
      patches: [
        { segs: [1, 2], color: "#e0562a", pw: 0.6 },
        { segs: [6, 7], color: "#e34f24", pw: 0.46 }
      ]
    },
    {
      name: "\u5927\u6B63\u4E09\u8272",
      body: "#f6f3ea",
      w: 0.15,
      net: 0.055,
      patches: [
        { segs: [2, 3], color: "#dc4a20", pw: 0.58 },
        { segs: [4, 5], color: "#2a241c", pw: 0.28 },
        { segs: [7, 8], color: "#2a241c", pw: 0.22 }
      ]
    },
    {
      name: "\u662D\u548C\u4E09\u8272",
      body: "#3b352b",
      w: 0.09,
      net: 0.075,
      sheen: 0.14,
      patches: [
        { segs: [1, 2, 3], color: "#eae5d8", pw: 0.6 },
        { segs: [5, 6], color: "#d8441c", pw: 0.5 }
      ]
    },
    {
      name: "\u767D\u522B\u7532",
      body: "#f6f3ea",
      w: 0.11,
      net: 0.06,
      patches: [
        { segs: [2, 3], color: "#2a241c", pw: 0.4 },
        { segs: [6, 7], color: "#2a241c", pw: 0.34 }
      ]
    },
    {
      name: "\u9EC4\u91D1",
      body: "#eab842",
      w: 0.14,
      net: 0.1,
      sheen: 0.3,
      patches: []
    },
    {
      name: "\u5B54\u96C0",
      body: "#e0a83c",
      w: 0.08,
      net: 0.17,
      sheen: 0.26,
      patches: [{ segs: [3, 4, 5], color: "#d2571e", pw: 0.48 }]
    },
    {
      name: "\u6D45\u9EC4",
      body: "#9db8c8",
      w: 0.08,
      net: 0.15,
      edge: "#c0483a",
      patches: []
    },
    {
      name: "\u7EEF",
      body: "#dd5322",
      w: 0.1,
      net: 0.05,
      sheen: 0.15,
      patches: []
    }
  ];
  var ids = ["kohaku", "taisho-sanke", "showa-sanke", "shiro-bekko", "ogon", "kujaku", "asagi", "hi"];
  KOI_BREEDS.forEach((b, i) => {
    b.id = ids[i];
  });

  // src/pond/schools.js
  var SOLO_RATIO = 0.4;
  function createSchools({ viewport, config }) {
    const TRAIL_STEP = 7;
    const TRAIL_MAX = 1250;
    const QUEUE_LEN = 900;
    const SCHOOL_COUNT = 3;
    const SCHOOL_HOMES = [[0.2, 0.31], [0.8, 0.31], [0.5, 0.7]];
    const HOME_DRIFT_RATE = Math.PI * 2 / 900;
    const HOME_DRIFT_MUL = [1, 1.15, 0.85];
    function liveHome(s) {
      const p = s.homePhase || 0;
      const c = Math.cos(p), sn = Math.sin(p);
      const ox = s.homeX - 0.5, oy = s.homeY - 0.5;
      return {
        x: (0.5 + ox * c - oy * sn) * viewport.width,
        y: (0.5 + ox * sn + oy * c) * viewport.height
      };
    }
    const SCHOOL_PERCEIVE_K = 0.9;
    const SCHOOL_PERCEIVE_MIN = 70;
    const SEP_W = 1.8;
    const ALIGN_W = 1.4;
    const COH_W = 1.6;
    const MAX_STEER = 1.4;
    const schools = [];
    let schoolAssignCounter = 0;
    let moodSpeedMul = 1;
    function buildSchools() {
      schools.length = 0;
      for (let i = 0; i < SCHOOL_COUNT; i++) {
        const h = SCHOOL_HOMES[i % SCHOOL_HOMES.length];
        schools.push({
          homeX: h[0],
          homeY: h[1],
          x: viewport.width * h[0],
          y: viewport.height * h[1],
          heading: Math.random() * Math.PI * 2,
          formHeading: 0,
          // 正对墙时两个切向等价,用每群固定的一侧来定方向,否则会随机抖
          side: Math.random() < 0.5 ? 1 : -1,
          speed: 0.24 + Math.random() * 0.13,
          turnBias: 0,
          biasTimer: 2 + Math.random() * 3,
          homePhase: 0,
          // 漂移相位(弧度)
          homeDriftMul: HOME_DRIFT_MUL[i % HOME_DRIFT_MUL.length]
        });
        const s0 = schools[schools.length - 1];
        s0.formHeading = s0.heading;
        s0.trail = [{ x: s0.x, y: s0.y, a: 0 }];
        s0.arc = 0;
        s0.arcLive = 0;
        s0.curSpeed = s0.speed;
      }
    }
    const EDGE_MARGIN = 178;
    function edgeUrgency(px, py) {
      const d = Math.min(px, py, viewport.width - px, viewport.height - py);
      if (d >= EDGE_MARGIN) return 0;
      return Math.min(1, (EDGE_MARGIN - d) / EDGE_MARGIN);
    }
    function edgeNormal(x, y) {
      const dl = x, dr = viewport.width - x, dt2 = y, db = viewport.height - y;
      const m = Math.min(dl, dr, dt2, db);
      if (m > EDGE_MARGIN * 1.5) return null;
      if (m === dl) return { x: 1, y: 0 };
      if (m === dr) return { x: -1, y: 0 };
      if (m === dt2) return { x: 0, y: 1 };
      return { x: 0, y: -1 };
    }
    function trailPoint(s, back) {
      const T = s.trail;
      const n = T ? T.length : 0;
      if (n < 2) return null;
      const want = (s.arcLive !== void 0 ? s.arcLive : s.arc) - back;
      if (want <= T[0].a) {
        const dx = T[1].x - T[0].x, dy = T[1].y - T[0].y;
        const m = Math.hypot(dx, dy) || 1;
        return { x: T[0].x, y: T[0].y, tx: dx / m, ty: dy / m, ok: false };
      }
      for (let i = n - 1; i > 0; i--) {
        if (T[i - 1].a <= want && want <= T[i].a) {
          const seg = Math.max(1e-6, T[i].a - T[i - 1].a);
          const t = (want - T[i - 1].a) / seg;
          const dx = T[i].x - T[i - 1].x, dy = T[i].y - T[i - 1].y;
          const m = Math.hypot(dx, dy) || 1;
          return {
            x: T[i - 1].x + dx * t,
            y: T[i - 1].y + dy * t,
            tx: dx / m,
            ty: dy / m,
            ok: true
          };
        }
      }
      return null;
    }
    function updateSchools(dt) {
      const dtMult = dt * 60;
      for (let i = 0; i < schools.length; i++) {
        const s = schools[i];
        s.homePhase = (s.homePhase || 0) + HOME_DRIFT_RATE * s.homeDriftMul * dt;
        s.biasTimer -= dt;
        if (s.biasTimer <= 0) {
          s.turnBias = (Math.random() - 0.5) * 12e-4;
          s.biasTimer = 4 + Math.random() * 7;
        }
        const look = 240 + s.speed * 140;
        const px = s.x + Math.cos(s.heading) * look;
        const py = s.y + Math.sin(s.heading) * look;
        let turn = s.turnBias;
        let turnLimit = 0.012;
        const urgent = edgeUrgency(px, py);
        if (urgent <= 0 && s.escapeLock) {
          s.escapeLock = false;
          s.side = -s.side;
        }
        if (urgent > 0) {
          s.escapeLock = true;
          const n = edgeNormal(s.x, s.y);
          if (n) {
            const h = liveHome(s);
            const toH = Math.atan2(h.y - s.y, h.x - s.x);
            const want = toH + s.side * 0.85;
            const delta = Math.atan2(Math.sin(want - s.heading), Math.cos(want - s.heading));
            turn += delta * (0.75 + urgent * 0.85);
            turnLimit = 0.012 + urgent * 0.046;
          }
        }
        s.heading += Math.max(-turnLimit, Math.min(turnLimit, turn)) * dtMult;
        s.formHeading += Math.atan2(Math.sin(s.heading - s.formHeading), Math.cos(s.heading - s.formHeading)) * Math.min(1, dt * 1.25);
        s.surgePhase = (s.surgePhase || 0) + dt * 0.45;
        const surge = 0.84 + 0.3 * (0.5 + 0.5 * Math.sin(s.surgePhase));
        s.x += Math.cos(s.heading) * s.speed * surge * dtMult * moodSpeedMul;
        s.y += Math.sin(s.heading) * s.speed * surge * dtMult * moodSpeedMul;
        s.curSpeed = s.speed * surge * moodSpeedMul;
        if (!s.trail) {
          s.trail = [{ x: s.x, y: s.y, a: 0 }];
          s.arc = 0;
        }
        let tail = s.trail[s.trail.length - 1];
        let mv = Math.hypot(s.x - tail.x, s.y - tail.y);
        s.arcLive = tail.a + mv;
        if (mv >= TRAIL_STEP) {
          s.arc += mv;
          s.trail.push({ x: s.x, y: s.y, a: s.arc });
          while (s.trail.length > 2 && s.arc - s.trail[0].a > TRAIL_MAX) s.trail.shift();
          s.arcLive = s.arc;
        }
        s.x = Math.max(20, Math.min(viewport.width - 20, s.x));
        s.y = Math.max(20, Math.min(viewport.height - 20, s.y));
      }
    }
    return { schools, buildSchools, updateSchools, setMoodSpeed(m) {
      moodSpeedMul = m;
    }, trailPoint, QUEUE_LEN, SOLO_RATIO, SCHOOL_COUNT, SCHOOL_PERCEIVE_K, SCHOOL_PERCEIVE_MIN, SEP_W, ALIGN_W, COH_W, MAX_STEER, nextSchool: () => schoolAssignCounter++ % SCHOOL_COUNT };
  }

  // src/pond/types.js
  var KOI_TYPE = {
    id: "koi",
    name: "\u9526\u9CA4",
    segmentSpacing: 5,
    shape: null,
    speedMultiplier: 1,
    turnRadius: 2.5,
    soloRatio: SOLO_RATIO,
    collisionRadius: 0.115,
    collisionEnd: 9,
    breeds: KOI_BREEDS
  };
  function createFishTypes() {
    const types = /* @__PURE__ */ new Map();
    function register(definition) {
      const d = { ...KOI_TYPE, ...definition };
      if (!/^[a-z][a-z0-9-]*$/.test(d.id) || types.has(d.id)) throw new Error("Invalid or duplicate fish type: " + d.id);
      for (const key of ["segmentSpacing", "speedMultiplier", "turnRadius", "collisionRadius"]) {
        if (!Number.isFinite(d[key]) || d[key] <= 0) throw new Error("Invalid fish parameter: " + key);
      }
      if (!Number.isFinite(d.soloRatio) || d.soloRatio < 0 || d.soloRatio > 1) throw new Error("Invalid soloRatio");
      if (!Number.isInteger(d.collisionEnd) || d.collisionEnd < 1 || d.collisionEnd > 11) throw new Error("Invalid collisionEnd");
      if (!Array.isArray(d.breeds) || !d.breeds.length || d.breeds.some((b) => !b.id || !(b.w > 0))) throw new Error("Invalid breeds");
      if (d.draw !== void 0 && typeof d.draw !== "function") throw new Error("Invalid fish renderer");
      d.shape = d.shape ? Object.freeze({ ...d.shape }) : null;
      d.breeds = Object.freeze(d.breeds.map((b) => Object.freeze({ ...b })));
      types.set(d.id, Object.freeze(d));
    }
    register(KOI_TYPE);
    return {
      register,
      get(id) {
        if (!types.has(id)) throw new Error("Unknown fish type: " + id);
        return types.get(id);
      },
      list: () => [...types.values()]
    };
  }

  // src/core/settings.js
  var DEFAULT_SETTINGS = {
    // 浏览器里没人会调 wallpaperPropertyListener,所以默认值必须是个能看的数。
    // 被改成 0 的那次,页面上就只剩一个空池塘(宿主会推值 ≠ 默认值可以随便设)。
    fishCount: 80,
    useGpuCaustics: true,
    useGpuRipples: true,
    waterHue: 195,
    fishSpeed: 1.5,
    enableCaustics: true,
    enableFeeding: true,
    shyFish: true,
    fishSize: 1.45,
    rippleStrength: 1,
    // 天气(2026-09-26 建,2026-10-03 扩):0=晴 1=雨 2=大雨 3=雪。**数字下标**——
    // WPE 的 combo 与 Lively 的 dropdown 都只给数字,不是字符串。
    // 默认 0 = 与基线逐帧一致(见 core/environment.js 的注释)。
    weather: 0,
    // 跟随当地真实天气(2026-10-03):默认开 —— 启动经 IP 定位 + Open-Meteo(均免 key)
    // 把现实天气映射到四档,每 30 分钟刷新(见 features/weather.js)。拿到数据期间它
    // 接管 config.weather,轮动暂停;离线/失败静默回退手动/轮动,不影响画面。
    realWeather: true,
    // 天气定时轮动(2026-10-03):默认【关】—— 有真实天气跟随时轮动本来就暂停,
    // 双开没有意义;想要纯轮动的人在面板开它(然后最好关掉 realWeather)。
    // 开着时每 weatherAutoMinutes 分钟顺时针拨一格(晴→雨→大雨→雪→晴),
    // 由 features/weather.js 每帧驱动;手动选天气会重新计时。
    weatherAuto: false,
    weatherAutoMinutes: 5,
    // 自持事件(2026-09-26):无人值守时的落叶与花瓣。默认开 ——
    // 它不影响任何既有行为(自己的随机流、自己的涟漪池),只往 weather 层多画几件东西。
    idleEvents: true,
    // 光的时段(2026-09-26):让天色/光向跟着现实时间走。**默认开**(用户定)——
    // 它和池里那行时钟自洽(时钟 22:07,水面就真是夜里的样子);不喜欢的人在宿主面板关掉即可。
    dayCycle: true,
    // 帧率上限(0 = 不限)。由宿主推来:WE 走 applyGeneralProperties({fps}),见 core/loop.js 与 platform/properties.js。
    fps: 0,
    // 环境音量(0~1,0 = 静音)。WebAudio 合成,无音频文件(见 features/ambient-audio.js):
    // 水声底噪 / 雨声跟雨量 / 夜虫昼鸟(合成)/ 大雨雷声。夜里水雨声自动压半。
    ambientVolume: 0.5,
    // 夜间暗度倍率(0~1.3,1.0 = 现在这版观感)。夜里太暗是这功能最大的口味分歧点,给一根细旋钮。
    nightDim: 1
  };
  function createSettings() {
    return { ...DEFAULT_SETTINGS };
  }

  // src/core/loop.js
  function createLoop({ update, draw, paused = () => false, fpsLimit = () => 0 }) {
    let request = null, last = 0, running = false;
    function tick(now) {
      if (!running) return;
      if (!last) {
        last = now;
        if (!paused()) {
          update(0);
          draw();
        }
        request = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1e3));
      const limit = Math.max(0, Number(fpsLimit()) || 0);
      if (limit > 0 && dt < 1 / limit) {
        request = requestAnimationFrame(tick);
        return;
      }
      last = now;
      if (!paused()) {
        update(dt);
        draw();
      }
      if (running) request = requestAnimationFrame(tick);
    }
    return {
      start() {
        if (running) return;
        running = true;
        last = 0;
        request = requestAnimationFrame(tick);
      },
      stop() {
        running = false;
        if (request !== null) cancelAnimationFrame(request);
        request = null;
        last = 0;
      }
    };
  }

  // src/core/layers.js
  var LAYERS = Object.freeze([
    { id: "floor", target: "under", desc: "\u6C60\u5E95\u4E0E\u6C34\u5E95\u7EB9\u7406" },
    { id: "hud", target: "under", desc: '\u65F6\u949F/\u5B57\u5E55\u8FD9\u7C7B"\u6C89\u5728\u6C34\u4E0B"\u7684\u754C\u9762\u5C42' },
    { id: "food", target: "under", desc: "\u9972\u6599" },
    { id: "creatures", target: "under", desc: "\u9C7C\u4E0E\u5176\u4ED6\u751F\u7269(\u6309 depth \u6392\u5E8F)" },
    { id: "surface", target: "main", desc: "\u6C34\u9762\u4F4D\u79FB\u4E0E\u6298\u5C04" },
    { id: "light", target: "main", desc: "\u7126\u6563/\u5149\u611F" },
    { id: "farTint", target: "main", desc: "\u8FDC\u573A\u8C03\u8272(\u628A\u8FDC\u5904\u538B\u6697)" },
    { id: "weather", target: "main", desc: "\u5929\u6C14(\u96E8/\u843D\u53F6/\u82B1\u74E3)\u8FD9\u7C7B\u524D\u666F\u7C92\u5B50" },
    { id: "ripples", target: "main", desc: "\u9F20\u6807\u6D9F\u6F2A" },
    { id: "ui", target: "main", desc: "\u754C\u9762\u8986\u76D6\u5C42(\u540D\u5B57\u3001\u5165\u53E3\u6309\u94AE)" }
  ]);
  var LAYER_IDS = new Set(LAYERS.map((l) => l.id));
  function createLayerSet() {
    const lists = new Map(LAYERS.map((l) => [l.id, []]));
    function add(layerId, draw) {
      if (!lists.has(layerId)) throw new Error("Unknown draw layer: " + layerId);
      if (typeof draw !== "function") throw new Error("Layer draw must be a function");
      lists.get(layerId).push(draw);
      return () => {
        const list = lists.get(layerId);
        const i = list.indexOf(draw);
        if (i >= 0) list.splice(i, 1);
      };
    }
    return {
      add,
      /** 按固定顺序遍历某一层(renderer 每帧调用) */
      draw(layerId, ctx) {
        const list = lists.get(layerId);
        if (!list) throw new Error("Unknown draw layer: " + layerId);
        for (let i = 0; i < list.length; i++) list[i](ctx);
      },
      count: (layerId) => (lists.get(layerId) || []).length,
      layerIds: () => [...LAYER_IDS],
      /** 自检用:所有层都在表里、target 合法 */
      inspect: () => LAYERS.map((l) => ({ ...l, contributors: lists.get(l.id).length }))
    };
  }

  // src/shared/legacy-assets.js
  var { THEME, KOI_SHAPE, WaterGL } = globalThis.KoiShared;

  // src/shared/math.js
  function shadeColor(hex, amt) {
    let n = parseInt(hex.slice(1), 16);
    let r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    if (amt >= 0) {
      r += (255 - r) * amt;
      g += (255 - g) * amt;
      b += (255 - b) * amt;
    } else {
      r *= 1 + amt;
      g *= 1 + amt;
      b *= 1 + amt;
    }
    return "rgb(" + Math.round(r) + "," + Math.round(g) + "," + Math.round(b) + ")";
  }
  function varyHexColor(hex, amt) {
    let n = parseInt(hex.slice(1), 16);
    let r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    if (amt >= 0) {
      r += (255 - r) * amt;
      g += (255 - g) * amt;
      b += (255 - b) * amt;
    } else {
      r *= 1 + amt;
      g *= 1 + amt;
      b *= 1 + amt;
    }
    const part = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
    return "#" + part(r) + part(g) + part(b);
  }
  function hexRgba(hex, alpha) {
    let n = parseInt(hex.slice(1), 16);
    return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + alpha + ")";
  }
  function mixHex(a, b, t) {
    let na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
    let r = Math.round((na >> 16 & 255) + ((nb >> 16 & 255) - (na >> 16 & 255)) * t);
    let g = Math.round((na >> 8 & 255) + ((nb >> 8 & 255) - (na >> 8 & 255)) * t);
    let bl = Math.round((na & 255) + ((nb & 255) - (na & 255)) * t);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }
  function traceSmooth(ctx, pts) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      let mx = (pts[i][0] + pts[i + 1][0]) / 2;
      let my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    let last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
  }
  function distanceSq(a, b) {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    return dx * dx + dy * dy;
  }
  function mulberry32(a) {
    return function() {
      a |= 0;
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // src/core/environment.js
  function createEnvironment({ config, transition, seed = 2654435769 } = {}) {
    const T = THEME.weather || { order: ["clear"], transition: 3.5, rainFade: 1, clear: { causticAlpha: 1, grade: "#000000", gradeAlpha: 0, rain: null } };
    const order = T.order;
    const presetOf = (i) => T[order[Math.max(0, Math.min(order.length - 1, i))]] || T.clear;
    const NEUTRAL_DAY = Object.freeze({ causticMul: 1, dim: 0, grade: "#ffffff", lm: 1 });
    let day = NEUTRAL_DAY;
    function setDayPhase(next) {
      if (!next) {
        day = NEUTRAL_DAY;
        return day;
      }
      day = {
        causticMul: Number.isFinite(next.causticMul) ? next.causticMul : 1,
        dim: Number.isFinite(next.dim) ? next.dim : 0,
        grade: typeof next.grade === "string" ? next.grade : "#ffffff",
        lm: Number.isFinite(next.lm) ? next.lm : 1
      };
      return day;
    }
    let index = Number(config == null ? void 0 : config.weather) || 0;
    let target = index;
    let rainAmount = presetOf(target).rain || presetOf(target).snow || presetOf(target).fog ? 1 : 0;
    let clock = 0;
    const rng = mulberry32(seed);
    const range = (a, b) => a + rng() * (b - a);
    function resolveWeather(next) {
      let i = typeof next === "string" ? order.indexOf(next) : Number(next);
      if (!Number.isFinite(i) || i < 0) i = 0;
      return Math.max(0, Math.min(order.length - 1, Math.round(i)));
    }
    function setWeather(next) {
      target = resolveWeather(next);
      return target;
    }
    function snapTo(next) {
      target = index = resolveWeather(next);
      return target;
    }
    function update(dt) {
      var _a, _b;
      if (!(dt > 0)) return;
      clock += dt;
      const trans = (_a = transition != null ? transition : T.transition) != null ? _a : 3.5;
      const step = dt / Math.max(1e-3, trans);
      if (index < target) index = Math.min(target, index + step);
      else if (index > target) index = Math.max(target, index - step);
      const wantPrecip = presetOf(target).rain || presetOf(target).snow || presetOf(target).fog ? 1 : 0;
      const rStep = dt / Math.max(1e-3, (_b = T.rainFade) != null ? _b : 1.1);
      if (rainAmount < wantPrecip) rainAmount = Math.min(wantPrecip, rainAmount + rStep);
      else if (rainAmount > wantPrecip) rainAmount = Math.max(wantPrecip, rainAmount - rStep);
    }
    function lerped() {
      const i0 = Math.floor(index), i1 = Math.min(order.length - 1, i0 + 1), f = index - i0;
      const a = presetOf(i0), b = presetOf(i1);
      return {
        causticAlpha: a.causticAlpha + (b.causticAlpha - a.causticAlpha) * f,
        grade: f <= 0 ? a.grade : mixHex(a.grade, b.grade, f),
        gradeAlpha: a.gradeAlpha + (b.gradeAlpha - a.gradeAlpha) * f,
        rain: presetOf(target).rain
      };
    }
    const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
    const rgb2hex = (a) => "#" + a.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
    function composeGrade(aw, cw, ad, cd) {
      if (aw <= 1e-3 && ad <= 1e-3) return { color: "#ffffff", alpha: 0 };
      const A = hex2rgb(cw), D = hex2rgb(cd);
      const f = [0, 1, 2].map((i) => (1 - aw + aw * A[i]) * (1 - ad + ad * D[i]));
      const a = 1 - (1 - aw) * (1 - ad);
      if (a <= 1e-3) return { color: "#ffffff", alpha: 0 };
      const c = f.map((v) => (v - (1 - a)) / a);
      return { color: rgb2hex(c), alpha: a };
    }
    function rainSpawnCount() {
      const r = presetOf(target).rain;
      if (!r || !r.streak || rainAmount <= 0) return 0;
      return Math.round((r.streak.perSec || 0) * rainAmount);
    }
    function snowSpawnCount() {
      const s = presetOf(target).snow;
      if (!s || rainAmount <= 0) return 0;
      return Math.round((s.perSec || 0) * rainAmount);
    }
    return {
      setWeather,
      snapTo,
      update,
      get name() {
        return order[Math.round(target)];
      },
      get index() {
        return index;
      },
      get targetIndex() {
        return target;
      },
      /** 目标预设里的雨坑/雨丝参数(天气玩法按它建粒子系统;非雨档为 null) */
      get rainSpec() {
        return presetOf(target).rain || null;
      },
      /** 目标预设里的雪片参数(非雪档为 null) */
      get snowSpec() {
        return presetOf(target).snow || null;
      },
      /** 目标预设里的雾参数(非雾档为 null) */
      get fogSpec() {
        return presetOf(target).fog || null;
      },
      /** 雷暴档(lightning: true)→ weather 玩法排全屏闪电 */
      get isStorm() {
        return !!presetOf(target).lightning;
      },
      /** 预设总数(定时轮动用来取模) */
      get orderLength() {
        return order.length;
      },
      get settled() {
        return Math.abs(index - target) < 1e-3;
      },
      get rainAmount() {
        return rainAmount;
      },
      setDayPhase,
      /** 光感总量 = 天气衰减 × 时段光感乘数 × 时段整层乘数(三者都是"光还剩多少",合成成一次乘法) */
      get causticAlpha() {
        return lerped().causticAlpha * day.causticMul * day.lm;
      },
      /** 天气色罩 × 时段色罩 → 精确合成一道(见 composeGrade) */
      get grade() {
        return composeGrade(lerped().gradeAlpha, lerped().grade, day.dim, day.grade);
      },
      composeGrade,
      get dayPhase() {
        return day;
      },
      rainSpawnCount,
      snowSpawnCount,
      rng,
      range,
      inspect: () => ({
        name: order[Math.round(target)],
        index,
        target,
        rainAmount,
        settled: Math.abs(index - target) < 1e-3,
        causticAlpha: lerped().causticAlpha * day.causticMul * day.lm,
        grade: composeGrade(lerped().gradeAlpha, lerped().grade, day.dim, day.grade).color,
        gradeAlpha: composeGrade(lerped().gradeAlpha, lerped().grade, day.dim, day.grade).alpha,
        weatherCausticAlpha: lerped().causticAlpha,
        day: { ...day },
        clock,
        order: [...order]
      })
    };
  }

  // src/core/feature-registry.js
  function createFeatureRegistry({ context, layers, input }) {
    const features = /* @__PURE__ */ new Map();
    function register({ id, create, enabled = true, title }) {
      if (!/^[a-zA-Z][\w-]*$/.test(String(id || ""))) throw new Error("Invalid feature id: " + id);
      if (features.has(id)) throw new Error("Duplicate feature: " + id);
      if (typeof create !== "function") throw new Error("Feature needs a create(ctx): " + id);
      const instance = create(context) || {};
      const detach = [];
      if (instance.layers) {
        for (const [layerId, draw] of Object.entries(instance.layers)) detach.push(layers.add(layerId, draw));
      }
      if (instance.interactions) {
        for (const [name, handler] of Object.entries(instance.interactions)) detach.push(input.register(name, handler));
      }
      const entry = { id, title: title || id, instance, enabled: enabled !== false, detach };
      features.set(id, entry);
      if (typeof instance.setEnabled === "function") instance.setEnabled(entry.enabled);
      return () => unregister(id);
    }
    function unregister(id) {
      var _a, _b;
      const entry = features.get(id);
      if (!entry) return false;
      entry.detach.forEach((fn) => fn());
      (_b = (_a = entry.instance).dispose) == null ? void 0 : _b.call(_a);
      features.delete(id);
      return true;
    }
    function setEnabled(id, on) {
      var _a, _b;
      const entry = features.get(id);
      if (!entry) throw new Error("Unknown feature: " + id);
      entry.enabled = !!on;
      (_b = (_a = entry.instance).setEnabled) == null ? void 0 : _b.call(_a, entry.enabled);
    }
    function get(id) {
      var _a;
      return (_a = features.get(id)) == null ? void 0 : _a.instance;
    }
    function isEnabled(id) {
      const e = features.get(id);
      if (!e) return false;
      return e.enabled;
    }
    function updater() {
      return (dt) => {
        for (const e of features.values()) {
          const active = e.enabled || e.instance.settleWhileDisabled === true;
          if (active && typeof e.instance.update === "function") e.instance.update(dt);
        }
      };
    }
    function dispose() {
      [...features.keys()].forEach(unregister);
    }
    return {
      register,
      unregister,
      setEnabled,
      get,
      isEnabled,
      updater,
      dispose,
      has: (id) => features.has(id),
      list: () => [...features.keys()],
      inspect: () => [...features.values()].map((e) => ({ id: e.id, enabled: e.enabled }))
    };
  }

  // src/pond/creature-registry.js
  function createCreatureRegistry({ types }) {
    const kinds = /* @__PURE__ */ new Map();
    function register({ id, create, title, exports = {} }) {
      if (!/^[a-z][a-z0-9-]*$/.test(String(id || ""))) throw new Error("Invalid creature kind id: " + id);
      if (kinds.has(id)) throw new Error("Duplicate creature kind: " + id);
      if (typeof create !== "function") throw new Error("Creature kind needs a create(): " + id);
      kinds.set(id, Object.freeze({ id, title: title || id, create, exports: Object.freeze({ ...exports }) }));
      return () => kinds.delete(id);
    }
    function spawn(typeId, opts = {}) {
      const type = types.get(typeId);
      const kindId = type.creature || "koi-fish";
      const kind = kinds.get(kindId);
      if (!kind) throw new Error(`Fish type "${typeId}" needs creature kind "${kindId}" \u2014 register it first`);
      const creature = kind.create(type, opts);
      if (!creature || typeof creature.update !== "function" || typeof creature.draw !== "function") {
        throw new Error(`Creature kind "${kindId}" must return an object with update(dt) and draw(ctx)`);
      }
      if (!Number.isFinite(creature.depth)) throw new Error(`Creature kind "${kindId}" must set a numeric depth`);
      if (creature.collision && typeof creature.translate !== "function") {
        throw new Error(`Creature kind "${kindId}" declares collision but has no translate(dx, dy)`);
      }
      return creature;
    }
    return {
      register,
      spawn,
      has: (id) => kinds.has(id),
      /** kind 带出来的额外导出(例如锦鲤把 Koi 类给"自定义鱼"继承用) */
      exports: (id) => {
        var _a;
        return ((_a = kinds.get(id)) == null ? void 0 : _a.exports) || {};
      },
      kindOf: (typeId) => types.get(typeId).creature || "koi-fish",
      list: () => [...kinds.keys()]
    };
  }

  // src/pond/population.js
  function createPopulation({ list, registry, config, stockTypeId = "koi", onAfterSync = () => {
  } }) {
    function spawnStock() {
      const creature = registry.spawn(stockTypeId, { origin: "stock" });
      creature.origin = "stock";
      return creature;
    }
    function syncStock() {
      const stock = list.filter((e) => e.origin === "stock");
      while (stock.length < config.fishCount) stock.push(spawnStock());
      stock.length = Math.min(stock.length, config.fishCount);
      const others = list.filter((e) => e.origin !== "stock");
      list.splice(0, list.length, ...stock, ...others);
      onAfterSync();
    }
    function spawn(typeId, opts = {}) {
      const creature = registry.spawn(typeId, { origin: opts.origin || "spawned", ...opts });
      list.push(creature);
      return creature;
    }
    function countBy(origin) {
      return list.filter((e) => e.origin === origin).length;
    }
    return { syncStock, spawn, countBy, counts: () => ({ stock: countBy("stock"), spawned: countBy("spawned"), custom: countBy("custom"), total: list.length }) };
  }

  // src/pond/shape.js
  function capsuleEnds(c) {
    const col = c && c.collision;
    if (!col || col.shape !== "capsule") return null;
    const S = c.segments;
    const end = col.end;
    if (!Array.isArray(S) || !S[0] || !S[end]) return null;
    return [S[0].x, S[0].y, S[end].x, S[end].y];
  }
  function bodyCenter(c) {
    const e = capsuleEnds(c);
    if (e) return [(e[0] + e[2]) * 0.5, (e[1] + e[3]) * 0.5];
    return [c.x, c.y];
  }

  // src/pond/collisions.js
  function segSegDist(ax, ay, bx, by, cx, cy, dx, dy) {
    const ux = bx - ax, uy = by - ay;
    const vx = dx - cx, vy = dy - cy;
    const wx = ax - cx, wy = ay - cy;
    const a = ux * ux + uy * uy, b = ux * vx + uy * vy, c = vx * vx + vy * vy;
    const d = ux * wx + uy * wy, e = vx * wx + vy * wy;
    const D = a * c - b * b;
    let sc, tc;
    if (D < 1e-9) {
      sc = 0;
      tc = c > 1e-9 ? e / c : 0;
    } else {
      sc = (b * e - c * d) / D;
      tc = (a * e - b * d) / D;
    }
    sc = Math.max(0, Math.min(1, sc));
    tc = Math.max(0, Math.min(1, tc));
    tc = c > 1e-9 ? Math.max(0, Math.min(1, (b * sc + e) / c)) : 0;
    sc = a > 1e-9 ? Math.max(0, Math.min(1, (b * tc - d) / a)) : 0;
    const px = ax + ux * sc, py = ay + uy * sc;
    const qx = cx + vx * tc, qy = cy + vy * tc;
    return { d: Math.hypot(px - qx, py - qy), nx: px - qx, ny: py - qy };
  }
  function pointSegDist(px, py, ax, ay, bx, by) {
    const ux = bx - ax, uy = by - ay;
    const L = ux * ux + uy * uy;
    let t = L > 1e-9 ? ((px - ax) * ux + (py - ay) * uy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + ux * t, qy = ay + uy * t;
    return { d: Math.hypot(px - qx, py - qy), nx: px - qx, ny: py - qy };
  }
  function createCollisions({ kois, config }) {
    const COLLIDE_RELAX = 14;
    function contact(A, B) {
      const ca = A.collision, cb = B.collision;
      if (!ca || !cb) return null;
      const ea = capsuleEnds(A), eb = capsuleEnds(B);
      if (ca.shape === "capsule" && cb.shape === "capsule") {
        if (!ea || !eb) return null;
        return segSegDist(...ea, ...eb);
      }
      if (ca.shape === "capsule" && cb.shape === "circle") {
        if (!ea) return null;
        return pointSegDist(B.x, B.y, ...ea);
      }
      if (ca.shape === "circle" && cb.shape === "capsule") {
        if (!eb) return null;
        const r = pointSegDist(A.x, A.y, ...eb);
        return { d: r.d, nx: -r.nx, ny: -r.ny };
      }
      if (ca.shape === "circle" && cb.shape === "circle") {
        return { d: Math.hypot(A.x - B.x, A.y - B.y), nx: A.x - B.x, ny: A.y - B.y };
      }
      return null;
    }
    const grid = /* @__PURE__ */ new Map();
    let nextIdx = null;
    let pairA = null, pairB = null, pairCap = 0;
    function resolveFishCollisions(dt) {
      var _a;
      if (kois.length < 2) return;
      const n = kois.length;
      let maxR = 0;
      for (let i = 0; i < n; i++) {
        const ca = kois[i].collision;
        if (ca) {
          const R = ca.r + (ca.half || 0) * 2;
          if (R > maxR) maxR = R;
        }
      }
      if (!(maxR > 0)) return;
      const cell = Math.max(48, maxR * 2);
      if (!nextIdx || nextIdx.length < n) nextIdx = new Int32Array(n);
      grid.clear();
      for (let i = 0; i < n; i++) {
        const A = kois[i];
        if (!A.collision) continue;
        const key = Math.floor(A.x / cell) * 1e5 + Math.floor(A.y / cell);
        const head = grid.get(key);
        nextIdx[i] = head === void 0 ? -1 : head;
        grid.set(key, i);
      }
      let pairCount = 0;
      for (let i = 0; i < n; i++) {
        const A = kois[i], ca = A.collision;
        if (!ca) continue;
        const ra = ca.r, halfA = ca.half || 0;
        const lookR = halfA * 2 + ra + maxR;
        const gx0 = Math.floor((A.x - lookR) / cell), gx1 = Math.floor((A.x + lookR) / cell);
        const gy0 = Math.floor((A.y - lookR) / cell), gy1 = Math.floor((A.y + lookR) / cell);
        for (let gx = gx0; gx <= gx1; gx++) {
          for (let gy = gy0; gy <= gy1; gy++) {
            for (let j = (_a = grid.get(gx * 1e5 + gy)) != null ? _a : -1; j !== -1; j = nextIdx[j]) {
              if (j <= i || !kois[j].collision) continue;
              const B = kois[j], cb = B.collision;
              const reach = (halfA + (cb.half || 0)) * 2 + ra + cb.r;
              const hx = A.x - B.x, hy = A.y - B.y;
              if (hx * hx + hy * hy > reach * reach) continue;
              if (pairCount === pairCap) {
                const cap2 = Math.max(256, pairCap * 2);
                const a2 = new Int32Array(cap2), b2 = new Int32Array(cap2);
                if (pairCount) {
                  a2.set(pairA);
                  b2.set(pairB);
                }
                pairA = a2;
                pairB = b2;
                pairCap = cap2;
              }
              pairA[pairCount] = i;
              pairB[pairCount] = j;
              pairCount++;
            }
          }
        }
      }
      if (!pairCount) return;
      const relax = Math.min(1, 1 - Math.exp(-COLLIDE_RELAX * dt));
      for (let iter = 0; iter < 8; iter++) {
        for (let p = 0; p < pairCount; p++) {
          const A = kois[pairA[p]], B = kois[pairB[p]];
          const ca = A.collision, cb = B.collision;
          if (!ca || !cb) continue;
          const ra = ca.r;
          const res = contact(A, B);
          if (!res) continue;
          let dMin = res.d, nx, ny;
          if (dMin > 1e-4) {
            nx = res.nx / dMin;
            ny = res.ny / dMin;
          } else {
            const [ax, ay] = bodyCenter(A);
            const [bx, by] = bodyCenter(B);
            let ex = ax - bx, ey = ay - by;
            let el = Math.hypot(ex, ey);
            if (el < 1e-4) {
              ex = -Math.sin(A.heading || 0);
              ey = Math.cos(A.heading || 0);
              el = 1;
            }
            nx = ex / el;
            ny = ey / el;
            dMin = 0;
          }
          const overlap = ra + cb.r - dMin;
          if (overlap <= 0) continue;
          const corr = overlap * relax;
          const mA = A.sizeMul, mB = B.sizeMul, ms = mA + mB;
          const wA = mB / ms, wB = mA / ms;
          A.translate(nx * corr * wA, ny * corr * wA);
          B.translate(-nx * corr * wB, -ny * corr * wB);
        }
      }
    }
    return { resolveFishCollisions };
  }

  // src/pond/food.js
  function createFood({ rng }) {
    const R = rng || Math.random;
    const PELLET_SPRITES = [];
    (function buildPelletSprites() {
      const S = 32;
      for (let v = 0; v < 5; v++) {
        const c = document.createElement("canvas");
        c.width = c.height = S;
        const g = c.getContext("2d");
        const pad = 5.5 + R() * 3.5;
        const jit = () => (R() - 0.5) * 7;
        const pts = [
          [pad + jit(), pad + jit()],
          [S - pad + jit(), pad + jit()],
          [S - pad + jit(), S - pad + jit()],
          [pad + jit(), S - pad + jit()]
        ];
        const grd = g.createLinearGradient(0, 0, S, S);
        grd.addColorStop(0, "#cfb089");
        grd.addColorStop(0.55, "#b8946a");
        grd.addColorStop(1, "#9c7952");
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < 4; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.closePath();
        g.fillStyle = grd;
        g.fill();
        g.lineJoin = "round";
        g.lineWidth = 3.4;
        g.strokeStyle = grd;
        g.stroke();
        g.beginPath();
        g.ellipse(S * 0.38, S * 0.33, S * 0.13, S * 0.085, -0.5, 0, Math.PI * 2);
        g.fillStyle = "rgba(244,232,212,0.45)";
        g.fill();
        PELLET_SPRITES.push(c);
      }
    })();
    class Food {
      constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 1.9 + R() * 1.4;
        this.sprite = PELLET_SPRITES[R() * PELLET_SPRITES.length | 0];
        this.spin = R() * Math.PI * 2;
        this.life = 1e3;
        this.pop = 1;
        this.sink = 0;
        this.sinkRate = 0.1 + R() * 0.08;
        const a = R() * Math.PI * 2;
        this.dvx = Math.cos(a) * (0.1 + R() * 0.18);
        this.dvy = Math.sin(a) * (0.06 + R() * 0.12);
        this.swirl = R() * Math.PI * 2;
      }
      update(dt) {
        let dtMult = dt * 60;
        this.life -= 1 * dtMult;
        if (this.pop > 0) this.pop = Math.max(0, this.pop - dt * 4.5);
        if (this.sink < 1) {
          this.sink = Math.min(1, this.sink + dt * this.sinkRate);
          this.swirl += dt * 0.6;
          this.x += (this.dvx + Math.cos(this.swirl) * 0.06) * dtMult;
          this.y += (this.dvy + Math.sin(this.swirl * 0.8) * 0.05) * dtMult;
        }
      }
      draw(ctx) {
        let fade = this.life < 90 ? Math.max(0, this.life / 90) : 1;
        let deep = this.sink;
        let d = this.radius * 2 * (1 + this.pop * 0.55) * (0.55 + 0.45 * fade) * (1 - deep * 0.3);
        ctx.save();
        ctx.globalAlpha = fade * (1 - deep * 0.55);
        ctx.translate(this.x, this.y);
        ctx.rotate(this.spin);
        ctx.drawImage(this.sprite, -d / 2, -d / 2, d, d);
        ctx.restore();
      }
    }
    return { Food };
  }

  // src/pond/simulation.js
  function createSimulation({ kois, foods, schoolSystem, resolveFishCollisions, extraUpdate = () => {
  } }) {
    return { update(dt) {
      schoolSystem.updateSchools(dt);
      for (let i = foods.length - 1; i >= 0; i--) {
        foods[i].update(dt);
        if (foods[i].life <= 0) foods.splice(i, 1);
      }
      for (const entity of kois) entity.update(dt);
      extraUpdate(dt);
      resolveFishCollisions(dt);
    } };
  }

  // src/render/fish-skin.js
  function noseColorOf(img) {
    try {
      const c = document.createElement("canvas");
      c.width = 6;
      c.height = 24;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0, 6, img.naturalHeight, 0, 0, 6, 24);
      const d = x.getImageData(0, 0, 6, 24).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 40) continue;
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
        n++;
      }
      if (!n) return "#ffffff";
      return "rgb(" + Math.round(r / n) + "," + Math.round(g / n) + "," + Math.round(b / n) + ")";
    } catch (e) {
      return "#ffffff";
    }
  }
  var NRM_CAP = 201;
  var nrmPX = new Float64Array(NRM_CAP);
  var nrmPY = new Float64Array(NRM_CAP);
  var nrmSX = new Float64Array(NRM_CAP);
  var nrmSY = new Float64Array(NRM_CAP);
  var nrmNX = new Float64Array(NRM_CAP);
  var nrmNY = new Float64Array(NRM_CAP);
  function buildSmoothNormals(at, N, win) {
    const shared = N + 1 <= NRM_CAP;
    const px = shared ? nrmPX : new Float64Array(N + 1);
    const py = shared ? nrmPY : new Float64Array(N + 1);
    const sx = shared ? nrmSX : new Float64Array(N + 1);
    const sy = shared ? nrmSY : new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const p = at(i / N);
      px[i] = p.x;
      py[i] = p.y;
    }
    for (let i = 0; i <= N; i++) {
      let ax = 0, ay = 0, c = 0;
      for (let k = -win; k <= win; k++) {
        const j = i + k < 0 ? 0 : i + k > N ? N : i + k;
        ax += px[j];
        ay += py[j];
        c++;
      }
      sx[i] = ax / c;
      sy[i] = ay / c;
    }
    const nx = shared ? nrmNX : new Float64Array(N + 1);
    const ny = shared ? nrmNY : new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const a = i - 2 < 0 ? 0 : i - 2, b = i + 2 > N ? N : i + 2;
      const dx = sx[b] - sx[a], dy = sy[b] - sy[a];
      const m = Math.hypot(dx, dy) || 1;
      nx[i] = -dy / m;
      ny[i] = dx / m;
    }
    return function(u) {
      const f = u <= 0 ? 0 : u >= 1 ? N : u * N;
      const i = Math.floor(f), t = f - i, j = i + 1 > N ? N : i + 1;
      return { nx: nx[i] + (nx[j] - nx[i]) * t, ny: ny[i] + (ny[j] - ny[i]) * t };
    };
  }
  function drawSkinOnBody(ctx, at, BS, W, maxHalf, img, nose, noseW, capDepth) {
    const TW = img.naturalWidth, TH = img.naturalHeight;
    const K = 40;
    const OVER_MIN_PX = 1.4, OVER_MAX_T = 8;
    const nrm = buildSmoothNormals(at, 200, 6);
    if (nose) {
      const XCAP = Math.min(TW, 14), NC = 4;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(nose.x - nose.nx * noseW, nose.y - nose.ny * noseW);
      for (let j = 1; j <= 5; j++) {
        const a = -Math.PI / 2 + Math.PI * (j / 6);
        ctx.lineTo(
          nose.x + nose.nx * Math.sin(a) * noseW - nose.tx * Math.cos(a) * capDepth,
          nose.y + nose.ny * Math.sin(a) * noseW - nose.ty * Math.cos(a) * capDepth
        );
      }
      ctx.closePath();
      ctx.clip();
      for (let i2 = 0; i2 < NC; i2++) {
        const r0 = i2 / NC, r1 = (i2 + 1) / NC;
        const x0 = XCAP * r0, x1 = XCAP * r1;
        const f0 = 1 - r0, f1 = 1 - r1;
        const Ax = nose.x - nose.nx * noseW - nose.tx * f0 * capDepth, Ay = nose.y - nose.ny * noseW - nose.ty * f0 * capDepth;
        const Bx = nose.x - nose.nx * noseW - nose.tx * f1 * capDepth, By = nose.y - nose.ny * noseW - nose.ty * f1 * capDepth;
        const Cx = nose.x + nose.nx * noseW - nose.tx * f0 * capDepth, Cy = nose.y + nose.ny * noseW - nose.ty * f0 * capDepth;
        const yA = 0, yC = TH;
        const ax = (Bx - Ax) / (x1 - x0), ay = (By - Ay) / (x1 - x0);
        const bx = (Cx - Ax) / (yC - yA), by = (Cy - Ay) / (yC - yA);
        const ox = Ax - ax * x0 - bx * yA, oy = Ay - ay * x0 - by * yA;
        ctx.save();
        ctx.transform(ax, ay, bx, by, ox, oy);
        ctx.drawImage(img, x0, 0, x1 - x0, TH, x0, 0, x1 - x0, TH);
        ctx.restore();
      }
      ctx.restore();
    }
    for (let i = 0; i < K; i++) {
      const u0 = i / K, u1 = (i + 1) / K;
      const bw0 = KOI_SHAPE.bwAtU(u0), bw1 = KOI_SHAPE.bwAtU(u1);
      const p0 = at(bw0 * BS), p1 = at(bw1 * BS);
      const n0 = nrm(bw0 * BS), n1 = nrm(bw1 * BS);
      const w0 = W(bw0) * maxHalf, w1 = W(bw1) * maxHalf;
      let mnx = n0.nx + n1.nx, mny = n0.ny + n1.ny;
      const mn = Math.hypot(mnx, mny) || 1;
      mnx /= mn;
      mny /= mn;
      const wm = w0 > w1 ? w0 : w1;
      const Ax = p0.x - mnx * wm, Ay = p0.y - mny * wm;
      const Bx = p1.x - mnx * wm, By = p1.y - mny * wm;
      const Cx = p0.x + mnx * wm, Cy = p0.y + mny * wm;
      const xA = u0 * TW, xB = u1 * TW, yA = 0, yC = TH;
      const ax = (Bx - Ax) / (xB - xA), ay = (By - Ay) / (xB - xA);
      const bx = (Cx - Ax) / (yC - yA), by = (Cy - Ay) / (yC - yA);
      const ox = Ax - ax * xA - bx * yA, oy = Ay - ay * xA - by * yA;
      ctx.save();
      ctx.transform(ax, ay, bx, by, ox, oy);
      const ov = Math.min(OVER_MAX_T, OVER_MIN_PX / Math.max(0.05, Math.abs(ax)));
      const sx0 = Math.max(0, xA - ov), sx1 = Math.min(TW, xB + ov);
      if (sx1 > sx0) ctx.drawImage(img, sx0, 0, sx1 - sx0, TH, sx0, 0, sx1 - sx0, TH);
      ctx.restore();
    }
  }

  // src/render/fish-renderer.js
  var lx = () => THEME.light.dir[0];
  var ly = () => THEME.light.dir[1];
  var WATER_TINT = THEME.water.tint;
  var koiWidth = KOI_SHAPE.koiWidth;
  var traceClosedSmooth = KOI_SHAPE.traceClosedSmooth;
  function createFishRenderer({ config }) {
    const FISH_SCALES = false;
    function drawFish(ctx) {
      let dropAlpha = 1;
      if (this.drop) {
        const p = Math.min(1, this.drop.t / this.drop.dur);
        const sink = 1 - p * (2 - p);
        const c = this.segments[0];
        const sc = 1 + 0.85 * sink;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.scale(sc, sc);
        ctx.translate(-c.x, -c.y);
        dropAlpha = 0.3 + 0.7 * (1 - sink);
      } else {
        dropAlpha = 1;
      }
      let fs = config.fishSize * this.sizeMul;
      ctx.globalAlpha = (0.62 + this.depth * 0.38) * dropAlpha;
      let segs = this.segments;
      if (this.waveEnv > 0) {
        const NL = this.numSegments - 1;
        segs = new Array(this.numSegments);
        for (let i = 0; i < this.numSegments; i++) {
          segs[i] = { x: this.segments[i].x, y: this.segments[i].y };
        }
        const wnx = [], wny = [];
        for (let i = 1; i < this.numSegments; i++) {
          const dx = this.segments[i].x - this.segments[i - 1].x;
          const dy = this.segments[i].y - this.segments[i - 1].y;
          const d = Math.hypot(dx, dy) || 1;
          wnx[i] = -dy / d;
          wny[i] = dx / d;
        }
        for (let i = 1; i < this.numSegments; i++) {
          const u = i / NL;
          const off2 = Math.sin(this.swimCycle * this.waveFreq - u * this.waveLen) * this.waveEnv * u * u;
          segs[i].x += wnx[i] * off2;
          segs[i].y += wny[i] * off2;
        }
      }
      let cum = [0], total = 0;
      for (let i = 1; i < segs.length; i++) {
        total += Math.hypot(segs[i].x - segs[i - 1].x, segs[i].y - segs[i - 1].y);
        cum.push(total);
      }
      if (total < 2) total = 2;
      const BODY_SPAN = 0.78 * (this.shape ? this.shape.bodyLen : 1);
      function at(u) {
        let d = u * total, i = 1;
        while (i < cum.length - 1 && cum[i] < d) i++;
        let segLen = Math.max(1e-4, cum[i] - cum[i - 1]);
        let t = (d - cum[i - 1]) / segLen;
        let a = segs[i - 1], b = segs[i];
        let tx = b.x - a.x, ty = b.y - a.y, m = Math.hypot(tx, ty) || 1;
        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          tx: tx / m,
          ty: ty / m,
          nx: -ty / m,
          ny: tx / m
        };
      }
      const W = this.shape ? ((bw) => KOI_SHAPE.shapeWidth(bw, this.shape)) : KOI_SHAPE.koiWidth;
      let maxHalf = total * 0.78 * 0.168 * (this.shape ? this.shape.bodyH : 1);
      let N = 32, pts = [];
      const FRONT = 0.045;
      let nose = at(FRONT * BODY_SPAN);
      let noseW = W(FRONT) * maxHalf;
      let capDepth = noseW * 0.95;
      for (let i = 0; i <= N; i++) {
        let bw = FRONT + (1 - FRONT) * (i / N);
        let p = at(bw * BODY_SPAN), w = W(bw) * maxHalf;
        pts.push([p.x + p.nx * w, p.y + p.ny * w]);
      }
      for (let i = N; i >= 0; i--) {
        let bw = FRONT + (1 - FRONT) * (i / N);
        let p = at(bw * BODY_SPAN), w = W(bw) * maxHalf;
        pts.push([p.x - p.nx * w, p.y - p.ny * w]);
      }
      for (let j = 1; j <= 5; j++) {
        let a = -Math.PI / 2 + Math.PI * (j / 6);
        let lat = Math.sin(a) * noseW;
        let fwd = Math.cos(a) * capDepth;
        pts.push([
          nose.x + nose.nx * lat - nose.tx * fwd,
          nose.y + nose.ny * lat - nose.ty * fwd
        ]);
      }
      const bodyPath = new Path2D();
      traceClosedSmooth(bodyPath, pts);
      let deep = 1 - this.depth;
      let off = maxHalf * (0.75 + (1 - deep) * 1.35);
      let shX = -lx() * off, shY = -ly() * off;
      if (this._cc !== this.color || this._cd !== this.depth) {
        this._cc = this.color;
        this._cd = this.depth;
        const sb = 0.24 * (0.78 + 0.22 * this.depth);
        const SH = THEME.fish.shadow;
        this._shStyles = [
          SH + (sb * 0.9).toFixed(3) + ")",
          SH + (sb * 0.56).toFixed(3) + ")",
          SH + (sb * 0.28).toFixed(3) + ")",
          SH + (sb * 0.34).toFixed(3) + ")"
        ];
        this._finFill = hexRgba(varyHexColor(this.color, 0.55), 0.3);
        this._finLine = hexRgba(varyHexColor(this.color, 0.68), 0.24);
        this._tailFill = hexRgba(varyHexColor(this.color, 0.58), 0.5);
        this._tailLine = hexRgba(varyHexColor(this.color, 0.72), 0.38);
      }
      ctx.save();
      ctx.translate(shX, shY);
      ctx.lineJoin = "round";
      {
        const NSH = 11;
        const PX = [], PY = [], PNX = [], PNY = [], PW = [];
        for (let k = 0; k <= NSH; k++) {
          const bw = FRONT + (1 - FRONT) * (k / NSH);
          const p = at(bw * BODY_SPAN);
          PX.push(p.x);
          PY.push(p.y);
          PNX.push(p.nx);
          PNY.push(p.ny);
          PW.push(W(bw) * maxHalf);
        }
        const noseS = at(FRONT * BODY_SPAN);
        const noseW0 = W(FRONT) * maxHalf;
        const PADS = [0.8, 4.2, 7.6];
        for (let s2 = 0; s2 < 3; s2++) {
          const pad = PADS[s2] * (1.15 - deep * 0.28);
          ctx.beginPath();
          for (let k = 0; k <= NSH; k++) {
            const w = PW[k] + pad;
            const x = PX[k] - PNX[k] * w, y = PY[k] - PNY[k] * w;
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          for (let k = NSH; k >= 0; k--) {
            const w = PW[k] + pad;
            ctx.lineTo(PX[k] + PNX[k] * w, PY[k] + PNY[k] * w);
          }
          const nw = noseW0 + pad;
          const cd = nw * 0.95;
          for (let j = 1; j <= 5; j++) {
            const a2 = Math.PI / 2 - Math.PI * (j / 6);
            ctx.lineTo(
              noseS.x + noseS.nx * Math.sin(a2) * nw - noseS.tx * Math.cos(a2) * cd,
              noseS.y + noseS.ny * Math.sin(a2) * nw - noseS.ty * Math.cos(a2) * cd
            );
          }
          ctx.closePath();
          ctx.fillStyle = this._shStyles[s2];
          ctx.fill();
        }
        const tp2 = at(BODY_SPAN);
        const pedW2 = W(1) * maxHalf;
        ctx.beginPath();
        ctx.moveTo(tp2.x - tp2.nx * pedW2, tp2.y - tp2.ny * pedW2);
        ctx.lineTo(
          tp2.x + tp2.tx * maxHalf * 1.35 - tp2.nx * pedW2 * 1.5,
          tp2.y + tp2.ty * maxHalf * 1.35 - tp2.ny * pedW2 * 1.5
        );
        ctx.lineTo(
          tp2.x + tp2.tx * maxHalf * 1.35 + tp2.nx * pedW2 * 1.5,
          tp2.y + tp2.ty * maxHalf * 1.35 + tp2.ny * pedW2 * 1.5
        );
        ctx.closePath();
        ctx.fillStyle = this._shStyles[3];
        ctx.fill();
      }
      ctx.restore();
      let lit = at(0.44 * BODY_SPAN);
      let gw = maxHalf * 1.15;
      let con = 0.45 + 0.55 * this.depth;
      if (this.skinReady && this.skin && this.skin.naturalWidth) {
        ctx.save();
        ctx.clip(bodyPath);
        const keepA = ctx.globalAlpha;
        ctx.globalAlpha = 1;
        ctx.fillStyle = this.noseColor || "#ffffff";
        ctx.fill(bodyPath);
        drawSkinOnBody(ctx, at, BODY_SPAN, W, maxHalf, this.skin, nose, noseW, capDepth);
        ctx.globalAlpha = keepA;
        ctx.restore();
        let lg = ctx.createLinearGradient(
          lit.x + lx() * gw,
          lit.y + ly() * gw,
          lit.x - lx() * gw,
          lit.y - ly() * gw
        );
        lg.addColorStop(0, "rgba(255,253,240," + (0.3 * con).toFixed(3) + ")");
        lg.addColorStop(0.42, "rgba(255,253,240,0)");
        lg.addColorStop(0.8, "rgba(10,30,28," + (0.16 * con).toFixed(3) + ")");
        lg.addColorStop(1, "rgba(10,30,28," + (0.3 * con).toFixed(3) + ")");
        ctx.fillStyle = lg;
        ctx.fill(bodyPath);
        ctx.globalAlpha = (1 - this.depth) * 0.34;
        ctx.fillStyle = WATER_TINT;
        ctx.fill(bodyPath);
        ctx.globalAlpha = 1;
      } else {
        let ab = mixHex(this.color, WATER_TINT, (1 - this.depth) * 0.52);
        let bodyGrad = ctx.createLinearGradient(
          lit.x + lx() * gw,
          lit.y + ly() * gw,
          lit.x - lx() * gw,
          lit.y - ly() * gw
        );
        bodyGrad.addColorStop(0, shadeColor(ab, 0.34 * con));
        bodyGrad.addColorStop(0.4, ab);
        bodyGrad.addColorStop(0.78, shadeColor(ab, -0.14 * con));
        bodyGrad.addColorStop(1, shadeColor(ab, -0.3 * con));
        ctx.fillStyle = bodyGrad;
        ctx.fill(bodyPath);
      }
      ctx.save();
      ctx.clip(bodyPath);
      ctx.strokeStyle = THEME.fish.outline;
      ctx.lineWidth = maxHalf * 0.22;
      ctx.stroke(bodyPath);
      for (let k = 0; k < this.spotRanges.length; k++) {
        let rg = this.spotRanges[k];
        let u0 = rg[0], u1 = rg[1], mid = (u0 + u1) * 0.5;
        let steps = 18, left = [], right = [];
        for (let i = 0; i <= steps; i++) {
          let u = u0 + (u1 - u0) * (i / steps);
          let p = at(u), local = W(u / BODY_SPAN) * maxHalf;
          let taper = 0.5 + 0.5 * Math.sin(Math.PI * i / steps);
          let wobble = 0.9 + 0.1 * Math.sin(i * 0.85 + k * 1.9);
          let half = local * Math.min(0.72, rg[3] || 0.5) * taper * wobble;
          let off2 = Math.sin(i * 0.34 + k * 2.4) * local * 0.13;
          let a1 = Math.max(-local * 0.94, Math.min(local * 0.94, off2 + half));
          let a2 = Math.max(-local * 0.94, Math.min(local * 0.94, off2 - half));
          left.push([p.x + p.nx * a1, p.y + p.ny * a1]);
          right.push([p.x + p.nx * a2, p.y + p.ny * a2]);
        }
        let spotPts = left.concat(right.slice().reverse());
        ctx.beginPath();
        traceSmooth(ctx, spotPts);
        ctx.closePath();
        ctx.fillStyle = rg[2];
        ctx.fill();
        let mp = at(mid);
        ctx.beginPath();
        ctx.arc(mp.x - mp.nx * maxHalf * 0.16, mp.y - mp.ny * maxHalf * 0.16, maxHalf * 0.23, 0, Math.PI * 2);
        ctx.fillStyle = THEME.fish.spotHi;
        ctx.fill();
      }
      const SCALE_MIN_HALF = 14;
      if (FISH_SCALES && this.net > 0.012 && maxHalf >= SCALE_MIN_HALF) {
        const ROWS = 13;
        const rowGap = BODY_SPAN / (ROWS + 1) * total;
        ctx.lineWidth = Math.max(0.4, maxHalf * 0.03);
        for (let ci = 1; ci <= ROWS; ci++) {
          const fr = ci / (ROWS + 1);
          const p = at(fr * BODY_SPAN), wv = W(fr) * maxHalf;
          if (wv < 1.5) continue;
          const m = Math.max(3, Math.round(wv / (maxHalf * 0.24)));
          const stagger = ci % 2 ? 0.5 : 0;
          const headTail = Math.min(1, Math.min(ci, ROWS + 1 - ci) / 2.5);
          for (let sgn = -1; sgn <= 1; sgn += 2) {
            for (let j = 0; j < m; j++) {
              const f0 = (j + stagger) / m, f1 = (j + 1 + stagger) / m;
              if (f1 > 1.06) continue;
              const fm = (f0 + f1) * 0.5;
              const ax = p.x + p.nx * wv * f0 * sgn, ay = p.y + p.ny * wv * f0 * sgn;
              const bx = p.x + p.nx * wv * f1 * sgn, by = p.y + p.ny * wv * f1 * sgn;
              const qx = p.x + p.nx * wv * fm * sgn - p.tx * rowGap * 0.38;
              const qy = p.y + p.ny * wv * fm * sgn - p.ty * rowGap * 0.38;
              const rel = ((ax + bx) * 0.5 - p.x) * lx() + ((ay + by) * 0.5 - p.y) * ly();
              const lit2 = Math.max(0, Math.min(1, 0.5 + rel / Math.max(1, wv) * 1.1));
              const a = this.net * headTail * (1 - fm * 0.55) * (0.25 + 0.95 * lit2) * (0.4 + 0.6 * this.depth);
              if (a < 8e-3) continue;
              ctx.strokeStyle = "rgba(" + (lit2 > 0.5 ? "255,252,244," : "58,48,36,") + (lit2 > 0.5 ? a : a * 0.9).toFixed(3) + ")";
              ctx.beginPath();
              ctx.moveTo(ax, ay);
              ctx.quadraticCurveTo(qx, qy, bx, by);
              ctx.stroke();
            }
          }
        }
      }
      if (this.sheen > 0.012) {
        ctx.beginPath();
        for (let i2 = 0; i2 <= 22; i2++) {
          let u = i2 / 22 * BODY_SPAN;
          let p = at(u), wv = W(i2 / 22) * maxHalf;
          let px = p.x + p.nx * wv * 0.3, py = p.y + p.ny * wv * 0.3;
          if (i2 === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        let s0 = at(0.06 * BODY_SPAN), s1 = at(0.94 * BODY_SPAN);
        let sg = ctx.createLinearGradient(s0.x, s0.y, s1.x, s1.y);
        sg.addColorStop(0, THEME.fish.sheen + "0)");
        sg.addColorStop(0.3, THEME.fish.sheen + (this.sheen * 0.8).toFixed(3) + ")");
        sg.addColorStop(0.64, THEME.fish.sheen + (this.sheen * 0.92).toFixed(3) + ")");
        sg.addColorStop(1, THEME.fish.sheen + "0)");
        ctx.strokeStyle = sg;
        ctx.lineWidth = maxHalf * 0.24;
        ctx.lineCap = "round";
        ctx.stroke();
      }
      if (this.edge) {
        ctx.beginPath();
        for (let i2 = 0; i2 <= 20; i2++) {
          let u = i2 / 20 * BODY_SPAN;
          let p = at(u), wv = W(i2 / 20) * maxHalf;
          let px = p.x - p.nx * wv * 0.86, py = p.y - p.ny * wv * 0.86;
          if (i2 === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = this.edge;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = maxHalf * 0.2;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (this.kuchi) {
        let kp = at(FRONT * 0.75);
        let kw = W(FRONT) * maxHalf;
        ctx.beginPath();
        ctx.ellipse(
          kp.x - kp.tx * kw * 0.62,
          kp.y - kp.ty * kw * 0.62,
          maxHalf * 0.3,
          maxHalf * 0.19,
          Math.atan2(kp.ty, kp.tx),
          0,
          Math.PI * 2
        );
        ctx.fillStyle = this.kuchi;
        ctx.fill();
      }
      ctx.restore();
      const P0 = KOI_SHAPE.PECTORAL;
      let pf = at(P0.bw * BODY_SPAN);
      let pfW = W(P0.bw) * maxHalf;
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        let bx = pf.x + pf.nx * pfW * P0.lat * sgn;
        let by = pf.y + pf.ny * pfW * P0.lat * sgn;
        const P = KOI_SHAPE.PECTORAL;
        let ang = Math.atan2(pf.ty, pf.tx) + sgn * P.spread + Math.sin(this.swimCycle * P.flapFreq) * P.flapAmp;
        let fl = KOI_SHAPE.pectoralFinLen(maxHalf, this.shape);
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(ang);
        KOI_SHAPE.pectoralFinPath(ctx, fl);
        ctx.fillStyle = this._finFill;
        ctx.fill();
        ctx.strokeStyle = this._finLine;
        ctx.lineWidth = 0.9;
        ctx.stroke();
        ctx.restore();
      }
      let tp = at(BODY_SPAN);
      let pedW = W(1) * maxHalf;
      let tAng = Math.atan2(tp.ty, tp.tx) + Math.sin(this.swimCycle * this.waveFreq - this.waveLen) * KOI_SHAPE.TAIL.anglePhase;
      let tl = KOI_SHAPE.tailFinLen(maxHalf, this.shape);
      ctx.save();
      ctx.translate(tp.x, tp.y);
      ctx.rotate(tAng);
      KOI_SHAPE.tailFinPath(ctx, tl, pedW);
      ctx.fillStyle = this._tailFill;
      ctx.fill();
      ctx.strokeStyle = this._tailLine;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = THEME.fish.finEdge;
      ctx.lineWidth = 0.8;
      for (let i2 = -3; i2 <= 3; i2++) {
        if (i2 === 0) continue;
        let a2 = i2 / 3 * 0.34;
        ctx.beginPath();
        ctx.moveTo(tl * 0.08, 0);
        ctx.quadraticCurveTo(
          tl * 0.55,
          tl * Math.sin(a2) * 0.2,
          tl * 0.84 * Math.cos(a2),
          tl * 0.84 * Math.sin(a2) * 0.58
        );
        ctx.stroke();
      }
      ctx.restore();
      const E = KOI_SHAPE.EYE;
      let ep = at(E.bw * BODY_SPAN);
      let ew = W(E.bw) * maxHalf;
      let er = KOI_SHAPE.eyeRadius(maxHalf, this.shape);
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        let ex = ep.x + ep.nx * ew * E.lat * sgn;
        let ey = ep.y + ep.ny * ew * E.lat * sgn;
        ctx.beginPath();
        ctx.arc(ex, ey, er, 0, Math.PI * 2);
        ctx.fillStyle = THEME.fish.eye;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex + er * E.hiOff, ey + er * E.hiOff, er * E.hi, 0, Math.PI * 2);
        ctx.fillStyle = THEME.fish.eyeHi;
        ctx.fill();
      }
      ctx.globalAlpha = (1 - this.depth) * 0.1;
      ctx.fillStyle = WATER_TINT;
      ctx.fill(bodyPath);
      ctx.globalAlpha = 1;
      if (this.drop) ctx.restore();
    }
    return { drawFish };
  }

  // src/render/background.js
  function createBackground({ viewport, invalidate }) {
    const pondBackground = new Image();
    let pondBackgroundReady = false;
    pondBackground.onload = () => {
      pondBackgroundReady = true;
      invalidate();
    };
    pondBackground.src = "assets/pond-background-v7.webp";
    function drawLilyPad(g, x, y, r, rot, pal) {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      function padPath(scale, sx, sy) {
        g.beginPath();
        let segs = 52;
        for (let i = 0; i <= segs; i++) {
          let a = i / segs * Math.PI * 2;
          let notch = Math.abs((a + Math.PI) % (Math.PI * 2) - Math.PI);
          let rr = r * scale;
          if (notch < 0.44) rr *= 0.26 + 0.74 * (notch / 0.44);
          rr *= 1 + 0.035 * Math.sin(a * 7 + rot * 3);
          let px = Math.cos(a) * rr + sx, py = Math.sin(a) * rr * 0.95 + sy;
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
      }
      padPath(1.02, r * 0.05, r * 0.08);
      g.fillStyle = "rgba(39,72,50,0.17)";
      g.fill();
      padPath(1, 0, 0);
      let lg = g.createRadialGradient(-r * 0.28, -r * 0.32, r * 0.08, 0, 0, r * 1.06);
      lg.addColorStop(0, pal[0]);
      lg.addColorStop(0.62, pal[1]);
      lg.addColorStop(1, pal[2]);
      g.fillStyle = lg;
      g.fill();
      g.strokeStyle = pal[3];
      g.globalAlpha = 0.42;
      g.lineWidth = Math.max(0.8, r * 0.014);
      for (let v = 0; v < 11; v++) {
        let va = v / 15 * Math.PI * 2 + 0.22;
        let n2 = Math.abs((va + Math.PI) % (Math.PI * 2) - Math.PI);
        if (n2 < 0.52) continue;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(Math.cos(va) * r * 0.9, Math.sin(va) * r * 0.86);
        g.stroke();
      }
      padPath(1, 0, 0);
      g.strokeStyle = pal[4];
      g.globalAlpha = 0.38;
      g.lineWidth = Math.max(0.8, r * 0.017);
      g.stroke();
      g.beginPath();
      g.ellipse(-r * 0.28, -r * 0.32, r * 0.24, r * 0.13, -0.62, 0, Math.PI * 2);
      g.fillStyle = "rgba(255,255,255,0.12)";
      g.fill();
      g.restore();
    }
    function drawLotus(g, x, y, r, rot) {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      for (let ring = 0; ring < 3; ring++) {
        let n = ring === 0 ? 8 : ring === 1 ? 6 : 5;
        let rr = r * (ring === 0 ? 1 : ring === 1 ? 0.66 : 0.37);
        for (let i = 0; i < n; i++) {
          let a = i / n * Math.PI * 2 + ring * 0.42;
          g.save();
          g.rotate(a);
          g.beginPath();
          g.ellipse(rr * 0.6, 0, rr * 0.56, rr * 0.21, 0, 0, Math.PI * 2);
          g.fillStyle = ring === 0 ? "rgba(203,112,139,0.76)" : ring === 1 ? "rgba(235,159,177,0.82)" : "rgba(249,190,201,0.88)";
          g.fill();
          g.restore();
        }
      }
      g.beginPath();
      g.arc(0, 0, r * 0.23, 0, Math.PI * 2);
      g.fillStyle = "#e6c66a";
      g.fill();
      g.beginPath();
      g.arc(-r * 0.06, -r * 0.06, r * 0.11, 0, Math.PI * 2);
      g.fillStyle = "rgba(255,255,255,0.38)";
      g.fill();
      g.restore();
    }
    function drawPondBackground(g, w, h) {
      let scale = Math.max(w / pondBackground.naturalWidth, h / pondBackground.naturalHeight);
      let sourceW = w / scale, sourceH = h / scale;
      let sourceX = (pondBackground.naturalWidth - sourceW) * 0.5;
      let sourceY = (pondBackground.naturalHeight - sourceH) * 0.5;
      g.drawImage(pondBackground, sourceX, sourceY, sourceW, sourceH, 0, 0, w, h);
      let waterVeil = g.createLinearGradient(0, 0, w, h);
      waterVeil.addColorStop(0, "rgba(22,82,79,0.08)");
      waterVeil.addColorStop(1, "rgba(10,57,57,0.13)");
      g.fillStyle = waterVeil;
      g.fillRect(0, 0, w, h);
    }
    function buildPond(w, h) {
      let c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      let g = c.getContext("2d");
      let R = mulberry32(20260924);
      if (pondBackgroundReady) {
        drawPondBackground(g, w, h);
        return c;
      }
      let water = g.createLinearGradient(0, 0, w * 0.4, h);
      water.addColorStop(0, "#2a8073");
      water.addColorStop(0.35, "#1e7a6f");
      water.addColorStop(0.72, "#106b64");
      water.addColorStop(1, "#0d5c58");
      g.fillStyle = water;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 5; i++) {
        let dx = R() * w, dy = R() * h, dr = 130 + R() * 260;
        let dg = g.createRadialGradient(dx, dy, 0, dx, dy, dr);
        dg.addColorStop(0, "rgba(76,116,96,0.22)");
        dg.addColorStop(0.6, "rgba(88,124,104,0.09)");
        dg.addColorStop(1, "rgba(90,126,98,0)");
        g.fillStyle = dg;
        g.fillRect(dx - dr, dy - dr, dr * 2, dr * 2);
      }
      for (let i = 0; i < 5; i++) {
        let dx = R() * w, dy = R() * h, dr = 90 + R() * 180;
        let dg = g.createRadialGradient(dx, dy, 0, dx, dy, dr);
        dg.addColorStop(0, "rgba(150,190,150,0.18)");
        dg.addColorStop(1, "rgba(196,214,166,0)");
        g.fillStyle = dg;
        g.fillRect(dx - dr, dy - dr, dr * 2, dr * 2);
      }
      for (let i = 0; i < 9; i++) {
        let px = R() * w, py = R() * h, pr = 26 + R() * 78;
        g.save();
        g.filter = "blur(" + (8 + R() * 14).toFixed(0) + "px)";
        g.beginPath();
        g.ellipse(px, py, pr, pr * (0.5 + R() * 0.5), R() * Math.PI, 0, Math.PI * 2);
        g.fillStyle = R() < 0.78 ? "rgba(64,100,78,0.11)" : "rgba(122,142,108,0.08)";
        g.fill();
        g.restore();
      }
      for (let i = 0; i < 64; i++) {
        let py = R() * h, px = R() * w, len = 22 + R() * 74;
        let tilt = (R() - 0.5) * 0.5;
        g.beginPath();
        g.moveTo(px, py);
        for (let k = 1; k <= 6; k++) {
          g.lineTo(px + len * k / 6, py + tilt * (len * k) / 6 + Math.sin(k * 1.1 + px * 0.01) * 2.6);
        }
        g.strokeStyle = R() < 0.5 ? "rgba(244,250,235,0.075)" : "rgba(91,132,111,0.035)";
        g.lineWidth = 0.65 + R() * 0.9;
        g.stroke();
      }
      for (let i = 0; i < 14; i++) {
        let edge = Math.floor(R() * 4);
        let ex, ey, ang;
        if (edge === 0) {
          ex = R() * w;
          ey = -10;
          ang = Math.PI / 2;
        } else if (edge === 1) {
          ex = w + 10;
          ey = R() * h;
          ang = Math.PI;
        } else if (edge === 2) {
          ex = R() * w;
          ey = h + 10;
          ang = -Math.PI / 2;
        } else {
          ex = -10;
          ey = R() * h;
          ang = 0;
        }
        ang += (R() - 0.5) * 0.9;
        let len = h * (0.08 + R() * 0.2);
        g.save();
        g.translate(ex, ey);
        g.rotate(ang);
        let bw = h * (4e-3 + R() * 8e-3);
        g.beginPath();
        g.moveTo(0, -bw);
        g.quadraticCurveTo(len * 0.5, -bw * 2.6, len, -bw * 1.4);
        g.quadraticCurveTo(len * 0.5, bw * 2.8, 0, bw);
        g.closePath();
        let lg2 = g.createLinearGradient(0, 0, len, 0);
        lg2.addColorStop(0, "rgba(58,96,48,0.94)");
        lg2.addColorStop(1, "rgba(104,150,72,0.90)");
        g.fillStyle = lg2;
        g.fill();
        g.restore();
      }
      let PADS = [
        ["#86ad6d", "#668e55", "#4e7447", "rgba(204,224,175,0.42)", "rgba(57,105,58,0.55)"],
        ["#94b979", "#71975e", "#55794d", "rgba(214,230,185,0.40)", "rgba(64,110,61,0.52)"],
        ["#78a365", "#5e8753", "#496f48", "rgba(193,216,166,0.40)", "rgba(52,96,55,0.52)"]
      ];
      let padSpots = [
        [0.04, 0.09, 0.095],
        [0.26, 0.04, 0.064],
        [0.94, 0.12, 0.084],
        [0.06, 0.69, 0.078],
        [0.91, 0.68, 0.092],
        [0.64, 0.95, 0.068],
        [0.15, 0.91, 0.06],
        [0.98, 0.43, 0.053]
      ];
      for (let i = 0; i < padSpots.length; i++) {
        let sp = padSpots[i];
        drawLilyPad(
          g,
          sp[0] * w,
          sp[1] * h,
          sp[2] * Math.min(w, h),
          R() * Math.PI * 2,
          PADS[Math.floor(R() * PADS.length)]
        );
      }
      let lotusSpots = [[0.1, 0.28], [0.86, 0.34], [0.2, 0.94], [0.66, 0.06]];
      for (let i = 0; i < lotusSpots.length; i++) {
        drawLotus(
          g,
          lotusSpots[i][0] * w,
          lotusSpots[i][1] * h,
          Math.min(w, h) * 0.032,
          R() * Math.PI * 2
        );
      }
      for (let i = 0; i < 14; i++) {
        let px = R() * w, py = R() * h, pr = 3 + R() * 5.5, pa = R() * Math.PI * 2;
        g.save();
        g.translate(px, py);
        g.rotate(pa);
        g.beginPath();
        g.moveTo(-pr, 0);
        g.quadraticCurveTo(-pr * 0.1, -pr * 0.72, pr, 0);
        g.quadraticCurveTo(-pr * 0.1, pr * 0.72, -pr, 0);
        g.closePath();
        g.fillStyle = R() < 0.55 ? "rgba(242,182,201,0.62)" : "rgba(198,170,112,0.55)";
        g.fill();
        g.restore();
      }
      let vig = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.8);
      vig.addColorStop(0, "rgba(60,90,66,0)");
      vig.addColorStop(1, "rgba(56,86,62,0.18)");
      g.fillStyle = vig;
      g.fillRect(0, 0, w, h);
      return c;
    }
    return { buildPond, dispose() {
      pondBackground.onload = null;
    } };
  }

  // src/render/water-surface.js
  function createWaterSurface({ ctx, underCanvas, viewport, time }) {
    const WATER_MARGIN = 56;
    const WATER_STRIPS = 16;
    const WATER_WARP_AMP = 1.8;
    function drawWaterSurface() {
      const sh = viewport.height / WATER_STRIPS;
      const t = time.elapsed;
      const breathe = 1 + 0.25 * Math.sin(t * 0.19);
      for (let i = 0; i < WATER_STRIPS; i++) {
        const y = i * sh;
        const dx = Math.sin(y * 32e-4 + t * 0.55) * WATER_WARP_AMP * breathe;
        ctx.drawImage(
          underCanvas,
          WATER_MARGIN + dx,
          y,
          viewport.width,
          sh + 1.2,
          0,
          y,
          viewport.width,
          sh + 1.2
        );
      }
    }
    return { draw: drawWaterSurface };
  }

  // src/render/caustics.js
  function createCaustics({ config, viewport, time }) {
    const WATER_MARGIN = 56;
    const causticTexture = new Image();
    let causticTextureReady = false;
    const causticWarm = document.createElement("canvas");
    let causticFeather = null;
    causticTexture.onload = () => {
      causticTextureReady = true;
      causticWarm.width = causticTexture.naturalWidth;
      causticWarm.height = causticTexture.naturalHeight;
      let wg = causticWarm.getContext("2d");
      wg.filter = "saturate(" + THEME.light.desaturate + ")";
      wg.globalCompositeOperation = "lighter";
      for (let rp = 0; rp < THEME.light.reps; rp++) wg.drawImage(causticTexture, 0, 0);
      wg.globalCompositeOperation = "source-over";
      wg.filter = "none";
      if (THEME.light.tint) {
        wg.globalCompositeOperation = "source-atop";
        wg.fillStyle = THEME.light.tint;
        wg.fillRect(0, 0, causticWarm.width, causticWarm.height);
        wg.globalCompositeOperation = "source-over";
      }
      const FW = 0.08;
      const W0 = causticWarm.width, H0 = causticWarm.height;
      if (!causticFeather || causticFeather.width !== W0 || causticFeather.height !== H0) {
        causticFeather = document.createElement("canvas");
        causticFeather.width = W0;
        causticFeather.height = H0;
        const fg = causticFeather.getContext("2d");
        fg.fillStyle = "#fff";
        fg.fillRect(0, 0, W0, H0);
        fg.globalCompositeOperation = "destination-out";
        const wx = W0 * FW, wy = H0 * FW;
        const band = (x, y, w, h, gx0, gy0, gx1, gy1) => {
          const gr = fg.createLinearGradient(gx0, gy0, gx1, gy1);
          gr.addColorStop(0, "rgba(0,0,0,1)");
          gr.addColorStop(1, "rgba(0,0,0,0)");
          fg.fillStyle = gr;
          fg.fillRect(x, y, w, h);
        };
        band(0, 0, wx, H0, 0, 0, wx, 0);
        band(W0 - wx, 0, wx, H0, W0, 0, W0 - wx, 0);
        band(0, 0, W0, wy, 0, 0, 0, wy);
        band(0, H0 - wy, W0, wy, 0, H0, 0, H0 - wy);
      }
      wg.globalCompositeOperation = "destination-in";
      wg.drawImage(causticFeather, 0, 0);
      wg.globalCompositeOperation = "source-over";
    };
    causticTexture.src = THEME.light.texture;
    const CAUSTIC_BLADES = THEME.light.blades;
    let causticBlades = null;
    function buildCausticBlades() {
      const R = mulberry32(20261105);
      const base = Math.max(viewport.width, viewport.height);
      const out = [];
      for (let i = 0; i < CAUSTIC_BLADES; i++) {
        out.push({
          cx: (R() * 1.8 - 0.4) * viewport.width,
          // 允许飘到画面外,边缘才不会突然断掉
          cy: (R() * 1.8 - 0.4) * viewport.height,
          rot: R() * Math.PI * 2,
          spin: (R() - 0.5) * THEME.light.spin,
          // ★ 尺寸是"光有多宽"的唯一开关。光带贴图本身就宽,铺太大会糊成一片云;
          //   实测 0.30~0.50 时接近 1:1,光带保持"带状"而不是"团状"。
          size: base * (THEME.light.size[0] + R() * THEME.light.size[1]),
          amp: base * (0.16 + R() * 0.18),
          // 漂移半径(原来 0.10~0.23,动得太慢)
          ph: R() * Math.PI * 2,
          sp: THEME.light.drift[0] + R() * THEME.light.drift[1],
          al: THEME.light.alpha[0] + R() * THEME.light.alpha[1]
        });
      }
      return out;
    }
    const PATCH_BLOBS = THEME.light.patchBlobs;
    const PATCH_PEAK = THEME.light.patchPeak;
    const USE_CAUSTIC_PATCH = true;
    function buildCausticPatch(w, h) {
      const c = document.createElement("canvas");
      c.width = Math.max(1, w);
      c.height = Math.max(1, h);
      const g = c.getContext("2d");
      const R = mulberry32(20261105);
      const base = Math.max(w, h);
      for (let i = 0; i < PATCH_BLOBS; i++) {
        const x = R() * w, y = R() * h;
        const r = base * (THEME.light.patchRadius[0] + R() * THEME.light.patchRadius[1]);
        const a = PATCH_PEAK * (0.35 + R() * 0.65);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, "rgba(255,255,255," + a.toFixed(3) + ")");
        gr.addColorStop(0.4, "rgba(255,255,255," + (a * 0.5).toFixed(3) + ")");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      return c;
    }
    let causticScratch = null;
    let causticPatch = null;
    function ensureCausticScratch() {
      const w = Math.max(1, Math.round(viewport.width + WATER_MARGIN * 2));
      const h = Math.max(1, Math.round(viewport.height));
      if (!causticScratch || causticScratch.c.width !== w || causticScratch.c.height !== h) {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        causticScratch = { c, g: c.getContext("2d") };
        const padP = Math.round(Math.max(w, h) * 0.3);
        causticPatch = buildCausticPatch(w + padP * 2, h + padP * 2);
        causticBlades = buildCausticBlades();
      }
      return causticScratch;
    }
    function drawCausticsEx(g, baseAlpha, extraScale, offsetX) {
      if (config.useGpuCaustics && typeof WaterGL !== "undefined" && WaterGL.init()) {
        const wc = WaterGL.causticsCanvas(viewport.width, viewport.height, time.elapsed);
        if (wc) {
          g.save();
          g.globalCompositeOperation = "screen";
          g.globalAlpha = baseAlpha;
          g.drawImage(wc, offsetX === void 0 ? 0 : offsetX, 0, viewport.width, viewport.height);
          g.restore();
          return;
        }
      }
      if (!causticTextureReady) return;
      if (!causticBlades) causticBlades = buildCausticBlades();
      const t = time.elapsed;
      const k = extraScale || 1;
      const sc = ensureCausticScratch();
      const sg = sc.g;
      const SW = sc.c.width, SH = sc.c.height;
      sg.setTransform(1, 0, 0, 1, 0, 0);
      sg.globalAlpha = 1;
      sg.globalCompositeOperation = "source-over";
      sg.clearRect(0, 0, SW, SH);
      sg.globalCompositeOperation = "screen";
      for (let i = 0; i < causticBlades.length; i++) {
        const B = causticBlades[i];
        const s = B.size * k;
        const x = B.cx + WATER_MARGIN + Math.cos(t * B.sp + B.ph) * B.amp;
        const y = B.cy + Math.sin(t * B.sp * 1.37 + B.ph) * B.amp;
        sg.save();
        sg.translate(x, y);
        sg.rotate(B.rot + t * B.spin);
        sg.globalAlpha = B.al;
        const asp = causticWarm.height / causticWarm.width;
        sg.drawImage(causticWarm, -s * 0.5, -s * asp * 0.5, s, s * asp);
        sg.restore();
      }
      if (USE_CAUSTIC_PATCH) {
        sg.globalCompositeOperation = "destination-in";
        sg.globalAlpha = 1;
        const PW = causticPatch.width, PH = causticPatch.height;
        const pad = Math.max(SW, SH) * 0.3;
        const dx = Math.sin(t * 0.17) * pad * 0.85;
        const dy = Math.cos(t * 0.13) * pad * 0.85;
        const breathe = 1 + 0.1 * Math.sin(t * 0.075);
        sg.save();
        sg.translate(SW * 0.5 + dx, SH * 0.5 + dy);
        sg.scale(breathe, breathe);
        sg.drawImage(causticPatch, -PW * 0.5, -PH * 0.5, PW, PH);
        sg.restore();
      }
      g.save();
      g.globalCompositeOperation = "screen";
      g.globalAlpha = baseAlpha;
      g.drawImage(sc.c, offsetX === void 0 ? -WATER_MARGIN : offsetX, 0, SW, SH);
      g.restore();
    }
    return { draw: drawCausticsEx, dispose() {
      causticTexture.onload = null;
      causticWarm.width = causticWarm.height = 1;
      causticScratch = causticPatch = causticFeather = null;
    } };
  }

  // src/render/renderer.js
  function createRenderer({ canvas, viewport, config, time, kois, foods, ripples, layers, environment }) {
    const ctx = canvas.getContext("2d");
    const underCanvas = document.createElement("canvas");
    const uctx = underCanvas.getContext("2d");
    const margin = 56;
    let pondScene, farGradient;
    const drawOrder = [];
    const background = createBackground({ viewport, invalidate() {
      if (viewport.width && viewport.height) pondScene = background.buildPond(viewport.width + margin * 2, viewport.height);
    } });
    const surface = createWaterSurface({ ctx, underCanvas, viewport, time });
    const caustics = createCaustics({ config, viewport, time });
    function resize() {
      viewport.width = window.innerWidth;
      viewport.height = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      underCanvas.width = viewport.width + margin * 2;
      underCanvas.height = viewport.height;
      pondScene = background.buildPond(underCanvas.width, viewport.height);
      farGradient = ctx.createLinearGradient(0, 0, 0, viewport.height * THEME.water.farSpan);
      farGradient.addColorStop(0, THEME.water.farTop);
      farGradient.addColorStop(0.55, THEME.water.farMid);
      farGradient.addColorStop(1, "rgba(7,28,32,0)");
    }
    window.addEventListener("resize", resize);
    resize();
    const detach = [
      layers.add("floor", (g) => {
        if (pondScene) g.drawImage(pondScene, -margin, 0);
      }),
      // 饲料:倒序绘制与第一轮一致(后撒的先画)
      layers.add("food", (g) => {
        for (let i = foods.length - 1; i >= 0; i--) foods[i].draw(g);
      }),
      layers.add("creatures", (g) => {
        for (let i = 0; i < kois.length; i++) drawOrder[i] = kois[i];
        drawOrder.length = kois.length;
        drawOrder.sort((a, b) => a.depth - b.depth);
        for (const fish of drawOrder) fish.draw(g);
      }),
      layers.add("surface", () => surface.draw()),
      // 光感:环境给一个乘数(阴/雨压暗)。⚠️ GPU 光感路径只吃 alpha —— 所以天气靠 alpha 表达,
      // 不能指望 extraScale(那个只有 CPU 分支认)。
      layers.add("light", (g) => {
        if (!config.enableCaustics) return;
        const k = environment ? environment.causticAlpha : 1;
        caustics.draw(g, THEME.light.layerAlpha * k, 1, 0);
      }),
      layers.add("farTint", (g) => {
        g.fillStyle = farGradient;
        g.fillRect(0, 0, viewport.width, viewport.height * THEME.water.farSpan);
        const grade = environment ? environment.grade : null;
        if (grade && grade.alpha > 1e-3) {
          g.save();
          g.globalCompositeOperation = "multiply";
          g.globalAlpha = grade.alpha;
          g.fillStyle = grade.color;
          g.fillRect(0, 0, viewport.width, viewport.height);
          g.restore();
        }
      }),
      layers.add("ripples", (g) => ripples.draw(g))
    ];
    return {
      draw() {
        const { width, height } = viewport;
        ctx.clearRect(0, 0, width, height);
        ctx.lineCap = ctx.lineJoin = "round";
        uctx.setTransform(1, 0, 0, 1, margin, 0);
        uctx.clearRect(-margin, 0, underCanvas.width, underCanvas.height);
        uctx.lineCap = uctx.lineJoin = "round";
        for (const layer of LAYERS) layers.draw(layer.id, layer.target === "under" ? uctx : ctx);
      },
      dispose() {
        window.removeEventListener("resize", resize);
        detach.forEach((fn) => fn());
        background.dispose();
        caustics.dispose();
        WaterGL.dispose();
        underCanvas.width = underCanvas.height = 1;
        pondScene = null;
        drawOrder.length = 0;
      }
    };
  }

  // src/render/ripples.js
  var lx2 = () => THEME.light.dir[0];
  var ly2 = () => THEME.light.dir[1];
  var Ripple = class {
    /** profile 默认 = 鼠标涟漪那套(THEME.water.ripple);雨滴传自己的(同一套参数的派生) */
    constructor(x, y, power, profile, deps) {
      const T = this.T = profile || THEME.water.ripple;
      this.viewport = deps && deps.viewport || { width: 1, height: 1 };
      this.config = deps && deps.config || {};
      this.x = x;
      this.y = y;
      this.power = power;
      this.age = 0;
      this.dead = false;
      this.life = T.life[0] + power * T.life[1];
      this.speed = T.speed[0] + power * T.speed[1];
      this.seed = (x * 0.0131 + y * 0.0217 + power * 1.7) % (Math.PI * 2);
    }
    update(dt) {
      this.age += dt;
      if (this.age >= this.life) this.dead = true;
    }
    get radius() {
      return this.speed * this.age;
    }
    get fade() {
      const T = this.T;
      return 1 - Math.pow(Math.min(1, this.age / this.life), T.fadePower);
    }
    intensity() {
      const T = this.T;
      const spread = T.spread / (this.radius + T.spread);
      const L = Math.max(1, Math.hypot(this.viewport.width, this.viewport.height) * 0.5);
      const proj = ((this.x - this.viewport.width * 0.5) * lx2() + (this.y - this.viewport.height * 0.5) * ly2()) / L;
      const lightDist = 1 - T.lightDistDim * (1 - proj) * 0.5;
      return this.fade * spread * Math.max(0, lightDist);
    }
    draw(ctx) {
      const T = this.T;
      const R = this.radius;
      if (R < 2) return;
      if (this.useGpu !== false && this.config.useGpuRipples && typeof WaterGL !== "undefined" && WaterGL.init()) {
        const a0 = this.intensity();
        if (a0 < 0.035) return;
        const crest = WaterGL.rippleCanvas(this, 0);
        if (crest) {
          ctx.save();
          ctx.globalCompositeOperation = "screen";
          ctx.globalAlpha = T.crestAlpha;
          ctx.drawImage(crest.canvas, crest.x, crest.y, crest.size, crest.size);
          ctx.restore();
        }
        const trough = T.troughAlpha > 0 ? WaterGL.rippleCanvas(this, 1) : null;
        if (trough) {
          ctx.save();
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = T.troughAlpha;
          ctx.drawImage(trough.canvas, trough.x, trough.y, trough.size, trough.size);
          ctx.restore();
        }
        return;
      }
      const lam = R * T.lamRatio;
      const hwRidge = lam * T.ridgeFrac;
      const hwFlank = lam * T.flankFrac;
      const a = this.intensity();
      if (a < 0.035) return;
      rippleGeomCheck();
      const ridges = [], flanks = [];
      let rmin = Infinity, rmax = 0;
      for (let k = 0; k < T.crests; k++) {
        const rc = R - k * lam;
        if (rc < 3) break;
        const damp = 1 / (1 + k * 0.45);
        const ar = T.ridgeAmp * damp, af = T.flankAmp * damp;
        ridges.push([rc, hwRidge, ar]);
        rmin = Math.min(rmin, rc - hwRidge);
        rmax = Math.max(rmax, rc + hwRidge);
        for (let s = -1; s <= 1; s += 2) {
          const rt = rc + s * lam * T.flankOffset;
          if (rt > 3) {
            flanks.push([rt, hwFlank, af]);
            rmin = Math.min(rmin, rt - hwFlank);
            rmax = Math.max(rmax, rt + hwFlank);
          }
        }
      }
      if (!ridges.length) return;
      const rin = Math.max(0, rmin - 2);
      const rout = rmax + 2;
      const size = Math.ceil(rout * 2) + 4;
      const sc = ensureRippleScratch(size, this.viewport);
      if (!sc) return;
      const g = sc.g, S = sc.c.width, cx = S / 2, cy = S / 2;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.clearRect(0, 0, S, S);
      rippleProfile(g, S, rin, rout, ridges, T);
      g.globalCompositeOperation = "source-in";
      g.fillStyle = rippleArcGradient(g, cx, cy, rout, T.crest, T.crestAlpha * a, this.seed, T.arcFloor, T);
      g.fillRect(0, 0, S, S);
      g.globalCompositeOperation = "source-over";
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.drawImage(sc.c, 0, 0, S, S, this.x - cx, this.y - cy, S, S);
      ctx.restore();
      if (flanks.length && T.troughAlpha > 0) {
        g.clearRect(0, 0, S, S);
        rippleProfile(g, S, rin, rout, flanks, T);
        g.globalCompositeOperation = "source-in";
        g.fillStyle = rippleArcGradient(g, cx, cy, rout, T.trough, T.troughAlpha * a, this.seed, T.flankFloor, T);
        g.fillRect(0, 0, S, S);
        g.globalCompositeOperation = "source-over";
        ctx.drawImage(sc.c, 0, 0, S, S, this.x - cx, this.y - cy, S, S);
      }
    }
  };
  function rippleArcGradient(g, cx, cy, rout, head, full, seed, floor, profile) {
    const T = profile || THEME.water.ripple;
    const floorA = Math.max(0, Math.min(0.9, floor));
    const env = (d) => {
      let c = Math.cos(d);
      if (c < 0) c = 0;
      return floorA + (1 - floorA) * Math.pow(c, T.arcPower);
    };
    const a0 = Math.atan2(ly2(), lx2());
    if (typeof g.createConicGradient === "function") {
      const N = Math.max(12, T.arcStops | 0);
      const gr = g.createConicGradient(a0, cx, cy);
      for (let i = 0; i <= N; i++) {
        const f = i / N;
        let e = env(f * Math.PI * 2) * (1 + T.arcJitter * Math.sin(f * Math.PI * 6 + seed));
        if (e < 0) e = 0;
        gr.addColorStop(f, head + Math.min(1, full * e).toFixed(4) + ")");
      }
      return gr;
    }
    const x0 = cx - lx2() * rout, y0 = cy - ly2() * rout;
    const x1 = cx + lx2() * rout, y1 = cy + ly2() * rout;
    const gl = g.createLinearGradient(x0, y0, x1, y1);
    gl.addColorStop(0, head + Math.min(1, full * floorA).toFixed(4) + ")");
    gl.addColorStop(0.5, head + Math.min(1, full * floorA).toFixed(4) + ")");
    for (let i = 1; i <= 5; i++) {
      const t = 0.5 + 0.5 * i / 5;
      gl.addColorStop(t, head + Math.min(1, full * env(Math.acos(Math.max(-1, Math.min(1, 2 * t - 1))))).toFixed(4) + ")");
    }
    return gl;
  }
  var HANN_D = [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1];
  var HANN_V = [0, 0.25, 0.75, 1, 0.75, 0.25, 0];
  function rippleProfile(g, S, rin, rout, bands, profile) {
    const T = profile || THEME.water.ripple;
    const cx = S / 2, cy = S / 2, span = Math.max(1, rout - rin);
    const stops = [[0, 0]];
    for (let i = 0; i < bands.length; i++) {
      const r = bands[i][0], hw = bands[i][1], amp = bands[i][2] === void 0 ? 1 : bands[i][2];
      const o = (v) => (v - rin) / span;
      for (let k = 0; k < HANN_D.length; k++) {
        const v = o(r + HANN_D[k] * hw);
        if (v > 0 && v < 1) stops.push([v, amp * HANN_V[k]]);
      }
    }
    stops.push([1, 0]);
    stops.sort((a, b) => a[0] - b[0]);
    const rg = g.createRadialGradient(cx, cy, rin, cx, cy, rout);
    for (let i = 0; i < stops.length; i++) {
      rg.addColorStop(Math.max(0, Math.min(1, stops[i][0])), "rgba(255,255,255," + stops[i][1] + ")");
    }
    g.fillStyle = rg;
    g.beginPath();
    g.arc(cx, cy, rout, 0, Math.PI * 2);
    g.fill();
  }
  var rippleGeomWarned = false;
  function rippleGeomCheck() {
    const T = THEME.water.ripple;
    if (rippleGeomWarned) return;
    const gap = T.flankOffset - T.flankFrac - T.ridgeFrac;
    if (gap > 0.05 || gap < -0.3) {
      rippleGeomWarned = true;
      console.warn("[koi] \u6D9F\u6F2A\u51E0\u4F55:\u4EAE\u810A\u548C\u6697\u5E26\u4E4B\u95F4 " + (gap > 0 ? "\u7559\u4E86 " + gap.toFixed(2) : "\u91CD\u53E0\u4E86 " + (-gap).toFixed(2)) + "\u03BB(flankOffset " + T.flankOffset + " \u2212 flankFrac " + T.flankFrac + " \u2212 ridgeFrac " + T.ridgeFrac + ")\u2014\u2014 \u4EA4\u70B9\u5E94\u5F53\u521A\u597D\u642D\u4E0A(\xB10.05\u03BB \u5185)\u3002");
    }
  }
  var rippleScratch = null;
  function ensureRippleScratch(size, viewport) {
    const max = Math.ceil(Math.max(viewport.width, viewport.height) * 1.7);
    if (size > max) return null;
    if (!rippleScratch) {
      const c = document.createElement("canvas");
      rippleScratch = { c, g: c.getContext("2d"), size: 0 };
    }
    if (rippleScratch.c.width < size) {
      rippleScratch.c.width = size;
      rippleScratch.c.height = size;
    }
    return rippleScratch;
  }
  function createRipples({ config, viewport }) {
    const ripples = [];
    function spawnRipple(x, y, power) {
      const T = THEME.water.ripple;
      while (ripples.length >= T.maxLive) ripples.shift();
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        if (r.age > T.mergeAge) break;
        const dx = r.x - x, dy = r.y - y;
        if (Math.abs(r.power - power) < T.mergePower && dx * dx + dy * dy < T.mergeDist * T.mergeDist) return;
      }
      ripples.push(new Ripple(x, y, power, void 0, { viewport, config }));
    }
    return { ripples, spawnRipple, update(dt) {
      for (let i = ripples.length - 1; i >= 0; i--) {
        ripples[i].update(dt);
        if (ripples[i].dead) ripples.splice(i, 1);
      }
    }, draw(g) {
      for (let i = ripples.length - 1; i >= 0; i--) ripples[i].draw(g);
    } };
  }
  function createRainRipples({ viewport, config, profile }) {
    const P = profile || THEME.water.ripple;
    const list = [];
    const cap = P.maxLive || 140;
    return {
      get count() {
        return list.length;
      },
      get cap() {
        return cap;
      },
      spawn(x, y, power) {
        while (list.length >= cap) list.shift();
        const r = new Ripple(x, y, power, P, { viewport, config });
        r.useGpu = false;
        list.push(r);
      },
      update(dt) {
        for (let i = list.length - 1; i >= 0; i--) {
          list[i].update(dt);
          if (list[i].dead) list.splice(i, 1);
        }
      },
      draw(g) {
        for (let i = list.length - 1; i >= 0; i--) list[i].draw(g);
      },
      clear() {
        list.length = 0;
      }
    };
  }

  // src/storage/repository.js
  function createRepository() {
    return {
      getRaw(key) {
        try {
          return localStorage.getItem(key);
        } catch (e) {
          return null;
        }
      },
      read(key, fallback = null) {
        try {
          const raw = localStorage.getItem(key);
          return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
          return fallback;
        }
      },
      write(key, value) {
        try {
          localStorage.setItem(key, JSON.stringify(value));
          return true;
        } catch (e) {
          return false;
        }
      }
    };
  }

  // src/input/input-router.js
  function createInputRouter(mouse) {
    const actions = /* @__PURE__ */ new Map();
    let mode = "feed";
    return {
      move(x, y) {
        mouse.x = x;
        mouse.y = y;
        mouse.active = true;
      },
      leave() {
        mouse.active = false;
      },
      register(name, action) {
        if (actions.has(name)) throw new Error("Duplicate input mode: " + name);
        actions.set(name, action);
        return () => actions.delete(name);
      },
      setMode(name) {
        if (!actions.has(name)) throw new Error("Unknown input mode: " + name);
        mode = name;
      },
      activate(x, y) {
        var _a;
        (_a = actions.get(mode)) == null ? void 0 : _a(x, y);
      },
      dispose() {
        actions.clear();
        mouse.active = false;
      }
    };
  }

  // src/input/browser-input.js
  function attachBrowserInput(router, canvas) {
    const move = (e) => router.move(e.clientX, e.clientY);
    const leave = () => router.leave();
    const click = (e) => {
      if (!e.defaultPrevented && e.target === canvas) router.activate(e.clientX, e.clientY);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseout", leave);
    window.addEventListener("click", click);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseout", leave);
      window.removeEventListener("click", click);
    };
  }

  // src/platform/desktop-bridge.js
  function attachDesktopBridge(router) {
    var _a, _b;
    window.__koiGeom = window.__koiGeom || { vx: 0, vy: 0, vw: 0, vh: 0, btn: null };
    let downBefore = false;
    const bridge = (sx, sy, down, feed) => {
      const g = window.__koiGeom, k = g.vw > 0 ? window.innerWidth / g.vw : 1;
      const x = (sx - g.vx) * k, y = (sy - g.vy) * k;
      router.move(x, y);
      if (down && !downBefore && feed !== false) router.activate(x, y);
      downBefore = down;
    };
    const previous = window.__koiMouse;
    window.__koiMouse = bridge;
    const invoke = (_b = (_a = window.__TAURI__) == null ? void 0 : _a.core) == null ? void 0 : _b.invoke;
    if (invoke) invoke("koi_geom").then((raw) => {
      const g = typeof raw === "string" ? JSON.parse(raw) : raw;
      if ((g == null ? void 0 : g.btn) && g.vw) window.__koiGeom = g;
    }).catch(() => {
    });
    return () => {
      if (window.__koiMouse === bridge) window.__koiMouse = previous;
    };
  }

  // src/storage/settings-store.js
  var SETTINGS_KEY = "koi.settings.v1";
  function readSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const o = raw ? JSON.parse(raw) : null;
      return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch (e) {
      return {};
    }
  }
  function writeSettings(patch) {
    try {
      const next = { ...readSettings(), ...patch || {} };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    } catch (e) {
      return null;
    }
  }
  function clearSettings() {
    try {
      localStorage.removeItem(SETTINGS_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }
  function onSettingsChange(cb) {
    const handler = (e) => {
      if (e.key === SETTINGS_KEY) cb(readSettings());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }

  // src/platform/properties.js
  function asProperties(flat) {
    const out = {};
    for (const [k, v] of Object.entries(flat || {})) out[k] = { value: v };
    return out;
  }
  function attachProperties(config, syncKois) {
    const previous = window.wallpaperPropertyListener, previousLively = window.livelyPropertyListener;
    const numeric = { fishCount: [10, 200], fishSpeed: [0.5, 3], fishSize: [0.5, 3], rippleStrength: [0.1, 5], waterHue: [0, 360], weather: [0, 5], nightDim: [0, 1.3], weatherAutoMinutes: [1, 60], ambientVolume: [0, 1] };
    const applyUserProperties = (properties) => {
      for (const [key, property] of Object.entries(properties || {})) {
        if (!(key in config) || !property || !("value" in property)) continue;
        let value = property.value;
        if (numeric[key]) {
          value = Number(value);
          if (!Number.isFinite(value)) continue;
          const [min, max] = numeric[key];
          value = Math.max(min, Math.min(max, value));
          if (key === "fishCount" || key === "weather" || key === "weatherAutoMinutes") value = Math.round(value);
        } else if (typeof config[key] === "boolean") {
          if (typeof value !== "boolean") continue;
        } else continue;
        config[key] = value;
        if (key === "fishCount") syncKois();
        if (key === "waterHue") document.body.style.backgroundColor = "hsl(" + value + ",75%,18%)";
      }
    };
    const applyGeneralProperties = (properties) => {
      const fps = Number(properties && properties.fps);
      if (Number.isFinite(fps) && fps >= 0) config.fps = fps;
    };
    window.wallpaperPropertyListener = { applyUserProperties, applyGeneralProperties };
    window.livelyPropertyListener = (name, value) => applyUserProperties({ [name]: { value } });
    applyUserProperties(asProperties(readSettings()));
    const offStore = onSettingsChange((next) => applyUserProperties(asProperties(next)));
    return () => {
      window.wallpaperPropertyListener = previous;
      window.livelyPropertyListener = previousLively;
      offStore();
    };
  }

  // src/ui/settings-panel.js
  var FIELDS = [
    { key: "dayCycle", type: "bool", label: "\u5149\u7EBF\u8DDF\u968F\u73B0\u5B9E\u65F6\u95F4" },
    { key: "nightDim", type: "range", label: "\u591C\u95F4\u53D8\u6697", min: 0, max: 1.3, step: 0.01, sub: true },
    { key: "idleEvents", type: "bool", label: "\u843D\u53F6\u4E0E\u82B1\u74E3" },
    { key: "enableCaustics", type: "bool", label: "\u6C34\u9762\u6CE2\u5149" },
    { key: "enableFeeding", type: "bool", label: "\u70B9\u51FB\u6C34\u9762\u5582\u98DF" },
    { key: "shyFish", type: "bool", label: "\u9C7C\u7FA4\u8EB2\u907F\u9F20\u6807(\u6015\u751F)" },
    { key: "fishCount", type: "range", label: "\u9526\u9CA4\u6570\u91CF", min: 10, max: 200, step: 1 },
    { key: "fishSize", type: "range", label: "\u9C7C\u4F53\u5927\u5C0F\u500D\u7387", min: 0.5, max: 3, step: 0.01 },
    { key: "fishSpeed", type: "range", label: "\u6E38\u52A8\u901F\u5EA6\u500D\u7387", min: 0.5, max: 3, step: 0.01 },
    { key: "waterHue", type: "range", label: "\u6C34\u8272\u8272\u76F8", min: 0, max: 360, step: 1 },
    { key: "rippleStrength", type: "range", label: "\u6D9F\u6F2A\u5F3A\u5EA6", min: 0.1, max: 5, step: 0.01 },
    { key: "weather", type: "select", label: "\u5929\u6C14", options: [{ value: 0, label: "\u6674" }, { value: 1, label: "\u96E8" }, { value: 2, label: "\u5927\u96E8" }, { value: 3, label: "\u96EA" }, { value: 4, label: "\u96F7\u66B4" }, { value: 5, label: "\u96FE" }] },
    { key: "realWeather", type: "bool", label: "\u8DDF\u968F\u5F53\u5730\u771F\u5B9E\u5929\u6C14" },
    { key: "weatherAuto", type: "bool", label: "\u5929\u6C14\u81EA\u52A8\u8F6E\u6362" },
    { key: "weatherAutoMinutes", type: "range", label: "\u8F6E\u6362\u95F4\u9694(\u5206\u949F)", min: 1, max: 60, step: 1 },
    { key: "ambientVolume", type: "range", label: "\u73AF\u5883\u97F3\u91CF", min: 0, max: 1, step: 0.01 }
  ];
  var CSS = `
#koi-settings-gear {
    position: fixed; left: 16px; bottom: 16px; z-index: 20;
    width: 36px; height: 36px; border-radius: 50%;
    border: 1px solid var(--koi-line, rgba(227,222,196,0.26));
    cursor: pointer;
    background: var(--koi-bg, #173b39);
    display: flex; align-items: center; justify-content: center;
    color: var(--koi-ink, #f1efdf);
    box-shadow: 0 2px 10px rgba(0,0,0,0.35);
    transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}
#koi-settings-gear:hover { border-color: var(--koi-accent, #d88796); color: var(--koi-accent, #d88796); transform: scale(1.06); }
#koi-settings-gear svg { width: 19px; height: 19px; display: block; overflow: visible; }
#koi-settings-panel {
    position: fixed; left: 16px; bottom: 60px; z-index: 20;
    width: 280px; max-height: calc(100vh - 90px); overflow-y: auto;
    background: var(--koi-bg, #173b39);
    border: 1px solid var(--koi-line, rgba(227,222,196,0.26));
    border-radius: 10px;
    padding: 14px 14px 10px;
    color: var(--koi-ink, #f1efdf);
    font: 13px/1.4 var(--koi-font, system-ui, sans-serif);
    box-shadow: 0 8px 28px rgba(0,0,0,0.35);
    display: none;
}
#koi-settings-panel.open { display: block; }
#koi-settings-panel h2 {
    font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase;
    color: var(--koi-accent, #d88796); margin: 0 0 10px; font-weight: 600;
}
#koi-settings-panel .row { margin: 10px 0; }
#koi-settings-panel .row.bool { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
#koi-settings-panel label.title { display: block; color: var(--koi-dim, #b4c0a9); margin-bottom: 4px; font-size: 12px; }
#koi-settings-panel .row.bool label.title { margin-bottom: 0; }
#koi-settings-panel input[type=range] { width: 100%; accent-color: var(--koi-accent, #d88796); }
#koi-settings-panel select {
    width: 100%; background: var(--koi-panel, rgba(232,223,199,0.11));
    color: var(--koi-ink, #f1efdf); border: 1px solid var(--koi-line, rgba(227,222,196,0.26));
    border-radius: 5px; padding: 4px 6px; font: inherit;
    /* Sin esto el DESPLEGABLE (no el <select> cerrado) lo pinta el navegador
       con su tema claro por defecto -> texto claro sobre fondo blanco,
       ilegible. color-scheme le dice al navegador que use su paleta oscura
       para los controles nativos de este elemento (afecta al popup, que no
       se puede estilar con CSS normal). */
    color-scheme: dark;
}
#koi-settings-panel select option {
    background: var(--koi-bg, #173b39);
    color: var(--koi-ink, #f1efdf);
}
#koi-settings-panel input[type=checkbox] {
    appearance: none; width: 34px; height: 20px; border-radius: 10px;
    background: var(--koi-raise, rgba(239,231,208,0.10));
    border: 1px solid var(--koi-line, rgba(227,222,196,0.26));
    position: relative; cursor: pointer; flex: none;
}
#koi-settings-panel input[type=checkbox]::after {
    content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px;
    border-radius: 50%; background: var(--koi-dim, #b4c0a9); transition: left 0.15s ease, background 0.15s ease;
}
#koi-settings-panel input[type=checkbox]:checked { background: var(--koi-accent, #d88796); }
#koi-settings-panel input[type=checkbox]:checked::after { left: 16px; background: var(--koi-accent-ink, #34252b); }
#koi-settings-panel .actions { margin-top: 12px; text-align: right; }
#koi-settings-panel .actions button {
    background: transparent; border: 1px solid var(--koi-line, rgba(227,222,196,0.26));
    color: var(--koi-dim, #b4c0a9); border-radius: 5px; padding: 4px 10px; font: inherit; cursor: pointer;
}
#koi-settings-panel .actions button:hover { color: var(--koi-ink, #f1efdf); border-color: var(--koi-accent, #d88796); }
`;
  var GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 13a1.7 1.7 0 0 0 .35 1.9l.05.05a2 2 0 1 1-2.9 2.9l-.05-.05a1.7 1.7 0 0 0-1.9-.35 1.7 1.7 0 0 0-1 1.55V19a2 2 0 1 1-4 0v-.08a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.9.35l-.05.05a2 2 0 1 1-2.9-2.9l.05-.05a1.7 1.7 0 0 0 .35-1.9 1.7 1.7 0 0 0-1.55-1H5a2 2 0 1 1 0-4h.08A1.7 1.7 0 0 0 6.63 8.2a1.7 1.7 0 0 0-.35-1.9l-.05-.05a2 2 0 1 1 2.9-2.9l.05.05a1.7 1.7 0 0 0 1.9.35H11a1.7 1.7 0 0 0 1-1.55V2a2 2 0 1 1 4 0v.08a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.9-.35l.05-.05a2 2 0 1 1 2.9 2.9l-.05.05a1.7 1.7 0 0 0-.35 1.9V8a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.08a1.7 1.7 0 0 0-1.52 1z"/></svg>';
  function createSettingsPanel({ config }) {
    if (typeof document === "undefined") return () => {
    };
    if (window.__koiSettingsPanel) return window.__koiSettingsPanel.dispose;
    if (typeof applyThemeCssVars === "function") applyThemeCssVars();
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    const gear = document.createElement("button");
    gear.id = "koi-settings-gear";
    gear.type = "button";
    gear.title = "\u8BBE\u7F6E";
    gear.innerHTML = GEAR_SVG;
    document.body.appendChild(gear);
    const panel = document.createElement("div");
    panel.id = "koi-settings-panel";
    const title = document.createElement("h2");
    title.textContent = "\u6C60\u5858\u8BBE\u7F6E";
    panel.appendChild(title);
    document.body.appendChild(panel);
    const controls = {};
    FIELDS.forEach((spec) => {
      const configKey = spec.key;
      const row = document.createElement("div");
      row.className = "row" + (spec.type === "bool" ? " bool" : "") + (spec.sub ? " sub" : "");
      const lab = document.createElement("label");
      lab.className = "title";
      lab.textContent = spec.label;
      let input;
      if (spec.type === "bool") {
        input = document.createElement("input");
        input.type = "checkbox";
        row.appendChild(lab);
        row.appendChild(input);
      } else if (spec.type === "range") {
        input = document.createElement("input");
        input.type = "range";
        input.min = spec.min;
        input.max = spec.max;
        input.step = spec.step;
        row.appendChild(lab);
        row.appendChild(input);
      } else {
        input = document.createElement("select");
        spec.options.forEach((o) => {
          const opt = document.createElement("option");
          opt.value = o.value;
          opt.textContent = o.label;
          input.appendChild(opt);
        });
        row.appendChild(lab);
        row.appendChild(input);
      }
      panel.appendChild(row);
      controls[configKey] = { input, spec };
      const COMMIT_DEBOUNCE = 150;
      let commitTimer = null;
      function cancelCommit() {
        if (commitTimer !== null) {
          clearTimeout(commitTimer);
          commitTimer = null;
        }
      }
      function commit() {
        cancelCommit();
        let v = spec.type === "bool" ? input.checked : spec.type === "select" ? Number(input.value) : Number(input.value);
        writeSettings({ [configKey]: v });
        if (window.wallpaperPropertyListener) {
          window.wallpaperPropertyListener.applyUserProperties({ [configKey]: { value: v } });
        }
        if (configKey === "dayCycle") updateSubRows();
      }
      if (spec.type === "range") {
        input.addEventListener("input", () => {
          if (configKey === "fishCount") return;
          cancelCommit();
          commitTimer = setTimeout(commit, COMMIT_DEBOUNCE);
        });
        input.addEventListener("change", commit);
      } else {
        input.addEventListener("change", commit);
      }
    });
    function updateSubRows() {
      const dayCycleOn = config.dayCycle !== false;
      panel.querySelectorAll(".row.sub").forEach((r) => {
        r.style.opacity = dayCycleOn ? "" : "0.4";
      });
    }
    function refresh() {
      for (const key in controls) {
        const { input, spec } = controls[key];
        const v = config[key];
        if (v === void 0) continue;
        if (spec.type === "bool") input.checked = !!v;
        else input.value = v;
      }
      updateSubRows();
    }
    function open() {
      panel.classList.add("open");
      refresh();
    }
    function close() {
      panel.classList.remove("open");
    }
    function toggle() {
      panel.classList.contains("open") ? close() : open();
    }
    gear.addEventListener("click", toggle);
    const resetBtn = document.createElement("button");
    const actions = document.createElement("div");
    actions.className = "actions";
    resetBtn.type = "button";
    resetBtn.textContent = "\u6062\u590D\u9ED8\u8BA4";
    resetBtn.addEventListener("click", () => {
      clearSettings();
      location.reload();
    });
    actions.appendChild(resetBtn);
    panel.appendChild(actions);
    refresh();
    const prevApply = window.wallpaperPropertyListener && window.wallpaperPropertyListener.applyUserProperties;
    if (window.wallpaperPropertyListener && prevApply) {
      window.wallpaperPropertyListener.applyUserProperties = function(props) {
        prevApply(props);
        if (panel.classList.contains("open")) refresh();
      };
    }
    function dispose() {
      gear.remove();
      panel.remove();
      style.remove();
      delete window.__koiSettingsPanel;
    }
    window.__koiSettingsPanel = { open, close, toggle, dispose };
    return dispose;
  }

  // src/pond/behavior.js
  function createBehavior({ config, viewport, time, kois, foods, mouse, spawnRipple, schoolSystem }) {
    const { schools, trailPoint, QUEUE_LEN, SOLO_RATIO: SOLO_RATIO2, SCHOOL_COUNT, SCHOOL_PERCEIVE_K, SCHOOL_PERCEIVE_MIN, SEP_W, ALIGN_W, COH_W, MAX_STEER } = schoolSystem;
    const FOOD_DETECT_RADIUS_SQ = 230400;
    const EAT_RADIUS = 20;
    const EAT_RADIUS_SQ = 400;
    const FEAR_RADIUS_SQ = 4e4;
    function computeFlockInfluence() {
      let sepX = 0, sepY = 0, alignX = 0, alignY = 0;
      let centerX = 0, centerY = 0, neighborCount = 0;
      let pushX = 0, pushY = 0, separationPressure = 0;
      const ownLength = (this.numSegments - 1) * this.segmentSpacing * config.fishSize * this.sizeMul;
      for (let i = 0; i < kois.length; i++) {
        const other = kois[i];
        if (other === this) continue;
        const dx = this.x - other.x, dy = this.y - other.y;
        const d = Math.hypot(dx, dy);
        if (d < 1e-3) continue;
        const otherLength = (other.numSegments - 1) * other.segmentSpacing * config.fishSize * other.sizeMul;
        const personalSpace = (ownLength + otherLength) * 0.6;
        const perception = Math.max(SCHOOL_PERCEIVE_MIN, (ownLength + otherLength) * SCHOOL_PERCEIVE_K);
        if (d > perception) continue;
        if (d < personalSpace) {
          const pressure = 1 - d / personalSpace;
          const nx = dx / d, ny = dy / d;
          sepX += nx * pressure;
          sepY += ny * pressure;
          separationPressure = Math.max(separationPressure, pressure);
        }
        if (this.schoolId >= 0 && this.schoolId === other.schoolId) {
          neighborCount++;
          alignX += other.vx;
          alignY += other.vy;
          centerX += other.x;
          centerY += other.y;
        }
      }
      let forceX = 0, forceY = 0;
      const sepLength = Math.hypot(sepX, sepY);
      if (sepLength > 1e-3) {
        forceX += sepX / sepLength * SEP_W;
        forceY += sepY / sepLength * SEP_W;
      }
      if (neighborCount > 0) {
        const alignLength = Math.hypot(alignX, alignY);
        if (alignLength > 1e-3) {
          forceX += alignX / alignLength * ALIGN_W;
          forceY += alignY / alignLength * ALIGN_W;
        }
        const cohesionX = centerX / neighborCount - this.x;
        const cohesionY = centerY / neighborCount - this.y;
        const cohesionLength = Math.hypot(cohesionX, cohesionY);
        if (cohesionLength > 1e-3) {
          forceX += cohesionX / cohesionLength * COH_W;
          forceY += cohesionY / cohesionLength * COH_W;
        }
      }
      const turnFrom = (fx, fy, cap) => {
        const len = Math.hypot(fx, fy);
        if (len < 1e-3) return 0;
        const h = Math.atan2(fy, fx);
        return Math.atan2(Math.sin(h - this.heading), Math.cos(h - this.heading)) * Math.min(cap, len) * 1.25;
      };
      return {
        turn: turnFrom(forceX, forceY, MAX_STEER),
        sepTurn: turnFrom(sepX / (sepLength || 1) * SEP_W, sepY / (sepLength || 1) * SEP_W, MAX_STEER),
        pushX,
        pushY,
        pressure: separationPressure
      };
    }
    function bodyTouchesFood(f) {
      const S = this.segments;
      const rr = this.collR + 11;
      const n = Math.min(10, S.length);
      for (let i = 0; i < n; i++) {
        const dx = f.x - S[i].x, dy = f.y - S[i].y;
        if (dx * dx + dy * dy < rr * rr) return true;
      }
      return false;
    }
    function update(dt) {
      const collisionLength = (this.numSegments - 1) * this.segmentSpacing * config.fishSize * this.sizeMul;
      this.collHalf = collisionLength * 0.5;
      this.collR = collisionLength * this.type.collisionRadius;
      let dtMult = dt * 60;
      if (this.drop) {
        this.drop.t += dt;
        const p = this.drop.t / this.drop.dur;
        this.speed = 0;
        if (!this.drop.splashed && p >= 0.55) {
          this.drop.splashed = true;
          const c = this.segments[0];
          const rs = config.rippleStrength;
          spawnRipple(c.x, c.y, 3.2 * rs);
        }
        if (p >= 1) {
          this.drop = null;
          this.speed = 2.4;
        }
      }
      if (this.fedTimer > 0) this.fedTimer -= dtMult;
      let target = null;
      let minDistSq = Infinity;
      if (this.fedTimer <= 0) {
        for (let i = 0; i < foods.length; i++) {
          let dSq = distanceSq(this, foods[i]);
          if (dSq < minDistSq) {
            minDistSq = dSq;
            target = foods[i];
          }
        }
      }
      let effectiveBaseSpeed = this.baseSpeed * config.fishSpeed * (this.moodSpeedMul || 1);
      const bodyLength = (this.numSegments - 1) * this.segmentSpacing * config.fishSize * this.sizeMul;
      const minimumTurnRadius = bodyLength * this.type.turnRadius;
      const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      let desiredTurnRate = 0;
      let desiredSpeed = effectiveBaseSpeed;
      let behavior = "cruise";
      let wantHeading = null;
      const flock = this.computeFlockInfluence();
      const fx = Math.cos(this.heading), fy = Math.sin(this.heading);
      const safeMargin = Math.max(50, bodyLength * 1);
      const probeDistance = Math.max(minimumTurnRadius * 1.15, this.speed * 60 * 0.9);
      let inwardX = 0, inwardY = 0, threat = 0;
      const consider = (room, comp, ix, iy) => {
        if (comp <= 0.02) return;
        const t = (room - safeMargin) / (comp * probeDistance);
        if (t < 1) {
          const w = 1 - Math.max(0, t);
          if (w > threat) {
            threat = w;
            inwardX = ix;
            inwardY = iy;
          }
        }
      };
      consider(viewport.width - this.x, fx, -1, 0);
      consider(this.x, -fx, 1, 0);
      consider(viewport.height - this.y, fy, 0, -1);
      consider(this.y, -fy, 0, 1);
      let edgeThreat = clamp(threat, 0, 1);
      const wantsFood = !!target && minDistSq < FOOD_DETECT_RADIUS_SQ;
      const foodWins = wantsFood && edgeThreat < 0.5;
      if (edgeThreat > 0.04 && !foodWins) {
        behavior = "edge";
        let inwardHeading = Math.atan2(inwardY, inwardX);
        wantHeading = inwardHeading;
        desiredTurnRate = clamp(wrapAngle(inwardHeading - this.heading) * 3, -1.45, 1.45);
        desiredSpeed = effectiveBaseSpeed * (1 - edgeThreat * 0.2);
      } else if (foodWins) {
        behavior = "food";
        let foodHeading = Math.atan2(target.y - this.y, target.x - this.x);
        wantHeading = foodHeading;
        desiredTurnRate = clamp(wrapAngle(foodHeading - this.heading) * 2.6, -1.45, 1.45);
        const fd = Math.sqrt(minDistSq);
        const near = clamp((fd - 14) / 110, 0.34, 1);
        desiredSpeed = effectiveBaseSpeed * 2.2 * near;
        if (minDistSq < EAT_RADIUS_SQ || this.bodyTouchesFood(target)) {
          foods.splice(foods.indexOf(target), 1);
          this.fedTimer = 51;
        }
      } else if (config.shyFish && mouse.active && distanceSq(this, mouse) < FEAR_RADIUS_SQ) {
        behavior = "flee";
        let fleeHeading = Math.atan2(this.y - mouse.y, this.x - mouse.x);
        wantHeading = fleeHeading;
        desiredTurnRate = clamp(wrapAngle(fleeHeading - this.heading) * 2.7, -1.35, 1.35);
        desiredSpeed = effectiveBaseSpeed * 2.8;
      } else if (this.schoolId >= 0 && schools[this.schoolId]) {
        behavior = "school";
        const s = schools[this.schoolId];
        const arcNow = s.arcLive !== void 0 ? s.arcLive : s.arc;
        const avail = Math.max(80, arcNow - (s.trail && s.trail.length ? s.trail[0].a : 0));
        const queueLen = Math.min(avail, QUEUE_LEN);
        const wantBack = (0.05 + 0.9 * this.schoolFrac) * QUEUE_LEN;
        const back = Math.min(wantBack, Math.max(30, avail - 30));
        const tp = trailPoint(s, back + Math.sin(time.elapsed * 0.35 + this.slotPhase) * 16);
        const fwd = s.curSpeed || s.speed;
        let tx = this.x, ty = this.y;
        if (tp) {
          const pnx = -tp.ty, pny = tp.tx;
          const side = this.schoolSide + Math.cos(time.elapsed * 0.29 + this.slotPhase) * 10;
          tx = tp.x + pnx * side;
          ty = tp.y + pny * side;
        }
        const kp = 8e-3;
        const fwdX = tp ? tp.tx : Math.cos(s.heading);
        const fwdY = tp ? tp.ty : Math.sin(s.heading);
        const dvx = fwdX * fwd + (tx - this.x) * kp;
        const dvy = fwdY * fwd + (ty - this.y) * kp;
        const dvLen = Math.hypot(dvx, dvy);
        if (dvLen > 1e-3) {
          const wantH = Math.atan2(dvy, dvx);
          wantHeading = wantH;
          desiredTurnRate = clamp(wrapAngle(wantH - this.heading) * 2.2, -1.2, 1.2);
          const err = Math.hypot(tx - this.x, ty - this.y);
          const catchUp = Math.min(2.6, 1 + err / 90);
          desiredSpeed = Math.min(dvLen, fwd * catchUp);
        }
      } else {
        this.turnBiasTimer -= dt;
        if (this.turnBiasTimer <= 0) {
          this.turnBiasTarget = (Math.random() - 0.5) * 0.26;
          this.turnBiasTimer = 1.8 + Math.random() * 3.2;
        }
        this.turnBias += (this.turnBiasTarget - this.turnBias) * Math.min(1, dt / 1.25);
        desiredTurnRate = this.turnBias;
        this.cruisePhase += dt * 0.42;
        this.burstPhase += dt * this.burstRate;
        desiredSpeed = effectiveBaseSpeed * (0.78 + 0.34 * (0.5 + 0.5 * Math.sin(this.burstPhase)));
      }
      this.lastBehavior = behavior;
      if (behavior !== "edge") {
        if (behavior === "school") {
          desiredTurnRate += flock.sepTurn * 0.3;
        } else {
          const flockWeight = behavior === "food" ? 0.6 : behavior === "flee" ? 0.45 : 1;
          desiredTurnRate += flock.turn * flockWeight;
        }
      }
      if (this.moodBandPull && behavior !== "edge" && behavior !== "food" && behavior !== "flee") {
        const lookX = this.x + Math.cos(this.heading) * 240;
        const bandHeading = Math.atan2(this.moodBandY - this.y, lookX - this.x);
        desiredTurnRate += clamp(wrapAngle(bandHeading - this.heading), -0.6, 0.6) * this.moodBandPull * (behavior === "school" ? 0.5 : 1);
      }
      let pivot = false;
      if (wantHeading !== null && behavior !== "school") {
        pivot = Math.abs(wrapAngle(wantHeading - this.heading)) > 2.39;
      }
      if (pivot) this.pivotTimer = 0.8;
      else if (this.pivotTimer > 0) {
        this.pivotTimer -= dt;
        pivot = true;
      }
      if (pivot) {
        desiredTurnRate = clamp(wrapAngle(wantHeading - this.heading) * 2.6, -2.6, 2.6);
        desiredSpeed = Math.min(desiredSpeed, effectiveBaseSpeed * 0.36);
      }
      this.lastPivot = pivot;
      const speedPerSecond = Math.max(this.speed, effectiveBaseSpeed * 0.42) * 60;
      let turnRadius = minimumTurnRadius;
      if (pivot) turnRadius = minimumTurnRadius * 0.05;
      else if (behavior === "food") turnRadius = minimumTurnRadius * 0.26;
      else if (this.schoolId >= 0) turnRadius = minimumTurnRadius * 0.32;
      const fastAct = behavior === "food" || behavior === "flee";
      const maxTurnRate = Math.min(
        pivot ? 2.6 : fastAct ? 1.6 : 1.15,
        speedPerSecond / turnRadius
      );
      const turnAcceleration = pivot ? 7 : 2.6;
      desiredTurnRate = clamp(desiredTurnRate, -maxTurnRate, maxTurnRate);
      this.turnRate += clamp(desiredTurnRate - this.turnRate, -turnAcceleration * dt, turnAcceleration * dt);
      this.turnRate = clamp(this.turnRate, -maxTurnRate, maxTurnRate);
      this.heading = wrapAngle(this.heading + this.turnRate * dt);
      let speedResponse = desiredSpeed > this.speed ? 1.8 : 1.15;
      if (pivot) speedResponse = 3.5;
      if (behavior === "food" || behavior === "flee") speedResponse = 4.5;
      this.speed += (desiredSpeed - this.speed) * Math.min(1, speedResponse * dt);
      let speedCap = effectiveBaseSpeed * 3.2;
      let speedFloor = effectiveBaseSpeed * 0.42;
      if (this.schoolId >= 0 && schools[this.schoolId]) {
        const ls = schools[this.schoolId].speed;
        speedCap = Math.max(speedCap, ls * 2.6);
        speedFloor = Math.min(speedFloor, ls * 0.55);
      }
      this.speed = clamp(this.speed, speedFloor, speedCap);
      this.vx = Math.cos(this.heading) * this.speed;
      this.vy = Math.sin(this.heading) * this.speed;
      this.x += this.vx * dtMult;
      this.y += this.vy * dtMult;
      if (this.x < 0) {
        this.x = 0;
        this.heading = Math.atan2(Math.sin(this.heading), Math.abs(Math.cos(this.heading)));
        this.turnRate = 0;
      }
      if (this.x > viewport.width) {
        this.x = viewport.width;
        this.heading = Math.atan2(Math.sin(this.heading), -Math.abs(Math.cos(this.heading)));
        this.turnRate = 0;
      }
      if (this.y < 0) {
        this.y = 0;
        this.heading = Math.atan2(Math.abs(Math.sin(this.heading)), Math.cos(this.heading));
        this.turnRate = 0;
      }
      if (this.y > viewport.height) {
        this.y = viewport.height;
        this.heading = Math.atan2(-Math.abs(Math.sin(this.heading)), Math.cos(this.heading));
        this.turnRate = 0;
      }
      this.vx = Math.cos(this.heading) * this.speed;
      this.vy = Math.sin(this.heading) * this.speed;
      this.swimCycle += (1.45 + this.speed * 60 * 0.075) * dt;
      this.angle = this.heading;
      this.segments[0].x = this.x;
      this.segments[0].y = this.y;
      let currentSpacing = this.segmentSpacing * config.fishSize * this.sizeMul;
      const MAX_JOINT_TURN = 0.17;
      const MAX_JOINT_RATE = 3.5;
      const maxJointTurn = MAX_JOINT_TURN;
      const maxJointStep = MAX_JOINT_RATE * dt;
      let prevAngle = this.bodyAngle;
      let firstJointAngle = null;
      if (!this.jointAngles) this.jointAngles = [];
      for (let i = 1; i < this.numSegments; i++) {
        let prev = this.segments[i - 1];
        let curr = this.segments[i];
        let dx = prev.x - curr.x;
        let dy = prev.y - curr.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        let a = dist > 1e-3 ? Math.atan2(dy, dx) : prevAngle !== null ? prevAngle : this.angle + Math.PI;
        if (prevAngle !== null) {
          let d = Math.atan2(Math.sin(a - prevAngle), Math.cos(a - prevAngle));
          a = prevAngle + Math.max(-maxJointTurn, Math.min(maxJointTurn, d));
        }
        curr.x = prev.x - Math.cos(a) * currentSpacing;
        curr.y = prev.y - Math.sin(a) * currentSpacing;
        const pa = this.jointAngles[i];
        if (pa !== void 0) {
          const d2 = Math.atan2(Math.sin(a - pa), Math.cos(a - pa));
          a = pa + Math.max(-maxJointStep, Math.min(maxJointStep, d2));
        }
        this.jointAngles[i] = a;
        if (i === 1) firstJointAngle = a;
        prevAngle = a;
      }
      if (firstJointAngle !== null) this.bodyAngle = firstJointAngle;
    }
    return { computeFlockInfluence, bodyTouchesFood, update };
  }

  // src/pond/creatures/koi-fish.js
  function createKoiCreature({ config, viewport, time, kois, foods, mouse, spawnRipple, schoolSystem, drawFish }) {
    const { schools, trailPoint, QUEUE_LEN, SOLO_RATIO: SOLO_RATIO2, SCHOOL_COUNT, SCHOOL_PERCEIVE_K, SCHOOL_PERCEIVE_MIN, SEP_W, ALIGN_W, COH_W, MAX_STEER } = schoolSystem;
    class Koi {
      constructor(type, opts = {}) {
        this.type = type;
        this.typeId = type.id;
        this.segmentSpacing = this.type.segmentSpacing;
        this.origin = opts.origin || "spawned";
        this.custom = opts.custom === true;
        this.drop = null;
        this.shape = this.type.shape ? KOI_SHAPE.clampShape(this.type.shape) : null;
        this.skin = null;
        this.skinReady = false;
        this.name = "";
        this.x = Math.random() * viewport.width;
        this.y = Math.random() * viewport.height;
        this.vx = (Math.random() - 0.5) * 1;
        this.vy = (Math.random() - 0.5) * 1;
        this.baseSpeed = (0.4 + Math.random() * 0.4) * this.type.speedMultiplier;
        this.maxForce = 0.03;
        this.pickBreed();
        this.depth = Math.random();
        this.sizeMul = 0.4 + this.depth * 0.56;
        this.segments = [];
        this.numSegments = 12;
        for (let i = 0; i < this.numSegments; i++) {
          this.segments.push({ x: this.x, y: this.y });
        }
        this.angle = Math.atan2(this.vy, this.vx);
        this.heading = this.angle;
        this.turnRate = 0;
        this.speed = Math.hypot(this.vx, this.vy);
        this.bodyAngle = this.heading + Math.PI;
        const bodyLen = (this.numSegments - 1) * this.segmentSpacing * config.fishSize * this.sizeMul;
        this.waveFreq = 1 + Math.random() * 0.55;
        this.waveLen = 4.3 + Math.random() * 2.3;
        this.waveEnv = bodyLen * (0.07 + Math.random() * 0.06);
        this.collHalf = bodyLen * 0.5;
        this.collR = bodyLen * this.type.collisionRadius;
        this.collision = { shape: "capsule", half: this.collHalf, r: this.collR, end: this.type.collisionEnd };
        this.burstRate = 0.3 + Math.random() * 0.35;
        this.burstPhase = Math.random() * Math.PI * 2;
        this.turnBias = 0;
        this.turnBiasTarget = (Math.random() - 0.5) * 0.2;
        this.turnBiasTimer = 1.5 + Math.random() * 2.5;
        this.cruisePhase = Math.random() * Math.PI * 2;
        this.schoolId = Math.random() < this.type.soloRatio ? -1 : schoolSystem.nextSchool();
        this.schoolFrac = Math.random();
        this.schoolSide = (Math.random() - 0.5) * 110;
        this.slotPhase = Math.random() * Math.PI * 2;
        this.swimCycle = Math.random() * Math.PI * 2;
        this.fedTimer = 0;
        if (this.schoolId >= 0 && schools[this.schoolId] && schools[this.schoolId].trail) {
          const sc0 = schools[this.schoolId];
          const av0 = Math.max(80, (sc0.arcLive !== void 0 ? sc0.arcLive : sc0.arc) - sc0.trail[0].a);
          const ql0 = Math.min(av0, QUEUE_LEN);
          const tp0 = trailPoint(sc0, (0.05 + 0.9 * this.schoolFrac) * ql0);
          if (tp0) {
            this.x = tp0.x + -tp0.ty * this.schoolSide;
            this.y = tp0.y + tp0.tx * this.schoolSide;
            this.heading = Math.atan2(tp0.ty, tp0.tx);
            this.angle = this.heading;
            this.vx = Math.cos(this.heading) * this.speed;
            this.vy = Math.sin(this.heading) * this.speed;
            for (let i = 0; i < this.numSegments; i++) {
              this.segments[i].x = this.x;
              this.segments[i].y = this.y;
            }
          }
        }
      }
      /** 按权重随机挑一个品种(红白/黄金/孔雀…)。
       *  原来这里还有"霓虹/单色"两个主题分支(上游留下的 fishTheme 属性)——
       *  已按用户决定删掉:这个池塘是低饱和写实风,霓虹/灰阶是另一个产品,
       *  而且默认档位就是它,那个下拉对用户等于没有。 */
      pickBreed() {
        const breeds = this.type.breeds;
        let r = Math.random() * breeds.reduce((sum, b) => sum + b.w, 0), acc = 0, pick = breeds[0];
        for (let k = 0; k < breeds.length; k++) {
          acc += breeds[k].w;
          if (r <= acc) {
            pick = breeds[k];
            break;
          }
        }
        this.applyBreed(pick);
      }
      applyBreed(pick) {
        this.breedId = pick.id || "custom-palette";
        this.breed = pick.name;
        const tint = (Math.random() - 0.5) * 0.18;
        this.color = varyHexColor(pick.body, tint);
        this.net = (pick.net || 0) * (0.75 + Math.random() * 0.5);
        this.sheen = (pick.sheen || 0) * (0.8 + Math.random() * 0.4);
        this.kuchi = pick.kuchi ? varyHexColor(pick.kuchi, tint * 0.6) : null;
        this.edge = pick.edge ? varyHexColor(pick.edge, tint * 0.6) : null;
        const BODY_SPAN = 0.78, NSEG = 11;
        this.spotRanges = [];
        const patches = pick.patches || [];
        for (let k = 0; k < patches.length; k++) {
          const pt = patches[k];
          const segs = pt.segs || [];
          if (!segs.length) continue;
          const u0 = Math.min(BODY_SPAN, segs[0] / NSEG);
          const u1 = Math.min(BODY_SPAN, (segs[segs.length - 1] + 1) / NSEG);
          this.spotRanges.push([
            u0,
            u1,
            varyHexColor(pt.color, tint * 0.6),
            pt.pw || 0.5
          ]);
        }
        if (!patches.length && pick.heads && pick.heads.length) {
          const u0 = Math.min(BODY_SPAN, pick.heads[0] / NSEG);
          const u1 = Math.min(BODY_SPAN, (pick.heads[pick.heads.length - 1] + 1) / NSEG);
          this.spotRanges.push([u0, u1, varyHexColor(pick.spot || "#ffffff", tint * 0.6), 0.52]);
        }
      }
      /** 碰撞推开:整体位移(身体各节一起挪,否则会把鱼扯直) */
      translate(dx, dy) {
        this.x += dx;
        this.y += dy;
        const S = this.segments;
        for (let i = 0; i < S.length; i++) {
          S[i].x += dx;
          S[i].y += dy;
        }
      }
    }
    Object.assign(Koi.prototype, createBehavior({ config, viewport, time, kois, foods, mouse, spawnRipple, schoolSystem }));
    Koi.prototype.draw = function(ctx) {
      (this.type.draw || drawFish).call(this, ctx);
    };
    return { create: (type, opts) => new Koi(type, opts), Koi };
  }

  // src/features/clock.js
  var lx3 = () => THEME.light.dir[0];
  var ly3 = () => THEME.light.dir[1];
  function createClock({ viewport }) {
    let clockTime = "", clockDate = "", clockStamp = "";
    function refreshClockText() {
      const d = /* @__PURE__ */ new Date();
      const stamp = d.getFullYear() + "/" + d.getMonth() + "/" + d.getDate() + " " + d.getHours() + ":" + d.getMinutes();
      if (stamp === clockStamp) return;
      clockStamp = stamp;
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      clockTime = hh + ":" + mm;
      const weekdays = ["\u661F\u671F\u65E5", "\u661F\u671F\u4E00", "\u661F\u671F\u4E8C", "\u661F\u671F\u4E09", "\u661F\u671F\u56DB", "\u661F\u671F\u4E94", "\u661F\u671F\u516D"];
      clockDate = d.getMonth() + 1 + "\u6708" + d.getDate() + "\u65E5 " + weekdays[d.getDay()];
    }
    function drawClock(g) {
      const T = THEME.clock;
      if (!T.show) return;
      refreshClockText();
      const short = Math.min(viewport.width, viewport.height);
      const tSize = short * T.timeSize;
      const dSize = tSize * T.dateSize;
      const gap = tSize * T.gap;
      const [vert, horiz] = T.anchor.split("-");
      const mx = viewport.width * T.marginX, my = viewport.height * T.marginY;
      g.save();
      g.textBaseline = "middle";
      g.textAlign = horiz === "left" ? "left" : horiz === "right" ? "right" : "center";
      const cx = horiz === "left" ? mx : horiz === "right" ? viewport.width - mx : viewport.width / 2;
      const blockH = tSize + gap + dSize;
      const top = vert === "top" ? my : viewport.height - my - blockH;
      const timeY = top + tSize / 2;
      const dateY = top + tSize + gap + dSize / 2;
      const off = short * T.shadowOffset;
      g.shadowColor = T.shadow + T.shadowAlpha + ")";
      g.shadowBlur = short * T.shadowBlur;
      g.shadowOffsetX = -lx3() * off;
      g.shadowOffsetY = -ly3() * off;
      const rf = short * 22e-4;
      g.save();
      g.shadowColor = "transparent";
      g.fillStyle = "rgba(150,220,215,0.20)";
      g.font = "600 " + Math.round(tSize) + "px " + T.font;
      g.fillText(clockTime, cx - lx3() * rf, timeY - ly3() * rf);
      g.font = "400 " + Math.round(dSize) + "px " + T.font;
      g.fillText(clockDate, cx - lx3() * rf, dateY - ly3() * rf);
      g.restore();
      g.fillStyle = T.color;
      g.font = "600 " + Math.round(tSize) + "px " + T.font;
      g.fillText(clockTime, cx, timeY);
      g.font = "400 " + Math.round(dSize) + "px " + T.font;
      g.fillText(clockDate, cx, dateY);
      g.restore();
    }
    return { draw: drawClock };
  }

  // src/features/feeding.js
  function createFeeding({ config, foods, Food, spawnRipple, rng }) {
    const R = rng || Math.random;
    function feedAt(x, y) {
      if (config.enableFeeding) {
        const N = 20;
        const MAX_FOOD = 240;
        const startIdx = foods.length;
        for (let i = 0; i < N && foods.length < MAX_FOOD; i++) {
          let a = R() * Math.PI * 2;
          let d = 8 + Math.pow(R(), 0.6) * 48;
          const fx = x + Math.cos(a) * d;
          const fy = y + Math.sin(a) * d * 0.85;
          foods.push(new Food(fx, fy));
        }
        for (let i = startIdx; i < foods.length; i++) {
          foods[i].pop = 0.4 + R() * 0.6;
        }
      }
      spawnRipple(x, y, 1.5 * config.rippleStrength);
    }
    return { feedAt };
  }

  // src/features/custom-fish.js
  function createCustomFish({ Koi, koiType, kois, config, viewport, spawnRipple, repository }) {
    const listeners = [];
    function listen(n, fn) {
      window.addEventListener(n, fn);
      listeners.push([n, fn]);
    }
    let customDefs = [];
    const customKoiById = /* @__PURE__ */ new Map();
    class CustomKoi extends Koi {
      constructor(def) {
        super(koiType, { custom: true, origin: "custom" });
        this.custom = true;
        this.customId = def.id;
        this.sizeMul = 0.5 + this.depth * 0.44;
        this.spotRanges = [];
        this.net = 0;
        this.sheen = 0;
        this.kuchi = null;
        this.edge = null;
        this.applyCustomDef(def);
      }
      applyCustomDef(def) {
        this.shape = KOI_SHAPE.clampShape(def.shape);
        this.name = def.name || "";
        this.color = def.color || "#ffffff";
        if (def.skin && def.skin !== this.skinSrc) {
          this.skinSrc = def.skin;
          const im = new Image();
          im.onload = () => {
            this.skin = im;
            this.skinReady = true;
            this.noseColor = noseColorOf(im);
          };
          im.src = def.skin;
        }
      }
    }
    function syncCustomFish() {
      for (let i = kois.length - 1; i >= 0; i--) {
        const k = kois[i];
        if (k.custom && !customDefs.some((d) => d && d.id === k.customId)) {
          kois.splice(i, 1);
          customKoiById.delete(k.customId);
        }
      }
      customDefs.slice(0, 6).forEach((d) => {
        if (!d || !d.id) return;
        let k = customKoiById.get(d.id);
        if (!k) {
          k = new CustomKoi(d);
          customKoiById.set(d.id, k);
          kois.push(k);
        } else {
          k.applyCustomDef(d);
        }
      });
    }
    let lastCustomRaw = null;
    const RELEASE_KEY = "koi.custom.release.v1";
    let lastReleaseRaw = "";
    function releaseFish(k) {
      if (!k) return;
      const cx = viewport.width * 0.5, cy = viewport.height * 0.5;
      for (let i = 0; i < k.segments.length; i++) {
        k.segments[i].x = cx;
        k.segments[i].y = cy;
      }
      k.x = cx;
      k.y = cy;
      k.heading = Math.random() * Math.PI * 2;
      k.angle = k.heading;
      k.speed = 0;
      k.depth = Math.max(0.45, k.depth);
      k.drop = { t: 0, dur: 1.05, splashed: false };
      spawnRipple(cx, cy, 0.8 * config.rippleStrength);
    }
    function checkRelease() {
      let raw = null;
      try {
        raw = repository.getRaw(RELEASE_KEY);
      } catch (e) {
        return;
      }
      if (!raw || raw === lastReleaseRaw) return;
      lastReleaseRaw = raw;
      let msg = null;
      try {
        msg = JSON.parse(raw);
      } catch (e) {
        return;
      }
      if (!msg || !msg.id || !Number.isFinite(msg.t) || Date.now() - msg.t > 15e3) return;
      releaseFish(customKoiById.get(msg.id));
    }
    listen("storage", (e) => {
      if (e.key === RELEASE_KEY) {
        loadCustomFishFromStore();
        checkRelease();
      }
    });
    function loadCustomFishFromStore() {
      try {
        const raw = repository.getRaw("koi.custom.fish.v1");
        lastCustomRaw = raw;
        const parsed = raw && JSON.parse(raw);
        customDefs = Array.isArray(parsed == null ? void 0 : parsed.list) ? parsed.list.filter((d) => d && typeof d.id === "string") : [];
      } catch (e) {
        customDefs = [];
      }
      syncCustomFish();
    }
    listen("storage", (e) => {
      if (e.key === "koi.custom.fish.v1") loadCustomFishFromStore();
    });
    const poll = setInterval(() => {
      try {
        if (repository.getRaw("koi.custom.fish.v1") !== lastCustomRaw) loadCustomFishFromStore();
      } catch (e) {
      }
      checkRelease();
    }, 2e3);
    return { syncCustomFish, loadCustomFishFromStore, releaseFish, dispose() {
      clearInterval(poll);
      for (const [n, f] of listeners) window.removeEventListener(n, f);
      for (let i = kois.length - 1; i >= 0; i--) if (kois[i].custom) kois.splice(i, 1);
      customKoiById.clear();
    } };
  }

  // src/ui/overlay.js
  function createOverlay({ kois, mouse }) {
    function customBtnRectCss() {
      const g = window.__koiGeom;
      if (!g || !g.btn || !g.vw) return null;
      const k = window.innerWidth / g.vw;
      return {
        x: (g.btn.x - g.vx) * k,
        y: (g.btn.y - g.vy) * k,
        w: g.btn.w * k,
        h: g.btn.h * k
      };
    }
    function drawRoundRect(g, x, y, w, h, r) {
      g.beginPath();
      if (g.roundRect) {
        g.roundRect(x, y, w, h, r);
        return;
      }
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }
    function drawCustomOverlay(g) {
      if (mouse.active) {
        g.textAlign = "center";
        g.textBaseline = "middle";
        for (let i = 0; i < kois.length; i++) {
          const k = kois[i];
          if (!k.custom || !k.name) continue;
          const hx = k.segments[0].x, hy = k.segments[0].y;
          const d = Math.hypot(mouse.x - hx, mouse.y - hy);
          if (d > 160) continue;
          const a = Math.min(1, (160 - d) / 70);
          g.font = "600 15px system-ui,sans-serif";
          const w = g.measureText(k.name).width + 22;
          const by = hy - 56;
          g.globalAlpha = a * 0.85;
          g.fillStyle = "rgba(8,20,18,0.62)";
          drawRoundRect(g, hx - w / 2, by, w, 25, 12.5);
          g.fill();
          g.globalAlpha = a * 0.95;
          g.fillStyle = "#eef7f2";
          g.fillText(k.name, hx, by + 13);
          g.globalAlpha = 1;
        }
      }
      const r = customBtnRectCss();
      if (!r || !mouse.active) return;
      const pad = 54;
      const dx = Math.max(r.x - mouse.x, 0, mouse.x - (r.x + r.w));
      const dy = Math.max(r.y - mouse.y, 0, mouse.y - (r.y + r.h));
      const dist = Math.hypot(dx, dy);
      if (dist > pad) return;
      g.globalAlpha = 0.3 + 0.7 * (1 - dist / pad);
      g.fillStyle = "rgba(10,26,24,0.66)";
      drawRoundRect(g, r.x, r.y, r.w, r.h, r.h / 2);
      g.fill();
      g.strokeStyle = "rgba(210,235,225,0.42)";
      g.lineWidth = 1.2;
      g.stroke();
      g.fillStyle = "#eaf5ef";
      g.font = "600 " + Math.round(r.h * 0.4) + "px system-ui,sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("+ Custom Fish", r.x + r.w / 2, r.y + r.h / 2 + 0.5);
      g.globalAlpha = 1;
    }
    return { draw: drawCustomOverlay };
  }

  // src/render/rain-streaks.js
  function createRainStreaks({ viewport, streak = {}, rng = Math.random }) {
    const cap = Math.max(1, streak.maxLive || 140);
    const lenR = streak.len || [10, 26];
    const speedR = streak.speed || [620, 900];
    const width = streak.width || 1.25;
    const slopeR = streak.slope || [-0.26, -0.26];
    const alphaR = streak.alpha || [0.1, 0.3];
    const pool = new Array(cap);
    const pick = (r) => r[0] + rng() * (r[1] - r[0]);
    for (let i = 0; i < cap; i++) pool[i] = { x: 0, y: 0, len: 0, vy: 0, slope: 0, a: 0, target: 0, live: false };
    let created = 0, impacts = 0;
    function respawn(s, anywhere) {
      const far = rng();
      s.len = pick(lenR) * (0.55 + 0.75 * far);
      s.vy = pick(speedR) * (0.55 + 0.75 * far);
      s.slope = pick(slopeR);
      s.a = pick(alphaR) * (0.45 + 0.9 * far);
      s.x = rng() * viewport.width * 1.25 - viewport.width * 0.125;
      s.target = viewport.height * (0.05 + 0.95 * rng());
      s.y = anywhere ? rng() * s.target : -s.len - rng() * viewport.height * 0.3;
      s.live = true;
      created++;
    }
    return {
      get count() {
        return pool.reduce((n, s) => n + (s.live ? 1 : 0), 0);
      },
      get cap() {
        return cap;
      },
      get created() {
        return created;
      },
      get impacts() {
        return impacts;
      },
      /** 把数量凑到 target(不足就补;多了不动,等它自己落完) */
      fill(target) {
        let live = this.count;
        for (let i = 0; i < cap && live < target; i++) {
          if (!pool[i].live) {
            respawn(pool[i], true);
            live++;
          }
        }
      },
      /**
       * @param dt 秒
       * @param target 当前该有多少条在场(天晴/关天气时传 0 ⇒ 落完就退休,不会永远循环)
       * @param onImpact 撞到水面的回调(在原地起水坑)
       */
      update(dt, target = cap, onImpact) {
        for (let i = 0; i < cap; i++) {
          const s = pool[i];
          if (!s.live) continue;
          s.y += s.vy * dt;
          s.x += s.vy * s.slope * dt;
          if (s.y >= s.target) {
            if (onImpact) {
              onImpact(s.x, s.target);
              impacts++;
            }
            if (this.count > target) s.live = false;
            else respawn(s, false);
          }
          if (s.x < -viewport.width * 0.25) s.x += viewport.width * 1.5;
        }
      },
      draw(g) {
        const wasOp = g.globalCompositeOperation, wasA = g.globalAlpha;
        g.globalCompositeOperation = "screen";
        g.lineCap = "round";
        g.lineWidth = width;
        g.strokeStyle = "rgba(228,245,249,1)";
        for (let i = 0; i < cap; i++) {
          const s = pool[i];
          if (!s.live) continue;
          g.globalAlpha = s.a;
          g.beginPath();
          g.moveTo(s.x, s.y);
          g.lineTo(s.x - s.slope * s.len * 1, s.y - s.len);
          g.stroke();
        }
        g.globalAlpha = wasA;
        g.globalCompositeOperation = wasOp;
      },
      clear() {
        for (let i = 0; i < cap; i++) pool[i].live = false;
      },
      inspect: () => ({ cap, created, impacts, count: pool.reduce((n, s) => n + (s.live ? 1 : 0), 0) })
    };
  }

  // src/render/snowflakes.js
  var SPRITE_S = 64;
  var sprites = null;
  function bakeSprites() {
    if (sprites || typeof document === "undefined") return sprites;
    const R = mulberry32(24145);
    const make = (detail) => {
      const c = document.createElement("canvas");
      c.width = c.height = SPRITE_S;
      const g = c.getContext("2d");
      const cx = SPRITE_S / 2, maxR = SPRITE_S * 0.46;
      g.strokeStyle = "rgba(255,255,255,0.92)";
      g.fillStyle = "rgba(255,255,255,0.92)";
      g.lineCap = "round";
      g.shadowColor = "rgba(255,255,255,0.8)";
      g.shadowBlur = 2;
      if (detail === 0) {
        g.beginPath();
        g.arc(cx, cx, SPRITE_S * 0.1, 0, Math.PI * 2);
        g.fill();
        return c;
      }
      for (let i = 0; i < 6; i++) {
        g.save();
        g.translate(cx, cx);
        g.rotate(i / 6 * Math.PI * 2 + (R() - 0.5) * 0.06);
        const L = maxR * (0.82 + R() * 0.18);
        g.lineWidth = Math.max(1.6, SPRITE_S * 0.035);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(0, -L);
        g.stroke();
        if (detail >= 2) {
          g.lineWidth = Math.max(1.2, SPRITE_S * 0.025);
          for (const [t, bl] of [[0.45, 0.3], [0.72, 0.2]]) {
            for (const s of [-1, 1]) {
              const y0 = -L * t;
              const bx = Math.sin(Math.PI / 3) * L * bl * s;
              const by = y0 - Math.cos(Math.PI / 3) * L * bl;
              g.beginPath();
              g.moveTo(0, y0);
              g.lineTo(bx, by);
              g.stroke();
            }
          }
        }
        if (detail >= 3) {
          const pr = L * 0.13;
          g.lineWidth = Math.max(1.1, SPRITE_S * 0.022);
          g.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = k / 6 * Math.PI * 2 + Math.PI / 6;
            const px = Math.cos(a) * pr, py = -L - Math.sin(a) * pr;
            if (k === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          }
          g.closePath();
          g.stroke();
        }
        g.restore();
      }
      g.beginPath();
      g.arc(cx, cx, SPRITE_S * (0.05 + detail * 0.012), 0, Math.PI * 2);
      g.fill();
      return c;
    };
    sprites = [make(0), make(1), make(2), make(2), make(3), make(3)];
    return sprites;
  }
  function createSnowflakes({ viewport, snow = {}, rng = Math.random }) {
    const cap = Math.max(1, snow.maxLive || 180);
    const sizeR = snow.size || [8, 26];
    const vyR = snow.vy || [26, 60];
    const freqR = snow.swayFreq || [0.5, 1.3];
    const ampR = snow.swayAmp || [6, 20];
    const alphaR = snow.alpha || [0.3, 0.75];
    const meltR = snow.melt || [0.7, 1.5];
    const pool = new Array(cap);
    const pick = (r) => r[0] + rng() * (r[1] - r[0]);
    for (let i = 0; i < cap; i++) {
      pool[i] = {
        x: 0,
        y: 0,
        d: 0,
        vy: 0,
        freq: 0,
        amp: 0,
        ph: 0,
        a: 0,
        target: 0,
        melt: 0,
        meltT: 0,
        melting: false,
        live: false,
        rot: 0,
        spin: 0,
        si: 0
      };
    }
    let created = 0, melted = 0;
    function respawn(f, anywhere) {
      const far = rng();
      f.d = pick(sizeR) * (0.55 + 0.75 * far);
      f.vy = pick(vyR) * (0.55 + 0.75 * far);
      f.freq = pick(freqR);
      f.amp = pick(ampR) * (0.55 + 0.75 * far);
      f.ph = rng() * Math.PI * 2;
      f.a = pick(alphaR) * (0.45 + 0.9 * far);
      f.rot = rng() * Math.PI * 2;
      f.spin = (rng() - 0.5) * 1.6;
      f.si = f.d < 6 ? 0 : f.d < 11 ? 1 : 2 + (rng() * 4 | 0);
      f.x = rng() * viewport.width * 1.25 - viewport.width * 0.125;
      f.target = viewport.height * (0.05 + 0.95 * rng());
      f.y = anywhere ? rng() * f.target : -f.d - rng() * viewport.height * 0.3;
      f.melt = pick(meltR);
      f.meltT = 0;
      f.melting = false;
      f.live = true;
      created++;
    }
    return {
      get count() {
        return pool.reduce((n, f) => n + (f.live ? 1 : 0), 0);
      },
      get cap() {
        return cap;
      },
      get created() {
        return created;
      },
      get melted() {
        return melted;
      },
      /** 把数量凑到 target(不足就补;多了不动,等它们自己化完) */
      fill(target) {
        let live = this.count;
        for (let i = 0; i < cap && live < target; i++) {
          if (!pool[i].live) {
            respawn(pool[i], true);
            live++;
          }
        }
      },
      /**
       * @param dt 秒
       * @param target 当前该有多少片在场(天晴/关天气时传 0 ⇒ 飘完就退休)
       */
      update(dt, target = cap) {
        for (let i = 0; i < cap; i++) {
          const f = pool[i];
          if (!f.live) continue;
          if (!f.melting) {
            f.y += f.vy * dt;
            f.ph += f.freq * dt;
            f.x += Math.sin(f.ph) * f.amp * dt;
            f.rot += f.spin * dt;
            if (f.y >= f.target) {
              if (this.count > target) {
                f.live = false;
                continue;
              }
              f.melting = true;
              f.meltT = 0;
            }
          } else {
            f.meltT += dt;
            if (f.meltT >= f.melt) {
              melted++;
              if (this.count > target) {
                f.live = false;
              } else respawn(f, false);
            }
          }
        }
      },
      draw(g) {
        const wasOp = g.globalCompositeOperation, wasA = g.globalAlpha;
        g.globalCompositeOperation = "screen";
        g.fillStyle = "rgb(240,248,252)";
        const sp = bakeSprites();
        for (let i = 0; i < cap; i++) {
          const f = pool[i];
          if (!f.live) continue;
          let a = f.a;
          if (f.melting) a *= 1 - f.meltT / f.melt;
          if (sp) {
            g.save();
            g.translate(f.x, f.y);
            g.rotate(f.rot);
            g.globalAlpha = a;
            g.drawImage(sp[f.si], -f.d / 2, -f.d / 2, f.d, f.d);
            g.restore();
          } else {
            g.globalAlpha = a;
            g.beginPath();
            g.arc(f.x, f.y, Math.max(0.6, f.d / 2), 0, Math.PI * 2);
            g.fill();
          }
        }
        g.globalAlpha = wasA;
        g.globalCompositeOperation = wasOp;
      },
      clear() {
        for (let i = 0; i < cap; i++) pool[i].live = false;
      },
      inspect: () => ({
        cap,
        created,
        melted,
        sprites: sprites ? sprites.length : 0,
        count: pool.reduce((n, f) => n + (f.live ? 1 : 0), 0)
      })
    };
  }

  // src/render/fog.js
  function createFog({ viewport, fog = {} }) {
    var _a;
    const rng = mulberry32((_a = fog.seed) != null ? _a : 3846);
    const count = Math.max(1, fog.puffs || 12);
    const tint = fog.tint || "214,228,235";
    let sprite = null;
    function bake() {
      if (sprite || typeof document === "undefined") return sprite;
      const S = 256;
      const c = document.createElement("canvas");
      c.width = c.height = S;
      const g = c.getContext("2d");
      const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      gr.addColorStop(0, "rgba(" + tint + ",0.9)");
      gr.addColorStop(0.45, "rgba(" + tint + ",0.42)");
      gr.addColorStop(1, "rgba(" + tint + ",0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, S, S);
      sprite = c;
      return sprite;
    }
    const puffs = [];
    for (let i = 0; i < count; i++) {
      puffs.push({
        x: rng() * 1.4 - 0.2,
        // 画宽的比例(允许出界 20%)
        y: rng() * 0.9 - 0.05,
        // 画高的比例
        s: 0.3 + rng() * 0.4,
        // 团直径 = 短边的比例
        vx: (4 + rng() * 10) * (rng() < 0.5 ? -1 : 1),
        // px/s,横向漂移
        vy: -(0.6 + rng() * 1.6),
        // 极缓上浮
        a: 0.06 + rng() * 0.07,
        ph: rng() * Math.PI * 2
      });
    }
    return {
      get count() {
        return count;
      },
      update(dt) {
        for (const p of puffs) {
          p.x += p.vx * dt / Math.max(1, viewport.width);
          p.y += p.vy * dt / Math.max(1, viewport.height);
          p.ph += dt * 0.15;
          if (p.x < -0.35) p.x += 1.7;
          else if (p.x > 1.35) p.x -= 1.7;
          if (p.y < -0.45) p.y += 1;
          else if (p.y > 0.55) p.y -= 1;
        }
      },
      /** amount = 大气量 0~1(雾档的淡入淡出) */
      draw(g, amount) {
        const sp = bake();
        if (!sp) return;
        if (amount <= 3e-3) return;
        const w = Math.max(2, viewport.width), h = Math.max(2, viewport.height);
        const short = Math.min(w, h);
        const wasOp = g.globalCompositeOperation, wasA = g.globalAlpha;
        g.globalCompositeOperation = "screen";
        for (let i = 0; i < puffs.length; i++) {
          const p = puffs[i];
          const a = p.a * amount * (0.75 + 0.25 * Math.sin(p.ph));
          const d = p.s * short;
          g.globalAlpha = Math.max(0, Math.min(1, a));
          g.drawImage(sp, p.x * w - d / 2, p.y * h - d / 2, d, d);
        }
        g.globalAlpha = wasA;
        g.globalCompositeOperation = wasOp;
      },
      clear() {
      },
      inspect: () => ({ count, sprite: !!sprite })
    };
  }

  // src/render/frost.js
  function createFrost({ viewport, frost = {} }) {
    var _a, _b, _c, _d, _e, _f;
    const seed = (_a = frost.seed) != null ? _a : 24301;
    const edgeAlpha = (_b = frost.edgeAlpha) != null ? _b : 0.42;
    const insetTop = (_c = frost.insetTop) != null ? _c : 0.17;
    const insetSide = (_d = frost.insetSide) != null ? _d : 0.13;
    const blobCount = (_e = frost.blobCount) != null ? _e : 220;
    const crystalCount = (_f = frost.crystalCount) != null ? _f : 70;
    const tint = frost.tint || "225,242,248";
    let tex = null, texW = 0, texH = 0;
    function edgePoint(R, w, h) {
      const perim = 2 * (w + h);
      let t = R() * perim;
      if (t < w) return { x: t, y: 0, nx: 0, ny: 1, side: "h" };
      if ((t -= w) < h) return { x: w, y: t, nx: -1, ny: 0, side: "v" };
      if ((t -= h) < w) return { x: w - t, y: h, nx: 0, ny: -1, side: "h" };
      t -= w;
      return { x: 0, y: h - t, nx: 1, ny: 0, side: "v" };
    }
    function build() {
      const w = Math.max(2, viewport.width | 0), h = Math.max(2, viewport.height | 0);
      const short = Math.min(w, h);
      const top = short * insetTop, bottom = short * insetTop * 0.62, side = short * insetSide;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d");
      const R = mulberry32(seed);
      const band = (gx0, gy0, gx1, gy1, rect, a0) => {
        const gr = g.createLinearGradient(gx0, gy0, gx1, gy1);
        gr.addColorStop(0, "rgba(" + tint + "," + a0 + ")");
        gr.addColorStop(0.5, "rgba(" + tint + "," + (a0 * 0.45).toFixed(3) + ")");
        gr.addColorStop(1, "rgba(" + tint + ",0)");
        g.fillStyle = gr;
        g.fillRect(rect[0], rect[1], rect[2], rect[3]);
      };
      band(0, 0, 0, top, [0, 0, w, top], edgeAlpha);
      band(0, h, 0, h - bottom, [0, h - bottom, w, bottom], edgeAlpha * 0.8);
      band(0, 0, side, 0, [0, 0, side, h], edgeAlpha * 0.9);
      band(w, 0, w - side, 0, [w - side, 0, side, h], edgeAlpha * 0.9);
      g.filter = "blur(" + Math.max(2, short * 6e-3).toFixed(1) + "px)";
      g.fillStyle = "rgba(" + tint + ",1)";
      for (let i = 0; i < blobCount; i++) {
        const p = edgePoint(R, w, h);
        const inset = p.side === "h" ? top : side;
        const depth = Math.min(1, -Math.log(1 - R() * 0.999) / 3.2);
        const r = 1.5 + R() * short * 0.018;
        g.globalAlpha = 0.05 + R() * 0.16;
        g.beginPath();
        g.arc(p.x + p.nx * depth * inset, p.y + p.ny * depth * inset, r, 0, Math.PI * 2);
        g.fill();
      }
      g.filter = "none";
      g.strokeStyle = "rgba(255,255,255,0.9)";
      g.lineWidth = 1;
      for (let i = 0; i < crystalCount; i++) {
        const p = edgePoint(R, w, h);
        const inset = p.side === "h" ? top : side;
        const depth = R() * 0.4;
        const x = p.x + p.nx * depth * inset, y = p.y + p.ny * depth * inset;
        const r = short * (6e-3 + R() * 0.012);
        const rot = R() * Math.PI;
        g.globalAlpha = 0.1 + R() * 0.2;
        g.beginPath();
        for (let k = 0; k < 3; k++) {
          const an = rot + k * Math.PI / 3;
          g.moveTo(x - Math.cos(an) * r, y - Math.sin(an) * r);
          g.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
      const hi = Math.max(2, short * 0.012);
      band(0, 0, 0, hi, [0, 0, w, hi], edgeAlpha * 0.9);
      band(0, h, 0, h - hi, [0, h - hi, w, hi], edgeAlpha * 0.7);
      band(0, 0, hi, 0, [0, 0, hi, h], edgeAlpha * 0.8);
      band(w, 0, w - hi, 0, [w - hi, 0, hi, h], edgeAlpha * 0.8);
      tex = c;
      texW = w;
      texH = h;
    }
    function draw(g, amount, time) {
      if (typeof document === "undefined") return;
      if (!tex || texW !== viewport.width || texH !== viewport.height) build();
      if (!tex) return;
      const breathe = 1 + 0.04 * Math.sin((time ? time.elapsed : 0) * 0.35);
      g.save();
      g.globalAlpha = Math.max(0, Math.min(1, amount * breathe));
      g.drawImage(tex, 0, 0);
      g.restore();
    }
    return {
      draw,
      dispose() {
        tex = null;
      },
      inspect: () => ({ built: !!tex, w: texW, h: texH })
    };
  }

  // src/features/weather.js
  function mapWeatherCode(code, precipitation = 0) {
    const c = Number(code) | 0;
    if (!Number.isFinite(c)) return 0;
    if (c === 0 || c >= 1 && c <= 3 || c === 45 || c === 48) return 0;
    if (c === 65 || c === 67 || c === 82) return 2;
    if (c >= 51 && c <= 64 || c === 66 || c === 80 || c === 81) return precipitation >= 2.5 ? 2 : 1;
    if (c >= 71 && c <= 77 || c === 85 || c === 86) return 3;
    if (c >= 95 && c <= 99) return 2;
    return 0;
  }
  function createWeather({ config, viewport, environment, time }) {
    const T = THEME.water.ripple;
    let enabled = true;
    let spawned = 0;
    let rotT = 0;
    const frostCfg = THEME.weather && THEME.weather.snow && THEME.weather.snow.snow && THEME.weather.snow.snow.frost || {};
    const frost = createFrost({ viewport, frost: frostCfg });
    let frostAmt = 0;
    let flash = 0, flashSecond = false, lightningTimer = 10;
    const REAL_REFRESH = 30 * 60 * 1e3;
    const FETCH_TIMEOUT = 8e3;
    let realState = "idle";
    let realResolved = false;
    let realNextAt = 0;
    let realWarned = false;
    let realMapped = -1;
    let bootSnap = false;
    let pendingSnap = false;
    function fetchJson(url) {
      const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), FETCH_TIMEOUT) : null;
      return fetch(url, ctl ? { signal: ctl.signal } : void 0).then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }).finally(() => {
        if (timer) clearTimeout(timer);
      });
    }
    async function getGeo() {
      const srcs = [
        ["https://ipwho.is/", (j) => [Number(j.latitude), Number(j.longitude)]],
        ["https://get.geojs.io/v1/ip/geo.json", (j) => [parseFloat(j.latitude), parseFloat(j.longitude)]],
        ["https://ipapi.co/json/", (j) => [Number(j.latitude), Number(j.longitude)]]
      ];
      for (const [url, pick] of srcs) {
        try {
          const j = await fetchJson(url);
          const c = pick(j || {});
          if (Number.isFinite(c[0]) && Number.isFinite(c[1])) return c;
        } catch (e) {
        }
      }
      throw new Error("all geo sources failed");
    }
    async function doSyncReal() {
      const [lat, lon] = await getGeo();
      const url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon + "&current=weather_code,precipitation&timezone=auto";
      const j = await fetchJson(url);
      const cur = j && j.current;
      const idx = mapWeatherCode(cur && cur.weather_code, Number(cur && cur.precipitation));
      realMapped = idx;
      if (enabled && config.realWeather) config.weather = idx;
    }
    function syncRealWeather() {
      realState = "loading";
      const deadline = new Promise((_, rej) => setTimeout(() => rej(new Error("\u6574\u4F53\u8D85\u65F6(10s)")), 1e4));
      Promise.race([doSyncReal(), deadline]).then(() => {
        realState = "ok";
        realResolved = true;
        realNextAt = Date.now() + REAL_REFRESH;
      }).catch((e) => {
        realState = "failed";
        realResolved = true;
        realNextAt = Date.now() + REAL_REFRESH;
        if (!realWarned) {
          realWarned = true;
          console.warn("[koi] \u771F\u5B9E\u5929\u6C14\u83B7\u53D6\u5931\u8D25,\u56DE\u9000\u624B\u52A8/\u8F6E\u52A8(30 \u5206\u949F\u540E\u91CD\u8BD5):", e && e.message);
        }
      });
    }
    let field = null, streaks = null, flakes = null, fogR = null;
    let builtFor = -1;
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
      streaks = createRainStreaks({ viewport, streak: rain && rain.streak || {}, rng: environment.rng });
      flakes = createSnowflakes({ viewport, snow: snow || {}, rng: environment.rng });
      fogR = fog ? createFog({ viewport, fog }) : null;
    }
    function onImpact(x, y) {
      const p = environment.rainSpec && environment.rainSpec.power || [0.1, 0.25];
      field.spawn(x, y, environment.range(p[0], p[1]));
      spawned++;
    }
    return {
      /** 宿主属性(wallpaperPropertyListener / livelyPropertyListener)只写 config,**每帧在这里同步** */
      /** 禁用后还要把雨收完(见 core/feature-registry.js 的 settleWhileDisabled) */
      settleWhileDisabled: true,
      update(dt) {
        if (enabled && config.realWeather && realState !== "loading" && Date.now() >= realNextAt) syncRealWeather();
        if (enabled && config.realWeather && !realResolved && !bootSnap) {
          bootSnap = true;
          pendingSnap = true;
          environment.snapTo(0);
        }
        const holdForReal = enabled && config.realWeather && !realResolved;
        const realWins = enabled && config.realWeather && realState === "ok";
        if (enabled && !holdForReal && !realWins && config.weatherAuto) {
          rotT += dt;
          const interval = Math.max(60, (Number(config.weatherAutoMinutes) || 5) * 60);
          if (rotT >= interval) {
            rotT = 0;
            config.weather = ((Number(config.weather) || 0) + 1) % environment.orderLength;
          }
        }
        const want = holdForReal ? 0 : enabled ? Number(config.weather) || 0 : 0;
        if (want !== environment.targetIndex) {
          if (pendingSnap) {
            environment.snapTo(want);
            pendingSnap = false;
          } else environment.setWeather(want);
          rotT = 0;
        }
        environment.update(dt);
        ensureSystems();
        const frostTarget = enabled && environment.snowSpec ? 1 : 0;
        const frostStep = dt / 5;
        frostAmt += Math.max(-frostStep, Math.min(frostStep, frostTarget - frostAmt));
        if (frostAmt < 3e-3) frostAmt = 0;
        if (enabled && environment.isStorm) {
          lightningTimer -= dt;
          if (lightningTimer <= 0) {
            flash = 0.62;
            flashSecond = false;
            lightningTimer = 8 + environment.rng() * 18;
          }
        } else if (flash > 0) {
          flash = 0;
        }
        if (flash > 0) {
          flash -= dt * 3.2;
          if (!flashSecond && flash <= 0.36) {
            flashSecond = true;
            flash = 0.45;
          }
          if (flash < 0) flash = 0;
        }
        if (fogR) fogR.update(dt);
        const wantStreaks = enabled && field ? environment.rainSpawnCount() : 0;
        if (streaks) {
          streaks.fill(wantStreaks);
          streaks.update(dt, wantStreaks, enabled && field ? onImpact : null);
        }
        if (field) field.update(dt);
        const wantFlakes = enabled ? environment.snowSpawnCount() : 0;
        if (flakes) {
          flakes.fill(wantFlakes);
          flakes.update(dt, wantFlakes);
        }
      },
      layers: {
        // 雾在最底下(它是"空气"),再雨坑(水面),再雨丝(空气),最后雪片 —— 全在 weather 层
        weather: (g) => {
          if (fogR) fogR.draw(g, environment.rainAmount);
          if (field) field.draw(g);
          if (streaks) streaks.draw(g);
          if (flakes) flakes.draw(g);
        },
        // 闪电画在 farTint 层(天色那一层):screen 加亮整幅 —— 在雨丝/涟漪之下,
        // 所以闪电照亮"天",雨还是黑的剪影,层次才对
        farTint: (g) => {
          if (flash > 3e-3) {
            g.save();
            g.globalCompositeOperation = "screen";
            g.globalAlpha = flash;
            g.fillStyle = "#cfe4ff";
            g.fillRect(0, 0, viewport.width, viewport.height);
            g.restore();
          }
        },
        // 霜冻画在 ui 层(最上面):它是"结在玻璃上"的,压在鱼/涟漪/粒子之上,鱼名字之下
        ui: (g) => {
          if (frostAmt > 0) frost.draw(g, frostAmt, time);
        }
      },
      setEnabled(on) {
        enabled = !!on;
        environment.setWeather(enabled ? Number(config.weather) || 0 : 0);
      },
      dispose() {
        if (field) field.clear();
        if (streaks) streaks.clear();
        if (flakes) flakes.clear();
        frost.dispose();
      },
      inspect: () => ({
        field,
        streaks,
        flakes,
        fog: fogR,
        spawned,
        enabled,
        builtFor,
        rotT,
        frost: frostAmt,
        flash,
        real: {
          state: realState,
          resolved: realResolved,
          mapped: realMapped,
          nextInMin: Math.max(0, Math.round((realNextAt - Date.now()) / 6e4))
        }
      })
    };
  }

  // src/render/idle-sprites.js
  var IDLE_ASSET_FILES = {
    leaf: [
      "assets/idle/leaf-1.baked.png",
      "assets/idle/leaf-2.baked.png",
      "assets/idle/leaf-3.baked.png",
      "assets/idle/leaf-4.baked.png"
    ],
    petal: [
      "assets/idle/petal-1.baked.png",
      "assets/idle/petal-2.baked.png",
      "assets/idle/petal-3.baked.png",
      "assets/idle/petal-4.baked.png"
    ]
  };
  function createIdleSprites({ base = "" } = {}) {
    const groups = { leaf: [], petal: [] };
    let expected = 0, loaded = 0;
    const failedFiles = [];
    function prep(url) {
      return new Promise((resolve) => {
        const im = new Image();
        im.onerror = () => {
          failedFiles.push(url);
          resolve(null);
        };
        im.onload = () => {
          const c = document.createElement("canvas");
          c.width = im.naturalWidth;
          c.height = im.naturalHeight;
          c.getContext("2d").drawImage(im, 0, 0);
          loaded++;
          resolve({ c, w: c.width, h: c.height, src: url });
        };
        im.src = base + url;
      });
    }
    function load() {
      const jobs = [];
      for (const kind of Object.keys(IDLE_ASSET_FILES)) {
        for (const url of IDLE_ASSET_FILES[kind]) {
          expected++;
          jobs.push(prep(url).then((s) => {
            if (s) groups[kind].push(s);
          }));
        }
      }
      return Promise.all(jobs);
    }
    return {
      groups,
      load,
      get ready() {
        return expected > 0 && loaded + failedFiles.length >= expected;
      },
      get failed() {
        return failedFiles.length;
      },
      failedFiles,
      /** 全部素材就绪且一件不缺 —— 玩法据此决定"要不要生成" */
      get complete() {
        return expected > 0 && loaded === expected && failedFiles.length === 0;
      },
      inspect: () => ({
        expected,
        loaded,
        failed: failedFiles.length,
        failedFiles: [...failedFiles],
        leaf: groups.leaf.length,
        petal: groups.petal.length,
        sizes: groups.leaf.concat(groups.petal).map((s) => s.w + "x" + s.h)
      }),
      dispose() {
        groups.leaf.length = 0;
        groups.petal.length = 0;
      }
    };
  }

  // src/features/idle-drift.js
  function createIdleDrift({ config, viewport, foods, input, mouse, kois }) {
    const P = THEME.idleDrift || {};
    const rng = mulberry32(P.seed || 1374496523);
    const range = (r) => r[0] + rng() * (r[1] - r[0]);
    const pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length];
    const R = P.ripple || {};
    const profile = Object.freeze({
      ...THEME.water.ripple,
      ...R.maxLive !== void 0 ? { maxLive: R.maxLive } : {},
      ...R.speed ? { speed: R.speed } : {},
      ...R.life ? { life: R.life } : {},
      ...R.crestAlpha !== void 0 ? { crestAlpha: R.crestAlpha } : {},
      ...R.ridgeFrac !== void 0 ? { ridgeFrac: R.ridgeFrac } : {},
      ...R.arcFloor !== void 0 ? { arcFloor: R.arcFloor } : {},
      ...R.arcJitter !== void 0 ? { arcJitter: R.arcJitter } : {},
      ...R.troughAlpha !== void 0 ? { troughAlpha: R.troughAlpha } : {}
    });
    const field = createRainRipples({ viewport, config, profile });
    const sprites2 = createIdleSprites({});
    sprites2.load();
    const items = [];
    const holds = [];
    const gathers = [];
    const timers = { leaf: 0, petal: 0 };
    let enabled = config.idleEvents !== false;
    let spawned = 0, landed = 0, startled = 0, gathered = 0;
    let sinceSpawn = 1e9;
    const kinds = ["leaf", "petal"];
    function drop(kind, x) {
      if (items.length >= (P.cap || 12)) return null;
      const petal = kind === "petal";
      const arr = sprites2.groups[kind] || [];
      if (!arr.length) return null;
      const F = P.fall || {};
      const it = {
        kind,
        petal,
        x: x !== void 0 ? x : range([0.06, 0.94]) * viewport.width,
        y: -36,
        vy: range(F.vy || [34, 66]),
        t: rng() * 6,
        rot: rng() * Math.PI * 2,
        spin: range(F.spin || [-1.4, 1.4]),
        flip: rng() * Math.PI * 2,
        flipSpd: range(F.flip || [1.1, 2.3]),
        sway: range(F.sway || [0.7, 1.6]),
        sizeMul: range(P.sprite && P.sprite.sizeMul || [1, 1]),
        spr: pick(arr),
        land: range(P.land || [0.3, 0.88]) * viewport.height,
        state: "fall",
        sink: 0,
        sinkRate: range(P.sink && P.sink.rate || [0.1, 0.18]),
        life: range(P.life || [9, 17]),
        swirl: rng() * 6.28,
        driftA: rng() * 6.28
      };
      items.push(it);
      spawned++;
      return it;
    }
    function onLand(it) {
      landed++;
      const power = R.power && R.power[it.kind] || 0.36;
      field.spawn(it.x, it.y, power);
      const near = nearby(it.x, it.y, P.startle && P.startle.radius || 150);
      if (near > 0) {
        input.move(it.x, it.y);
        holds.push({ x: it.x, y: it.y, left: P.startle && P.startle.hold || 0.42 });
        startled += near;
      }
      const g = P.gather || {};
      const around = nearby(it.x, it.y, (P.startle && P.startle.radius || 150) * (g.radiusMul || 1.8));
      if (around > 0) gathers.push({ x: it.x, y: it.y, left: g.delay || 0.9 });
    }
    function nearby(x, y, radius) {
      if (!Array.isArray(kois) || !radius) return 0;
      let n = 0;
      const r2 = radius * radius;
      for (let i = 0; i < kois.length; i++) {
        const dx = kois[i].x - x, dy = kois[i].y - y;
        if (dx * dx + dy * dy < r2) n++;
      }
      return n;
    }
    function bait(x, y, seconds) {
      const b = {
        x,
        y,
        life: seconds,
        sink: 0,
        sinkRate: 0,
        pop: 0,
        swirl: rng() * 6.28,
        dvx: 0,
        dvy: 0,
        /* life 由 simulation 统一递减并回收(它每帧 `foods[i].update(dt); life<=0 → splice`)。
         * ★ 这里【不要自己 splice】:那会在引擎的倒序遍历里挪动下标,可能顺手删掉一粒真饲料。 */
        update(dt) {
          this.life -= dt;
        },
        draw() {
        }
      };
      foods.push(b);
      gathered++;
      return b;
    }
    let assetErrorReported = false;
    function assetsOk() {
      if (sprites2.complete) return true;
      if (!assetErrorReported && sprites2.ready) {
        assetErrorReported = true;
        console.error(
          "[koi] \u81EA\u843D\u4E8B\u4EF6\u7D20\u6750\u7F3A\u5931,\u5DF2\u505C\u6B62\u751F\u6210(\u4E0D\u662F\u964D\u7EA7,\u662F\u9519\u8BEF):",
          sprites2.failedFiles.join(", ")
        );
      }
      return false;
    }
    function stepItems(dt) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.t += dt;
        if (it.state === "fall") {
          it.flip += it.flipSpd * dt;
          it.x += Math.sin(it.t * it.sway) * (P.fall && P.fall.swayAmp || 22) * dt;
          it.y += it.vy * dt;
          const land = Math.min(it.land, viewport.height * 0.94);
          if (it.y >= land) {
            it.state = "float";
            it.y = land;
            onLand(it);
          }
        } else {
          const S = P.sink || {};
          it.life -= dt;
          if (it.sink < 1) {
            it.sink = Math.min(1, it.sink + dt * it.sinkRate);
            it.swirl += dt * (S.swirl || 0.6);
            it.x += (Math.cos(it.driftA) * (S.drift || 0.14) + Math.cos(it.swirl) * 0.06) * 60 * dt;
            it.y += (Math.sin(it.driftA) * 0.09 + Math.sin(it.swirl * 0.8) * 0.05) * 60 * dt;
          }
          if (it.life <= 0) {
            const out = P.fadeOut || 1.6;
            it.sink = Math.min(1, it.sink + dt * 0.6);
            if (it.life <= -out) {
              items.splice(i, 1);
              continue;
            }
          }
        }
      }
    }
    function drawItem(g, it) {
      const S = P.sink || {};
      const out = P.fadeOut || 1.6;
      const fade = it.life < out ? Math.max(0, it.life / out) : 1;
      const deep = it.state === "fall" ? 0 : it.sink;
      g.save();
      g.translate(it.x, it.y);
      g.rotate(it.rot + it.t * 0.7);
      g.globalAlpha = fade * (1 - deep * (S.fade !== void 0 ? S.fade : 0.55));
      g.scale(0.35 + 0.65 * Math.abs(Math.cos(it.flip)), 1 - deep * (S.squash !== void 0 ? S.squash : 0.3));
      const k = it.sizeMul;
      g.drawImage(it.spr.c, -it.spr.w * k / 2, -it.spr.h * k / 2, it.spr.w * k, it.spr.h * k);
      g.restore();
    }
    function stepHolds(dt) {
      for (let i = holds.length - 1; i >= 0; i--) {
        const h = holds[i];
        h.left -= dt;
        if (h.left > 0) continue;
        holds.splice(i, 1);
        const moved = mouse && (mouse.x === null || Math.abs(mouse.x - h.x) > 2 || Math.abs(mouse.y - h.y) > 2);
        if (!moved) input.leave();
      }
    }
    function stepGathers(dt) {
      for (let i = gathers.length - 1; i >= 0; i--) {
        const g = gathers[i];
        g.left -= dt;
        if (g.left > 0) continue;
        gathers.splice(i, 1);
        bait(g.x, g.y, P.gather && P.gather.seconds || 8);
      }
    }
    return {
      /** 关掉后还要让在空中的落完、在水里的沉完(不留残景) */
      settleWhileDisabled: true,
      /** 手动放一件(测试与后续"阵风"玩法用) */
      drop,
      update(dt) {
        const want = enabled && config.idleEvents !== false && assetsOk();
        sinceSpawn += dt;
        if (want) {
          const gapOk = sinceSpawn >= (P.minGap || 0);
          for (const kind of kinds) {
            timers[kind] -= dt;
            if (timers[kind] <= 0) {
              if (gapOk) {
                if (drop(kind)) sinceSpawn = 0;
                const r = P.rate && P.rate[kind] || [3, 1.5];
                timers[kind] = r[0] + rng() * r[1];
              } else {
                timers[kind] = 0;
              }
            }
          }
        }
        stepItems(dt);
        stepHolds(dt);
        stepGathers(dt);
        field.update(dt);
      },
      layers: {
        // 层表里 weather 的语义就是"天气(雨/落叶/花瓣)这类前景粒子"——新层一个字没加
        weather: (g) => {
          field.draw(g);
          for (let i = 0; i < items.length; i++) drawItem(g, items[i]);
        }
      },
      setEnabled(on) {
        enabled = !!on;
      },
      dispose() {
        items.length = 0;
        holds.length = 0;
        gathers.length = 0;
        field.clear();
        sprites2.dispose();
      },
      inspect: () => ({
        enabled,
        host: config.idleEvents !== false,
        cap: P.cap || 12,
        count: items.length,
        spawned,
        landed,
        startled,
        gathered,
        sinceSpawn,
        pending: { holds: holds.length, gathers: gathers.length },
        field,
        sprites: sprites2
      })
    };
  }

  // src/features/day-cycle.js
  var clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  var hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  var rgbHex = (a) => "#" + a.map((v) => Math.round(clamp01(v / 255) * 255).toString(16).padStart(2, "0")).join("");
  function createDayCycle({ config, environment }) {
    const P = THEME.dayPhase || {};
    const keys = (P.keys || []).slice().sort((a, b) => a.h - b.h);
    const baseAz = (Math.atan2(THEME.light.dir[1], THEME.light.dir[0]) * 180 / Math.PI % 360 + 360) % 360;
    const baseElev = WaterGL && WaterGL.P && Number.isFinite(WaterGL.P.elev) ? WaterGL.P.elev : 55;
    const elevNight = Number.isFinite(P.elevNight) ? P.elevNight : 30;
    const ease = Number.isFinite(P.ease) ? P.ease : 0.3;
    let on = true;
    let pinned = null;
    let reported = "";
    const CUR = { causticMul: null, dim: null, lm: null, az: null, rgb: null };
    const realHour = () => {
      const d = /* @__PURE__ */ new Date();
      return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    };
    const dayness = (h) => clamp01(1 - Math.abs(h - 12) / 9);
    function sample(h) {
      let a = keys[0], b = keys[keys.length - 1];
      for (let i = 0; i < keys.length - 1; i++) {
        if (h >= keys[i].h && h <= keys[i + 1].h) {
          a = keys[i];
          b = keys[i + 1];
          break;
        }
      }
      const f = b.h === a.h ? 0 : clamp01((h - a.h) / (b.h - a.h));
      const A = hexRgb(a.grade), B = hexRgb(b.grade);
      return {
        causticMul: a.causticMul + (b.causticMul - a.causticMul) * f,
        dim: a.dim + (b.dim - a.dim) * f,
        lm: a.lm + (b.lm - a.lm) * f,
        rgb: [0, 1, 2].map((i) => A[i] + (B[i] - A[i]) * f),
        az: baseAz + (h - 12) * (P.azPerHour || 15) * (P.azAmp === void 0 ? 0.5 : P.azAmp)
      };
    }
    function easeTo(t, dt) {
      const f = clamp01(dt * ease);
      if (CUR.dim === null) {
        CUR.causticMul = t.causticMul;
        CUR.dim = t.dim;
        CUR.lm = t.lm;
        CUR.az = t.az;
        CUR.rgb = t.rgb.slice();
        return;
      }
      const k = f;
      CUR.causticMul += (t.causticMul - CUR.causticMul) * k;
      CUR.dim += (t.dim - CUR.dim) * k;
      CUR.lm += (t.lm - CUR.lm) * k;
      let d = t.az - CUR.az;
      if (d > 180) d -= 360;
      else if (d < -180) d += 360;
      CUR.az += d * k;
      for (let i = 0; i < 3; i++) CUR.rgb[i] += (t.rgb[i] - CUR.rgb[i]) * k;
    }
    function write(hour) {
      environment.setDayPhase({
        causticMul: CUR.causticMul,
        dim: CUR.dim,
        lm: CUR.lm,
        grade: rgbHex(CUR.rgb)
      });
      const r = CUR.az * Math.PI / 180;
      THEME.light.dir[0] = Math.cos(r);
      THEME.light.dir[1] = Math.sin(r);
      if (WaterGL && WaterGL.P) {
        WaterGL.P.az = CUR.az;
        WaterGL.P.elev = elevNight + (baseElev - elevNight) * dayness(hour);
      }
    }
    function restore() {
      environment.setDayPhase(null);
      const r = baseAz * Math.PI / 180;
      THEME.light.dir[0] = Math.cos(r);
      THEME.light.dir[1] = Math.sin(r);
      if (WaterGL && WaterGL.P) {
        WaterGL.P.az = baseAz;
        WaterGL.P.elev = baseElev;
      }
    }
    return {
      update(dt) {
        var _a;
        const want = on && config.dayCycle !== false;
        const dimMul = Number.isFinite(Number(config.nightDim)) ? Number(config.nightDim) : (_a = P.nightDim) != null ? _a : 1;
        const hour = want ? pinned === null ? realHour() : pinned : 12;
        const t = sample(hour);
        t.dim = clamp01(t.dim * dimMul);
        t.lm = 1 - (1 - t.lm) * dimMul;
        easeTo(t, dt);
        write(hour);
        reported = hour;
      },
      /** 预览/测试:把时刻钉住(小时,可小数);传 null 回到真实时间 */
      setClock(hours) {
        pinned = Number.isFinite(hours) ? (hours % 24 + 24) % 24 : null;
        return pinned;
      },
      setEnabled(next) {
        on = !!next;
      },
      dispose() {
        restore();
      },
      inspect: () => ({
        on,
        host: config.dayCycle !== false,
        nightDim: Number(config.nightDim),
        pinned,
        hour: reported,
        realHour: realHour(),
        baseAz,
        baseElev,
        azAmp: P.azAmp === void 0 ? 0.5 : P.azAmp,
        cur: { ...CUR, rgb: CUR.rgb ? rgbHex(CUR.rgb) : null },
        lightDir: [THEME.light.dir[0], THEME.light.dir[1]],
        waterAz: WaterGL && WaterGL.P ? WaterGL.P.az : null,
        waterElev: WaterGL && WaterGL.P ? WaterGL.P.elev : null,
        day: environment.dayPhase
      })
    };
  }

  // src/features/fish-mood.js
  function createFishMood({ kois, environment, schoolSystem, viewport }) {
    const W = THEME.weather || {};
    const order = W.order || ["clear"];
    const presets = order.map((n) => W[n] && W[n].mood || { speed: 1, band: 0.5, pull: 0.25 });
    let cur = { speed: 1, band: 0.5, pull: 0.25 };
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
        const k = Math.min(1, dt / 2.5);
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

  // src/features/ambient-audio.js
  function nightnessFromDim(dim) {
    const d = Number(dim) || 0;
    return Math.max(0, Math.min(1, (d - 0.15) / 0.35));
  }
  function rainGainFor(amount, isHeavy) {
    const a = Math.max(0, Number(amount) || 0);
    return Math.min(1, a * (isHeavy ? 1.35 : 1));
  }
  function createAmbientAudio({ config, environment }) {
    let enabled = true;
    let ctx = null, master = null, nodes = null;
    let thunderTimer = 15;
    const rng = mulberry32(658704);
    function makeNoiseBuffer(c) {
      const len = c.sampleRate * 2;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = rng() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        const out = (b0 + b1 + b2 + b3 + b4 + b5 + b6) * 0.11;
        b6 = w * 0.115926;
        d[i] = Math.max(-1, Math.min(1, out * 2.5));
      }
      return buf;
    }
    function init() {
      const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      try {
        ctx = new AC();
      } catch (e) {
        return;
      }
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      const noise = makeNoiseBuffer(ctx);
      const waterSrc = ctx.createBufferSource();
      waterSrc.buffer = noise;
      waterSrc.loop = true;
      const waterLP = ctx.createBiquadFilter();
      waterLP.type = "lowpass";
      waterLP.frequency.value = 320;
      waterLP.Q.value = 0.7;
      const waterGain = ctx.createGain();
      waterGain.gain.value = 0.045;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.08;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 90;
      lfo.connect(lfoGain);
      lfoGain.connect(waterLP.frequency);
      lfo.start();
      waterSrc.connect(waterLP);
      waterLP.connect(waterGain);
      waterGain.connect(master);
      waterSrc.start();
      const rainSrc = ctx.createBufferSource();
      rainSrc.buffer = noise;
      rainSrc.loop = true;
      rainSrc.playbackRate.value = 1.7;
      const rainHP = ctx.createBiquadFilter();
      rainHP.type = "highpass";
      rainHP.frequency.value = 1e3;
      const rainLP2 = ctx.createBiquadFilter();
      rainLP2.type = "lowpass";
      rainLP2.frequency.value = 7e3;
      const rainGain = ctx.createGain();
      rainGain.gain.value = 0;
      rainSrc.connect(rainHP);
      rainHP.connect(rainLP2);
      rainLP2.connect(rainGain);
      rainGain.connect(master);
      rainSrc.start();
      const voices = [];
      for (const [freq, pan] of [[4100, -0.55], [4500, 0.1], [3800, 0.6]]) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = 0;
        const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        if (p) {
          p.pan.value = pan;
          osc.connect(g);
          g.connect(p);
          p.connect(master);
        } else {
          osc.connect(g);
          g.connect(master);
        }
        osc.start();
        voices.push({ gain: g, timer: 0.4 + rng() * 2 });
      }
      nodes = { waterGain, rainGain, voices, noise };
    }
    function chirp(v, vol) {
      const t0 = ctx.currentTime + 0.05;
      const g = v.gain.gain;
      g.cancelScheduledValues(t0);
      g.setValueAtTime(0, t0);
      const pulses = 6 + Math.floor(rng() * 4);
      for (let j = 0; j < pulses; j++) {
        const p = t0 + j * 0.045;
        g.linearRampToValueAtTime(vol, p + 8e-3);
        g.linearRampToValueAtTime(1e-4, p + 0.032);
      }
    }
    function thunder() {
      const t0 = ctx.currentTime + 0.1, dur = 2.8;
      const src = ctx.createBufferSource();
      src.buffer = nodes.noise;
      src.loop = true;
      src.playbackRate.value = 0.35;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(220, t0);
      lp.frequency.exponentialRampToValueAtTime(55, t0 + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(1e-4, t0);
      g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.12);
      g.gain.exponentialRampToValueAtTime(1e-4, t0 + dur);
      src.connect(lp);
      lp.connect(g);
      g.connect(master);
      src.start(t0);
      src.stop(t0 + dur + 0.1);
    }
    return {
      update(dt) {
        if (!enabled) return;
        if (!ctx) init();
        if (!ctx) return;
        if (ctx.state === "suspended") {
          ctx.resume().catch(() => {
          });
          return;
        }
        const vol = Math.max(0, Math.min(1, Number(config.ambientVolume) || 0));
        const dim = environment.dayPhase && environment.dayPhase.dim || 0;
        const night = nightnessFromDim(dim);
        const isHeavy = environment.name === "heavyrain";
        const isStorm = environment.name === "thunder" || environment.isStorm === true;
        const rain = rainGainFor(environment.rainAmount, isStorm ? true : isHeavy);
        const t = ctx.currentTime;
        const duck = 1 - night * 0.5;
        master.gain.setTargetAtTime(vol, t, 0.1);
        nodes.waterGain.gain.setTargetAtTime(0.045 * duck * (1 - rain * 0.4), t, 0.2);
        nodes.rainGain.gain.setTargetAtTime(rain * rain * 0.13 * duck * (isStorm ? 1.1 : 1), t, 0.25);
        const cricketOn = night > 0.45 && rain < 0.5;
        for (const v of nodes.voices) {
          v.timer -= dt;
          if (v.timer <= 0) {
            if (cricketOn) chirp(v, (0.03 + rng() * 0.03) * night);
            v.timer = cricketOn ? 0.9 + rng() * 1.8 : 1 + rng();
          }
        }
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
        if (enabled) ctx.resume().catch(() => {
        });
        else ctx.suspend().catch(() => {
        });
      },
      dispose() {
        if (ctx) {
          ctx.close().catch(() => {
          });
          ctx = null;
          master = null;
          nodes = null;
        }
      },
      inspect: () => ({
        ctxState: ctx ? ctx.state : "no-ctx",
        volume: Number(config.ambientVolume) || 0,
        night: nightnessFromDim(environment.dayPhase && environment.dayPhase.dim || 0),
        rain: rainGainFor(environment.rainAmount, environment.name === "heavyrain"),
        thunderIn: Math.round(thunderTimer),
        voices: nodes ? nodes.voices.length : 0
      })
    };
  }

  // src/render/fireflies.js
  function createFireflies({ viewport, fireflies = {} }) {
    var _a;
    const rng = mulberry32((_a = fireflies.seed) != null ? _a : 61925);
    const count = Math.max(1, fireflies.count || 8);
    const speedR = fireflies.speed || [8, 20];
    const blinkR = fireflies.blink || [2.2, 4.2];
    const pick = (r) => r[0] + rng() * (r[1] - r[0]);
    let sprite = null;
    function bake() {
      if (sprite || typeof document === "undefined") return sprite;
      const S = 32;
      const c = document.createElement("canvas");
      c.width = c.height = S;
      const g = c.getContext("2d");
      const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      gr.addColorStop(0, "rgba(238,255,192,1)");
      gr.addColorStop(0.35, "rgba(202,236,132,0.4)");
      gr.addColorStop(1, "rgba(180,225,110,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, S, S);
      sprite = c;
      return sprite;
    }
    const pool = [];
    for (let i = 0; i < count; i++) {
      pool.push({
        x: 30 + rng() * Math.max(1, viewport.width - 60),
        y: 30 + rng() * Math.max(1, viewport.height - 60),
        ang: rng() * Math.PI * 2,
        spd: pick(speedR),
        ph: rng() * Math.PI * 2,
        fq: pick(blinkR)
      });
    }
    return {
      get count() {
        return count;
      },
      /** amount = 夜度 0~1(白天萤火虫不存在) */
      update(dt, amount) {
        const w = Math.max(1, viewport.width), h = Math.max(1, viewport.height);
        for (const f of pool) {
          f.ang += (rng() - 0.5) * 1.6 * dt;
          const spd = f.spd * (0.3 + 0.7 * amount);
          f.x += Math.cos(f.ang) * spd * dt;
          f.y += Math.sin(f.ang) * spd * dt;
          if (f.x < 24) {
            f.x = 24;
            f.ang = Math.PI - f.ang;
          }
          if (f.x > w - 24) {
            f.x = w - 24;
            f.ang = Math.PI - f.ang;
          }
          if (f.y < 24) {
            f.y = 24;
            f.ang = -f.ang;
          }
          if (f.y > h - 24) {
            f.y = h - 24;
            f.ang = -f.ang;
          }
          f.ph += f.fq * dt;
        }
      },
      draw(g, amount) {
        const sp = bake();
        if (!sp || amount <= 0.01) return;
        const wasOp = g.globalCompositeOperation, wasA = g.globalAlpha;
        g.globalCompositeOperation = "screen";
        for (let i = 0; i < pool.length; i++) {
          const f = pool[i];
          const pulse = Math.max(0, Math.sin(f.ph));
          const a = pulse * pulse * amount;
          if (a < 0.02) continue;
          g.globalAlpha = a * 0.55;
          g.drawImage(sp, f.x - 8, f.y - 8, 16, 16);
          g.globalAlpha = a;
          g.fillStyle = "rgba(244,255,208,1)";
          g.beginPath();
          g.arc(f.x, f.y, 1.3, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = wasA;
        g.globalCompositeOperation = wasOp;
      },
      clear() {
      },
      inspect: () => ({ count, lit: pool.reduce((n, f) => n + (Math.sin(f.ph) > 0.3 ? 1 : 0), 0) })
    };
  }

  // src/render/meteor.js
  function createMeteor({ viewport, meteor = {}, onLand }) {
    var _a;
    const rng = mulberry32((_a = meteor.seed) != null ? _a : 24301);
    const minNight = Number.isFinite(meteor.minNight) ? meteor.minNight : 0.55;
    const everyR = meteor.every || [45, 110];
    const speedR = meteor.speed || [900, 1300];
    const lenR = meteor.len || [90, 150];
    const lifeR = meteor.life || [0.45, 0.75];
    const pick = (r) => r[0] + rng() * (r[1] - r[0]);
    let m = null;
    let timer = Number.isFinite(meteor.first) ? meteor.first : 12 + rng() * 20;
    function spawn() {
      const w = Math.max(1, viewport.width), h = Math.max(1, viewport.height);
      const dir = rng() < 0.5 ? -1 : 1;
      const ang = Math.PI / 180 * (28 + rng() * 22);
      const spd = pick(speedR);
      m = {
        x: w * (0.15 + rng() * 0.7),
        y: h * rng() * 0.22,
        vx: Math.cos(ang) * spd * dir,
        vy: Math.sin(ang) * spd,
        len: pick(lenR),
        life: pick(lifeR),
        t: 0
      };
    }
    return {
      /** night = 夜度 0~1(过门槛才倒计时) */
      update(dt, night) {
        if (m) {
          m.t += dt;
          m.x += m.vx * dt;
          m.y += m.vy * dt;
          if (m.t >= m.life) {
            const lx4 = m.x, ly4 = m.y;
            m = null;
            timer = pick(everyR);
            if (onLand) onLand(lx4, ly4);
          }
        } else if (night > minNight) {
          timer -= dt;
          if (timer <= 0) spawn();
        }
      },
      draw(g) {
        if (!m) return;
        const fade = Math.sin(Math.PI * Math.min(1, m.t / m.life));
        const sp = Math.hypot(m.vx, m.vy) || 1;
        const tx = m.x - m.vx / sp * m.len, ty = m.y - m.vy / sp * m.len;
        g.save();
        g.globalCompositeOperation = "screen";
        if (typeof g.createLinearGradient === "function") {
          const grad = g.createLinearGradient(m.x, m.y, tx, ty);
          grad.addColorStop(0, "rgba(255,255,255," + (0.85 * fade).toFixed(3) + ")");
          grad.addColorStop(1, "rgba(255,255,255,0)");
          g.strokeStyle = grad;
        } else {
          g.strokeStyle = "rgba(255,255,255," + (0.6 * fade).toFixed(3) + ")";
        }
        g.lineWidth = 1.8;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(m.x, m.y);
        g.lineTo(tx, ty);
        g.stroke();
        g.fillStyle = "rgba(255,255,255," + (0.95 * fade).toFixed(3) + ")";
        g.beginPath();
        g.arc(m.x, m.y, 1.6, 0, Math.PI * 2);
        g.fill();
        g.restore();
      },
      clear() {
        m = null;
      },
      inspect: () => ({ live: !!m, timer: Math.round(timer), progress: m ? +(m.t / m.life).toFixed(2) : null })
    };
  }

  // src/features/night-sky.js
  function createNightSky({ config, viewport, environment, spawnRipple }) {
    const N = THEME.night || {};
    const flies = createFireflies({ viewport, fireflies: N.fireflies || {} });
    const meteor = createMeteor({
      viewport,
      meteor: N.meteor || {},
      onLand: (x, y) => spawnRipple(x, y, 0.7 * (Number(config.rippleStrength) || 1))
    });
    let on = true;
    let amt = 0;
    return {
      settleWhileDisabled: true,
      // 关掉也要把萤火虫淡完,别冻在半空
      update(dt) {
        const target = on ? nightnessFromDim(environment.dayPhase && environment.dayPhase.dim || 0) : 0;
        amt += (target - amt) * Math.min(1, dt / 2);
        flies.update(dt, amt);
        meteor.update(dt, amt);
      },
      layers: {
        weather: (g) => {
          flies.draw(g, amt);
          meteor.draw(g);
        }
      },
      setEnabled(next) {
        on = !!next;
      },
      dispose() {
        meteor.clear();
      },
      inspect: () => ({ night: +amt.toFixed(2), flies: flies.inspect(), meteor: meteor.inspect() })
    };
  }

  // src/builtins.js
  function registerBuiltins({ creatures, features, context }) {
    const koiKind = createKoiCreature({
      config: context.config,
      viewport: context.viewport,
      time: context.time,
      kois: context.kois,
      foods: context.foods,
      mouse: context.mouse,
      spawnRipple: context.spawnRipple,
      schoolSystem: context.schoolSystem,
      drawFish: context.drawFish
    });
    creatures.register({ id: "koi-fish", title: "\u9526\u9CA4", create: koiKind.create, exports: koiKind });
    features.register({ id: "clock", title: "\u65F6\u949F", create: () => {
      const clock = createClock({ viewport: context.viewport });
      let on = true;
      return {
        layers: { hud: (g) => {
          if (on) clock.draw(g);
        } },
        setEnabled(next) {
          on = !!next;
        }
        // 与第一轮一致:关掉只是不画,不是卸载
      };
    } });
    features.register({ id: "feeding", title: "\u6295\u5582", create: () => {
      const feeding = createFeeding({ config: context.config, foods: context.foods, Food: context.Food, spawnRipple: context.spawnRipple, rng: context.feedRng });
      return {
        interactions: { feed: feeding.feedAt },
        setEnabled(next) {
          context.config.enableFeeding = !!next;
        }
      };
    } });
    features.register({ id: "customFish", title: "\u81EA\u5B9A\u4E49\u9C7C", create: () => {
      const make = () => createCustomFish({
        Koi: koiKind.Koi,
        koiType: context.types.get("koi"),
        kois: context.kois,
        config: context.config,
        viewport: context.viewport,
        spawnRipple: context.spawnRipple,
        repository: context.repository
      });
      let inst = make();
      return {
        loadCustomFishFromStore: (...a) => inst == null ? void 0 : inst.loadCustomFishFromStore(...a),
        syncCustomFish: (...a) => inst == null ? void 0 : inst.syncCustomFish(...a),
        setEnabled(on) {
          if (!on) {
            inst == null ? void 0 : inst.dispose();
            inst = null;
          } else if (!inst) {
            inst = make();
            inst.loadCustomFishFromStore();
          }
        },
        dispose() {
          inst == null ? void 0 : inst.dispose();
          inst = null;
        }
      };
    } });
    features.register({ id: "weather", title: "\u5929\u6C14", create: () => createWeather({
      config: context.config,
      viewport: context.viewport,
      environment: context.environment,
      time: context.time
    }) });
    features.register({ id: "idleDrift", title: "\u843D\u53F6\u82B1\u74E3", create: () => createIdleDrift({
      config: context.config,
      viewport: context.viewport,
      foods: context.foods,
      input: context.input,
      mouse: context.mouse,
      kois: context.kois
    }) });
    features.register({ id: "dayCycle", title: "\u5149\u968F\u65F6\u95F4\u8D70", create: () => createDayCycle({
      config: context.config,
      environment: context.environment
    }) });
    features.register({ id: "fishMood", title: "\u5929\u6C14\u5FC3\u60C5", create: () => createFishMood({
      kois: context.kois,
      environment: context.environment,
      schoolSystem: context.schoolSystem,
      viewport: context.viewport
    }) });
    features.register({ id: "audio", title: "\u73AF\u5883\u97F3\u6548", create: () => createAmbientAudio({
      config: context.config,
      environment: context.environment
    }) });
    features.register({ id: "nightSky", title: "\u591C\u7A7A", create: () => createNightSky({
      config: context.config,
      viewport: context.viewport,
      environment: context.environment,
      spawnRipple: context.spawnRipple
    }) });
    features.register({ id: "overlay", title: "\u8986\u76D6\u5C42", create: () => {
      const overlay = createOverlay({ kois: context.kois, mouse: context.mouse });
      return { layers: { ui: (g) => overlay.draw(g) } };
    } });
    return { creatures, features };
  }

  // src/app.js
  function createPondApp(canvas) {
    var _a, _b;
    const config = createSettings();
    const types = createFishTypes();
    const viewport = { width: innerWidth, height: innerHeight };
    const time = { elapsed: 0 };
    const kois = [], foods = [];
    const mouse = { x: null, y: null, active: false };
    const repository = createRepository();
    const ripples = createRipples({ config, viewport });
    const { spawnRipple } = ripples;
    const schoolSystem = createSchools({ config, viewport });
    schoolSystem.buildSchools();
    for (let i = 0; i < 3600; i++) schoolSystem.updateSchools(1 / 60);
    const { drawFish } = createFishRenderer({ config });
    const feedRng = mulberry32(1592651789);
    const { Food } = createFood({ rng: feedRng });
    const creatures = createCreatureRegistry({ types });
    const layers = createLayerSet();
    const environment = createEnvironment({ config });
    const router = createInputRouter(mouse);
    const context = {
      config,
      viewport,
      time,
      kois,
      foods,
      mouse,
      spawnRipple,
      repository,
      Food,
      feedRng,
      types,
      creatures,
      layers,
      input: router,
      schoolSystem,
      drawFish,
      environment
    };
    const features = createFeatureRegistry({ context, layers, input: router });
    registerBuiltins({ creatures, features, context });
    const population = createPopulation({
      list: kois,
      registry: creatures,
      config,
      onAfterSync: () => {
        var _a2, _b2;
        return (_b2 = (_a2 = features.get("customFish")) == null ? void 0 : _a2.syncCustomFish) == null ? void 0 : _b2.call(_a2);
      }
    });
    population.syncStock();
    (_b = (_a = features.get("customFish")) == null ? void 0 : _a.loadCustomFishFromStore) == null ? void 0 : _b.call(_a);
    const { resolveFishCollisions } = createCollisions({ kois, config });
    const simulation = createSimulation({ kois, foods, schoolSystem, resolveFishCollisions, extraUpdate: features.updater() });
    const cleanup = [
      attachBrowserInput(router, canvas),
      attachDesktopBridge(router),
      attachProperties(config, population.syncStock),
      // Gear + panel en pantalla: la unica forma de tocar ajustes cuando no
      // hay WE/Lively ni el software propio (ver src/ui/settings-panel.js).
      createSettingsPanel({ config })
    ];
    const renderer = createRenderer({ canvas, viewport, config, time, kois, foods, ripples, layers, environment });
    const loop = createLoop({
      paused: () => !!window.__koiPaused,
      fpsLimit: () => config.fps,
      // 宿主(WE)推来的帧率上限,0 = 不限
      update(dt) {
        time.elapsed += dt;
        simulation.update(dt);
        ripples.update(dt);
      },
      draw: renderer.draw
    });
    return {
      start: loop.start,
      stop: loop.stop,
      registerFishType: types.register,
      registerCreatureKind: creatures.register,
      spawnFish(typeId = "koi", opts) {
        return population.spawn(typeId, opts);
      },
      registerInteraction: router.register,
      setInteraction: router.setMode,
      registerFeature: features.register,
      setFeature: (name, enabled) => features.setEnabled(name, enabled),
      /**
       * 切天气。config.weather 是**唯一真源**(宿主属性也写它),所以这里必须一并写回 —
       * 否则天气玩法每帧的同步会把直接改环境状态的那次调用覆盖掉(config 还是旧值)。
       */
      setWeather: (v) => {
        const i = environment.setWeather(v);
        config.weather = i;
        return i;
      },
      dispose() {
        loop.stop();
        renderer.dispose();
        features.dispose();
        router.dispose();
        cleanup.forEach((fn) => fn());
      },
      inspect: () => ({
        config,
        viewport,
        time,
        kois,
        foods,
        ripples: ripples.ripples,
        Koi: creatures.exports("koi-fish").Koi,
        router,
        schoolSystem,
        types,
        creatures,
        features,
        layers,
        population,
        environment,
        counts: population.counts()
      })
    };
  }
  var app = createPondApp(document.getElementById("wallpaper-canvas"));
  var params = new URLSearchParams(location.search);
  if (params.has("debug")) window.__pondDebug = app;
  if (params.has("weather")) {
    const v = params.get("weather");
    try {
      app.setWeather(v);
    } catch (e) {
      console.warn("[koi] \u672A\u77E5\u7684 weather \u53C2\u6570,\u5DF2\u5FFD\u7565:", v);
    }
  }
  app.start();
})();
