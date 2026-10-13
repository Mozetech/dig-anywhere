// The stitched FireRed Kanto: collision, metatile behaviours, map areas and dig destinations.
import { A } from './assets.js';

export const TILE = 16;
export const MB = {
  TALL_GRASS: 0x02, CAVE: 0x08, MOUNTAIN_TOP: 0x0C, SAND: 0x21,
  JUMP_EAST: 0x38, JUMP_WEST: 0x39, JUMP_NORTH: 0x3A, JUMP_SOUTH: 0x3B,
  WATER: new Set([0x10, 0x11, 0x12, 0x13, 0x15, 0x16, 0x17, 0x19, 0x1A, 0x1B]),
};
// Signposts and the town boards you read from the tile below them.
export const SIGN_BEHAVIORS = new Set([0x84, 0x85, 0x87, 0x88, 0x91, 0x92]);
export const JUMP_DIR = { [MB.JUMP_EAST]: 'right', [MB.JUMP_WEST]: 'left', [MB.JUMP_NORTH]: 'up', [MB.JUMP_SOUTH]: 'down' };

export function buildWorld() {
  const { w: W, h: H, maps, towns } = A.world;
  const collision = A.collision, behavior = A.behavior;
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  let signFronts = null; // tiles you stand on to read a sign, built on first use
  const world = {
    W, H, maps, towns,
    holes: [], // tiles dug open this session
    behaviorAt: (x, y) => (inside(x, y) ? behavior[y * W + x] : 0),
    isBlocked: (x, y) => (!inside(x, y) ? true : collision[y * W + x] === 1),
    mapAt(x, y) {
      for (const m of maps) if (x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h) return m;
      return null;
    },
    areaAt(x, y) {
      const m = world.mapAt(Math.floor(x), Math.floor(y));
      return m ? m.name : null;
    },
    townAt(x, y) {
      const m = world.mapAt(x, y);
      return m ? towns.find((t) => t.id === m.id) || null : null;
    },
    // Which region-map cell the player is standing in.
    regionCell(x, y) {
      const m = world.mapAt(x, y);
      if (!m) return null;
      const s = A.region.sections[m.mapsec];
      if (!s) return null;
      return {
        x: s.x + Math.min(s.w - 1, Math.floor(((x - m.x) / m.w) * s.w)),
        y: s.y + Math.min(s.h - 1, Math.floor(((y - m.y) / m.h) * s.h)),
      };
    },
    townByMapsec: (mapsec) => towns.find((t) => t.mapsec === mapsec) || null,
    isWater: (x, y) => MB.WATER.has(world.behaviorAt(x, y)),
    signFrontAt(x, y) {
      if (!signFronts) {
        signFronts = new Set();
        for (let yy = 0; yy < H - 1; yy++) {
          for (let xx = 0; xx < W; xx++) {
            if (!SIGN_BEHAVIORS.has(behavior[yy * W + xx])) continue;
            if (!world.isBlocked(xx, yy + 1) && !world.isWater(xx, yy + 1)) signFronts.add((yy + 1) * W + xx);
          }
        }
      }
      return signFronts.has(y * W + x);
    },
    // Water tiles that touch walkable land near a point, closest first.
    shoreWater(tx, ty, R = 40, limit = 8) {
      const out = [];
      for (let y = ty - R; y <= ty + R; y++) for (let x = tx - R; x <= tx + R; x++) {
        if (!world.isWater(x, y)) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !world.isBlocked(x + dx, y + dy) && !world.isWater(x + dx, y + dy))) out.push({ x, y, d: Math.abs(x - tx) + Math.abs(y - ty) });
      }
      out.sort((a, b) => a.d - b.d);
      return out.slice(0, limit);
    },
    // Walkable tile beside a water tile, closest to a target.
    shoreBeside(tile, target) {
      let best = null, bd = Infinity;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = tile.x + dx, y = tile.y + dy;
        if (world.isBlocked(x, y) || world.isWater(x, y)) continue;
        const d = Math.abs(x - target.x) + Math.abs(y - target.y) - (world.signFrontAt(x, y) ? 100 : 0);
        if (d < bd) { bd = d; best = { x, y }; }
      }
      return best;
    },
    // Route across one connected body of water from a shore near A to a shore near B, or null.
    // Shores inside the town's own map are preferred at both ends, and the search costs more for
    // tiles next to rocks or land, so the ride keeps to open water instead of scraping the edges.
    waterPath(ax, ay, bx, by) {
      const key = (x, y) => y * W + x;
      const R = 40;
      const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const inMap = (m, x, y) => !!m && x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h;
      const isShoreTile = (x, y) => N4.some(([dx, dy]) => !world.isBlocked(x + dx, y + dy) && !world.isWater(x + dx, y + dy));
      const tileCost = (x, y) => (N4.some(([dx, dy]) => !world.isWater(x + dx, y + dy)) ? 4 : 1);
      const fromMap = world.mapAt(ax, ay), toMap = world.mapAt(bx, by);
      const starts = world.shoreWater(ax, ay, R, 12).sort((p, q) => (inMap(fromMap, p.x, p.y) ? 0 : 1) - (inMap(fromMap, q.x, q.y) ? 0 : 1) || p.d - q.d);
      for (const A of starts) {
        // Dijkstra with small integer costs: bucket queue.
        const dist = new Map([[key(A.x, A.y), 0]]);
        const prev = new Map([[key(A.x, A.y), -1]]);
        const buckets = [[A]];
        let best = null, bd = Infinity, visited = 0;
        for (let c0 = 0; c0 < buckets.length && visited < 150000; c0++) {
          const bucket = buckets[c0];
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i++) {
            const c = bucket[i];
            const ck = key(c.x, c.y);
            if (dist.get(ck) !== c0) continue; // stale entry
            visited++;
            if (Math.abs(c.x - bx) <= R && Math.abs(c.y - by) <= R && isShoreTile(c.x, c.y)) {
              // Landing in front of a signpost reads as arriving somewhere, so it is worth a short detour.
              const atSign = N4.some(([dx, dy]) => world.signFrontAt(c.x + dx, c.y + dy));
              const d = Math.abs(c.x - bx) + Math.abs(c.y - by) + (inMap(toMap, c.x, c.y) ? 0 : 1000) - (atSign ? 14 : 0);
              if (d < bd) { bd = d; best = c; }
            }
            for (const [dx, dy] of N4) {
              const x = c.x + dx, y = c.y + dy;
              if (!world.isWater(x, y)) continue;
              const nk = key(x, y), nd = c0 + tileCost(x, y);
              if (dist.has(nk) && dist.get(nk) <= nd) continue;
              dist.set(nk, nd); prev.set(nk, ck);
              (buckets[nd] || (buckets[nd] = [])).push({ x, y });
            }
          }
        }
        if (!best) continue;
        const path = [];
        let k = key(best.x, best.y);
        while (k !== -1) { path.push({ x: k % W, y: Math.floor(k / W) }); k = prev.get(k); }
        path.reverse();
        // keep only corner tiles so the swim reads as straight legs
        const pts = [path[0]];
        for (let i = 1; i < path.length - 1; i++) {
          const a = path[i - 1], b = path[i], c = path[i + 1];
          if ((b.x - a.x) !== (c.x - b.x) || (b.y - a.y) !== (c.y - b.y)) pts.push(b);
        }
        if (path.length > 1) pts.push(path[path.length - 1]);
        return { start: A, end: best, path, points: pts };
      }
      return null;
    },
    // Underground soil kind derived from what is on the surface.
    soilKind(x, y) {
      const b = world.behaviorAt(x, y);
      if (MB.WATER.has(b)) return 'wet';
      if (b === MB.TALL_GRASS) return 'root';
      if (b === MB.SAND) return 'sandy';
      if (b === MB.CAVE || b === MB.MOUNTAIN_TOP) return 'stone';
      return 'soil';
    },
  };
  return world;
}

export function hash(x, y, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
