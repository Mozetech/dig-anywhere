// Start menu, region map, location banner and message box using FireRed's own window frame and font.
import { A } from './assets.js';
import { drawText, textWidth } from './font.js';
import { VW, VH } from './render.js';

const FG = '#383838', SH = '#d8d8d8';

// std.png is a 3x3 grid of 8px tiles: corners, edges, centre.
export function drawWindow(ctx, x, y, w, h) {
  const img = A.img.window;
  const t = (sx, sy, dx, dy, dw = 8, dh = 8) => ctx.drawImage(img, sx, sy, 8, 8, dx, dy, dw, dh);
  t(8, 8, x + 8, y + 8, w - 16, h - 16);
  t(8, 0, x + 8, y, w - 16, 8); t(8, 16, x + 8, y + h - 8, w - 16, 8);
  t(0, 8, x, y + 8, 8, h - 16); t(16, 8, x + w - 8, y + 8, 8, h - 16);
  t(0, 0, x, y); t(16, 0, x + w - 8, y); t(0, 16, x, y + h - 8); t(16, 16, x + w - 8, y + h - 8);
}

export const MENU_ITEMS = ['POKéDEX', 'POKéMON', 'BAG', 'MAP', 'RED', 'SAVE', 'OPTION', 'EXIT'];
export function drawMenu(ctx, cursor) {
  const x = 160, y = 4, w = 76, h = MENU_ITEMS.length * 16 + 12;
  drawWindow(ctx, x, y, w, h);
  MENU_ITEMS.forEach((it, i) => {
    drawText(ctx, it, x + 18, y + 6 + i * 16, FG, SH);
    if (i === cursor) cursorArrow(ctx, x + 9, y + 9 + i * 16);
  });
}
function cursorArrow(ctx, x, y) {
  ctx.fillStyle = FG;
  for (let i = 0; i < 4; i++) ctx.fillRect(x + i, y + i, 1, 8 - i * 2);
}

export function drawMessage(ctx, text, blink) {
  drawWindow(ctx, 4, VH - 44, VW - 8, 40);
  const lines = wrap(text, VW - 40);
  lines.slice(0, 2).forEach((l, i) => drawText(ctx, l, 14, VH - 38 + i * 16, FG, SH));
  if (blink) { ctx.fillStyle = '#e04848'; ctx.fillRect(VW - 20, VH - 14, 7, 2); ctx.fillRect(VW - 19, VH - 12, 5, 1); ctx.fillRect(VW - 18, VH - 11, 3, 1); ctx.fillRect(VW - 17, VH - 10, 1, 1); }
}
function wrap(text, maxW) {
  const out = []; let line = '';
  for (const wd of text.split(' ')) {
    const cand = (line + ' ' + wd).trim();
    if (textWidth(cand) > maxW) { out.push(line.trim()); line = wd; } else line = cand;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

export function drawBanner(ctx, text, alpha, slide) {
  if (alpha <= 0 || !text) return;
  const w = textWidth(text) + 18, x = Math.round((VW - w) / 2), y = 6 + Math.round(slide);
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = '#403848'; ctx.fillRect(x + 1, y, w - 2, 18); ctx.fillRect(x, y + 1, w, 16);
  ctx.fillStyle = '#585068'; ctx.fillRect(x + 1, y + 1, w - 2, 1);
  drawText(ctx, text, x + 9, y + 1, '#f8f8f8', '#302838');
  ctx.globalAlpha = 1;
}

// ---------- region map ----------
// Cells are 8px; cell (0,0) is at screen (32,32). Sprites are 16px, centred 4px past the cell origin.
export const CELL_X = 32, CELL_Y = 32, GRID_W = 22, GRID_H = 15;
export function regionMapsec(cx, cy) {
  const row = A.region.grid[cy];
  return row ? row[cx] : 'MAPSEC_NONE';
}
export function regionName(cx, cy) {
  const sec = regionMapsec(cx, cy);
  return A.region.names[sec] || '';
}
export function drawRegionMap(ctx, cursor, playerCell, time) {
  ctx.drawImage(A.img.regionmap, 0, 0);
  // top bar with the selected location, like the in-game map header
  ctx.fillStyle = '#203058'; ctx.fillRect(0, 0, VW, 16);
  ctx.fillStyle = '#4060a0'; ctx.fillRect(0, 15, VW, 1);
  const name = regionName(cursor.x, cursor.y);
  drawText(ctx, name, 6, 0, '#f8f8f8', '#3050a0');
  if (playerCell) ctx.drawImage(A.img.playerIcon, CELL_X + playerCell.x * 8 - 4, CELL_Y + playerCell.y * 8 - 4);
  const f = Math.floor(time * 4) % 2;
  ctx.drawImage(A.img.cursor, 0, f * 16, 16, 16, CELL_X + cursor.x * 8 - 4, CELL_Y + cursor.y * 8 - 4, 16, 16);
}

// Small option window in the bottom-right corner (DIG / SURF / CANCEL).
export function drawChoice(ctx, options, cursor) {
  const w = 72, h = options.length * 16 + 12, x = VW - w - 4, y = VH - h - 4;
  drawWindow(ctx, x, y, w, h);
  options.forEach((o, i) => {
    drawText(ctx, o, x + 18, y + 6 + i * 16, FG, SH);
    if (i === cursor) { ctx.fillStyle = FG; for (let k = 0; k < 4; k++) ctx.fillRect(x + 9 + k, y + 9 + i * 16 + k, 1, 8 - k * 2); }
  });
}
