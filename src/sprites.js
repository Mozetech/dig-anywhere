// Frame tables for the real overworld sprite sheets.
//   red.png      9 frames of 16x32: 0 down, 1 up, 2 left, 3/4 down walk, 5/6 up walk, 7/8 left walk
//   pikachu/dugtrio.png  6 frames of 32x32 (follower layout): 0 down, 1 down walk, 2 up, 3 up walk, 4 left, 5 left walk
import { A } from './assets.js';

function frame(img, i, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, i * w, 0, w, h, 0, 0, w, h);
  return c;
}
function flipX(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const x = c.getContext('2d');
  x.translate(src.width, 0); x.scale(-1, 1);
  x.drawImage(src, 0, 0);
  return c;
}

export const SPR = {};
export const DIGGERS = ['diglett', 'dugtrio', 'sandshrew', 'sandslash', 'drilbur', 'excadrill'];
export const SWIMMERS = ['lapras', 'gyarados', 'wailmer', 'dewgong', 'milotic'];
export const FOLLOWER = 'squirtle';
export const SUBMERGE = 6; // rows of a swimming Pokemon hidden under the waterline

// Opaque bounding box of a sprite canvas, used to seat the rider on each mount.
const bboxCache = new Map();
function bboxOf(canvas) {
  if (bboxCache.has(canvas)) return bboxCache.get(canvas);
  const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let x0 = canvas.width, y0 = canvas.height, x1 = -1, y1 = -1;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (d[(y * canvas.width + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const b = { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  bboxCache.set(canvas, b);
  return b;
}

export function initSprites() {
  const red = (i) => frame(A.img.red, i, 16, 32);
  const r = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(red);
  // walk cycle: step, stand, other step, stand
  SPR.player = {
    down: [r[0], r[3], r[0], r[4]],
    up: [r[1], r[5], r[1], r[6]],
    left: [r[2], r[7], r[2], r[8]],
    right: [flipX(r[2]), flipX(r[7]), flipX(r[2]), flipX(r[8])],
  };
  for (const key of ['pikachu', 'squirtle', ...DIGGERS, ...SWIMMERS]) {
    const f = [0, 1, 2, 3, 4, 5].map((i) => frame(A.img[key], i, 32, 32));
    SPR[key] = {
      down: [f[0], f[1], f[0], f[1]],
      up: [f[2], f[3], f[2], f[3]],
      left: [f[4], f[5], f[4], f[5]],
      right: [flipX(f[4]), flipX(f[5]), flipX(f[4]), flipX(f[5])],
    };
  }
  // Throw poses (red_item sheet): ball in hand, then arm raised.
  SPR.throwPose = [frame(A.img.redItem, 6, 16, 32), frame(A.img.redItem, 0, 16, 32)];
  // Seated poses. red_surf.png is the one sheet whose 16x32 sprites sit centred in 32px cells,
  // so they start at x = 32*i + 8. Sprites 6/7/8 are Red's upper body (down/up/left), drawn over a mount.
  const sitFrame = (i) => {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 32;
    c.getContext('2d').drawImage(A.img.redSurf, 32 * i + 8, 0, 16, 32, 0, 0, 16, 32);
    return c;
  };
  SPR.sit = { down: sitFrame(6), up: sitFrame(7), left: sitFrame(8) };
  SPR.sit.right = flipX(SPR.sit.left);
  // Swim rider composites (32x48) per swimmer and direction, two frames.
  SPR.swimRider = {};
  for (const key of SWIMMERS) {
    SPR.swimRider[key] = {};
    for (const dir of ['down', 'up', 'left', 'right']) {
      SPR.swimRider[key][dir] = [0, 1].map((i) => {
        const monImg = SPR[key][dir][i];
        const mb = bboxOf(monImg), rider = SPR.sit[dir], rb = bboxOf(rider);
        const c = document.createElement('canvas');
        c.width = 32; c.height = 48;
        const x = c.getContext('2d');
        // Seat Red partway down the mount's back; his cut-off waist is hidden by the mount itself.
        const seat = dir === 'down' ? 0.55 : dir === 'up' ? 0.6 : 0.62;
        const ry = 16 + mb.y0 + Math.round(mb.h * seat) - (rb.y1 + 1);
        const rx = Math.round((mb.x0 + mb.x1) / 2) - 8 + (dir === 'left' ? 3 : dir === 'right' ? -3 : 0);
        // Half submerged: the mount's lowest rows are under the waterline.
        const drawMount = () => x.drawImage(monImg, 0, 0, 32, 32 - SUBMERGE, 0, 16, 32, 32 - SUBMERGE);
        const drawRider = () => x.drawImage(rider, rx, ry);
        // Swimming toward the camera, the mount's head and body pass in front of him.
        if (dir === 'down') { drawRider(); drawMount(); } else { drawMount(); drawRider(); }
        return c;
      });
    }
  }
  // Pokéball (3 stacked 16x16 frames: closed, opening, open), the open-ball burst, and sparkles.
  const vframe = (img, i) => { const c = document.createElement('canvas'); c.width = 16; c.height = 16; c.getContext('2d').drawImage(img, 0, i * 16, 16, 16, 0, 0, 16, 16); return c; };
  SPR.ball = [0, 1, 2].map((i) => vframe(A.img.ball, i));
  SPR.ballOpen = A.img.ballOpen;
  SPR.sparkle = [0, 1].map((i) => vframe(A.img.sparkle, i));
  // Rider composites (32x48): Red riding on the digger's back, two animation frames each.
  SPR.rider = {};
  for (const key of DIGGERS) {
    SPR.rider[key] = [0, 1].map((i) => {
      const c = document.createElement('canvas');
      c.width = 32; c.height = 48;
      const x = c.getContext('2d');
      x.drawImage(SPR.player.down[0], 8, 0);
      x.drawImage(SPR[key].down[i], 0, 16);
      return c;
    });
  }
}
