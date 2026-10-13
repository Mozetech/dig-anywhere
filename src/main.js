// Game loop and state machine on the real FireRed Kanto:
// walk → menu → map → (choice) → Pokéball throw → dig under the map, or surf along the water → walk.
import { A, loadAssets } from './assets.js';
import { buildWorld, TILE, JUMP_DIR } from './world.js';
import { SPR, DIGGERS, SWIMMERS, FOLLOWER, SUBMERGE, initSprites } from './sprites.js';
import { initFont } from './font.js';
import { VW, VH, drawSurfaceBelow, drawSurfaceAbove, drawUnderground, drawFade, drawBlack, drawMound, preloadChunks } from './render.js';
import { drawMenu, MENU_ITEMS, drawMessage, drawBanner, drawRegionMap, drawChoice, regionMapsec, regionName, GRID_W, GRID_H } from './ui.js';
import { Input } from './input.js';
import { sfx } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function fit() {
  const hint = document.getElementById('hint');
  const availH = window.innerHeight - (hint && hint.offsetParent ? hint.offsetHeight + 40 : 20);
  const scale = Math.max(1, Math.floor(Math.min(window.innerWidth / VW, availH / VH)));
  canvas.style.width = VW * scale + 'px';
  canvas.style.height = VH * scale + 'px';
}
window.addEventListener('resize', fit);
fit();

ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VW, VH);
try {
  await loadAssets();
} catch (err) {
  // assets/ is built locally by ./setup.sh and never shipped with the code
  const hint = document.getElementById('hint');
  if (hint) { hint.style.display = 'block'; hint.innerHTML = '<b>The game assets are not built yet.</b><br>Run <b>./setup.sh</b> in the project folder, then reload.'; }
  throw err;
}
initFont();
initSprites();
const world = buildWorld();

const input = new Input();
window.addEventListener('keydown', () => sfx.unlock(), { once: true });
window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

// ---------- entities ----------
const WALK_T = 0.21;
const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
function makeActor(tx, ty, dir = 'down') {
  return { tx, ty, fx: tx, fy: ty, dir, moving: false, prog: 0, fromX: tx, fromY: ty, dist: 1, visible: true };
}
function startMove(a, dir) {
  const d = DIRS[dir];
  a.dir = dir;
  let nx = a.tx + d.x, ny = a.ty + d.y, dist = 1;
  const b = world.behaviorAt(nx, ny);
  if (JUMP_DIR[b]) {
    if (JUMP_DIR[b] !== dir) return false; // ledges only go one way
    nx += d.x; ny += d.y; dist = 2;
  }
  if (world.isBlocked(nx, ny) || (a !== player && nx === player.tx && ny === player.ty)) return false;
  a.fromX = a.tx; a.fromY = a.ty; a.tx = nx; a.ty = ny; a.moving = true; a.prog = 0; a.dist = dist;
  return true;
}
function updateActor(a, dt) {
  if (!a.moving) { a.fx = a.tx; a.fy = a.ty; return; }
  a.prog += dt / (WALK_T * (a.dist === 2 ? 1.6 : 1));
  if (a.prog >= 1) { a.prog = 0; a.moving = false; a.fx = a.tx; a.fy = a.ty; a.dist = 1; return; }
  a.fx = a.fromX + (a.tx - a.fromX) * a.prog; a.fy = a.fromY + (a.ty - a.fromY) * a.prog;
}
function actorFrame(a) { return a.moving ? Math.floor(a.prog * 4) % 4 : 0; }
function hopLift(a) { return a.moving && a.dist === 2 ? Math.sin(a.prog * Math.PI) * 8 : 0; }
function placeActor(a, x, y, dir) { a.tx = a.fromX = x; a.ty = a.fromY = y; a.fx = x; a.fy = y; a.moving = false; if (dir) a.dir = dir; }

const startTown = world.towns.find((t) => t.id === 'MAP_PALLET_TOWN');
const player = makeActor(startTown.land.x, startTown.land.y, 'down');
const follower = makeActor(startTown.land.x, startTown.land.y + 1, 'up');
if (world.isBlocked(follower.tx, follower.ty)) placeActor(follower, player.tx + 1, player.ty);
// The Pokémon that was let out of its ball, standing on the surface. clip = visible px from the top (0..32).
const mon = { tx: 0, ty: 0, visible: false, clip: 0, key: DIGGERS[0], dir: 'down' };
let diggerIdx = 0, swimmerIdx = 0, forcedDigger = null, forcedSwimmer = null;
const HOLE_TTL = 3; // seconds a hole stays open after you climb out

// ---------- state ----------
let state = 'walk';
let menuCursor = 0, message = '', msgFrom = 'walk';
const mapCursor = { x: 0, y: 0 };
let choice = null; // { options, cursor, town, route }
let time = 0, shake = 0;
const cam = { x: 0, y: 0 };
const particles = [];
let dig = null; // the active trip (dig or surf)
const banner = { text: '', alpha: 0, slide: -14, target: '' };

function showMessage(text, from = 'walk') { message = text; msgFrom = from; state = 'msg'; }

const DIRT = ['#a06840', '#6a4028', '#c08858'];
const SPRAY = ['#f8f8f8', '#b8e0f8', '#78b8f0'];
function spawnDirt(x, y, n, vx, vy, spread, cols = DIRT) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x, y, vx: vx + (Math.random() - 0.5) * spread, vy: vy + (Math.random() - 0.5) * spread,
      life: 0.35 + Math.random() * 0.35, size: 1 + Math.floor(Math.random() * 3), col: cols[Math.floor(Math.random() * cols.length)],
    });
  }
}
function updateParticles(dt, gravity) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; if (gravity) p.vy += 260 * dt; p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
function drawParticles() {
  for (const p of particles) { ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y), p.size, p.size); }
}

// ---------- trips ----------
function landBeside(tx, ty, avoid) {
  for (const d of ['left', 'right', 'down', 'up']) {
    const nx = tx + DIRS[d].x, ny = ty + DIRS[d].y;
    if (!world.isBlocked(nx, ny) && !world.isWater(nx, ny) && !avoid.some((a) => a.tx === nx && a.ty === ny)) return { x: nx, y: ny, dir: d };
  }
  return null;
}
function freeBeside(tx, ty, avoid) {
  for (const d of ['left', 'right', 'down', 'up']) {
    const nx = tx + DIRS[d].x, ny = ty + DIRS[d].y;
    if (!world.isBlocked(nx, ny) && !avoid.some((a) => a.tx === nx && a.ty === ny)) return { x: nx, y: ny, dir: d };
  }
  return null;
}
function beginTrip(dest, mode, route = null) {
  if (mode === 'surf') {
    // Surf is a cutscene: cut to the shore, let the Pokémon out onto the water, ride, and step off on the far shore.
    mon.key = forcedSwimmer || SWIMMERS[swimmerIdx++ % SWIMMERS.length]; forcedSwimmer = null;
    const shore = world.shoreBeside(route.start, { x: player.tx, y: player.ty }) || { x: player.tx, y: player.ty };
    mon.tx = route.start.x; mon.ty = route.start.y; mon.visible = false; mon.clip = 0; mon.dir = 'down';
    const already = shore.x === player.tx && shore.y === player.ty;
    dig = { mode, phase: already ? 'throw' : 'fadeToShore', t: 0, dest, route, shore, rider: null, fade: 0, black: 0, travel: null, hop: null, ball: null };
    if (already) player.dir = dirOf(mon.tx - player.tx, mon.ty - player.ty);
    state = 'dig';
    sfx.select();
    return;
  }
  const spot = freeBeside(player.tx, player.ty, [follower]) || { x: player.tx, y: player.ty + 1, dir: 'down' };
  player.dir = spot.dir;
  mon.key = forcedDigger || DIGGERS[diggerIdx++ % DIGGERS.length]; forcedDigger = null;
  mon.tx = spot.x; mon.ty = spot.y; mon.visible = false; mon.clip = 0; mon.dir = 'down';
  dig = { mode, phase: 'throw', t: 0, dest, spot, route, rider: null, fade: 0, black: 0, travel: null, hop: null, ball: null };
  state = 'dig';
  sfx.select();
}
function digPhase(next) { dig.phase = next; dig.t = 0; }
function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function dirOf(dx, dy) { return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up'); }
function updateBanner(dt, x, y) {
  const d = dig;
  const area = world.areaAt(x / TILE, y / TILE);
  if (!area) return;
  if (area !== d.pendArea) { d.pendArea = area; d.pendT = 0; } else d.pendT += dt;
  if (d.pendT > 0.2 && banner.target !== area) banner.target = area;
}
function finishTrip() {
  dig = null; state = 'walk'; sfx.jingle();
  for (const h of world.holes) if (!h.expires) h.expires = time + HOLE_TTL;
}

function updateTrip(dt) {
  const d = dig; d.t += dt;
  const dst = d.dest;
  switch (d.phase) {
    case 'fadeToShore': {
      const k = Math.min(1, d.t / 0.7);
      d.black = k < 0.5 ? k * 2 : (1 - k) * 2;
      if (k >= 0.5 && !d.moved) {
        d.moved = true;
        placeActor(player, d.shore.x, d.shore.y, dirOf(mon.tx - d.shore.x, mon.ty - d.shore.y));
        const fs = freeBeside(d.shore.x, d.shore.y, [{ tx: mon.tx, ty: mon.ty }]);
        if (fs && !world.isWater(fs.x, fs.y)) placeActor(follower, fs.x, fs.y, player.dir); else follower.visible = false;
      }
      if (k >= 1) { d.black = 0; digPhase('throw'); }
      break;
    }
    // --- shared: throw the ball, let the Pokémon out ---
    case 'throw': {
      if (d.t > 0.6) { digPhase('ball'); sfx.pop(); }
      break;
    }
    case 'ball': {
      const k = Math.min(1, d.t / 0.55);
      const sx = player.tx * TILE + 8, sy = player.ty * TILE - 6;
      const ex = mon.tx * TILE + 8, ey = mon.ty * TILE + 6;
      d.ball = { x: sx + (ex - sx) * k, y: sy + (ey - sy) * k - Math.sin(k * Math.PI) * 18, frame: 0 };
      if (k >= 1) { digPhase('open'); sfx.select(); }
      break;
    }
    case 'open': {
      d.ball = { x: mon.tx * TILE + 8, y: mon.ty * TILE + 6, frame: 2 };
      d.flash = Math.min(1, d.t / 0.45);
      if (d.t > 0.45) {
        d.ball = null; d.flash = 0;
        if (d.mode === 'dig') digPhase('summon');
        else { mon.visible = true; mon.clip = 32; digPhase('appear'); spawnDirt(mon.tx * TILE + 8, mon.ty * TILE + 12, 10, 0, -50, 90, SPRAY); }
      }
      break;
    }
    case 'appear': {
      if (d.t > 0.7) { digPhase('mount'); sfx.pop(); }
      break;
    }
    case 'summon': {
      mon.visible = true;
      mon.clip = Math.min(32, Math.round(ease(Math.min(1, d.t / 0.5)) * 32));
      if (d.t < 0.5 && Math.random() < 0.8) spawnDirt(mon.tx * TILE + 8, mon.ty * TILE + 14, 2, 0, -60, 90);
      shake = d.t < 0.5 ? 1 : 0;
      if (d.t > 0.75) { digPhase('mount'); sfx.pop(); }
      break;
    }
    case 'mount': {
      const k = Math.min(1, d.t / 0.55);
      d.hop = { x: player.tx + (mon.tx - player.tx) * k, y: player.ty + (mon.ty - player.ty) * k, lift: Math.sin(k * Math.PI) * 14 };
      if (k >= 1) {
        d.hop = null; player.visible = false; mon.visible = false;
        if (d.mode === 'dig') { d.rider = { x: mon.tx, y: mon.ty, clip: 48, lift: 0 }; digPhase('sink'); sfx.rumbleStart(); }
        else {
          // Build the swim as a list of pixel waypoints: spot → shore water → along the water → landing water tile.
          const pts = d.route.points.map((p) => ({ x: p.x * TILE + 8, y: p.y * TILE + 8 }));
          d.swim = { pts, seg: 0, x: pts[0].x, y: pts[0].y, dir: 'down', done: false };
          follower.visible = false;
          banner.alpha = 0; banner.text = ''; banner.target = ''; d.pendArea = null; d.pendT = 0;
          digPhase('swim');
        }
      }
      break;
    }
    // --- surf ---
    case 'swim': {
      const s = d.swim;
      const onWater = true; // the route is water tiles only
      let budget = 150 * dt;
      while (budget > 0 && s.seg < s.pts.length - 1) {
        const a = s.pts[s.seg], b = s.pts[s.seg + 1];
        const dx = b.x - s.x, dy = b.y - s.y, dist = Math.hypot(dx, dy);
        if (dist <= budget) { s.x = b.x; s.y = b.y; s.seg++; budget -= dist; if (dist > 0) s.dir = dirOf(b.x - a.x, b.y - a.y); }
        else { s.x += (dx / dist) * budget; s.y += (dy / dist) * budget; s.dir = dirOf(dx, dy); budget = 0; }
      }
      if (onWater) {
        const back = DIRS[s.dir];
        spawnDirt(s.x - back.x * 10 + (Math.random() - 0.5) * 10, s.y + 8 - back.y * 6, 2, -back.x * 40, -back.y * 40, 40, SPRAY);
      }
      updateBanner(dt, s.x, s.y);
      if (s.seg >= s.pts.length - 1) {
        const end = d.route.end;
        const shore = world.shoreBeside(end, dst.land) || dst.land;
        d.off = shore;
        d.rider = { x: end.x, y: end.y };
        // keep the mount on the water while Red climbs off
        mon.visible = true; mon.tx = end.x; mon.ty = end.y; mon.dir = s.dir; mon.clip = 32;
        digPhase('dismount');
      }
      break;
    }
    case 'recall': {
      const k = Math.min(1, d.t / 0.8);
      d.flash = k < 0.4 ? k / 0.4 : 0;
      if (k >= 0.4) {
        mon.visible = false;
        const kk = (k - 0.4) / 0.6;
        const sx = d.rider.x * TILE + 8, sy = d.rider.y * TILE + 4, ex = player.tx * TILE + 8, ey = player.ty * TILE - 4;
        d.ball = { x: sx + (ex - sx) * kk, y: sy + (ey - sy) * kk - Math.sin(kk * Math.PI) * 12, frame: 0 };
      }
      if (k >= 1) { d.ball = null; d.rider = null; digPhase('followerPop'); sfx.pop(); }
      break;
    }
    // --- dig ---
    case 'sink': {
      const k = Math.min(1, d.t / 0.6);
      d.rider.clip = Math.round(48 * (1 - ease(k)));
      shake = 1.5;
      if (Math.random() < 0.9) spawnDirt(mon.tx * TILE + 8 + (Math.random() - 0.5) * 14, mon.ty * TILE + 12, 2, 0, -80, 100);
      if (k >= 1) { world.holes.push({ x: mon.tx, y: mon.ty }); digPhase('fadeOut'); }
      break;
    }
    case 'fadeOut': {
      d.fade = Math.min(1, d.t / 0.35);
      shake = 1;
      if (d.t >= 0.4) {
        const sx = mon.tx * TILE + 8, sy = mon.ty * TILE + 8;
        const ex = dst.land.x * TILE + 8, ey = dst.land.y * TILE + 8;
        const len = Math.hypot(ex - sx, ey - sy);
        d.travel = { x: sx, y: sy, sx, sy, ex, ey, dx: (ex - sx) / len, dy: (ey - sy) / len, len, traveled: 0, claw: 0 };
        follower.visible = false;
        banner.alpha = 0; banner.text = ''; banner.target = ''; d.pendArea = null; d.pendT = 0;
        digPhase('travel');
      }
      break;
    }
    case 'travel': {
      const tr = d.travel;
      d.fade = Math.max(0, 1 - d.t / 0.35);
      const kind = world.soilKind(Math.floor(tr.x / TILE), Math.floor(tr.y / TILE));
      const speed = kind === 'stone' ? 220 : 380;
      const step = Math.min(speed * dt, tr.len - tr.traveled);
      tr.x += tr.dx * step; tr.y += tr.dy * step; tr.traveled += step; tr.claw += dt;
      shake = kind === 'stone' ? 2 : 1;
      const cols = kind === 'stone' ? ['#8a8a94', '#505058', '#b0b0ba'] : kind === 'wet' ? ['#5e4a46', '#7a98c0', '#8c7872'] : undefined;
      spawnDirt(tr.x + (Math.random() < 0.5 ? -11 : 11), tr.y + 6, 2, -tr.dx * 90, -tr.dy * 90, 70, cols);
      updateBanner(dt, tr.x, tr.y);
      if (tr.traveled >= tr.len - 0.01) {
        const lx = dst.land.x, ly = dst.land.y;
        const off = !world.isBlocked(lx, ly + 1) ? { x: lx, y: ly + 1 } : freeBeside(lx, ly, []) || { x: lx, y: ly };
        d.off = off;
        placeActor(player, off.x, off.y, 'down');
        world.holes.push({ x: lx, y: ly });
        d.rider = { x: lx, y: ly, clip: 0, lift: 0 };
        d.fade = 1;
        digPhase('fadeIn');
      }
      break;
    }
    case 'fadeIn': {
      d.fade = Math.max(0, 1 - d.t / 0.35);
      if (d.t > 0.45) { digPhase('emerge'); sfx.thud(); }
      break;
    }
    case 'emerge': {
      const k = Math.min(1, d.t / 0.5);
      d.rider.clip = Math.round(48 * ease(k));
      d.rider.lift = k >= 1 ? Math.max(0, Math.sin((d.t - 0.5) * Math.PI / 0.25)) * 4 : 0;
      shake = k < 1 ? 1.5 : 0;
      if (k < 1 && Math.random() < 0.9) spawnDirt(d.rider.x * TILE + 8 + (Math.random() - 0.5) * 16, d.rider.y * TILE + 12, 3, 0, -90, 110);
      if (d.t > 0.8) { sfx.rumbleStop(); digPhase('dismount'); sfx.pop(); }
      break;
    }
    // --- shared: hop off ---
    case 'dismount': {
      const k = Math.min(1, d.t / 0.55);
      d.hop = { x: d.rider.x + (d.off.x - d.rider.x) * k, y: d.rider.y + (d.off.y - d.rider.y) * k, lift: 12 + Math.sin(k * Math.PI) * 10 - 12 * k };
      player.visible = false;
      if (k >= 1) {
        d.hop = null; player.visible = true;
        placeActor(player, d.off.x, d.off.y, 'down');
        mon.visible = true; mon.tx = d.rider.x; mon.ty = d.rider.y; mon.clip = 32;
        const fs = landBeside(d.off.x, d.off.y, [{ tx: d.rider.x, ty: d.rider.y }]) || { x: d.off.x, y: d.off.y };
        placeActor(follower, fs.x, fs.y, 'down');
        if (d.mode === 'dig') { d.rider = null; digPhase('moleLeave'); }
        else { player.dir = dirOf(d.rider.x - d.off.x, d.rider.y - d.off.y); digPhase('recall'); }
      }
      break;
    }
    case 'moleLeave': {
      const k = Math.min(1, d.t / 0.4);
      mon.clip = Math.round(32 * (1 - ease(k)));
      if (Math.random() < 0.6) spawnDirt(mon.tx * TILE + 8, mon.ty * TILE + 14, 1, 0, -50, 70);
      if (k >= 1) { mon.visible = false; digPhase('followerPop'); world.holes.push({ x: follower.tx, y: follower.ty }); sfx.pop(); }
      break;
    }
    case 'followerPop': {
      const k = Math.min(1, d.t / 0.35);
      follower.visible = true; follower.dir = 'down';
      d.fLift = Math.sin(k * Math.PI) * 10;
      if (d.mode === 'dig' && d.t < 0.2 && Math.random() < 0.8) spawnDirt(follower.tx * TILE + 8, follower.ty * TILE + 14, 2, 0, -70, 90);
      if (d.t > 0.5) { d.fLift = 0; finishTrip(); }
      break;
    }
  }
}

// ---------- update ----------
function update(dt) {
  time += dt;
  banner.slide += (0 - banner.slide) * Math.min(1, dt * 10);
  if (banner.target !== banner.text) {
    banner.alpha -= dt * 6;
    if (banner.alpha <= 0) { banner.text = banner.target; banner.alpha = 0; banner.slide = -10; }
  } else if (banner.text) banner.alpha = Math.min(1, banner.alpha + dt * 5);

  switch (state) {
    case 'walk': {
      if (input.just('start')) { state = 'menu'; menuCursor = 0; sfx.select(); break; }
      updateActor(player, dt); updateActor(follower, dt);
      if (!player.moving) {
        const dir = input.dir();
        if (dir) {
          const prevX = player.tx, prevY = player.ty;
          if (startMove(player, dir)) {
            if (!(follower.tx === prevX && follower.ty === prevY)) {
              const fdx = prevX - follower.tx, fdy = prevY - follower.ty;
              const straight = (fdx === 0 || fdy === 0) && Math.abs(fdx) + Math.abs(fdy) <= 2;
              if (straight) {
                follower.dir = fdx > 0 ? 'right' : fdx < 0 ? 'left' : fdy > 0 ? 'down' : 'up';
                follower.fromX = follower.tx; follower.fromY = follower.ty; follower.tx = prevX; follower.ty = prevY; follower.moving = true; follower.prog = 0; follower.dist = Math.abs(fdx) + Math.abs(fdy);
              } else placeActor(follower, prevX, prevY);
            }
          } else if (input.just(dir)) sfx.bump();
        }
      }
      if (input.just('a')) {
        const d = DIRS[player.dir];
        const fx = player.tx + d.x, fy = player.ty + d.y;
        if (world.holes.some((h) => h.x === fx && h.y === fy)) showMessage('A fresh hole. Something dug here.');
        else if (world.isWater(fx, fy)) showMessage('The water is a deep blue. Pick a town on the MAP to surf across.');
        else if (world.isBlocked(fx, fy)) { const t = world.townAt(player.tx, player.ty); showMessage(t ? t.name + '. Open the menu and pick MAP to travel.' : 'Open the menu and pick MAP to travel to a town.'); }
      }
      break;
    }
    case 'menu': {
      if (input.just('up')) { menuCursor = (menuCursor + MENU_ITEMS.length - 1) % MENU_ITEMS.length; sfx.move(); }
      if (input.just('down')) { menuCursor = (menuCursor + 1) % MENU_ITEMS.length; sfx.move(); }
      if (input.just('b') || input.just('start')) { state = 'walk'; sfx.cancel(); }
      if (input.just('a')) {
        const it = MENU_ITEMS[menuCursor];
        sfx.select();
        if (it === 'MAP') {
          state = 'map';
          const cell = world.regionCell(player.tx, player.ty) || { x: 4, y: 11 };
          mapCursor.x = cell.x; mapCursor.y = cell.y;
        } else if (it === 'EXIT') state = 'walk';
        else showMessage(it + ' is not in this demo. Pick MAP to travel somewhere.', 'menu');
      }
      break;
    }
    case 'map': {
      let moved = false;
      if (input.just('up') && mapCursor.y > 0) { mapCursor.y--; moved = true; }
      if (input.just('down') && mapCursor.y < GRID_H - 1) { mapCursor.y++; moved = true; }
      if (input.just('left') && mapCursor.x > 0) { mapCursor.x--; moved = true; }
      if (input.just('right') && mapCursor.x < GRID_W - 1) { mapCursor.x++; moved = true; }
      if (moved) sfx.move();
      if (input.just('b')) { state = 'menu'; sfx.cancel(); }
      if (input.just('a')) {
        const sec = regionMapsec(mapCursor.x, mapCursor.y);
        const town = world.townByMapsec(sec);
        const here = world.townAt(player.tx, player.ty);
        if (!town) { sfx.cancel(); if (regionName(mapCursor.x, mapCursor.y)) showMessage('You can only travel to a town or city.', 'map'); }
        else if (here && here.id === town.id) { sfx.cancel(); showMessage("You're already in " + town.name + '.', 'map'); }
        else {
          sfx.select();
          // SURF is only offered when a body of water actually connects the two places.
          const route = world.waterPath(player.tx, player.ty, town.land.x, town.land.y);
          if (route) { choice = { options: ['DIG', 'SURF', 'CANCEL'], cursor: 0, town, route }; state = 'choice'; }
          else beginTrip(town, 'dig');
        }
      }
      break;
    }
    case 'choice': {
      if (input.just('up')) { choice.cursor = (choice.cursor + choice.options.length - 1) % choice.options.length; sfx.move(); }
      if (input.just('down')) { choice.cursor = (choice.cursor + 1) % choice.options.length; sfx.move(); }
      if (input.just('b')) { state = 'map'; choice = null; sfx.cancel(); }
      else if (input.just('a')) {
        const pick = choice.options[choice.cursor];
        if (pick === 'DIG') beginTrip(choice.town, 'dig');
        else if (pick === 'SURF') beginTrip(choice.town, 'surf', choice.route);
        else { state = 'map'; sfx.cancel(); }
        choice = null;
      }
      break;
    }
    case 'msg': {
      if (input.just('a') || input.just('b') || input.just('start')) { state = msgFrom; sfx.select(); }
      break;
    }
    case 'dig': updateTrip(dt); break;
  }
  updateParticles(dt, !(dig && (dig.phase === 'travel' || dig.phase === 'swim')));
  for (let i = world.holes.length - 1; i >= 0; i--) {
    const h = world.holes[i];
    if (h.expires && time >= h.expires) { spawnDirt(h.x * TILE + 8, h.y * TILE + 10, 6, 0, -30, 50); world.holes.splice(i, 1); }
  }

  // camera
  let cx, cy;
  if (dig && dig.phase === 'travel') { cx = dig.travel.x; cy = dig.travel.y; }
  else if (dig && dig.phase === 'swim') { cx = dig.swim.x; cy = dig.swim.y; }
  else if (dig && dig.rider) { cx = dig.rider.x * TILE + 8; cy = dig.rider.y * TILE + 8; }
  else { cx = player.fx * TILE + 8; cy = player.fy * TILE + 8; }
  cam.x = Math.round(Math.max(0, Math.min(world.W * TILE - VW, cx - VW / 2)));
  cam.y = Math.round(Math.max(0, Math.min(world.H * TILE - VH, cy - VH / 2)));
  if (shake > 0) { cam.x += Math.round((Math.random() - 0.5) * 2 * shake); cam.y += Math.round((Math.random() - 0.5) * 2 * shake); shake = 0; }
  preloadChunks(cam);
}

// ---------- draw ----------
function drawActor(a, sprites, lift = 0) {
  if (!a.visible) return;
  const f = sprites[a.dir][actorFrame(a)];
  const w = f.width;
  ctx.drawImage(f, Math.round(a.fx * TILE - cam.x - (w - 16) / 2), Math.round(a.fy * TILE - cam.y - 16 - lift - hopLift(a)));
}
function drawDigRider(r, frame) {
  const img = SPR.rider[mon.key][frame];
  const sx = Math.round(r.x * TILE - cam.x - 8), sy = Math.round(r.y * TILE - cam.y - 32 - (r.lift || 0));
  const clip = r.clip;
  if (clip <= 0) return;
  ctx.drawImage(img, 0, 0, 32, clip, sx, sy + (48 - clip), 32, clip);
}
function drawRipple(cx, cy, t) {
  // two short arcs either side of the mount rather than a full ring
  ctx.strokeStyle = 'rgba(236,248,255,0.4)';
  ctx.lineWidth = 1;
  const r = 11 + Math.sin(t * 4);
  ctx.beginPath(); ctx.ellipse(cx, cy, r, 3.5, 0, Math.PI * 0.12, Math.PI * 0.88); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx, cy, r, 3.5, 0, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
}
function drawMon(flashAlpha = 0) {
  const img = SPR[mon.key][mon.dir][Math.floor(time * 6) % 2 ? 1 : 0];
  const sx = Math.round(mon.tx * TILE - cam.x - 8), sy = Math.round(mon.ty * TILE - cam.y - 16);
  const afloat = world.isWater(mon.tx, mon.ty);
  if (afloat) drawRipple(Math.round(mon.tx * TILE + 8 - cam.x), Math.round(mon.ty * TILE + 8 - cam.y), time);
  const clip = Math.min(mon.clip, afloat ? 32 - SUBMERGE : 32); // half submerged when on the water
  if (clip <= 0) return;
  ctx.drawImage(img, 0, 0, 32, clip, sx, sy + (32 - clip), 32, clip);
  if (flashAlpha > 0) whiteOver(img, sx, sy, flashAlpha);
}
// White silhouette of a sprite (the Pokéball recall / release glow).
const silCache = new Map();
function whiteOver(img, sx, sy, alpha) {
  let s = silCache.get(img);
  if (!s) {
    s = document.createElement('canvas'); s.width = img.width; s.height = img.height;
    const x = s.getContext('2d'); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, s.width, s.height);
    silCache.set(img, s);
  }
  ctx.globalAlpha = Math.min(1, alpha); ctx.drawImage(s, sx, sy); ctx.globalAlpha = 1;
}
function drawBallBurst(x, y, k) {
  // expanding ring + sparkles while the ball opens
  ctx.globalAlpha = 1 - k;
  ctx.fillStyle = '#f8f8f8';
  const r = 4 + k * 14;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  const f = SPR.sparkle[Math.floor(time * 12) % 2];
  for (const [ox, oy] of [[-12, -10], [10, -12], [-10, 6], [12, 4]]) ctx.drawImage(f, Math.round(x + ox * (0.4 + k) - 8), Math.round(y + oy * (0.4 + k) - 8));
}
function draw() {
  if (state === 'map' || state === 'choice') {
    drawRegionMap(ctx, mapCursor, world.regionCell(player.tx, player.ty), time);
    if (state === 'choice') drawChoice(ctx, choice.options, choice.cursor);
    return;
  }
  if (dig && dig.phase === 'travel') {
    drawUnderground(ctx, world, cam, dig.travel);
    drawParticles();
    const frame = Math.floor(dig.travel.claw * 8) % 2;
    ctx.drawImage(SPR.rider[mon.key][frame], Math.round(VW / 2 - 16), Math.round(VH / 2 - 24 + Math.sin(time * 18)));
    drawFade(ctx, dig.fade);
    drawBanner(ctx, banner.text, banner.alpha, banner.slide);
    return;
  }
  drawSurfaceBelow(ctx, cam);
  for (const h of world.holes) drawMound(ctx, h.x * TILE - cam.x, h.y * TILE - cam.y);
  const list = [];
  if (follower.visible) list.push({ y: follower.fy, fn: () => drawActor(follower, SPR[FOLLOWER], dig && dig.fLift ? dig.fLift : 0) });
  if (player.visible && !(dig && dig.hop)) {
    if (dig && (dig.phase === 'throw' || dig.phase === 'ball')) {
      list.push({ y: player.fy, fn: () => ctx.drawImage(SPR.throwPose[dig.phase === 'throw' && dig.t < 0.18 ? 0 : 1], Math.round(player.fx * TILE - cam.x), Math.round(player.fy * TILE - cam.y - 16)) });
    } else list.push({ y: player.fy, fn: () => drawActor(player, SPR.player) });
  }
  if (mon.visible) list.push({ y: mon.ty, fn: () => drawMon(dig && dig.phase === 'recall' ? dig.flash : dig && dig.phase === 'appear' ? 1 - Math.min(1, dig.t / 0.45) : 0) });
  if (dig && dig.rider && dig.mode === 'dig') list.push({ y: dig.rider.y, fn: () => drawDigRider(dig.rider, Math.floor(time * 8) % 2) });
  if (dig && dig.phase === 'swim') {
    const s = dig.swim;
    list.push({ y: s.y / TILE, fn: () => {
      const img = SPR.swimRider[mon.key][s.dir][Math.floor(time * 5) % 2];
      const bob = Math.sin(time * 6) * 1.5;
      drawRipple(Math.round(s.x - cam.x), Math.round(s.y + 8 - cam.y), time);
      ctx.drawImage(img, Math.round(s.x - 16 - cam.x), Math.round(s.y - 32 - cam.y + bob));
    } });
  }
  if (dig && dig.hop) list.push({ y: dig.hop.y + 0.5, fn: () => { const f = SPR.player[player.dir][0]; ctx.drawImage(f, Math.round(dig.hop.x * TILE - cam.x), Math.round(dig.hop.y * TILE - cam.y - 16 - dig.hop.lift)); } });
  if (dig && dig.ball) list.push({ y: 1e9, fn: () => ctx.drawImage(SPR.ball[dig.ball.frame], Math.round(dig.ball.x - 8 - cam.x), Math.round(dig.ball.y - 8 - cam.y)) });
  list.sort((a, b) => a.y - b.y).forEach((s) => s.fn());
  if (dig && dig.phase === 'open') drawBallBurst(Math.round(mon.tx * TILE + 8 - cam.x), Math.round(mon.ty * TILE + 6 - cam.y), Math.min(1, dig.t / 0.45));
  if (dig && dig.phase === 'appear') { const f = SPR.sparkle[Math.floor(time * 12) % 2]; for (const [ox, oy] of [[-14, -14], [12, -18], [-12, 2]]) ctx.drawImage(f, Math.round(mon.tx * TILE + ox - cam.x), Math.round(mon.ty * TILE + oy - cam.y)); }
  drawParticles();
  drawSurfaceAbove(ctx, cam);
  if (dig) drawFade(ctx, dig.fade);
  if (dig) drawBlack(ctx, dig.black || 0);
  if (dig && dig.phase === 'swim') drawBanner(ctx, banner.text, banner.alpha, banner.slide);
  if (state === 'menu') drawMenu(ctx, menuCursor);
  if (state === 'msg') { if (msgFrom === 'menu') drawMenu(ctx, menuCursor); drawMessage(ctx, message, Math.floor(time * 3) % 2 === 0); }
}

// ---------- loop ----------
let last = performance.now();
let paused = false;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) { update(dt); draw(); input.endFrame(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__dig = {
  state: () => state, player, follower, world, towns: world.towns, banner, A,
  digTo: (id) => { const t = world.towns.find((x) => x.id === id || x.mapsec === id); if (t) beginTrip(t, 'dig'); },
  surfTo: (id) => { const t = world.towns.find((x) => x.id === id || x.mapsec === id); if (!t) return false; const r = world.waterPath(player.tx, player.ty, t.land.x, t.land.y); if (!r) return false; beginTrip(t, 'surf', r); return true; },
  canSurf: (id) => { const t = world.towns.find((x) => x.id === id || x.mapsec === id); return !!(t && world.waterPath(player.tx, player.ty, t.land.x, t.land.y)); },
  phase: () => (dig ? dig.phase : null),
  mapCursor: () => ({ x: mapCursor.x, y: mapCursor.y }),
  dig: () => dig,
  mon: () => mon.key,
  pause: (v = true) => { paused = v; },
  step: (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) { update(dt); draw(); input.endFrame(); } },
  press: (k) => { input.pressed.add(k); input.down.add(k); update(1 / 60); draw(); input.endFrame(); input.down.delete(k); },
  hold: (k, n = 1) => { input.down.add(k); input.pressed.add(k); if (['up', 'down', 'left', 'right'].includes(k)) input.lastDir = k; for (let i = 0; i < n; i++) { update(1 / 60); draw(); input.endFrame(); } input.down.delete(k); },
  setDigger: (name) => { forcedDigger = DIGGERS.includes(name) ? name : null; },
  setSwimmer: (name) => { forcedSwimmer = SWIMMERS.includes(name) ? name : null; },
  // One deterministic frame for the video renderer: optional held/pressed key, returns the frame as a PNG data URL.
  tick: ({ hold, press, dt = 1 / 30 } = {}) => {
    const isDir = (k) => ['up', 'down', 'left', 'right'].includes(k);
    if (press) { input.pressed.add(press); input.down.add(press); if (isDir(press)) input.lastDir = press; }
    if (hold) { input.down.add(hold); if (isDir(hold)) input.lastDir = hold; }
    update(dt); draw(); input.endFrame();
    if (press) input.down.delete(press);
    if (hold) input.down.delete(hold);
    return canvas.toDataURL('image/png');
  },
  teleport: (tx, ty) => { placeActor(player, tx, ty); placeActor(follower, tx, ty + 1); },
};
