/**
 * SpriteFactory.js — Geração procedural de sprites pixel-art via canvas
 *
 * Zero binários: todos os gráficos são desenhados em runtime usando
 * Phaser.Textures.CanvasTexture + ctx.fillRect. Paleta TransparênciaBR.
 *
 * Frames de animação (atlas de 16×24 px por frame, 4 colunas):
 *   col 0 = idle
 *   col 1 = walk
 *   col 2 = sit
 *   col 3 = work
 */

// ── Paletas ──────────────────────────────────────────────────────────────────
export const PALETTE = {
  forense:  { primary: '#01696F', dark: '#014D52', light: '#02909A', skin: '#F5CBA7', hair: '#3B2314' },
  revisor:  { primary: '#7B2D8E', dark: '#5A1F69', light: '#9C3DB5', skin: '#F5CBA7', hair: '#1A1A2E' },
  maestro:  { primary: '#C9A227', dark: '#9A7A1A', light: '#E8BF40', skin: '#FDDBB4', hair: '#222222' },
  copa:     { primary: '#6B6B6B', dark: '#4A4A4A', light: '#8C8C8C', skin: '#F5CBA7', hair: '#2C2C2C' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function setColor(ctx, hex, alpha = 1) {
  const [r, g, b] = hexToRgb(hex);
  ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
}

// px = pixel fill helper (1 pixel = 1 unit on the canvas; scale handled externally)
function px(ctx, x, y, w, h, color) {
  setColor(ctx, color);
  ctx.fillRect(x, y, w, h);
}

// ── drawHumanoid ──────────────────────────────────────────────────────────────
/**
 * Draws a 16×24 humanoid agent sprite.
 * frame: 0=idle  1=walk  2=sit  3=work
 */
function drawHumanoid(ctx, offsetX, offsetY, pal, frame) {
  const { primary, dark, skin, hair, light } = pal;

  // --- HEAD (cols 6-9, rows 0-3) ---
  px(ctx, offsetX + 5, offsetY + 0, 6, 1, hair);
  px(ctx, offsetX + 4, offsetY + 1, 8, 4, skin);
  px(ctx, offsetX + 5, offsetY + 1, 6, 1, hair);   // hair top
  px(ctx, offsetX + 4, offsetY + 1, 1, 3, skin);   // left ear
  px(ctx, offsetX + 11, offsetY + 1, 1, 3, skin);  // right ear
  // eyes
  px(ctx, offsetX + 6, offsetY + 2, 1, 1, dark);
  px(ctx, offsetX + 9, offsetY + 2, 1, 1, dark);
  // mouth
  px(ctx, offsetX + 7, offsetY + 4, 2, 1, dark);

  // --- BODY ---
  if (frame === 2) { // sit: torso lower
    px(ctx, offsetX + 5, offsetY + 6, 6, 7, primary);
    px(ctx, offsetX + 4, offsetY + 6, 1, 5, dark); // left arm
    px(ctx, offsetX + 11, offsetY + 6, 1, 5, dark); // right arm
    // legs bent
    px(ctx, offsetX + 5, offsetY + 13, 3, 4, dark);
    px(ctx, offsetX + 8, offsetY + 13, 3, 4, dark);
    px(ctx, offsetX + 3, offsetY + 17, 4, 4, dark);
    px(ctx, offsetX + 9, offsetY + 17, 4, 4, dark);
  } else if (frame === 3) { // work: arms forward
    px(ctx, offsetX + 5, offsetY + 6, 6, 7, primary);
    px(ctx, offsetX + 3, offsetY + 7, 2, 4, dark);
    px(ctx, offsetX + 11, offsetY + 7, 2, 4, dark);
    px(ctx, offsetX + 2, offsetY + 11, 4, 1, light); // keyboard hand left
    px(ctx, offsetX + 10, offsetY + 11, 4, 1, light); // keyboard hand right
    // legs standing
    px(ctx, offsetX + 5, offsetY + 13, 3, 7, dark);
    px(ctx, offsetX + 8, offsetY + 13, 3, 7, dark);
    px(ctx, offsetX + 5, offsetY + 20, 3, 2, '#333');
    px(ctx, offsetX + 8, offsetY + 20, 3, 2, '#333');
  } else if (frame === 1) { // walk
    px(ctx, offsetX + 5, offsetY + 6, 6, 7, primary);
    // swinging arms
    px(ctx, offsetX + 3, offsetY + 7, 2, 5, dark);
    px(ctx, offsetX + 11, offsetY + 5, 2, 5, dark);
    // legs stride
    px(ctx, offsetX + 5, offsetY + 13, 3, 5, dark);
    px(ctx, offsetX + 8, offsetY + 13, 3, 5, dark);
    px(ctx, offsetX + 3, offsetY + 18, 4, 4, dark);
    px(ctx, offsetX + 9, offsetY + 16, 4, 4, dark);
    px(ctx, offsetX + 3, offsetY + 22, 4, 2, '#333');
    px(ctx, offsetX + 9, offsetY + 22, 4, 2, '#333');
  } else { // idle (frame 0) — slight bob
    px(ctx, offsetX + 5, offsetY + 6, 6, 7, primary);
    px(ctx, offsetX + 4, offsetY + 7, 1, 5, dark);
    px(ctx, offsetX + 11, offsetY + 7, 1, 5, dark);
    px(ctx, offsetX + 5, offsetY + 13, 3, 7, dark);
    px(ctx, offsetX + 8, offsetY + 13, 3, 7, dark);
    px(ctx, offsetX + 5, offsetY + 20, 3, 2, '#333');
    px(ctx, offsetX + 8, offsetY + 20, 3, 2, '#333');
  }
}

// ── createAgentSprite ─────────────────────────────────────────────────────────
/**
 * Creates a texture atlas for an agent sprite with 4 animation frames.
 *
 * @param {Phaser.Scene} scene
 * @param {string}       key         Texture key (e.g. 'agent_forense')
 * @param {string}       paletteKey  'forense'|'revisor'|'maestro'|'copa'
 * @returns {string}  The texture key (same as `key`)
 */
export function createAgentSprite(scene, key, paletteKey = 'forense') {
  if (scene.textures.exists(key)) return key;

  const pal = PALETTE[paletteKey] || PALETTE.forense;
  const FRAME_W = 16;
  const FRAME_H = 24;
  const FRAMES  = 4;

  const ct = scene.textures.createCanvas(key, FRAME_W * FRAMES, FRAME_H);
  const ctx = ct.context;

  ctx.clearRect(0, 0, FRAME_W * FRAMES, FRAME_H);

  for (let f = 0; f < FRAMES; f++) {
    drawHumanoid(ctx, f * FRAME_W, 0, pal, f);
  }

  ct.refresh();

  // Register frame data
  for (let f = 0; f < FRAMES; f++) {
    ct.add(f, 0, f * FRAME_W, 0, FRAME_W, FRAME_H);
  }

  return key;
}

// ── TILE IDs ──────────────────────────────────────────────────────────────────
export const TILE = {
  FLOOR_TEAL:  0,
  FLOOR_DARK:  1,
  WALL_H:      2,
  WALL_V:      3,
  DESK:        4,
  CHAIR:       5,
  MONITOR:     6,
  SOFA:        7,
  COFFEE_MCA:  8,
  WHITEBOARD:  9,
  VERTEX_TOWER: 10,
  DOOR:        11,
  PLANT:       12,
  FLOOR_COPA:  13,
};

const TILE_SIZE  = 16;
const TILES_PER_ROW = 7; // columns in the atlas (2 rows)
const ATLAS_W = TILE_SIZE * TILES_PER_ROW;
const ATLAS_H = TILE_SIZE * 2; // 14 tiles → 2 rows

// ── drawTiles ─────────────────────────────────────────────────────────────────
function drawTileAtIndex(ctx, idx, color1, color2, color3, drawFn) {
  const col = idx % TILES_PER_ROW;
  const row = Math.floor(idx / TILES_PER_ROW);
  const ox  = col * TILE_SIZE;
  const oy  = row * TILE_SIZE;
  drawFn(ctx, ox, oy, color1, color2, color3);
}

const TEAL    = '#01696F';
const TEAL_D  = '#014D52';
const TEAL_L  = '#02909A';
const PURPLE  = '#7B2D8E';
const GOLD    = '#C9A227';
const GRAY    = '#3A3A3A';
const GRAY_L  = '#5A5A5A';
const WALL_C  = '#1A2A2A';
const WHITE   = '#E8E8E8';
const BROWN   = '#5C3317';
const GREEN   = '#2D6A2D';
const CREAM   = '#F5F0E0';

function tileFns(ctx, ox, oy) {
  return {
    fill(x, y, w, h, c) { setColor(ctx, c); ctx.fillRect(ox + x, oy + y, w, h); },
  };
}

/**
 * Creates the tileset texture atlas.
 * @param {Phaser.Scene} scene
 * @param {string}       key  Texture key
 * @returns {string}
 */
export function createTileSet(scene, key = 'aurora_tiles') {
  if (scene.textures.exists(key)) return key;

  const ct  = scene.textures.createCanvas(key, ATLAS_W, ATLAS_H);
  const ctx = ct.context;
  ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);

  // Helper
  function drawTile(idx, fn) {
    const col = idx % TILES_PER_ROW;
    const row = Math.floor(idx / TILES_PER_ROW);
    const ox  = col * TILE_SIZE;
    const oy  = row * TILE_SIZE;
    fn(ctx, ox, oy);
  }

  // 0 — FLOOR_TEAL (carpet with subtle grid)
  drawTile(0, (ctx, ox, oy) => {
    setColor(ctx, TEAL_D); ctx.fillRect(ox, oy, 16, 16);
    setColor(ctx, TEAL);   ctx.fillRect(ox+1, oy+1, 14, 14);
    setColor(ctx, TEAL_D); ctx.fillRect(ox+8, oy+1, 1, 14);
    setColor(ctx, TEAL_D); ctx.fillRect(ox+1, oy+8, 14, 1);
  });

  // 1 — FLOOR_DARK (corridor / transition)
  drawTile(1, (ctx, ox, oy) => {
    setColor(ctx, '#0D1E1E'); ctx.fillRect(ox, oy, 16, 16);
    setColor(ctx, '#152828'); ctx.fillRect(ox+1, oy+1, 14, 14);
  });

  // 2 — WALL_H (horizontal wall)
  drawTile(2, (ctx, ox, oy) => {
    setColor(ctx, WALL_C); ctx.fillRect(ox, oy, 16, 16);
    setColor(ctx, '#2A4040'); ctx.fillRect(ox+1, oy+2, 14, 4);
    setColor(ctx, '#1E3030'); ctx.fillRect(ox+1, oy+7, 14, 4);
  });

  // 3 — WALL_V (vertical wall)
  drawTile(3, (ctx, ox, oy) => {
    setColor(ctx, WALL_C); ctx.fillRect(ox, oy, 16, 16);
    setColor(ctx, '#2A4040'); ctx.fillRect(ox+2, oy+1, 4, 14);
    setColor(ctx, '#1E3030'); ctx.fillRect(ox+7, oy+1, 4, 14);
  });

  // 3 → already done; 4 — DESK
  drawTile(4, (ctx, ox, oy) => {
    // desk surface teal
    setColor(ctx, TEAL_D);  ctx.fillRect(ox,    oy+4, 16, 12);
    setColor(ctx, TEAL);    ctx.fillRect(ox+1,  oy+5, 14, 10);
    setColor(ctx, TEAL_L);  ctx.fillRect(ox+2,  oy+6,  4,  1); // highlight stripe
    // legs
    setColor(ctx, '#013235'); ctx.fillRect(ox+1, oy+14, 2, 2);
    setColor(ctx, '#013235'); ctx.fillRect(ox+13, oy+14, 2, 2);
  });

  // 5 — CHAIR
  drawTile(5, (ctx, ox, oy) => {
    setColor(ctx, '#1E1E1E'); ctx.fillRect(ox+4, oy+2, 8, 6);  // backrest
    setColor(ctx, GRAY_L);   ctx.fillRect(ox+3, oy+8, 10, 4);  // seat
    setColor(ctx, GRAY);     ctx.fillRect(ox+3, oy+12, 2, 3);  // leg L
    setColor(ctx, GRAY);     ctx.fillRect(ox+11, oy+12, 2, 3); // leg R
    setColor(ctx, GRAY_L);   ctx.fillRect(ox+4, oy+3,  8, 4);  // backrest highlight
  });

  // 6 — MONITOR
  drawTile(6, (ctx, ox, oy) => {
    setColor(ctx, '#0A0A0A'); ctx.fillRect(ox+3, oy+1, 10, 8); // frame
    setColor(ctx, '#001F2B'); ctx.fillRect(ox+4, oy+2,  8, 6); // screen
    // screen glow (teal data)
    setColor(ctx, TEAL_L);   ctx.fillRect(ox+5, oy+3, 3, 1);
    setColor(ctx, TEAL_L);   ctx.fillRect(ox+5, oy+5, 5, 1);
    setColor(ctx, TEAL_L);   ctx.fillRect(ox+5, oy+7, 2, 1);
    setColor(ctx, '#0A0A0A'); ctx.fillRect(ox+7, oy+9, 2, 2);  // stand
    setColor(ctx, '#0A0A0A'); ctx.fillRect(ox+5, oy+11, 6, 1); // base
  });

  // 7 — SOFA
  drawTile(7, (ctx, ox, oy) => {
    setColor(ctx, '#3B1A5A'); ctx.fillRect(ox+1, oy+2, 14, 12); // back
    setColor(ctx, PURPLE);   ctx.fillRect(ox+2, oy+3, 12, 10);
    setColor(ctx, '#5A2880'); ctx.fillRect(ox+2, oy+3, 12,  4);  // top cushion
    setColor(ctx, '#3B1A5A'); ctx.fillRect(ox+1, oy+10, 2, 5);  // arm L
    setColor(ctx, '#3B1A5A'); ctx.fillRect(ox+13, oy+10, 2, 5); // arm R
  });

  // 8 — COFFEE MACHINE
  drawTile(8, (ctx, ox, oy) => {
    setColor(ctx, '#1A1A1A'); ctx.fillRect(ox+3, oy+2, 10, 12); // body
    setColor(ctx, '#2A2A2A'); ctx.fillRect(ox+4, oy+3,  8, 10);
    setColor(ctx, GOLD);     ctx.fillRect(ox+5, oy+4,  6,  4);  // panel
    setColor(ctx, '#FF3300'); ctx.fillRect(ox+6, oy+5,  2,  2); // button (red)
    setColor(ctx, TEAL_L);   ctx.fillRect(ox+9, oy+5,  2,  2); // button (teal)
    setColor(ctx, '#4A3000'); ctx.fillRect(ox+6, oy+9,  4,  3); // cup area
    setColor(ctx, '#6B4000'); ctx.fillRect(ox+7, oy+10, 2,  1); // coffee
  });

  // 9 — WHITEBOARD
  drawTile(9, (ctx, ox, oy) => {
    setColor(ctx, WALL_C);  ctx.fillRect(ox, oy, 16, 16);
    setColor(ctx, WHITE);   ctx.fillRect(ox+1, oy+1, 14, 12); // board surface
    setColor(ctx, TEAL);    ctx.fillRect(ox+2, oy+2, 6, 1);
    setColor(ctx, TEAL);    ctx.fillRect(ox+2, oy+4, 8, 1);
    setColor(ctx, TEAL);    ctx.fillRect(ox+2, oy+6, 5, 1);
    setColor(ctx, '#CC0000'); ctx.fillRect(ox+9, oy+2, 4, 1);
    setColor(ctx, GRAY);    ctx.fillRect(ox+1, oy+13, 14, 2); // tray
  });

  // 10 — VERTEX_TOWER (server rack / AI tower)
  drawTile(10, (ctx, ox, oy) => {
    setColor(ctx, '#0A1A2A'); ctx.fillRect(ox+3, oy+0, 10, 16); // rack
    setColor(ctx, '#1A3040'); ctx.fillRect(ox+4, oy+1,  8, 14);
    // blinking lights
    setColor(ctx, TEAL_L);   ctx.fillRect(ox+5,  oy+2, 2, 1);
    setColor(ctx, TEAL_L);   ctx.fillRect(ox+9,  oy+2, 2, 1);
    setColor(ctx, GOLD);     ctx.fillRect(ox+5,  oy+5, 2, 1);
    setColor(ctx, GOLD);     ctx.fillRect(ox+9,  oy+5, 2, 1);
    setColor(ctx, TEAL_L);   ctx.fillRect(ox+5,  oy+8, 6, 1);
    setColor(ctx, TEAL_L);   ctx.fillRect(ox+5, oy+10, 6, 1);
    setColor(ctx, TEAL_L);   ctx.fillRect(ox+5, oy+12, 6, 1);
    setColor(ctx, '#FF3300'); ctx.fillRect(ox+7,  oy+2, 2, 1);
  });

  // 11 — DOOR
  drawTile(11, (ctx, ox, oy) => {
    setColor(ctx, TEAL_D);  ctx.fillRect(ox, oy, 16, 16);
    setColor(ctx, BROWN);   ctx.fillRect(ox+2, oy+1, 12, 14);
    setColor(ctx, '#8B4513'); ctx.fillRect(ox+3, oy+2, 10, 12);
    setColor(ctx, GOLD);    ctx.fillRect(ox+11, oy+7,  2,  2); // handle
  });

  // 12 — PLANT
  drawTile(12, (ctx, ox, oy) => {
    setColor(ctx, BROWN);   ctx.fillRect(ox+6,  oy+11, 4, 5); // pot
    setColor(ctx, '#5C3317'); ctx.fillRect(ox+7, oy+10, 2, 2); // stem
    setColor(ctx, GREEN);   ctx.fillRect(ox+4,  oy+4,  8, 7); // leaves
    setColor(ctx, '#3A8A3A'); ctx.fillRect(ox+5, oy+2,  6, 5);
    setColor(ctx, '#1F5F1F'); ctx.fillRect(ox+6, oy+1,  4, 3);
  });

  // 13 — FLOOR_COPA (lighter break-room floor)
  drawTile(13, (ctx, ox, oy) => {
    setColor(ctx, '#2A2A2A'); ctx.fillRect(ox, oy, 16, 16);
    setColor(ctx, '#333333'); ctx.fillRect(ox+1, oy+1, 14, 14);
    setColor(ctx, '#3A3A3A'); ctx.fillRect(ox+8, oy+1, 1, 14);
    setColor(ctx, '#3A3A3A'); ctx.fillRect(ox+1, oy+8, 14, 1);
  });

  ct.refresh();

  // Register tiles as named frames
  const names = ['floor_teal','floor_dark','wall_h','wall_v','desk','chair','monitor','sofa','coffee','whiteboard','vertex_tower','door','plant','floor_copa'];
  for (let i = 0; i < names.length; i++) {
    const col = i % TILES_PER_ROW;
    const row = Math.floor(i / TILES_PER_ROW);
    ct.add(names[i], 0, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    ct.add(i,        0, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }

  return key;
}

// ── createBalloonTexture ──────────────────────────────────────────────────────
/**
 * Creates speech-bubble textures for state indicators.
 * Keys: 'balloon_work', 'balloon_error', 'balloon_done', 'balloon_vertex'
 */
export function createBalloons(scene) {
  const balloons = [
    { key: 'balloon_work',   bg: '#01696F', text: '...', textColor: '#FFFFFF' },
    { key: 'balloon_error',  bg: '#CC0000', text: '⚠',  textColor: '#FFFFFF' },
    { key: 'balloon_done',   bg: '#00AA44', text: '✓',  textColor: '#FFFFFF' },
    { key: 'balloon_vertex', bg: '#C9A227', text: 'AI', textColor: '#000000' },
  ];

  for (const b of balloons) {
    if (scene.textures.exists(b.key)) continue;
    const ct  = scene.textures.createCanvas(b.key, 16, 12);
    const ctx = ct.context;
    ctx.clearRect(0, 0, 16, 12);
    setColor(ctx, b.bg);
    // rounded rect
    ctx.fillRect(0, 0, 16, 9);
    // triangle tail
    ctx.fillRect(6, 9, 4, 2);
    ctx.fillRect(7, 11, 2, 1);
    // text
    ctx.fillStyle = b.textColor;
    ctx.font = 'bold 6px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(b.text, 8, 7);
    ct.refresh();
  }
}
