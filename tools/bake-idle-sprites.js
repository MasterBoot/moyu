/* Pre-procesa assets/idle/*.webp (fuente en 256px, ver README junto a esos
 * archivos) en assets/idle/*.baked.png: recorte al bounding box visible
 * (alpha > 8), reescalado al tamano de muestra final, y normalizacion de la
 * curva de alpha (20 -> 0, 150 -> 255) para el caso de sprites con el cuerpo
 * semitransparente (petal-3).
 *
 * Por que esto se hornea offline y no en el navegador (como hacia antes
 * src/render/idle-sprites.js): bajo file:// (Wallpaper Engine, doble clic
 * en index.html, Lively, o cualquier host que sirva el HTML sin servidor)
 * Chromium marca el canvas como "tainted" en cuanto se dibuja una imagen
 * cargada por file:// y se intenta leer con getImageData — lanza
 * SecurityError, y src/features/idle-drift.js interpretaba eso como
 * "faltan assets" y dejaba de generar hojas/petalos (con un error en
 * consola). Haciendo este trabajo aqui, una sola vez, el runtime solo
 * necesita new Image() + drawImage: cero getImageData, cero tainting.
 *
 * Uso (tras cambiar algun assets/idle/*.webp):
 *   npm install sharp --no-save   (una vez, si no esta ya instalado)
 *   node tools/bake-idle-sprites.js
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));

const ALPHA_LO = 20, ALPHA_HI = 150;
const VISIBLE_ALPHA = 8;

const SPRITES = {
	leaf: { long: 30, names: ['leaf-1', 'leaf-2', 'leaf-3', 'leaf-4'] },
	petal: { long: 26, names: ['petal-1', 'petal-2', 'petal-3', 'petal-4'] }
};

const DIR = path.join(here, '..', 'assets', 'idle');

async function bakeOne(name, targetLong) {
	const srcPath = path.join(DIR, name + '.webp');

	// ① Bounding box ajustado: un escaneo de alpha sobre el original.
	const { data, info } = await sharp(srcPath).ensureAlpha().raw()
		.toBuffer({ resolveWithObject: true });
	const w0 = info.width, h0 = info.height, ch = info.channels;
	let x0 = w0, y0 = h0, x1 = -1, y1 = -1;
	for (let yy = 0; yy < h0; yy++) {
		const row = yy * w0;
		for (let xx = 0; xx < w0; xx++) {
			if (data[(row + xx) * ch + 3] > VISIBLE_ALPHA) {
				if (xx < x0) x0 = xx;
				if (xx > x1) x1 = xx;
				if (yy < y0) y0 = yy;
				if (yy > y1) y1 = yy;
			}
		}
	}
	if (x1 < 0) { console.error('[bake-idle-sprites] totalmente transparente:', name); return; }
	const cw = x1 - x0 + 1, chh = y1 - y0 + 1;
	const k = targetLong / Math.max(cw, chh);
	const outW = Math.max(1, Math.round(cw * k)), outH = Math.max(1, Math.round(chh * k));

	// ② Recorte + reescalado al tamano de muestra final.
	const { data: sd, info: si } = await sharp(srcPath).ensureAlpha()
		.extract({ left: x0, top: y0, width: cw, height: chh })
		.resize(outW, outH, { fit: 'fill', kernel: 'lanczos3' })
		.raw().toBuffer({ resolveWithObject: true });

	// ③ Normalizacion de alpha (petal-3 tiene el cuerpo semitransparente).
	const sch = si.channels;
	for (let i = 3; i < sd.length; i += sch) {
		const a = sd[i];
		if (a <= ALPHA_LO) sd[i] = 0;
		else if (a >= ALPHA_HI) sd[i] = 255;
		else sd[i] = Math.round((a - ALPHA_LO) / (ALPHA_HI - ALPHA_LO) * 255);
	}

	const outPath = path.join(DIR, name + '.baked.png');
	await sharp(sd, { raw: { width: si.width, height: si.height, channels: sch } })
		.png({ compressionLevel: 9 }).toFile(outPath);
	console.log('[bake-idle-sprites]', name, '->', path.basename(outPath), outW + 'x' + outH);
}

(async () => {
	for (const kind of Object.keys(SPRITES)) {
		const { long, names } = SPRITES[kind];
		for (const name of names) await bakeOne(name, long);
	}
})();
