/**
 * 自持事件的素材(落叶 4 + 花瓣 4)—— cargar los PNG ya pre-procesados.
 *
 * Antes esto cargaba el .webp de 256px y usaba getImageData() en tiempo de
 * ejecucion para recortar el bounding box y normalizar el alpha (ver
 * tools/bake-idle-sprites.js, que ahora hace exactamente ese trabajo una
 * sola vez, offline). El motivo del cambio:
 *
 *   Bajo file:// (Wallpaper Engine, doble clic en index.html, Lively, o
 *   cualquier host que sirva el HTML sin servidor) Chromium marca el canvas
 *   como "tainted" en cuanto se dibuja una imagen cargada por file:// y se
 *   intenta leer con getImageData — lanza SecurityError. Bajo un servidor
 *   http normal nunca pasaba, así que no se veía en el navegador de
 *   desarrollo, pero en cualquier wallpaper host de verdad esto apagaba
 *   la funcion entera (idle-drift.js lo trata como "faltan assets" y deja
 *   de generar hojas/petalos, con un error en consola).
 *
 *   La solucion no es intentar leer los pixeles en el propio host (seguiria
 *   tainted): es no necesitar leerlos ahi. tools/bake-idle-sprites.js hace
 *   el recorte + reescalado + normalizacion de alpha una vez, en Node (con
 *   sharp), y deja el resultado listo como PNG en assets/idle/*.baked.png.
 *   Esta version solo hace new Image() + drawImage: cero getImageData, cero
 *   tainting, funciona igual en file:// que en http(s)://.
 */

/* Ya vienen recortados y en su tamano de muestra final (ver
 * tools/bake-idle-sprites.js): no hace falta bbox ni reescalado aqui. */
export const IDLE_ASSET_FILES = {
	leaf: ['assets/idle/leaf-1.baked.png', 'assets/idle/leaf-2.baked.png',
	       'assets/idle/leaf-3.baked.png', 'assets/idle/leaf-4.baked.png'],
	petal: ['assets/idle/petal-1.baked.png', 'assets/idle/petal-2.baked.png',
	        'assets/idle/petal-3.baked.png', 'assets/idle/petal-4.baked.png']
};

/**
 * @param opts.base 资源前缀(默认空 = 相对页面根;宿主打包后也走相对路径)
 */
export function createIdleSprites({ base = '' } = {}) {
	const groups = { leaf: [], petal: [] };
	let expected = 0, loaded = 0;
	const failedFiles = [];          // 缺了哪些:报错要能直接指名道姓

	function prep(url) {
		return new Promise(resolve => {
			const im = new Image();
			im.onerror = () => { failedFiles.push(url); resolve(null); };
			im.onload = () => {
				const c = document.createElement('canvas');
				c.width = im.naturalWidth; c.height = im.naturalHeight;
				c.getContext('2d').drawImage(im, 0, 0);
				loaded++;
				resolve({ c, w: c.width, h: c.height, src: url });
			};
			im.src = base + url;
		});
	}

	/** 异步加载;完成前 groups 为空 —— 玩法会等到 complete 才开始生成(不画假件) */
	function load() {
		const jobs = [];
		for (const kind of Object.keys(IDLE_ASSET_FILES)) {
			for (const url of IDLE_ASSET_FILES[kind]) {
				expected++;
				jobs.push(prep(url).then(s => { if (s) groups[kind].push(s); }));
			}
		}
		return Promise.all(jobs);
	}

	return {
		groups,
		load,
		get ready() { return expected > 0 && loaded + failedFiles.length >= expected; },
		get failed() { return failedFiles.length; },
		failedFiles,
		/** 全部素材就绪且一件不缺 —— 玩法据此决定"要不要生成" */
		get complete() { return expected > 0 && loaded === expected && failedFiles.length === 0; },
		inspect: () => ({ expected, loaded, failed: failedFiles.length, failedFiles: [...failedFiles],
		                  leaf: groups.leaf.length, petal: groups.petal.length,
		                  sizes: groups.leaf.concat(groups.petal).map(s => s.w + 'x' + s.h) }),
		dispose() { groups.leaf.length = 0; groups.petal.length = 0; }
	};
}
