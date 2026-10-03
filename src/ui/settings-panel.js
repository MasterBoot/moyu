/**
 * Panel de ajustes en pantalla — el gear que faltaba.
 *
 * project.json ya declara 11 propiedades reales, y platform/properties.js
 * ya sabe aplicarlas y storage/settings-store.js ya sabe guardarlas en
 * localStorage (comentario propio: "el software propio no tiene panel de
 * host, asi que la ventana de ajustes escribe en localStorage"). Lo que no
 * existia era esa ventana: sin Wallpaper Engine/Lively no habia forma de
 * tocar ni un solo ajuste. Este panel es esa pieza que faltaba, pero vive
 * DENTRO de la misma pagina que el wallpaper (no en una ventana aparte como
 * asumia el diseno original) — por eso, ademas de persistir con
 * writeSettings(), aplica el cambio de inmediato llamando a
 * window.wallpaperPropertyListener.applyUserProperties(), el mismo punto de
 * entrada que usan WE y Lively (el evento nativo 'storage' que usa
 * onSettingsChange solo se dispara en OTRAS ventanas, nunca en la propia).
 *
 * Con host (WE/Lively) sus valores mandan igualmente: applyUserProperties
 * se envuelve (no se reemplaza) para que, venga de donde venga el cambio,
 * el panel se mantenga sincronizado.
 */
import { readSettings, writeSettings, clearSettings } from '../storage/settings-store.js';

const FIELDS = [
	{ key: 'dayCycle', type: 'bool', label: '光线跟随现实时间' },
	{ key: 'nightDim', type: 'range', label: '夜间变暗', min: 0, max: 1.3, step: 0.01, sub: true },
	{ key: 'idleEvents', type: 'bool', label: '落叶与花瓣' },
	{ key: 'enableCaustics', type: 'bool', label: '水面波光' },
	{ key: 'enableFeeding', type: 'bool', label: '点击水面喂食' },
	{ key: 'shyFish', type: 'bool', label: '鱼群躲避鼠标(怕生)' },
	{ key: 'fishCount', type: 'range', label: '锦鲤数量', min: 10, max: 200, step: 1 },
	{ key: 'fishSize', type: 'range', label: '鱼体大小倍率', min: 0.5, max: 3, step: 0.01 },
	{ key: 'fishSpeed', type: 'range', label: '游动速度倍率', min: 0.5, max: 3, step: 0.01 },
	{ key: 'waterHue', type: 'range', label: '水色色相', min: 0, max: 360, step: 1 },
	{ key: 'rippleStrength', type: 'range', label: '涟漪强度', min: 0.1, max: 5, step: 0.01 },
	{ key: 'weather', type: 'select', label: '天气', options: [{ value: 0, label: '晴' }, { value: 1, label: '雨' }, { value: 2, label: '大雨' }, { value: 3, label: '雪' }, { value: 4, label: '雷暴' }, { value: 5, label: '雾' }] },
	{ key: 'realWeather', type: 'bool', label: '跟随当地真实天气' },
	{ key: 'weatherAuto', type: 'bool', label: '天气自动轮换' },
	{ key: 'weatherAutoMinutes', type: 'range', label: '轮换间隔(分钟)', min: 1, max: 60, step: 1 },
	{ key: 'ambientVolume', type: 'range', label: '环境音量', min: 0, max: 1, step: 0.01 }
];

const CSS = `
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

const GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
	'<circle cx="12" cy="12" r="3"/>' +
	'<path d="M19.4 13a1.7 1.7 0 0 0 .35 1.9l.05.05a2 2 0 1 1-2.9 2.9l-.05-.05a1.7 1.7 0 0 0-1.9-.35 1.7 1.7 0 0 0-1 1.55V19a2 2 0 1 1-4 0v-.08a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.9.35l-.05.05a2 2 0 1 1-2.9-2.9l.05-.05a1.7 1.7 0 0 0 .35-1.9 1.7 1.7 0 0 0-1.55-1H5a2 2 0 1 1 0-4h.08A1.7 1.7 0 0 0 6.63 8.2a1.7 1.7 0 0 0-.35-1.9l-.05-.05a2 2 0 1 1 2.9-2.9l.05.05a1.7 1.7 0 0 0 1.9.35H11a1.7 1.7 0 0 0 1-1.55V2a2 2 0 1 1 4 0v.08a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.9-.35l.05-.05a2 2 0 1 1 2.9 2.9l-.05.05a1.7 1.7 0 0 0-.35 1.9V8a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.08a1.7 1.7 0 0 0-1.52 1z"/>' +
	'</svg>';

export function createSettingsPanel({ config }) {
	if (typeof document === 'undefined') return () => {};
	if (window.__koiSettingsPanel) return window.__koiSettingsPanel.dispose;

	if (typeof applyThemeCssVars === 'function') applyThemeCssVars();

	const style = document.createElement('style');
	style.textContent = CSS;
	document.head.appendChild(style);

	const gear = document.createElement('button');
	gear.id = 'koi-settings-gear';
	gear.type = 'button';
	gear.title = '设置';
	gear.innerHTML = GEAR_SVG;
	document.body.appendChild(gear);

	const panel = document.createElement('div');
	panel.id = 'koi-settings-panel';
	const title = document.createElement('h2');
	title.textContent = '池塘设置';
	panel.appendChild(title);
	document.body.appendChild(panel);

	const controls = {};
	FIELDS.forEach(spec => {
		const configKey = spec.key;
		const row = document.createElement('div');
		row.className = 'row' + (spec.type === 'bool' ? ' bool' : '') + (spec.sub ? ' sub' : '');

		const lab = document.createElement('label');
		lab.className = 'title';
		lab.textContent = spec.label;

		let input;
		if (spec.type === 'bool') {
			input = document.createElement('input');
			input.type = 'checkbox';
			row.appendChild(lab);
			row.appendChild(input);
		} else if (spec.type === 'range') {
			input = document.createElement('input');
			input.type = 'range';
			input.min = spec.min; input.max = spec.max; input.step = spec.step;
			row.appendChild(lab);
			row.appendChild(input);
		} else {
			input = document.createElement('select');
			spec.options.forEach(o => {
				const opt = document.createElement('option');
				opt.value = o.value; opt.textContent = o.label;
				input.appendChild(opt);
			});
			row.appendChild(lab);
			row.appendChild(input);
		}
		panel.appendChild(row);
		controls[configKey] = { input, spec };

		/* ── 提交策略(2026-10-03)──
		 * 拖动滑杆时 input 事件每帧能来好几次,原来每次都全量 JSON 写 localStorage
		 * 并触发 applyUserProperties —— "锦鲤数量"最伤:每个 tick 都会 syncStock()
		 * 增删鱼,一次拖动生成/销毁几十条。现在:
		 *   · range 拖动中 → 150ms 防抖合并;松手(change)→ 立即提交终值
		 *   · fishCount 这类"重建型"设置 → 只在松手时提交(拖动只动滑块本身)
		 *   · 开关/下拉 → change 直接提交(它们本来就是低频操作) */
		const COMMIT_DEBOUNCE = 150;
		let commitTimer = null;
		function cancelCommit() { if (commitTimer !== null) { clearTimeout(commitTimer); commitTimer = null; } }
		function commit() {
			cancelCommit();
			let v = spec.type === 'bool' ? input.checked
				: spec.type === 'select' ? Number(input.value)
				: Number(input.value);
			writeSettings({ [configKey]: v });
			if (window.wallpaperPropertyListener) {
				window.wallpaperPropertyListener.applyUserProperties({ [configKey]: { value: v } });
			}
			// "Falling leaves & petals" solo tiene sentido si dayCycle no lo tapa;
			// no hay dependencia real entre campos aqui, pero mantenemos el
			// sub-slider de nightDim visualmente atenuado si dayCycle esta apagado
			// (nightDim solo se nota de noche, y sin dayCycle nunca es de noche).
			if (configKey === 'dayCycle') updateSubRows();
		}
		if (spec.type === 'range') {
			input.addEventListener('input', () => {
				if (configKey === 'fishCount') return;    // 拖动不提交,松手见 change
				cancelCommit();
				commitTimer = setTimeout(commit, COMMIT_DEBOUNCE);
			});
			input.addEventListener('change', commit);
		} else {
			input.addEventListener('change', commit);
		}
	});

	function updateSubRows() {
		const dayCycleOn = config.dayCycle !== false;
		panel.querySelectorAll('.row.sub').forEach(r => { r.style.opacity = dayCycleOn ? '' : '0.4'; });
	}

	function refresh() {
		for (const key in controls) {
			const { input, spec } = controls[key];
			const v = config[key];
			if (v === undefined) continue;
			if (spec.type === 'bool') input.checked = !!v;
			else input.value = v;
		}
		updateSubRows();
	}

	function open() { panel.classList.add('open'); refresh(); }
	function close() { panel.classList.remove('open'); }
	function toggle() { panel.classList.contains('open') ? close() : open(); }
	gear.addEventListener('click', toggle);

	const resetBtn = document.createElement('button');
	const actions = document.createElement('div');
	actions.className = 'actions';
	resetBtn.type = 'button';
	resetBtn.textContent = '恢复默认';
	resetBtn.addEventListener('click', () => {
		clearSettings();
		location.reload();
	});
	actions.appendChild(resetBtn);
	panel.appendChild(actions);

	// Aplicar lo guardado la primera vez que se abre (por si el panel se
	// construyo antes de que attachProperties leyera localStorage — en la
	// practica ya se aplico en app.js, esto es solo para refrescar los
	// controles con el valor real).
	refresh();

	// Mantener el panel en sincronia venga el cambio de donde venga
	// (WE, Lively, este mismo panel, u otra pestana escribiendo localStorage).
	const prevApply = window.wallpaperPropertyListener && window.wallpaperPropertyListener.applyUserProperties;
	if (window.wallpaperPropertyListener && prevApply) {
		window.wallpaperPropertyListener.applyUserProperties = function (props) {
			prevApply(props);
			if (panel.classList.contains('open')) refresh();
		};
	}

	function dispose() {
		gear.remove(); panel.remove(); style.remove();
		delete window.__koiSettingsPanel;
	}
	window.__koiSettingsPanel = { open, close, toggle, dispose };
	return dispose;
}
