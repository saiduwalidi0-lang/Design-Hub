import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const uiHtmlPath = path.join(distDir, 'index.html');

if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
if (!fs.existsSync(uiHtmlPath)) {
  throw new Error('UI build not found. Run `npm run build:ui` first.');
}

const uiHtml = fs.readFileSync(uiHtmlPath, 'utf8');

const patchedUiHtml = uiHtml
  .replace(/<script\s+type="module"/g, '<script')
  .replace(/\s+crossorigin/g, '');

await build({
  entryPoints: [path.join(root, 'src', 'plugin', 'code.ts')],
  outfile: path.join(distDir, 'code.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2017'],
  define: {
    __UI_HTML__: JSON.stringify(patchedUiHtml),
  },
  logLevel: 'info',
});
