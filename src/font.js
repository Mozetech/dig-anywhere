// FireRed's latin_normal font: 16x16 glyph cells, variable advance widths, fg + shadow colours.
import { A } from './assets.js';

let atlas = null;   // ImageData of the atlas: black = foreground, red = shadow
let widths = [], charmap = {};
const colored = new Map();

export function initFont() {
  const img = A.img.font;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  atlas = x.getImageData(0, 0, img.width, img.height);
  widths = A.font.widths;
  charmap = A.font.map;
}

function atlasFor(fg, shadow) {
  const key = fg + '|' + shadow;
  if (colored.has(key)) return colored.get(key);
  const c = document.createElement('canvas');
  c.width = atlas.width; c.height = atlas.height;
  const x = c.getContext('2d');
  const out = x.createImageData(atlas.width, atlas.height);
  const f = hex(fg), s = hex(shadow);
  const src = atlas.data, dst = out.data;
  for (let i = 0; i < src.length; i += 4) {
    if (src[i + 3] === 0) continue;
    const col = src[i] > 128 ? s : f; // red channel high = shadow pixel
    if (!col) continue;
    dst[i] = col[0]; dst[i + 1] = col[1]; dst[i + 2] = col[2]; dst[i + 3] = 255;
  }
  x.putImageData(out, 0, 0);
  colored.set(key, c);
  return c;
}
function hex(h) {
  if (!h) return null;
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function glyphId(ch) {
  if (ch in charmap) return charmap[ch];
  return charmap['?'];
}
export function drawText(ctx, text, x, y, fg = '#383838', shadow = '#d8d8d8') {
  const sheet = atlasFor(fg, shadow);
  let cx = Math.round(x);
  for (const ch of text) {
    const id = glyphId(ch);
    const w = widths[id] || 6;
    if (ch !== ' ') ctx.drawImage(sheet, (id % 16) * 16, Math.floor(id / 16) * 16, 16, 16, cx, Math.round(y), 16, 16);
    cx += w;
  }
  return cx - Math.round(x);
}
export function textWidth(text) {
  let w = 0;
  for (const ch of text) w += widths[glyphId(ch)] || 6;
  return w;
}
