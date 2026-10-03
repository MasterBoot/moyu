/* Recompila src/app.js (y todo lo que importa) en src/app.bundle.js.
   Necesario porque index.html ya no puede cargar src/app.js como
   type="module": bajo file:// (Wallpaper Engine, doble clic en index.html, la
   mayoria de apps que solo cargan el HTML) Chromium bloquea esos modulos
   ES por CORS y la pagina se queda en blanco. app.bundle.js es el mismo
   codigo compilado a un script normal (IIFE) que funciona en cualquier host.

   Uso:
     npm install            (una vez, instala esbuild)
     npm run bundle
   Se ejecuta cada vez que se edite algo dentro de src/. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));

esbuild.buildSync({
	entryPoints: [path.join(here, '..', 'src', 'app.js')],
	bundle: true,
	format: 'iife',
	target: 'es2018',
	outfile: path.join(here, '..', 'src', 'app.bundle.js'),
	logLevel: 'info'
});
