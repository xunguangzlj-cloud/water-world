// Bundles src/*.js into the single self-contained ../index.html
//   npm run build            minified
//   npm run build:readable   unminified, for debugging
//   npm run build:dev        ../dev.html: unminified, plus the development tools in src/dev.js
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILES = ['quality.js', 'math.js', 'shaders.js', 'world.js', 'avatar.js', 'scene-collision.js', 'main.js', 'audio.js']; // concatenation order matters
const dev = process.argv.includes('--dev'), readable = dev || process.argv.includes('--readable');
const out = dev ? 'dev.html' : 'index.html';
if (dev) FILES.push('dev.js');

let js = FILES.map((f) => readFileSync(path.join(here, 'src', f), 'utf8')).join('\n');
const tpl = readFileSync(path.join(here, 'template.html'), 'utf8');
// everything runs inside one async function; startup errors are shown on screen
const wrap = (body) => `(async()=>{${body}\n})().catch(e=>{console.error(e);document.body.className='l e';document.getElementById('s').textContent=(e.cause?'':'启动失败，')+e.message});`;

let html;
if (readable) {
  html = tpl.replace('/*SCRIPT*/', () => wrap(js));
} else {
  // shrink the WGSL inside /*wgsl*/ template literals, then minify the JS and the page's CSS
  const minWgsl = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').replace(/ ?([{}()\[\];,:=+\-*\/<>&|!%@]) ?/g, '$1').trim();
  js = js.replace(/\/\*wgsl\*\/`([^`]*)`/g, (_, w) => '`' + minWgsl(w) + '`');
  const code = transformSync(wrap(js), { minify: true, target: 'es2022', legalComments: 'none' }).code.trim();
  const css = (_, s) => '<style>' + transformSync(s, { loader: 'css', minify: true }).code.trim();
  html = tpl.replace(/<style>([^]*?)(?=<\/style>)/, css).replace(/>\s+</g, '><').replace('/*SCRIPT*/', () => code).replace(/<script>\s+/, '<script>').replace(/\s+<\/script>/, '</script>');
}
// 将角色和署名嵌入游戏，下载单个 HTML 即可离线游玩。
const player = readFileSync(path.join(here, 'assets', 'player.bin'));
const license = readFileSync(path.join(here, '..', 'LICENSE'), 'utf8').replaceAll('\r\n', '\n');
const notice = `<!--
角色模型和服饰贴图来自暖光玩具房 V30：https://v25.dafeiyugame.site/
角色使用为深海花园编排的水下动作。
以下许可适用于原作 Abyssal Garden：https://github.com/Noniv/abyssal-garden
${license}
-->`;
html = html.replace('<head>', () => '<head>\n' + notice);
if (!readable) {
  // 在线版让角色并行加载，离线版仍然只需要一个 HTML 文件。
  const docs = path.join(here, '..', 'docs');
  mkdirSync(docs, { recursive: true });
  const version = createHash('sha256').update(player).digest('hex').slice(0, 12);
  const embedded = 'type=application/octet-stream>AVATAR_PAYLOAD</script>';
  if (!html.includes(embedded)) throw Error('找不到角色资源入口');
  writeFileSync(path.join(docs, 'player.bin'), player);
  writeFileSync(path.join(docs, 'index.html'), html.replace(embedded, `type=application/octet-stream data-src="player.bin?v=${version}"></script>`));
}
html = html.replace('AVATAR_PAYLOAD', () => player.toString('base64'));
writeFileSync(path.join(here, '..', out), html);
const gz = gzipSync(Buffer.from(html), { level: 9 }).length;
console.log(`${out}: ${(html.length / 1024).toFixed(1)} kB${readable ? ' (readable)' : ''}, ${(gz / 1024).toFixed(1)} kB gzipped`);
