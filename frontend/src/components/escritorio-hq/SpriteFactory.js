/**
 * SpriteFactory.js — 32×40 South Park canon procedural pixel sprites.
 *
 * Rules honored here:
 * - No external assets, no PNG/base64 imports.
 * - Runtime canvas generation via document.createElement('canvas') + scene.textures.addCanvas.
 * - Character atlases are 4 horizontal frames: 128×40, each frame 32×40.
 * - Rectangular pixel drawing only. No circular/path APIs, no antialiasing.
 * - South Park cutout silhouette: huge head, tiny chunky coat, obvious hat/hair profile.
 */

// ── Public palette ───────────────────────────────────────────────────────────
export const PALETTE = {
  cartman: {
    coat: '#D9201C', trim: '#F2D13B', hat: '#37A6DF', hat2: '#F2D13B',
    skin: '#F0C29B', cheek: '#E7A982', hair: '#5B2A12', pants: '#6A3A1E', dark: '#151515', shoe: '#101010', mouth: '#5B201D',
  },
  stan: {
    coat: '#7B3D1F', trim: '#D9201C', hat: '#2E64CF', hat2: '#D9201C',
    skin: '#F0C29B', cheek: '#E7A982', hair: '#171717', pants: '#21448E', dark: '#151515', shoe: '#101010', mouth: '#5B201D',
  },
  kyle: {
    coat: '#F07A22', trim: '#1F8A3B', hat: '#39B54A', hat2: '#207A31',
    skin: '#F0C29B', cheek: '#E7A982', hair: '#D46819', pants: '#236D2E', dark: '#151515', shoe: '#101010', mouth: '#5B201D',
  },
  kenny: {
    coat: '#EE7A1A', trim: '#67340F', hat: '#EE7A1A', hat2: '#9B4D12',
    skin: '#C98752', cheek: '#A86434', hair: '#4A260D', pants: '#6B3910', dark: '#14100C', shoe: '#101010', mouth: '#4A160F',
  },
  butters: {
    coat: '#8DD8F7', trim: '#F6E1A3', hat: '#F3CF58', hat2: '#E0AE35',
    skin: '#F0C29B', cheek: '#E7A982', hair: '#F3CF58', pants: '#2E64CF', dark: '#151515', shoe: '#101010', mouth: '#5B201D',
  },
  wendy: {
    coat: '#ED7EBB', trim: '#B43A86', hat: '#6C3A97', hat2: '#D85DA9',
    skin: '#F0C29B', cheek: '#E7A982', hair: '#111111', pants: '#6C3A97', dark: '#151515', shoe: '#101010', mouth: '#5B201D',
  },
  tweek: {
    coat: '#5E9F4C', trim: '#D3E8BC', hat: '#F0C95A', hat2: '#D8A83E',
    skin: '#F0C29B', cheek: '#E7A982', hair: '#F0C95A', pants: '#4A6A38', dark: '#151515', shoe: '#101010', mouth: '#5B201D',
  },
  craig: {
    coat: '#315AA8', trim: '#233D7C', hat: '#315AA8', hat2: '#F1D245',
    skin: '#F0C29B', cheek: '#E7A982', hair: '#171717', pants: '#1F2F52', dark: '#151515', shoe: '#101010', mouth: '#2E1A1A',
  },
  token: {
    coat: '#B32523', trim: '#F2D13B', hat: '#111111', hat2: '#2A2A2A',
    skin: '#7A4A2A', cheek: '#8D5A36', hair: '#090909', pants: '#232323', dark: '#050505', shoe: '#101010', mouth: '#2B120D',
  },
  jimmy: {
    coat: '#D9B442', trim: '#C9952D', hat: '#6B3D20', hat2: '#8A5A31',
    skin: '#F0C29B', cheek: '#E7A982', hair: '#6B3D20', pants: '#315AA8', dark: '#151515', shoe: '#101010', mouth: '#5B201D', metal: '#BFC5C7',
  },
  timmy: {
    coat: '#3C8B46', trim: '#215E2F', hat: '#6B3D20', hat2: '#8A5A31',
    skin: '#F0C29B', cheek: '#E7A982', hair: '#6B3D20', pants: '#253B78', dark: '#151515', shoe: '#101010', mouth: '#5B201D', metal: '#9EA7AA',
  },
  mr_garrison: {
    coat: '#D8C7A4', trim: '#B4252A', hat: '#BDBDBD', hat2: '#8F8F8F',
    skin: '#F0C29B', cheek: '#E7A982', hair: '#BDBDBD', pants: '#50606A', dark: '#151515', shoe: '#101010', mouth: '#5B201D',
  },

  // Compatibility keys used by the existing scene and older callers.
  garrison: null,
  vertex_engineer: null,
  maestro: null,
  forense: {
    coat: '#01696F', trim: '#C9A227', hat: '#02909A', hat2: '#C9A227',
    skin: '#F0C29B', cheek: '#E7A982', hair: '#3B2314', pants: '#014D52', dark: '#151515', shoe: '#101010', mouth: '#5B201D',
  },
  revisor: {
    coat: '#7B2D8E', trim: '#C9A227', hat: '#9C3DB5', hat2: '#C9A227',
    skin: '#F0C29B', cheek: '#E7A982', hair: '#1A1A2E', pants: '#5A1F69', dark: '#151515', shoe: '#101010', mouth: '#5B201D',
  },
};
PALETTE.garrison = PALETTE.mr_garrison;
PALETTE.vertex_engineer = PALETTE.mr_garrison;
PALETTE.maestro = PALETTE.cartman;

const META = {
  cartman: { name: 'Eric Cartman / Maestro', catchphrase: 'Respect mah authoritah — capricho extraordinário!', role: 'Maestro command center' },
  stan: { name: 'Stan Marsh', catchphrase: 'Dude, this audit log is real.', role: 'Forense leader' },
  kyle: { name: 'Kyle Broflovski', catchphrase: 'We validate sources before opinions.', role: 'Evidence reviewer' },
  kenny: { name: 'Kenny McCormick', catchphrase: 'Mmph mmmph facts.', role: 'Silent incident analyst' },
  butters: { name: 'Butters Stotch', catchphrase: 'Oh hamburgers, the pipeline passed.', role: 'Quality helper' },
  wendy: { name: 'Wendy Testaburger', catchphrase: 'Keep the tone informative.', role: 'Editorial lead' },
  tweek: { name: 'Tweek Tweak', catchphrase: 'Too much context! Checking anyway.', role: 'Signal watcher' },
  craig: { name: 'Craig Tucker', catchphrase: 'Deadpan. Deterministic. Done.', role: 'Queue operator' },
  token: { name: 'Token Black', catchphrase: 'Receipts first, summary second.', role: 'Source controller' },
  jimmy: { name: 'Jimmy Valmer', catchphrase: 'Data, d-data, data wins.', role: 'Metrics analyst' },
  timmy: { name: 'Timmy Burch', catchphrase: 'Timmy!', role: 'Infrastructure monitor' },
  mr_garrison: { name: 'Mr. Garrison', catchphrase: 'Bem-vindo, Comandante.', role: 'Vertex engineer' },
};
META.garrison = META.mr_garrison;
META.vertex_engineer = META.mr_garrison;
META.maestro = META.cartman;

export function getCharacterMeta(key = 'cartman') {
  return META[normalizeCharacterKey(key)] || META.cartman;
}

// ── Helpers: canvas, color and rectangular pixel primitives ──────────────────
const FRAME_W = 32;
const FRAME_H = 40;
const FRAMES = 4;
const TILE_SIZE = 16;
const TILES_PER_ROW = 7;
const TOTAL_TILE_FRAMES = 22; // 0-20 public tiles plus one alternate water frame.
const ATLAS_W = TILE_SIZE * TILES_PER_ROW;
const ATLAS_H = TILE_SIZE * Math.ceil(TOTAL_TILE_FRAMES / TILES_PER_ROW);

function normalizeCharacterKey(key = 'cartman') {
  const raw = String(key).toLowerCase().replace(/^sp_/, '');
  if (raw === 'garrison' || raw === 'mr-garrison' || raw === 'mr garrison') return 'mr_garrison';
  if (raw === 'vertex' || raw === 'vertex_engineer') return 'vertex_engineer';
  if (raw === 'maestro') return 'cartman';
  return raw;
}

function makeCanvas(width, height) {
  let canvas;
  if (typeof document !== 'undefined' && document.createElement) {
    canvas = document.createElement('canvas');
  } else if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height);
  } else {
    throw new Error('SpriteFactory needs document.createElement or OffscreenCanvas.');
  }
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function prepareCtx(ctx) {
  ctx.imageSmoothingEnabled = false;
  if ('mozImageSmoothingEnabled' in ctx) ctx.mozImageSmoothingEnabled = false;
  if ('webkitImageSmoothingEnabled' in ctx) ctx.webkitImageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
}

function setColor(ctx, color) {
  ctx.fillStyle = color;
}

function px(ctx, x, y, w, h, color) {
  if (w <= 0 || h <= 0) return;
  setColor(ctx, color);
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function pixelOval(ctx, x, y, w, h, color) {
  // Pixel oval made only from horizontal rectangle bands.
  const half = h / 2;
  for (let row = 0; row < h; row++) {
    const dy = Math.abs(row + 0.5 - half) / half;
    const inset = Math.round((w * 0.28) * dy * dy);
    px(ctx, x + inset, y + row, w - inset * 2, 1, color);
  }
}

function pixelMouth(ctx, x, y, frame, pal, mood = 'normal') {
  const open = frame === 1 || frame === 3;
  if (!open) {
    const w = mood === 'deadpan' ? 8 : mood === 'twitchy' ? 3 : 5;
    const xo = mood === 'twitchy' && frame === 2 ? x + 1 : x;
    px(ctx, xo, y, w, 1, pal.dark);
    return;
  }
  if (frame === 1) {
    pixelOval(ctx, x + 1, y - 1, 5, 4, pal.mouth);
    px(ctx, x + 2, y, 3, 1, '#1A0807');
  } else {
    px(ctx, x, y - 1, 7, 4, pal.mouth);
    px(ctx, x + 1, y, 5, 1, '#1A0807');
  }
}

function eyes(ctx, x, y, frame, pal, opts = {}) {
  const skinLine = opts.skinLine || pal.dark;
  if (frame === 2) {
    px(ctx, x, y + 3, 7, 1, skinLine);
    px(ctx, x + 10, y + 3, 7, 1, skinLine);
    return;
  }
  // Large white double-oval eyes, built from 1px rectangle bands.
  pixelOval(ctx, x, y, 8, 8, '#FFFFFF');
  pixelOval(ctx, x + 9, y, 8, 8, '#FFFFFF');
  px(ctx, x + 4 + (opts.lookLeft ? -1 : 0), y + 4, 2, 2, '#050505');
  px(ctx, x + 11 + (opts.lookLeft ? -1 : 0), y + 4, 2, 2, '#050505');
}

function shoePair(ctx, y, pal, x1 = 7, x2 = 19) {
  px(ctx, x1, y, 7, 2, pal.shoe);
  px(ctx, x2, y, 7, 2, pal.shoe);
}

function chunkyCoat(ctx, y, pal, frame, opts = {}) {
  const bodyX = opts.bodyX ?? 1;
  const bodyW = opts.bodyW ?? 30;
  const bodyY = y + 24;
  const swing = frame === 2 ? 1 : 0;
  // Body is deliberately wider than the head: chunky winter coat silhouette.
  px(ctx, bodyX + 2, bodyY, bodyW - 4, 3, pal.coat);
  px(ctx, bodyX, bodyY + 3, bodyW, 9, pal.coat);
  px(ctx, bodyX + 2, bodyY + 12, bodyW - 4, 2, pal.coat);
  px(ctx, bodyX + Math.floor(bodyW / 2) - 1, bodyY + 1, 2, 13, pal.trim);
  px(ctx, bodyX + 5, bodyY + 4, 4, 2, pal.trim);
  px(ctx, bodyX + bodyW - 9, bodyY + 4, 4, 2, pal.trim);
  // Tiny arms that swing frame 2.
  px(ctx, bodyX - 1, bodyY + 4 + swing, 4, 9, pal.coat);
  px(ctx, bodyX + bodyW - 3, bodyY + 4 - swing, 4, 9, pal.coat);
  px(ctx, bodyX, bodyY + 12 + swing, 3, 2, pal.dark);
  px(ctx, bodyX + bodyW - 2, bodyY + 12 - swing, 3, 2, pal.dark);
}

function legs(ctx, y, pal, opts = {}) {
  if (opts.noLegs) return;
  px(ctx, 9, y + 36, 5, 3, pal.pants);
  px(ctx, 18, y + 36, 5, 3, pal.pants);
  shoePair(ctx, y + 38, pal);
}

function headBase(ctx, y, pal, opts = {}) {
  const x = opts.x ?? 2;
  const w = opts.w ?? 28;
  const h = opts.h ?? 23;
  pixelOval(ctx, x, y + 3, w, h, pal.skin);
  if (opts.cheeks !== false) {
    px(ctx, x + 3, y + 17, 4, 2, pal.cheek);
    px(ctx, x + w - 7, y + 17, 4, 2, pal.cheek);
  }
}

function cartmanHat(ctx, y, pal) {
  px(ctx, 8, y + 0, 16, 2, pal.hat2);      // yellow poof line
  px(ctx, 5, y + 2, 22, 3, pal.hat);       // blue crown
  px(ctx, 3, y + 5, 26, 4, pal.hat);       // broad cap
  px(ctx, 2, y + 8, 28, 3, pal.hat2);      // yellow brim
  px(ctx, 13, y + 10, 6, 2, pal.hair);     // brown tuft peeking out
}

function stanHat(ctx, y, pal) {
  px(ctx, 14, y + 0, 4, 2, pal.hat2);
  px(ctx, 9, y + 1, 14, 2, pal.hat2);
  px(ctx, 5, y + 3, 22, 5, pal.hat);
  px(ctx, 3, y + 8, 26, 3, pal.hat2);
  px(ctx, 12, y + 10, 7, 2, pal.hair);
}

function kyleHat(ctx, y, pal) {
  px(ctx, 7, y + 0, 18, 3, pal.hat);
  px(ctx, 4, y + 2, 24, 5, pal.hat);
  px(ctx, 2, y + 6, 7, 15, pal.hat);       // ushanka flap L
  px(ctx, 23, y + 6, 7, 15, pal.hat);      // ushanka flap R
  px(ctx, 5, y + 8, 22, 4, pal.hat2);
  px(ctx, 4, y + 19, 5, 2, pal.hat2);
  px(ctx, 23, y + 19, 5, 2, pal.hat2);
}

function wendyHairAndHat(ctx, y, pal) {
  px(ctx, 3, y + 7, 26, 18, pal.hair);     // long black hair to shoulders
  px(ctx, 5, y + 2, 20, 4, pal.hat);
  px(ctx, 9, y + 0, 13, 3, pal.hat);
  px(ctx, 3, y + 5, 25, 3, pal.hat2);
  px(ctx, 23, y + 3, 4, 2, pal.hat2);
}

function spikyHair(ctx, y, pal, mode = 'butters') {
  const c = pal.hair;
  if (mode === 'tweek') {
    px(ctx, 4, y + 5, 5, 6, c); px(ctx, 8, y + 1, 5, 9, c); px(ctx, 13, y + 4, 5, 7, c);
    px(ctx, 18, y + 0, 5, 10, c); px(ctx, 23, y + 5, 5, 6, c); px(ctx, 2, y + 10, 28, 4, c);
  } else {
    px(ctx, 6, y + 5, 5, 5, c); px(ctx, 10, y + 2, 5, 7, c); px(ctx, 15, y + 3, 5, 7, c);
    px(ctx, 20, y + 5, 5, 5, c); px(ctx, 5, y + 9, 22, 4, c);
  }
}

function craigHat(ctx, y, pal) {
  px(ctx, 14, y + 0, 4, 3, pal.hat2);
  px(ctx, 6, y + 2, 20, 6, pal.hat);
  px(ctx, 3, y + 7, 26, 4, pal.hat);
  px(ctx, 4, y + 11, 5, 3, pal.hat2);
  px(ctx, 23, y + 11, 5, 3, pal.hat2);
}

function tokenHair(ctx, y, pal) {
  px(ctx, 5, y + 3, 22, 7, pal.hair);
  px(ctx, 3, y + 7, 26, 4, pal.hair);
  px(ctx, 6, y + 10, 5, 3, pal.hair);
  px(ctx, 21, y + 10, 5, 3, pal.hair);
}

function garrisonHair(ctx, y, pal) {
  px(ctx, 5, y + 4, 22, 5, pal.hair);
  px(ctx, 3, y + 7, 6, 9, pal.hair);
  px(ctx, 23, y + 7, 6, 9, pal.hat2);
  px(ctx, 11, y + 6, 10, 2, pal.hat2);
}

function jimmyCrutches(ctx, y, pal, frame) {
  const swing = frame === 2 ? 1 : 0;
  const metal = pal.metal || '#BFC5C7';
  // Small gray L-shape crutches beside the body.
  px(ctx, 2, y + 24 + swing, 2, 13, metal);
  px(ctx, 2, y + 24 + swing, 5, 2, metal);
  px(ctx, 1, y + 36 + swing, 5, 2, metal);
  px(ctx, 28, y + 24 - swing, 2, 13, metal);
  px(ctx, 25, y + 24 - swing, 5, 2, metal);
  px(ctx, 27, y + 36 - swing, 5, 2, metal);
}

function timmyWheelchair(ctx, y, pal) {
  const metal = pal.metal || '#9EA7AA';
  px(ctx, 4, y + 34, 24, 3, metal);
  px(ctx, 2, y + 32, 4, 6, metal);
  px(ctx, 26, y + 32, 4, 6, metal);
  px(ctx, 6, y + 31, 20, 2, pal.dark);
  px(ctx, 1, y + 37, 7, 2, pal.dark);
  px(ctx, 24, y + 37, 7, 2, pal.dark);
}

// ── Character renderers ─────────────────────────────────────────────────────
function drawCartman(ctx, oy, frame, pal) {
  const y = oy + (frame === 1 ? -1 : frame === 3 ? 1 : 0);
  // Cartman is visually the biggest: maximum frame-filling head and coat.
  headBase(ctx, y, pal, { x: 1, w: 30, h: 24 });
  cartmanHat(ctx, y, pal);
  eyes(ctx, 7, y + 12, frame, pal);
  pixelMouth(ctx, 13, y + 21, frame, pal);
  chunkyCoat(ctx, y, pal, frame, { bodyX: 0, bodyW: 32 });
  px(ctx, 1, y + 29, 5, 3, pal.hat2);
  px(ctx, 26, y + 29, 5, 3, pal.hat2);
  legs(ctx, y, pal);
}

function drawStan(ctx, oy, frame, pal) {
  const y = oy + (frame === 1 ? -1 : frame === 3 ? 1 : 0);
  headBase(ctx, y, pal);
  stanHat(ctx, y, pal);
  eyes(ctx, 7, y + 12, frame, pal);
  pixelMouth(ctx, 13, y + 21, frame, pal);
  chunkyCoat(ctx, y, pal, frame);
  legs(ctx, y, pal);
}

function drawKyle(ctx, oy, frame, pal) {
  const y = oy + (frame === 1 ? -1 : frame === 3 ? 1 : 0);
  headBase(ctx, y, pal, { x: 3, w: 26, h: 23, cheeks: false });
  kyleHat(ctx, y, pal);
  eyes(ctx, 7, y + 12, frame, pal);
  pixelMouth(ctx, 13, y + 21, frame, pal);
  chunkyCoat(ctx, y, pal, frame);
  px(ctx, 2, y + 27, 4, 9, pal.hat2);
  px(ctx, 26, y + 27, 4, 9, pal.hat2);
  legs(ctx, y, pal);
}

function drawKenny(ctx, oy, frame, pal) {
  const y = oy + (frame === 1 ? -1 : frame === 3 ? 1 : 0);
  // Hood up: orange outer oval, dark opening, only eyes and mouth visible.
  pixelOval(ctx, 2, y + 2, 28, 26, pal.hat);
  pixelOval(ctx, 6, y + 7, 20, 17, pal.trim);
  pixelOval(ctx, 8, y + 9, 16, 13, pal.dark);
  eyes(ctx, 8, y + 11, frame, pal, { skinLine: '#F0C29B', lookLeft: frame === 1 });
  pixelMouth(ctx, 13, y + 21, frame, pal);
  chunkyCoat(ctx, y, pal, frame);
  px(ctx, 11, y + 27, 2, 8, pal.dark);     // black drawstrings
  px(ctx, 19, y + 27, 2, 8, pal.dark);
  px(ctx, 10, y + 35, 4, 2, pal.dark);
  px(ctx, 18, y + 35, 4, 2, pal.dark);
  legs(ctx, y, pal);
}

function drawButters(ctx, oy, frame, pal) {
  const y = oy + (frame === 1 ? -1 : frame === 3 ? 1 : 0);
  headBase(ctx, y, pal);
  spikyHair(ctx, y, pal, 'butters');
  eyes(ctx, 7, y + 12, frame, pal);
  pixelMouth(ctx, 13, y + 21, frame, pal);
  chunkyCoat(ctx, y, pal, frame);
  legs(ctx, y, pal);
}

function drawWendy(ctx, oy, frame, pal) {
  const y = oy + (frame === 1 ? -1 : frame === 3 ? 1 : 0);
  wendyHairAndHat(ctx, y, pal);
  headBase(ctx, y, pal, { x: 3, w: 26, h: 23 });
  wendyHairAndHat(ctx, y, pal);
  // Restore face center after front hair/beret overlap.
  pixelOval(ctx, 5, y + 10, 22, 14, pal.skin);
  px(ctx, 4, y + 17, 4, 8, pal.hair);
  px(ctx, 24, y + 17, 4, 8, pal.hair);
  eyes(ctx, 7, y + 12, frame, pal);
  pixelMouth(ctx, 13, y + 21, frame, pal);
  chunkyCoat(ctx, y, pal, frame);
  legs(ctx, y, pal);
}

function drawTweek(ctx, oy, frame, pal) {
  const y = oy + (frame === 1 ? -1 : frame === 3 ? 1 : 0);
  headBase(ctx, y, pal);
  spikyHair(ctx, y + (frame === 1 ? -1 : 0), pal, 'tweek');
  eyes(ctx, 7, y + 12, frame, pal, { lookLeft: frame === 1 });
  pixelMouth(ctx, frame === 1 ? 12 : 14, y + 21, frame, pal, 'twitchy');
  chunkyCoat(ctx, y, pal, frame);
  legs(ctx, y, pal);
}

function drawCraig(ctx, oy, frame, pal) {
  const y = oy + (frame === 1 ? -1 : frame === 3 ? 1 : 0);
  headBase(ctx, y, pal, { cheeks: false });
  craigHat(ctx, y, pal);
  eyes(ctx, 7, y + 12, frame, pal);
  pixelMouth(ctx, 12, y + 21, frame === 2 ? 0 : frame, pal, 'deadpan');
  chunkyCoat(ctx, y, pal, frame);
  legs(ctx, y, pal);
}

function drawToken(ctx, oy, frame, pal) {
  const y = oy + (frame === 1 ? -1 : frame === 3 ? 1 : 0);
  headBase(ctx, y, pal, { x: 3, w: 26, h: 23 });
  tokenHair(ctx, y, pal);
  eyes(ctx, 7, y + 12, frame, pal);
  pixelMouth(ctx, 13, y + 21, frame, pal);
  chunkyCoat(ctx, y, pal, frame);
  legs(ctx, y, pal);
}

function drawJimmy(ctx, oy, frame, pal) {
  const y = oy + (frame === 1 ? -1 : frame === 3 ? 1 : 0);
  jimmyCrutches(ctx, y, pal, frame);
  headBase(ctx, y, pal);
  px(ctx, 5, y + 4, 22, 6, pal.hair);
  px(ctx, 6, y + 2, 6, 5, pal.hair);
  px(ctx, 20, y + 3, 5, 5, pal.hair);
  eyes(ctx, 7, y + 12, frame, pal);
  pixelMouth(ctx, 13, y + 21, frame, pal);
  chunkyCoat(ctx, y, pal, frame, { bodyX: 3, bodyW: 26 });
  legs(ctx, y, pal);
}

function drawTimmy(ctx, oy, frame, pal) {
  const y = oy + (frame === 1 ? -1 : frame === 3 ? 1 : 0);
  timmyWheelchair(ctx, y, pal);
  headBase(ctx, y, pal, { x: 4, w: 24, h: 22 });
  px(ctx, 6, y + 3, 20, 7, pal.hair);
  px(ctx, 8, y + 1, 6, 5, pal.hair);
  px(ctx, 18, y + 2, 6, 5, pal.hair);
  eyes(ctx, 8, y + 12, frame, pal);
  pixelMouth(ctx, 13, y + 21, frame, pal);
  chunkyCoat(ctx, y, pal, frame, { bodyX: 4, bodyW: 24 });
  px(ctx, 9, y + 34, 14, 3, pal.pants);
}

function drawGarrison(ctx, oy, frame, pal) {
  const y = oy + (frame === 1 ? -1 : frame === 3 ? 1 : 0);
  headBase(ctx, y, pal, { x: 3, w: 26, h: 23, cheeks: false });
  garrisonHair(ctx, y, pal);
  eyes(ctx, 7, y + 12, frame, pal);
  pixelMouth(ctx, 13, y + 21, frame, pal);
  chunkyCoat(ctx, y, pal, frame);
  px(ctx, 14, y + 25, 4, 10, pal.trim);    // tie
  px(ctx, 13, y + 25, 6, 2, '#FFFFFF');
  legs(ctx, y, pal);
}

function drawFallback(ctx, oy, frame, pal) {
  const y = oy + (frame === 1 ? -1 : frame === 3 ? 1 : 0);
  headBase(ctx, y, pal);
  stanHat(ctx, y, pal);
  eyes(ctx, 7, y + 12, frame, pal);
  pixelMouth(ctx, 13, y + 21, frame, pal);
  chunkyCoat(ctx, y, pal, frame);
  legs(ctx, y, pal);
}

function drawCharacterFrame(ctx, ox, oy, characterKey, frame) {
  ctx.save();
  ctx.translate(ox, oy);
  const k = normalizeCharacterKey(characterKey);
  const pal = PALETTE[k] || PALETTE[characterKey] || PALETTE.forense;
  px(ctx, 3, 38, 26, 2, 'rgba(0,0,0,0.22)');
  switch (k) {
    case 'cartman': drawCartman(ctx, 0, frame, pal); break;
    case 'stan': drawStan(ctx, 0, frame, pal); break;
    case 'kyle': drawKyle(ctx, 0, frame, pal); break;
    case 'kenny': drawKenny(ctx, 0, frame, pal); break;
    case 'butters': drawButters(ctx, 0, frame, pal); break;
    case 'wendy': drawWendy(ctx, 0, frame, pal); break;
    case 'tweek': drawTweek(ctx, 0, frame, pal); break;
    case 'craig': drawCraig(ctx, 0, frame, pal); break;
    case 'token': drawToken(ctx, 0, frame, pal); break;
    case 'jimmy': drawJimmy(ctx, 0, frame, pal); break;
    case 'timmy': drawTimmy(ctx, 0, frame, pal); break;
    case 'mr_garrison':
    case 'vertex_engineer': drawGarrison(ctx, 0, frame, pal); break;
    default: drawFallback(ctx, 0, frame, pal); break;
  }
  ctx.restore();
}

// ── Public sprite creation ──────────────────────────────────────────────────
export function createAgentSprite(scene, key, paletteKey = 'cartman') {
  if (scene.textures.exists(key)) return key;

  const characterKey = normalizeCharacterKey(paletteKey);
  const canvas = makeCanvas(FRAME_W * FRAMES, FRAME_H);
  const ctx = canvas.getContext('2d');
  prepareCtx(ctx);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let frame = 0; frame < FRAMES; frame++) {
    drawCharacterFrame(ctx, frame * FRAME_W, 0, characterKey, frame);
  }

  const texture = scene.textures.addCanvas(key, canvas);
  if (texture && typeof texture.refresh === 'function') texture.refresh();
  if (texture && typeof texture.add === 'function') {
    for (let frame = 0; frame < FRAMES; frame++) {
      texture.add(frame, 0, frame * FRAME_W, 0, FRAME_W, FRAME_H);
    }
  }

  // Register a looping 200ms-per-frame animation for callers that opt in.
  if (scene.anims && !scene.anims.exists(`${key}_talk`)) {
    scene.anims.create({
      key: `${key}_talk`,
      frames: [0, 1, 2, 3].map((frame) => ({ key, frame })),
      frameRate: 5,
      repeat: -1,
    });
  }

  return key;
}

// ── TILE IDs ─────────────────────────────────────────────────────────────────
export const TILE = {
  FLOOR_TEAL: 0,
  FLOOR_DARK: 1,
  WALL_H: 2,
  WALL_V: 3,
  DESK: 4,
  CHAIR: 5,
  MONITOR: 6,
  SOFA: 7,
  COFFEE_MCA: 8,
  WHITEBOARD: 9,
  VERTEX_TOWER: 10,
  DOOR: 11,
  PLANT: 12,
  FLOOR_COPA: 13,
  FLOOR_SOUTHPARK_SNOW: 14,
  FLOOR_WOOD_CLASSROOM: 15,
  STARKS_POND_WATER: 16,
  TREE_PINE: 17,
  SCHOOL_DESK: 18,
  CHALKBOARD: 19,
  SOUTH_PARK_SIGN: 20,
};

const TEAL = '#01696F';
const TEAL_D = '#014D52';
const TEAL_L = '#02909A';
const PURPLE = '#7B2D8E';
const GOLD = '#C9A227';
const GRAY = '#3A3A3A';
const GRAY_L = '#5A5A5A';
const WALL_C = '#1A2A2A';
const WHITE = '#E8E8E8';
const BROWN = '#5C3317';
const GREEN = '#2D6A2D';
const SNOW = '#F7FBFF';

function tilePos(idx) {
  return { ox: (idx % TILES_PER_ROW) * TILE_SIZE, oy: Math.floor(idx / TILES_PER_ROW) * TILE_SIZE };
}

function drawTile(ctx, idx, fn) {
  const { ox, oy } = tilePos(idx);
  fn(ctx, ox, oy);
}

function tileFrame(texture, name, idx) {
  const { ox, oy } = tilePos(idx);
  texture.add(name, 0, ox, oy, TILE_SIZE, TILE_SIZE);
  texture.add(idx, 0, ox, oy, TILE_SIZE, TILE_SIZE);
}

function pixelLetter(ctx, ox, oy, pattern, color) {
  for (let y = 0; y < pattern.length; y++) {
    for (let x = 0; x < pattern[y].length; x++) {
      if (pattern[y][x] === '1') px(ctx, ox + x, oy + y, 1, 1, color);
    }
  }
}

function tinyBemVindo(ctx, ox, oy) {
  // 16×16 cannot hold the full phrase legibly; these block glyphs abbreviate it as BEM V-CMD.
  const chalk = '#DCEFD2';
  pixelLetter(ctx, ox + 2, oy + 3, ['110','101','110'], chalk); // B
  pixelLetter(ctx, ox + 6, oy + 3, ['111','110','111'], chalk); // E
  pixelLetter(ctx, ox + 10, oy + 3, ['101','111','101'], chalk); // M
  pixelLetter(ctx, ox + 3, oy + 9, ['101','101','010'], chalk); // V
  pixelLetter(ctx, ox + 8, oy + 9, ['111','100','111'], chalk); // C
  px(ctx, ox + 12, oy + 9, 2, 1, chalk);
  px(ctx, ox + 12, oy + 11, 2, 1, chalk);
}

// ── Tileset creation ────────────────────────────────────────────────────────
export function createTileSet(scene, key = 'aurora_tiles') {
  if (scene.textures.exists(key)) return key;

  const canvas = makeCanvas(ATLAS_W, ATLAS_H);
  const ctx = canvas.getContext('2d');
  prepareCtx(ctx);
  ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);

  drawTile(ctx, 0, (ctx, ox, oy) => {
    px(ctx, ox, oy, 16, 16, TEAL_D); px(ctx, ox + 1, oy + 1, 14, 14, TEAL);
    px(ctx, ox + 8, oy + 1, 1, 14, TEAL_D); px(ctx, ox + 1, oy + 8, 14, 1, TEAL_D);
  });
  drawTile(ctx, 1, (ctx, ox, oy) => {
    px(ctx, ox, oy, 16, 16, '#0D1E1E'); px(ctx, ox + 1, oy + 1, 14, 14, '#152828');
  });
  drawTile(ctx, 2, (ctx, ox, oy) => {
    px(ctx, ox, oy, 16, 16, WALL_C); px(ctx, ox + 1, oy + 2, 14, 4, '#2A4040'); px(ctx, ox + 1, oy + 7, 14, 4, '#1E3030');
  });
  drawTile(ctx, 3, (ctx, ox, oy) => {
    px(ctx, ox, oy, 16, 16, WALL_C); px(ctx, ox + 2, oy + 1, 4, 14, '#2A4040'); px(ctx, ox + 7, oy + 1, 4, 14, '#1E3030');
  });
  drawTile(ctx, 4, (ctx, ox, oy) => {
    px(ctx, ox, oy + 4, 16, 12, TEAL_D); px(ctx, ox + 1, oy + 5, 14, 10, TEAL); px(ctx, ox + 2, oy + 6, 4, 1, TEAL_L);
    px(ctx, ox + 1, oy + 14, 2, 2, '#013235'); px(ctx, ox + 13, oy + 14, 2, 2, '#013235');
  });
  drawTile(ctx, 5, (ctx, ox, oy) => {
    px(ctx, ox + 4, oy + 2, 8, 6, '#1E1E1E'); px(ctx, ox + 3, oy + 8, 10, 4, GRAY_L);
    px(ctx, ox + 3, oy + 12, 2, 3, GRAY); px(ctx, ox + 11, oy + 12, 2, 3, GRAY); px(ctx, ox + 4, oy + 3, 8, 4, GRAY_L);
  });
  drawTile(ctx, 6, (ctx, ox, oy) => {
    px(ctx, ox + 3, oy + 1, 10, 8, '#0A0A0A'); px(ctx, ox + 4, oy + 2, 8, 6, '#001F2B');
    px(ctx, ox + 5, oy + 3, 3, 1, TEAL_L); px(ctx, ox + 5, oy + 5, 5, 1, TEAL_L); px(ctx, ox + 5, oy + 7, 2, 1, TEAL_L);
    px(ctx, ox + 7, oy + 9, 2, 2, '#0A0A0A'); px(ctx, ox + 5, oy + 11, 6, 1, '#0A0A0A');
  });
  drawTile(ctx, 7, (ctx, ox, oy) => {
    px(ctx, ox + 1, oy + 2, 14, 12, '#3B1A5A'); px(ctx, ox + 2, oy + 3, 12, 10, PURPLE);
    px(ctx, ox + 2, oy + 3, 12, 4, '#5A2880'); px(ctx, ox + 1, oy + 10, 2, 5, '#3B1A5A'); px(ctx, ox + 13, oy + 10, 2, 5, '#3B1A5A');
  });
  drawTile(ctx, 8, (ctx, ox, oy) => {
    px(ctx, ox + 3, oy + 2, 10, 12, '#1A1A1A'); px(ctx, ox + 4, oy + 3, 8, 10, '#2A2A2A'); px(ctx, ox + 5, oy + 4, 6, 4, GOLD);
    px(ctx, ox + 6, oy + 5, 2, 2, '#FF3300'); px(ctx, ox + 9, oy + 5, 2, 2, TEAL_L); px(ctx, ox + 6, oy + 9, 4, 3, '#4A3000'); px(ctx, ox + 7, oy + 10, 2, 1, '#6B4000');
  });
  drawTile(ctx, 9, (ctx, ox, oy) => {
    px(ctx, ox, oy, 16, 16, WALL_C); px(ctx, ox + 1, oy + 1, 14, 12, WHITE); px(ctx, ox + 2, oy + 2, 6, 1, TEAL);
    px(ctx, ox + 2, oy + 4, 8, 1, TEAL); px(ctx, ox + 2, oy + 6, 5, 1, TEAL); px(ctx, ox + 9, oy + 2, 4, 1, '#CC0000'); px(ctx, ox + 1, oy + 13, 14, 2, GRAY);
  });
  drawTile(ctx, 10, (ctx, ox, oy) => {
    px(ctx, ox + 3, oy, 10, 16, '#0A1A2A'); px(ctx, ox + 4, oy + 1, 8, 14, '#1A3040');
    px(ctx, ox + 5, oy + 2, 2, 1, TEAL_L); px(ctx, ox + 9, oy + 2, 2, 1, TEAL_L); px(ctx, ox + 5, oy + 5, 2, 1, GOLD); px(ctx, ox + 9, oy + 5, 2, 1, GOLD);
    px(ctx, ox + 5, oy + 8, 6, 1, TEAL_L); px(ctx, ox + 5, oy + 10, 6, 1, TEAL_L); px(ctx, ox + 5, oy + 12, 6, 1, TEAL_L); px(ctx, ox + 7, oy + 2, 2, 1, '#FF3300');
  });
  drawTile(ctx, 11, (ctx, ox, oy) => {
    px(ctx, ox, oy, 16, 16, TEAL_D); px(ctx, ox + 2, oy + 1, 12, 14, BROWN); px(ctx, ox + 3, oy + 2, 10, 12, '#8B4513'); px(ctx, ox + 11, oy + 7, 2, 2, GOLD);
  });
  drawTile(ctx, 12, (ctx, ox, oy) => {
    px(ctx, ox + 6, oy + 11, 4, 5, BROWN); px(ctx, ox + 7, oy + 10, 2, 2, '#5C3317');
    px(ctx, ox + 4, oy + 4, 8, 7, GREEN); px(ctx, ox + 5, oy + 2, 6, 5, '#3A8A3A'); px(ctx, ox + 6, oy + 1, 4, 3, '#1F5F1F');
  });
  drawTile(ctx, 13, (ctx, ox, oy) => {
    px(ctx, ox, oy, 16, 16, '#2A2A2A'); px(ctx, ox + 1, oy + 1, 14, 14, '#333333'); px(ctx, ox + 8, oy + 1, 1, 14, '#3A3A3A'); px(ctx, ox + 1, oy + 8, 14, 1, '#3A3A3A');
  });
  drawTile(ctx, 14, (ctx, ox, oy) => {
    px(ctx, ox, oy, 16, 16, '#DDEAF2'); px(ctx, ox + 1, oy + 1, 14, 14, SNOW);
    px(ctx, ox + 3, oy + 4, 2, 1, '#BFD4DE'); px(ctx, ox + 11, oy + 2, 1, 1, '#BFD4DE'); px(ctx, ox + 7, oy + 8, 2, 1, '#BFD4DE'); px(ctx, ox + 13, oy + 12, 1, 1, '#BFD4DE');
  });
  drawTile(ctx, 15, (ctx, ox, oy) => {
    px(ctx, ox, oy, 16, 16, '#6B3F1F');
    for (let r = 0; r < 4; r++) { px(ctx, ox, oy + r * 4, 16, 3, r % 2 ? '#A66A2C' : '#B87532'); px(ctx, ox, oy + r * 4 + 3, 16, 1, '#4B2A14'); }
    px(ctx, ox + 5, oy, 1, 16, '#87541F'); px(ctx, ox + 11, oy, 1, 16, '#87541F');
  });
  drawTile(ctx, 16, (ctx, ox, oy) => {
    px(ctx, ox, oy, 16, 16, '#2CB6D3'); px(ctx, ox, oy + 5, 16, 2, '#71D7E8'); px(ctx, ox + 2, oy + 10, 12, 2, '#1598BB'); px(ctx, ox + 5, oy + 2, 7, 1, '#B8F2FF');
  });
  drawTile(ctx, 17, (ctx, ox, oy) => {
    px(ctx, ox, oy, 16, 16, '#DDEAF2'); px(ctx, ox + 7, oy + 10, 3, 6, '#6B3D18');
    px(ctx, ox + 6, oy + 2, 5, 4, '#1D5D2C'); px(ctx, ox + 4, oy + 5, 9, 4, '#246B32'); px(ctx, ox + 2, oy + 8, 13, 5, '#185024'); px(ctx, ox + 5, oy + 10, 7, 2, '#2E7D38');
  });
  drawTile(ctx, 18, (ctx, ox, oy) => {
    px(ctx, ox + 1, oy + 5, 14, 6, '#D88B22'); px(ctx, ox + 2, oy + 4, 12, 2, '#F2A93B'); px(ctx, ox + 3, oy + 11, 2, 5, '#80511B'); px(ctx, ox + 11, oy + 11, 2, 5, '#80511B');
    px(ctx, ox + 4, oy + 7, 8, 1, '#B66F18');
  });
  drawTile(ctx, 19, (ctx, ox, oy) => {
    px(ctx, ox, oy, 16, 16, '#5B3617'); px(ctx, ox + 1, oy + 1, 14, 12, '#245C36'); px(ctx, ox + 1, oy + 13, 14, 2, '#C9A35D'); tinyBemVindo(ctx, ox, oy);
  });
  drawTile(ctx, 20, (ctx, ox, oy) => {
    px(ctx, ox, oy, 16, 16, '#EAF4FB'); px(ctx, ox + 7, oy + 10, 2, 6, '#614020');
    px(ctx, ox + 1, oy + 3, 14, 7, '#F5D241'); px(ctx, ox + 2, oy + 4, 12, 5, '#FFEA65'); px(ctx, ox + 4, oy + 5, 8, 1, '#111111'); px(ctx, ox + 5, oy + 7, 6, 1, '#111111');
  });
  drawTile(ctx, 21, (ctx, ox, oy) => {
    px(ctx, ox, oy, 16, 16, '#2CB6D3'); px(ctx, ox, oy + 3, 16, 2, '#71D7E8'); px(ctx, ox + 2, oy + 11, 12, 2, '#1598BB'); px(ctx, ox + 3, oy + 7, 9, 1, '#B8F2FF');
  });

  const texture = scene.textures.addCanvas(key, canvas);
  if (texture && typeof texture.refresh === 'function') texture.refresh();

  const names = [
    'floor_teal', 'floor_dark', 'wall_h', 'wall_v', 'desk', 'chair', 'monitor', 'sofa', 'coffee', 'whiteboard',
    'vertex_tower', 'door', 'plant', 'floor_copa', 'floor_southpark_snow', 'floor_wood_classroom',
    'starks_pond_water', 'tree_pine', 'school_desk', 'chalkboard', 'south_park_sign', 'starks_pond_water_alt',
  ];
  if (texture && typeof texture.add === 'function') {
    names.forEach((name, idx) => tileFrame(texture, name, idx));
  }

  return key;
}

// ── Speech balloons, still procedural rectangles only ───────────────────────
function drawPixelGlyph(ctx, ox, oy, glyph, color) {
  const glyphs = {
    '.': ['0', '0', '1'],
    '!': ['1', '1', '1'],
    '✓': ['001', '011', '110'],
    'A': ['010', '101', '111', '101'],
    'I': ['111', '010', '010', '111'],
    'E': ['111', '110', '111'],
  };
  const pattern = glyphs[glyph] || glyphs['.'];
  pixelLetter(ctx, ox, oy, pattern, color);
}

export function createBalloons(scene) {
  const balloons = [
    { key: 'balloon_work', bg: '#01696F', glyphs: ['.', '.', '.'], textColor: '#FFFFFF' },
    { key: 'balloon_error', bg: '#CC0000', glyphs: ['!'], textColor: '#FFFFFF' },
    { key: 'balloon_done', bg: '#00AA44', glyphs: ['✓'], textColor: '#FFFFFF' },
    { key: 'balloon_vertex', bg: '#C9A227', glyphs: ['A', 'I'], textColor: '#000000' },
  ];

  for (const b of balloons) {
    if (scene.textures.exists(b.key)) continue;
    const canvas = makeCanvas(16, 12);
    const ctx = canvas.getContext('2d');
    prepareCtx(ctx);
    ctx.clearRect(0, 0, 16, 12);
    px(ctx, 0, 0, 16, 9, b.bg);
    px(ctx, 6, 9, 4, 2, b.bg);
    px(ctx, 7, 11, 2, 1, b.bg);

    if (b.glyphs.length === 3) {
      drawPixelGlyph(ctx, 5, 4, '.', b.textColor);
      drawPixelGlyph(ctx, 8, 4, '.', b.textColor);
      drawPixelGlyph(ctx, 11, 4, '.', b.textColor);
    } else if (b.glyphs.length === 2) {
      drawPixelGlyph(ctx, 4, 3, b.glyphs[0], b.textColor);
      drawPixelGlyph(ctx, 9, 3, b.glyphs[1], b.textColor);
    } else {
      drawPixelGlyph(ctx, 7, 3, b.glyphs[0], b.textColor);
    }

    const texture = scene.textures.addCanvas(b.key, canvas);
    if (texture && typeof texture.refresh === 'function') texture.refresh();
  }
}
