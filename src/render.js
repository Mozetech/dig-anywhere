// Surface renderer (pre-rendered FireRed map chunks) and the underground renderer.
import { A, chunkImage } from './assets.js';
import { TILE, hash } from './world.js';

export const VW = 240, VH = 160;

function forChunks(cam, margin, fn) {
  const C = A.world.chunk;
  const x0 = Math.floor((cam.x - margin) / C), x1 = Math.floor((cam.x + VW + margin) / C);
  const y0 = Math.floor((cam.y - margin) / C), y1 = Math.floor((cam.y + VH + margin) / C);
  for (let cy = Math.max(0, y0); cy <= Math.min(A.world.ch - 1, y1); cy++)
    for (let cx = Math.max(0, x0); cx <= Math.min(A.world.cw - 1, x1); cx++) fn(cx, cy, cx * C - cam.x, cy * C - cam.y);
}
export function preloadChunks(cam) {
  forChunks(cam, A.world.chunk, (cx, cy) => { chunkImage(`${cx}_${cy}`); chunkImage(`${cx}_${cy}_top`); });
}
export function drawSurfaceBelow(ctx, cam) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VW, VH);
  forChunks(cam, 0, (cx, cy, sx, sy) => { const img = chunkImage(`${cx}_${cy}`); if (img) ctx.drawImage(img, sx, sy); });
}
export function drawSurfaceAbove(ctx, cam) {
  forChunks(cam, 0, (cx, cy, sx, sy) => { const img = chunkImage(`${cx}_${cy}_top`); if (img) ctx.drawImage(img, sx, sy); });
}

// A fresh hole left where someone dug.
let mound = null;
export function drawMound(ctx, sx, sy) {
  if (!mound) {
    mound = document.createElement('canvas'); mound.width = 16; mound.height = 16;
    const x = mound.getContext('2d');
    const p = (X, Y, col, w = 1, h = 1) => { x.fillStyle = col; x.fillRect(X, Y, w, h); };
    p(3, 5, '#a06840', 10, 8); p(2, 7, '#a06840', 12, 5); p(4, 4, '#b8804c', 8, 2);
    p(5, 8, '#4a2c18', 6, 3); p(6, 7, '#4a2c18', 4, 1); p(3, 12, '#6a4028', 10, 1);
  }
  ctx.drawImage(mound, sx, sy);
}

// ---------- underground ----------
const ucache = new Map();
const SOIL = ['#8a5a38', '#7e5232', '#96643e'];
const WET = ['#5e4a46', '#54423e', '#66524c'];
function mk() { const c = document.createElement('canvas'); c.width = TILE; c.height = TILE; return [c, c.getContext('2d')]; }
function px(x, X, Y, col, w = 1, h = 1) { x.fillStyle = col; x.fillRect(X, Y, w, h); }
function soilBase(x, wet, v, salt) {
  const cols = wet ? WET : SOIL;
  for (let j = 0; j < 16; j += 4) for (let i = 0; i < 16; i += 4) px(x, i, j, cols[Math.floor(hash(i, j, v * 7 + salt) * 3)], 4, 4);
  for (let k = 0; k < 3; k++) {
    const gx = Math.floor(hash(k, v, salt + 3) * 14), gy = Math.floor(hash(v, k, salt + 4) * 14);
    px(x, gx, gy, wet ? '#7a6660' : '#b48454', 2, 2); px(x, gx, gy, wet ? '#8c7872' : '#c89a68', 1, 1);
  }
  if (wet) for (let k = 0; k < 4; k++) px(x, Math.floor(hash(k, v, salt + 9) * 16), Math.floor(hash(v, k, salt + 10) * 16), '#7a98c0', 1, 2);
}
function utile(kind, v) {
  const key = kind + ':' + v;
  if (ucache.has(key)) return ucache.get(key);
  const [c, x] = mk();
  soilBase(x, kind === 'wet', v, kind.length);
  switch (kind) {
    case 'root':
      for (let r = 0; r < 2; r++) {
        let rx = 3 + Math.floor(hash(r, v, 41) * 10);
        for (let y = 0; y < 16; y++) { px(x, rx, y, '#c89860', 1, 1); if (hash(y, r, v + 42) < 0.3) rx += hash(y, r, v + 43) < 0.5 ? -1 : 1; rx = Math.max(1, Math.min(14, rx)); if (y % 5 === 2) px(x, rx - 1, y, '#a87c48', 3, 1); }
      }
      break;
    case 'stone': {
      const n = 2 + Math.floor(hash(v, 0, 50) * 2);
      const slabs = [];
      for (let i = 0; i < n; i++) {
        const w = 6 + Math.floor(hash(v, i, 51) * 9), h = 5 + Math.floor(hash(v, i, 52) * 8);
        slabs.push({ x: Math.floor(hash(v, i, 53) * (17 - w)) - 1, y: Math.floor(hash(v, i, 54) * (17 - h)) - 1, w, h });
      }
      for (const sl of slabs) { px(x, sl.x - 1, sl.y, '#505058', sl.w + 2, sl.h); px(x, sl.x, sl.y - 1, '#505058', sl.w, sl.h + 2); }
      for (const sl of slabs) px(x, sl.x, sl.y, '#8a8a94', sl.w, sl.h);
      for (const sl of slabs) { px(x, sl.x + 1, sl.y + 1, '#b0b0ba', Math.max(1, sl.w - 4), 1); px(x, sl.x + 1, sl.y + 1, '#b0b0ba', 1, Math.max(1, sl.h - 3)); }
      break;
    }
    case 'fossil':
      x.strokeStyle = '#e8e0c8'; x.lineWidth = 1; x.beginPath();
      for (let a = 0; a < Math.PI * 5; a += 0.2) { const r = 0.9 + a * 0.4; const X = 8 + Math.cos(a) * r, Y = 8 + Math.sin(a) * r; if (a === 0) x.moveTo(X, Y); else x.lineTo(X, Y); }
      x.stroke();
      break;
    case 'bone':
      px(x, 3, 7, '#e8e0c8', 10, 2); px(x, 2, 5, '#e8e0c8', 2, 2); px(x, 2, 9, '#e8e0c8', 2, 2); px(x, 12, 5, '#e8e0c8', 2, 2); px(x, 12, 9, '#e8e0c8', 2, 2);
      break;
    case 'sandy':
      for (let k = 0; k < 8; k++) px(x, Math.floor(hash(k, v, 61) * 16), Math.floor(hash(v, k, 62) * 16), '#c8a068', 2, 1);
      break;
  }
  ucache.set(key, c);
  return c;
}

export function drawUnderground(ctx, world, cam, travel) {
  const x0 = Math.floor(cam.x / TILE), y0 = Math.floor(cam.y / TILE);
  for (let ty = y0; ty <= y0 + 10; ty++) for (let tx = x0; tx <= x0 + 15; tx++) {
    let kind = world.soilKind(tx, ty);
    const h = hash(tx, ty, 77);
    if (kind === 'soil' && h < 0.004) kind = 'bone'; else if (kind === 'soil' && h < 0.007) kind = 'fossil';
    ctx.drawImage(utile(kind, Math.floor(hash(tx, ty, 78) * 4)), tx * TILE - cam.x, ty * TILE - cam.y);
  }
  // ghost of the surface so you can tell what you are tunnelling under
  ctx.globalAlpha = 0.26;
  forChunks(cam, 0, (cx, cy, sx, sy) => {
    const img = chunkImage(`${cx}_${cy}`); if (img) ctx.drawImage(img, sx, sy);
    const top = chunkImage(`${cx}_${cy}_top`); if (top) ctx.drawImage(top, sx, sy);
  });
  ctx.globalAlpha = 1;
  if (travel) {
    const { x, y, dx, dy, traveled } = travel;
    const maxLen = Math.min(traveled, 320);
    for (const [col, extra] of [['#b8804c', 4], ['#3a2414', 0]]) {
      ctx.fillStyle = col;
      for (let d = 0; d <= maxLen; d += 4) {
        const idx = Math.floor((traveled - d) / 4);
        const j = hash(idx, 0, 91) * 4 - 2, k = hash(idx, 1, 92) * 4 - 2;
        const size = 16 + extra + Math.floor(hash(idx, 2, 93) * 3);
        ctx.fillRect(Math.round(x - dx * d - cam.x + j - size / 2), Math.round(y - dy * d - cam.y + k - size / 2), size, size);
      }
    }
  }
}

export function drawFade(ctx, alpha) {
  if (alpha <= 0) return;
  ctx.fillStyle = `rgba(58,34,20,${Math.min(1, alpha)})`;
  ctx.fillRect(0, 0, VW, VH);
}

export function drawBlack(ctx, alpha) {
  if (alpha <= 0) return;
  ctx.fillStyle = `rgba(0,0,0,${Math.min(1, alpha)})`;
  ctx.fillRect(0, 0, VW, VH);
}
