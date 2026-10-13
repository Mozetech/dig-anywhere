// Loads the FireRed-derived assets produced by tools/build_assets.py.
export const A = { img: {} };

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('failed to load ' + url));
    img.src = url;
  });
}
async function loadJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(url); return r.json(); }
async function loadBytes(url) { const r = await fetch(url); if (!r.ok) throw new Error(url); return new Uint8Array(await r.arrayBuffer()); }

export async function loadAssets() {
  const [world, collision, behavior, region, font] = await Promise.all([
    loadJSON('assets/world/world.json'), loadBytes('assets/world/collision.bin'), loadBytes('assets/world/behavior.bin'),
    loadJSON('assets/ui/region.json'), loadJSON('assets/ui/font.json'),
  ]);
  Object.assign(A, { world, collision, behavior, region, font });
  const images = {
    red: 'assets/sprites/red.png', redItem: 'assets/sprites/red_item.png', redSurf: 'assets/sprites/red_surf.png',
    ball: 'assets/sprites/ball.png', ballOpen: 'assets/sprites/ball_open.png', sparkle: 'assets/sprites/sparkle.png',
    lapras: 'assets/sprites/lapras.png', gyarados: 'assets/sprites/gyarados.png', wailmer: 'assets/sprites/wailmer.png',
    dewgong: 'assets/sprites/dewgong.png', milotic: 'assets/sprites/milotic.png',
    pikachu: 'assets/sprites/pikachu.png', squirtle: 'assets/sprites/squirtle.png',
    diglett: 'assets/sprites/diglett.png', dugtrio: 'assets/sprites/dugtrio.png', sandshrew: 'assets/sprites/sandshrew.png',
    sandslash: 'assets/sprites/sandslash.png', drilbur: 'assets/sprites/drilbur.png', excadrill: 'assets/sprites/excadrill.png',
    regionmap: 'assets/ui/regionmap.png', cursor: 'assets/ui/cursor.png', playerIcon: 'assets/ui/player_icon.png',
    window: 'assets/ui/window.png', font: 'assets/ui/font.png',
  };
  const entries = await Promise.all(Object.entries(images).map(async ([k, url]) => [k, await loadImage(url)]));
  for (const [k, img] of entries) A.img[k] = img;
  return A;
}

// Lazy map chunk cache. Chunks are 512px squares named "{cx}_{cy}" (below sprites) and "{cx}_{cy}_top" (above).
const chunkCache = new Map();
let available = null;
export function chunkImage(name) {
  if (!available) available = new Set(A.world.chunks);
  if (!available.has(name)) return null;
  let e = chunkCache.get(name);
  if (!e) {
    e = { img: new Image(), ready: false };
    e.img.onload = () => { e.ready = true; };
    e.img.src = `assets/world/chunks/${name}.png`;
    chunkCache.set(name, e);
  }
  return e.ready ? e.img : null;
}
export function chunkExists(name) {
  if (!available) available = new Set(A.world.chunks);
  return available.has(name);
}
