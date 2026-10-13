#!/usr/bin/env node
// Renders the surf showcase deterministically: drives the game one frame at a time through
// window.__dig.tick(), saves each frame, and assembles an MP4 with ffmpeg.
//
//   node tools/render_video.mjs [out.mp4]
//
// Needs the built assets/ (./setup.sh), playwright (`npm install`, or PLAYWRIGHT_DIR pointing at an
// existing install), Google Chrome and ffmpeg. PORT picks the local server port (default 4712).
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'out', 'surf-anywhere.mp4'));
const FRAMES = path.join(ROOT, 'out', 'frames');
const PORT = Number(process.env.PORT) || 4712;
const FPS = 30;

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_DIR || 'playwright');

mkdirSync(path.dirname(OUT), { recursive: true });
rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

const server = spawn('python3', [path.join(ROOT, 'serve.py'), String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(`http://127.0.0.1:${PORT}/`);
await page.waitForFunction(() => window.__dig && window.__dig.state(), null, { timeout: 30000 });
await page.evaluate(() => window.__dig.pause());
// let the first chunks arrive before we start capturing
await page.waitForFunction(() => { window.__dig.step(1); return true; });
await new Promise((r) => setTimeout(r, 1500));

let n = 0;
async function tick(opts = {}) {
  const url = await page.evaluate((o) => window.__dig.tick(o), opts);
  writeFileSync(path.join(FRAMES, String(n++).padStart(5, '0') + '.png'), Buffer.from(url.split(',')[1], 'base64'));
}
const idle = async (frames) => { for (let i = 0; i < frames; i++) await tick(); };
const hold = async (key, frames) => { for (let i = 0; i < frames; i++) await tick({ hold: key }); };
const press = async (key, after = 6) => { await tick({ press: key }); await idle(after - 1); };
async function untilWalk(maxFrames = 3000) {
  for (let i = 0; i < maxFrames; i++) {
    await tick();
    const s = await page.evaluate(() => window.__dig.state());
    if (s === 'walk') return;
    // chunks load asynchronously in the headless page; give the network a moment now and then
    if (i % 60 === 0) await new Promise((r) => setTimeout(r, 40));
  }
}
// Move the region-map cursor from one cell to another.
async function cursorTo(from, to) {
  const sx = Math.sign(to.x - from.x), sy = Math.sign(to.y - from.y);
  for (let x = from.x; x !== to.x; x += sx) await press(sx > 0 ? 'right' : 'left', 5);
  for (let y = from.y; y !== to.y; y += sy) await press(sy > 0 ? 'down' : 'up', 5);
}
// mode 'dig' or 'surf'; the SURF option only exists when water connects the two places.
async function travelVia(mode, mon, to) {
  await page.evaluate(([m, n]) => (m === 'surf' ? window.__dig.setSwimmer(n) : window.__dig.setDigger(n)), [mode, mon]);
  await press('start', 18);
  await press('down', 10); await press('down', 10); await press('down', 14); // POKéDEX → MAP
  await press('a', 30);
  // the cursor opens on the cell you are standing in, which after a surf may be the beach outside town
  const start = await page.evaluate(() => window.__dig.mapCursor());
  await cursorTo(start, to);
  await idle(20);
  await press('a', 12);
  const st = await page.evaluate(() => window.__dig.state());
  if (st === 'choice') {
    if (mode === 'surf') await press('down', 14);
    await press('a', 1);
  } else if (mode === 'surf') throw new Error('no water route for surf leg');
  await untilWalk(6000);
}

// ---- the scenario: open on the shore, surf only ----
const PALLET = { x: 4, y: 11 }, FUCHSIA = { x: 12, y: 12 }, CINNABAR = { x: 4, y: 14 }; // region-map cells
await page.evaluate(() => window.__dig.teleport(64, 276)); // Pallet Town's south inlet
await idle(20);
await hold('right', 14); await idle(10); await hold('down', 8); await hold('right', 8); await idle(24);
await travelVia('surf', 'lapras', CINNABAR);       // down Route 21
await idle(40); await hold('left', 10); await idle(20);
await travelVia('surf', 'gyarados', FUCHSIA);      // east along Route 20, up Route 19
await idle(40); await hold('right', 8); await idle(20);
await travelVia('surf', 'wailmer', PALLET);        // the long way home: 19, 20, 21
await idle(40); await hold('up', 10); await idle(60);

await browser.close();
server.kill();

execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(FRAMES, '%05d.png'),
  '-vf', 'scale=1440:960:flags=neighbor', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
console.log(`wrote ${OUT} (${n} frames, ${(n / FPS).toFixed(1)}s)`);
