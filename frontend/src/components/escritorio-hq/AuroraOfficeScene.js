/**
 * AuroraOfficeScene.js — South Park Elementary / Maestro HQ cinematic scene.
 *
 * Contract:
 *   - ES module default export class AuroraOfficeScene extends Phaser.Scene.
 *   - Total world: 40×28 tiles, each 16px base, layer scaled 2× → 1280×896.
 *   - Four readable zones: Maestro office, Vertex AI lab, Stark's Pond, Bus Stop.
 *   - React/Firestore integration via scene.data + public methods:
 *       applyEvent(doc), updateMetrics(metrics), setKillSwitch(active)
 *
 * This file intentionally owns only scene composition and behavior. SpriteFactory.js
 * is left untouched and supplies procedural South Park sprites, tiles, and balloons.
 */
import Phaser from 'phaser';
import {
  createAgentSprite,
  createTileSet,
  createBalloons,
  getCharacterMeta,
  TILE,
} from './SpriteFactory.js';
// ─────────────────────────────────────────────────────────────────────────────
// World constants
// ─────────────────────────────────────────────────────────────────────────────
const MAP_COLS = 40;
const MAP_ROWS = 28;
const TILE_BASE = 16;
const WORLD_SCALE = 2;
const TILE_PX = TILE_BASE * WORLD_SCALE;
const WORLD_W = MAP_COLS * TILE_PX;
const WORLD_H = MAP_ROWS * TILE_PX;
const DEFAULT_METRICS = Object.freeze({
  findingsCount: 0,
  findingsTotal: 55,
  phase: 'standby',
  activeAgents: 0,
  totalAgents: 23,
  eta: '—',
});
const ZONES = Object.freeze({
  office: { id: 'office', name: "MAESTRO'S OFFICE", x: 0, y: 0, w: 20, h: 14, color: 0xf6d04d },
  vertex: { id: 'vertex', name: 'VERTEX AI LAB', x: 20, y: 0, w: 20, h: 14, color: 0x29e6d0 },
  pond: { id: 'pond', name: "STARK'S POND", x: 0, y: 14, w: 20, h: 14, color: 0x8dd7f7 },
  bus: { id: 'bus', name: 'BUS STOP', x: 20, y: 14, w: 20, h: 14, color: 0xf6d04d },
});
// Tile aliases include future SpriteFactory tile IDs 14-20. Fallbacks keep the
// file readable while Gates replaces SpriteFactory in parallel.
const T = Object.freeze({
  FLOOR_TEAL: TILE?.FLOOR_TEAL ?? 0,
  FLOOR_DARK: TILE?.FLOOR_DARK ?? 1,
  WALL_H: TILE?.WALL_H ?? 2,
  WALL_V: TILE?.WALL_V ?? 3,
  DESK: TILE?.DESK ?? 4,
  CHAIR: TILE?.CHAIR ?? 5,
  MONITOR: TILE?.MONITOR ?? 6,
  SOFA: TILE?.SOFA ?? 7,
  COFFEE: TILE?.COFFEE_MCA ?? TILE?.COFFEE ?? 8,
  WHITEBOARD: TILE?.WHITEBOARD ?? 9,
  VERTEX_TOWER: TILE?.VERTEX_TOWER ?? 10,
  DOOR: TILE?.DOOR ?? 11,
  PLANT: TILE?.PLANT ?? 12,
  FLOOR_COPA: TILE?.FLOOR_COPA ?? 13,
  SNOW: TILE?.SNOW ?? TILE?.FLOOR_SOUTHPARK_SNOW ?? 14,
  CLASSROOM_WOOD: TILE?.CLASSROOM_WOOD ?? TILE?.FLOOR_WOOD_CLASSROOM ?? 15,
  POND: TILE?.POND ?? TILE?.STARKS_POND_WATER ?? 16,
  PINE: TILE?.PINE ?? TILE?.TREE_PINE ?? 17,
  SCHOOL_DESK: TILE?.SCHOOL_DESK ?? 18,
  CHALKBOARD: TILE?.CHALKBOARD ?? 19,
  SP_SIGN: TILE?.SP_SIGN ?? TILE?.SOUTH_PARK_SIGN ?? 20,
});
const CHARACTER_KEYS = [
  'cartman', 'stan', 'kyle', 'kenny', 'garrison', 'wendy', 'butters',
  'tweek', 'craig', 'token', 'jimmy', 'timmy',
];
const AGENT_BLUEPRINTS = Object.freeze([
  {
    id: 'cartman', key: 'cartman', palette: 'cartman', zone: 'office',
    tx: 10.0, ty: 5.6, scale: 1.5, depthBoost: 5,
    role: 'Maestro Supremo',
    catchphrase: 'Comandante, respect mah authoritah!',
  },
  { id: 'stan', key: 'stan', palette: 'stan', zone: 'office', tx: 7.0, ty: 9.8, role: 'Aluno Forense', catchphrase: 'Dude... confere a evidência.' },
  { id: 'kyle', key: 'kyle', palette: 'kyle', zone: 'office', tx: 10.0, ty: 9.8, role: 'Aluno Revisor', catchphrase: 'Isso precisa de fonte primária.' },
  { id: 'kenny', key: 'kenny', palette: 'kenny', zone: 'office', tx: 13.0, ty: 9.8, role: 'Aluno Auditor', catchphrase: 'Mmph mmph audit log.' },
  { id: 'garrison', key: 'garrison', palette: 'garrison', zone: 'vertex', tx: 28.8, ty: 6.7, role: 'Professor Vertex AI', catchphrase: 'Okay, class, prompt com contexto!' },
  { id: 'wendy', key: 'wendy', palette: 'wendy', zone: 'pond', tx: 8.0, ty: 20.0, role: 'Patinadora de Qualidade', catchphrase: 'A tese precisa ser justa.' },
  { id: 'butters', key: 'butters', palette: 'butters', zone: 'pond', tx: 11.3, ty: 20.3, role: 'Patinador Otimista', catchphrase: 'Oh hamburgers, mais um finding!' },
  { id: 'tweek', key: 'tweek', palette: 'tweek', zone: 'bus', tx: 25.0, ty: 21.0, role: 'Alerta Telegram', catchphrase: 'Ahh! Mensagem sem confirmação!' },
  { id: 'craig', key: 'craig', palette: 'craig', zone: 'bus', tx: 27.4, ty: 21.2, role: 'Cético Operacional', catchphrase: 'Está no log? Então ok.' },
  { id: 'token', key: 'token', palette: 'token', zone: 'bus', tx: 29.8, ty: 20.8, role: 'FinOps Watcher', catchphrase: 'Hardcap não é sugestão.' },
  { id: 'jimmy', key: 'jimmy', palette: 'jimmy', zone: 'bus', tx: 32.2, ty: 21.4, role: 'Narrador de Status', catchphrase: 'W-wow, progresso tabular!' },
  { id: 'timmy', key: 'timmy', palette: 'timmy', zone: 'bus', tx: 34.4, ty: 21.1, role: 'Sinalizador', catchphrase: 'Timmy!' },
]);
// ─────────────────────────────────────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────────────────────────────────────
const clamp = Phaser.Math.Clamp;
const between = Phaser.Math.Between;
const floatBetween = Phaser.Math.FloatBetween;
function tileToWorld(tx, ty) {
  return { x: tx * TILE_PX + TILE_PX / 2, y: ty * TILE_PX + TILE_PX / 2 };
}
function topLeftOfTile(tx, ty) {
  return { x: tx * TILE_PX, y: ty * TILE_PX };
}
function normalizeEventDoc(doc = {}) {
  if (!doc) return { event: 'unknown' };
  if (doc.data && typeof doc.data === 'function') return { id: doc.id, ...doc.data() };
  return doc;
}
function safeMeta(key, fallbackRole, fallbackCatchphrase) {
  try {
    const meta = typeof getCharacterMeta === 'function' ? getCharacterMeta(key) : null;
    return {
      name: meta?.name || key[0].toUpperCase() + key.slice(1),
      role: meta?.role || fallbackRole || 'Agente Maestro',
      catchphrase: meta?.catchphrase || fallbackCatchphrase || 'Pronto, Comandante.',
    };
  } catch (_err) {
    return {
      name: key[0].toUpperCase() + key.slice(1),
      role: fallbackRole || 'Agente Maestro',
      catchphrase: fallbackCatchphrase || 'Pronto, Comandante.',
    };
  }
}
function eventAgentHint(evt) {
  return evt.agent || evt.agentId || evt.character || evt.owner || evt.assignee || null;
}
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight wandering controller. Phaser tweens do pathing; this state object
// decides targets, pause windows, hover facing, special freezes, and event moves.
// ─────────────────────────────────────────────────────────────────────────────
class AgentBrain {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.sprite = config.sprite;
    this.balloon = null;
    this.home = { x: config.homeX, y: config.homeY };
    this.idleRadius = config.idleRadius ?? 32;
    this.speed = config.speed ?? 11;
    this.nextThinkAt = 0;
    this.wanderTween = null;
    this.specialTween = null;
    this.isFrozen = false;
    this.hovered = false;
    this.lastFacing = 1;
    this.pondPhase = Math.random() * Math.PI * 2;
    this.stationMode = config.stationMode || 'wander';
  }
  boot(time) {
    this.nextThinkAt = time + between(450, 1800);
  }
  update(time, dt) {
    this.updateDepth();
    this.updateBalloonPosition(time);
    if (this.isFrozen || this.scene.killSwitchActive) return;
    if (this.stationMode === 'skate') {
      this.updateSkating(time);
      return;
    }
    if (!this.wanderTween && !this.specialTween && time >= this.nextThinkAt) {
      this.pickWanderTarget(time);
    }
  }
  updateDepth() {
    this.sprite.setDepth(100 + Math.floor(this.sprite.y) + (this.config.depthBoost || 0));
  }
  pickWanderTarget(time) {
    const radius = this.idleRadius;
    const target = new Phaser.Math.Vector2(
      this.home.x + floatBetween(-radius, radius),
      this.home.y + floatBetween(-radius * 0.55, radius * 0.55),
    );
    const zone = ZONES[this.config.zone];
    if (zone) {
      target.x = clamp(target.x, zone.x * TILE_PX + 24, (zone.x + zone.w) * TILE_PX - 24);
      target.y = clamp(target.y, zone.y * TILE_PX + 32, (zone.y + zone.h) * TILE_PX - 18);
    }
    this.walkTo(target.x, target.y, () => {
      this.nextThinkAt = time + between(3000, 5000);
    });
  }
  walkTo(x, y, onComplete) {
    this.stopWander();
    const dist = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, x, y);
    if (dist < 3) {
      onComplete?.();
      return;
    }
    this.faceX(x);
    this.wanderTween = this.scene.tweens.add({
      targets: this.sprite,
      x,
      y,
      duration: clamp((dist / this.speed) * 1000, 450, 2800),
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.wanderTween = null;
        onComplete?.();
      },
    });
  }
  stopWander() {
    if (this.wanderTween) {
      this.wanderTween.stop();
      this.wanderTween = null;
    }
  }
  updateSkating(time) {
    if (this.specialTween || this.hovered) return;
    const angle = time * 0.00042 + this.pondPhase;
    const rx = this.config.skateRx || 44;
    const ry = this.config.skateRy || 20;
    const x = this.home.x + Math.cos(angle) * rx;
    const y = this.home.y + Math.sin(angle) * ry;
    this.faceX(x);
    this.sprite.setPosition(x, y);
    this.sprite.rotation = Math.sin(angle * 2) * 0.035;
  }
  faceX(x) {
    const next = x >= this.sprite.x ? 1 : -1;
    if (next !== this.lastFacing) {
      this.lastFacing = next;
      this.sprite.setFlipX(next < 0);
    }
  }

  facePoint(x, y) {
    this.faceX(x);
    const tilt = clamp((y - this.sprite.y) / 800, -0.03, 0.03);
    this.sprite.rotation = tilt;
  }

  setFrozen(active) {
    this.isFrozen = active;
    if (active) {
      this.stopWander();
      this.sprite.anims?.pause();
    } else {
      this.sprite.anims?.resume();
      this.nextThinkAt = this.scene.time.now + between(700, 1600);
    }
  }

  showBalloon(key, duration = 2200) {
    if (!this.scene.textures.exists(key)) return;
    if (this.balloon) this.balloon.destroy();
    this.balloon = this.scene.add.image(this.sprite.x, this.sprite.y - 36, key)
      .setScale(2)
      .setDepth(9000)
      .setAlpha(0);
    this.scene.tweens.add({ targets: this.balloon, alpha: 1, y: this.balloon.y - 6, duration: 180, ease: 'Back.Out' });
    this.scene.time.delayedCall(duration, () => {
      if (!this.balloon) return;
      const old = this.balloon;
      this.balloon = null;
      this.scene.tweens.add({ targets: old, alpha: 0, y: old.y - 8, duration: 180, onComplete: () => old.destroy() });
    });
  }

  updateBalloonPosition(time) {
    if (!this.balloon) return;
    this.balloon.x = this.sprite.x;
    this.balloon.y = this.sprite.y - (this.config.scale > 1.2 ? 62 : 42) + Math.sin(time * 0.006) * 2;
  }

  jumpWithBalloon() {
    this.showBalloon('balloon_done', 2200);
    this.scene.playBlip(660, 0.08, 'triangle');
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.sprite.y - 24,
      duration: 180,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  shakeAndShout() {
    this.stopWander();
    this.showBalloon('balloon_error', 2800);
    this.scene.playBlip(150, 0.18, 'sawtooth');
    const originalFrame = this.sprite.frame?.name ?? 0;
    this.sprite.setFrame(3);
    this.scene.tweens.add({
      targets: this.sprite,
      x: { from: this.sprite.x - 4, to: this.sprite.x + 4 },
      duration: 70,
      yoyo: true,
      repeat: 10,
      ease: 'Stepped',
      onComplete: () => {
        this.sprite.setFrame(originalFrame);
        this.sprite.x = this.home.x;
      },
    });
    this.scene.time.delayedCall(1000, () => {
      if (this.sprite?.active) this.sprite.play(`walk_${this.config.key}`, true);
    });
  }

  walkToChalkboardAndBack() {
    const board = tileToWorld(9.6, 2.2);
    const start = { x: this.home.x, y: this.home.y };
    this.stopWander();
    this.specialTween = this.scene.tweens.timeline({
      targets: this.sprite,
      tweens: [
        { x: board.x, y: board.y + 36, duration: 1250, ease: 'Sine.easeInOut', onStart: () => this.faceX(board.x) },
        { y: board.y + 42, duration: 260, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' },
        { x: start.x, y: start.y, duration: 1250, ease: 'Sine.easeInOut', onStart: () => this.faceX(start.x) },
      ],
      onComplete: () => {
        this.specialTween = null;
        this.nextThinkAt = this.scene.time.now + 3000;
      },
    });
  }

  turnToDesk() {
    this.facePoint(this.home.x, this.home.y + 100);
    this.showBalloon('balloon_work', 1600);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene
// ─────────────────────────────────────────────────────────────────────────────

export default class AuroraOfficeScene extends Phaser.Scene {
  constructor() {
    super({ key: 'AuroraOfficeScene' });
    this.metrics = { ...DEFAULT_METRICS };
    this.agents = new Map();
    this.agentGroup = null;
    this.decorGroup = null;
    this.fxGroup = null;
    this.tileLayer = null;
    this.keys = null;
    this.drag = { active: false, x: 0, y: 0, scrollX: 0, scrollY: 0 };
    this.hoveredAgentId = null;
    this.hoverStartedAt = 0;
    this.cameraInterest = null;
    this.killSwitchActive = false;
    this.hud = null;
    this.finopsBar = null;
    this.tooltip = null;
    this.dialog = null;
    this.audio = { ctx: null, master: null, timer: null, muted: true };
  }

  preload() {
    // All art is procedural: SpriteFactory creates sprites, tiles, and balloons.
  }

  create() {
    this.metrics = this._readInitialMetrics();
    this._createProceduralTextures();
    this._buildTilemap();
    this._createWorldGroups();
    this._addZoneFrames();
    this._addOfficeZone();
    this._addVertexZone();
    this._addPondZone();
    this._addBusStopZone();
    this._spawnAgents();
    this._createHud();
    this._setupCamera();
    this._setupInput();
    this._setupMetricsHooks();
    this._bootBrains();
    this._cinematicIntro();
  }

  update(time, delta) {
    this._updateCameraFromInput(delta);
    this._updateHoverCamera(time);
    this._updateAgents(time, delta);
    this._updateWorldCulling();
    this._animateEnvironment(time);
  }

  // ── Public integration API ─────────────────────────────────────────────────

  applyEvent(doc) {
    const evt = normalizeEventDoc(doc);
    const eventName = evt.event || evt.type || evt.name || 'unknown';
    if (this.killSwitchActive && eventName !== 'kill_switch.off') return;

    switch (eventName) {
      case 'vertex.invoke':
        this._agent('garrison')?.showBalloon('balloon_vertex', 2600);
        this._pulseVertexTower();
        break;
      case 'task.complete':
        this._agent('cartman')?.jumpWithBalloon();
        this._emitDustAtAgent('cartman', 10, 0x00aa44);
        break;
      case 'telegram.send.unconfirmed':
        this._agent(eventAgentHint(evt) || 'cartman')?.showBalloon('balloon_error', 3000);
        this._agent('tweek')?.showBalloon('balloon_error', 2600);
        break;
      case 'freio.5.hardcap':
        this._hardcapAlarm();
        break;
      case 'reason.start':
        this._agent('cartman')?.walkToChalkboardAndBack();
        this._writeChalkStatus('REASON LOOP: ON', '#F6D04D');
        break;
      case 'message.received':
        this._agent('cartman')?.turnToDesk();
        break;
      case 'kill_switch.on':
        this.setKillSwitch(true);
        break;
      case 'kill_switch.off':
        this.setKillSwitch(false);
        break;
      default:
        this._emitDustAtAgent('cartman');
        break;
    }
  }

  updateMetrics(metrics = {}) {
    const normalized = {
      ...this.metrics,
      ...metrics,
      findingsTotal: metrics.findingsTotal ?? metrics.totalFindings ?? this.metrics.findingsTotal ?? 55,
      totalAgents: metrics.totalAgents ?? this.metrics.totalAgents ?? 23,
    };
    this.metrics = normalized;
    this.data.set('metrics', normalized);
    this._renderHudMetrics();
  }

  setKillSwitch(active) {
    this.killSwitchActive = !!active;
    for (const brain of this.agents.values()) brain.setFrozen(this.killSwitchActive);
    const cam = this.cameras.main;
    if (this.killSwitchActive) {
      cam.setBackgroundColor('#330000');
      this._showCenterBanner('KILL SWITCH ATIVO — sprites congelados', 0xff3333, 2200);
      this._setRedTint(true);
    } else {
      cam.setBackgroundColor('#061011');
      this._setRedTint(false);
      this._showCenterBanner('KILL SWITCH DESATIVADO', 0x00aa44, 1500);
    }
  }

  // Backward-compatible helpers for older React wrappers.
  setAgentClickCallback(fn) { this.onAgentClick = fn; }
  updateAgentState(agentId, data = {}) {
    const brain = this._agent(agentId);
    if (!brain) return;
    if (data.state === 'error') brain.showBalloon('balloon_error');
    else if (data.state === 'done') brain.showBalloon('balloon_done');
    else if (data.state === 'working' || data.state === 'processing') brain.showBalloon('balloon_work');
  }
  updateWhiteboard(snapshot = {}) {
    if (snapshot?.dossie?.status) this._writeChalkStatus(`Dossiê: ${snapshot.dossie.status}`, '#F6D04D');
  }
  applySnapshot(snapshot = {}) {
    if (snapshot?.hqMetrics) this.updateMetrics(snapshot.hqMetrics);
    if (snapshot?.dossie) this.updateWhiteboard(snapshot);
  }

  // ── Creation: assets and tilemap ───────────────────────────────────────────

  _readInitialMetrics() {
    const liveData = this.data.get('liveData') || {};
    const metrics = this.data.get('metrics') || liveData.metrics || liveData.hqMetrics || liveData;
    return { ...DEFAULT_METRICS, ...metrics };
  }

  _createProceduralTextures() {
    this.tilesKey = createTileSet(this, 'aurora_tiles');
    createBalloons(this);
    for (const key of CHARACTER_KEYS) {
      createAgentSprite(this, `sp_${key}`, key);
      if (!this.anims.exists(`walk_${key}`)) {
        this.anims.create({
          key: `walk_${key}`,
          frames: [0, 1, 2, 3].map((frame) => ({ key: `sp_${key}`, frame })),
          frameRate: 5,
          repeat: -1,
        });
      }
    }
    this._createDustTexture();
    this._createPondRippleTexture();
  }

  _createDustTexture() {
    if (this.textures.exists('dust_puff')) return;
    const g = this.textures.createCanvas('dust_puff', 16, 16);
    const ctx = g.context;
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = 'rgba(240,240,220,0.75)';
    ctx.beginPath(); ctx.arc(5, 10, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(9, 8, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(12, 11, 2.5, 0, Math.PI * 2); ctx.fill();
    g.refresh();
  }

  _createPondRippleTexture() {
    if (this.textures.exists('pond_ripple')) return;
    const ct = this.textures.createCanvas('pond_ripple', 64, 32);
    const ctx = ct.context;
    for (let f = 0; f < 2; f++) {
      const ox = f * 32;
      ctx.clearRect(ox, 0, 32, 32);
      ctx.strokeStyle = f === 0 ? 'rgba(255,255,255,0.42)' : 'rgba(141,215,247,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(ox + 16, 16, f === 0 ? 10 : 14, f === 0 ? 4 : 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.ellipse(ox + 16, 16, f === 0 ? 17 : 8, f === 0 ? 7 : 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ct.refresh();
    ct.add(0, 0, 0, 0, 32, 32);
    ct.add(1, 0, 32, 0, 32, 32);
    if (!this.anims.exists('pond_ripple_anim')) {
      this.anims.create({ key: 'pond_ripple_anim', frames: [{ key: 'pond_ripple', frame: 0 }, { key: 'pond_ripple', frame: 1 }], frameRate: 2, repeat: -1 });
    }
  }

  _buildTilemap() {
    const data = this._buildMapData();
    const map = this.make.tilemap({ data, tileWidth: TILE_BASE, tileHeight: TILE_BASE });
    const tileset = map.addTilesetImage(this.tilesKey, this.tilesKey, TILE_BASE, TILE_BASE, 0, 0);
    this.tileLayer = map.createLayer(0, tileset, 0, 0);
    this.tileLayer.setScale(WORLD_SCALE).setDepth(0);
  }

  _buildMapData() {
    const data = Array.from({ length: MAP_ROWS }, () => Array.from({ length: MAP_COLS }, () => T.SNOW));

    // Zone A — classroom wood.
    for (let y = 0; y < 14; y++) {
      for (let x = 0; x < 20; x++) data[y][x] = T.CLASSROOM_WOOD;
    }

    // Zone B — dark teal lab.
    for (let y = 0; y < 14; y++) {
      for (let x = 20; x < 40; x++) data[y][x] = T.FLOOR_DARK;
    }

    // Zone C and D — snow baseline.
    for (let y = 14; y < 28; y++) {
      for (let x = 0; x < 40; x++) data[y][x] = T.SNOW;
    }

    // Frozen pond oval.
    for (let y = 17; y <= 23; y++) {
      for (let x = 4; x <= 16; x++) {
        const nx = (x - 10) / 6.5;
        const ny = (y - 20) / 3.2;
        if (nx * nx + ny * ny <= 1) data[y][x] = T.POND;
      }
    }

    // Border walls and zone cross boundaries.
    for (let x = 0; x < MAP_COLS; x++) {
      data[0][x] = T.WALL_H;
      data[MAP_ROWS - 1][x] = T.WALL_H;
      data[13][x] = T.WALL_H;
      data[14][x] = T.WALL_H;
    }
    for (let y = 0; y < MAP_ROWS; y++) {
      data[y][0] = T.WALL_V;
      data[y][MAP_COLS - 1] = T.WALL_V;
      data[y][19] = T.WALL_V;
      data[y][20] = T.WALL_V;
    }

    // Openings between zones.
    for (const [x, y] of [[19, 6], [20, 6], [19, 7], [20, 7], [9, 13], [10, 13], [29, 13], [30, 13], [19, 21], [20, 21]]) {
      if (data[y]?.[x] !== undefined) data[y][x] = y < 14 ? T.FLOOR_DARK : T.SNOW;
    }

    // Tile-based decorative landmarks.
    for (let x = 5; x <= 14; x++) data[2][x] = T.CHALKBOARD;
    for (const [x, y] of [[2, 16], [4, 15], [16, 15], [17, 18], [2, 23], [6, 25], [15, 25]]) data[y][x] = T.PINE;
    for (const [x, y] of [[22, 2], [26, 2], [32, 2], [36, 2], [22, 11], [36, 11]]) data[y][x] = T.PLANT;
    data[25][33] = T.SP_SIGN;
    data[2][15] = T.SP_SIGN;

    return data;
  }

  _createWorldGroups() {
    this.decorGroup = this.add.group();
    this.agentGroup = this.add.group();
    this.fxGroup = this.add.group();
  }

  // ── Creation: world composition ────────────────────────────────────────────

  _addZoneFrames() {
    for (const zone of Object.values(ZONES)) {
      const x = zone.x * TILE_PX;
      const y = zone.y * TILE_PX;
      const w = zone.w * TILE_PX;
      const h = zone.h * TILE_PX;
      const stroke = this.add.rectangle(x + 2, y + 2, w - 4, h - 4)
        .setOrigin(0, 0)
        .setStrokeStyle(2, zone.color, 0.35)
        .setFillStyle(0x000000, 0)
        .setDepth(2);
      const label = this.add.text(x + 10, y + 9, zone.name, {
        fontFamily: 'monospace', fontSize: '10px', color: Phaser.Display.Color.IntegerToColor(zone.color).rgba,
        backgroundColor: 'rgba(0,0,0,0.50)', padding: { x: 4, y: 2 },
      }).setDepth(40);
      this.decorGroup.addMultiple([stroke, label]);
    }
  }

  _addOfficeZone() {
    this._addClassroomWallArt();
    this._addTeacherDesk();
    this._addStudentDesks();
    this._addOfficeProps();
  }

  _addClassroomWallArt() {
    // A large custom chalkboard makes the Portuguese welcome readable at distance.
    const boardX = 4.4 * TILE_PX;
    const boardY = 1.25 * TILE_PX;
    const boardW = 11.2 * TILE_PX;
    const boardH = 2.2 * TILE_PX;
    const board = this.add.rectangle(boardX, boardY, boardW, boardH, 0x1f5f3b, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(4, 0x7a4a21, 1)
      .setDepth(18);
    const chalk = this.add.text(boardX + boardW / 2, boardY + 14, 'Bem-vindo\nComandante Baesso', {
      fontFamily: 'monospace', fontSize: '14px', color: '#E8F6E8', fontStyle: 'bold', align: 'center',
      lineSpacing: 4,
    }).setOrigin(0.5, 0).setDepth(19);
    this.chalkStatusText = this.add.text(boardX + boardW - 8, boardY + boardH - 18, '55 FINDINGS · 6 FREIOS', {
      fontFamily: 'monospace', fontSize: '7px', color: '#F6D04D', align: 'right',
    }).setOrigin(1, 0).setDepth(19);
    this.decorGroup.addMultiple([board, chalk, this.chalkStatusText]);

    this._addSouthParkSign(15.8 * TILE_PX, 1.2 * TILE_PX, 'SOUTH PARK', 'ELEMENTARY', 1.05);
  }

  _addTeacherDesk() {
    const x = 8.4 * TILE_PX;
    const y = 5.6 * TILE_PX;
    const shadow = this.add.ellipse(x + 58, y + 34, 150, 34, 0x000000, 0.20).setDepth(42);
    const desk = this.add.rectangle(x, y, 122, 46, 0x7a4a21, 1).setOrigin(0, 0).setDepth(45);
    const top = this.add.rectangle(x + 3, y + 4, 116, 18, 0xa7652a, 1).setOrigin(0, 0).setDepth(46);
    const trim = this.add.rectangle(x + 4, y + 25, 114, 8, 0x5c3317, 1).setOrigin(0, 0).setDepth(46);
    const name = this.add.text(x + 61, y + 8, 'MAESTRO', { fontFamily: 'monospace', fontSize: '9px', color: '#F6D04D', fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(47);
    const mic = this.add.circle(x + 106, y + 14, 5, 0x111111, 1).setDepth(47);
    this.decorGroup.addMultiple([shadow, desk, top, trim, name, mic]);
  }

  _addStudentDesks() {
    const desks = [
      { tx: 5.8, ty: 8.4, label: 'STAN' },
      { tx: 8.8, ty: 8.4, label: 'KYLE' },
      { tx: 11.8, ty: 8.4, label: 'KENNY' },
      { tx: 14.8, ty: 8.4, label: 'BAESSO' },
    ];
    for (const d of desks) {
      const { x, y } = tileToWorld(d.tx, d.ty);
      const desk = this.add.rectangle(x, y, 56, 28, 0x9b5b2a, 1).setDepth(35);
      const lip = this.add.rectangle(x, y - 10, 52, 5, 0xc97b35, 1).setDepth(36);
      const chair = this.add.rectangle(x, y + 21, 34, 12, 0x5c3317, 1).setDepth(30);
      const label = this.add.text(x, y - 3, d.label, { fontFamily: 'monospace', fontSize: '7px', color: '#321500' }).setOrigin(0.5).setDepth(37);
      this.decorGroup.addMultiple([chair, desk, lip, label]);
    }
  }

  _addOfficeProps() {
    this._addTileImage(2, 2, T.PLANT, 2, 15);
    this._addTileImage(17, 11, T.DOOR, 2, 15);
    const flag = this.add.text(2.8 * TILE_PX, 11.7 * TILE_PX, 'NÃO DENUNCIAMOS. MOSTRAMOS.', {
      fontFamily: 'monospace', fontSize: '8px', color: '#F6D04D', backgroundColor: 'rgba(16,24,32,0.78)', padding: { x: 4, y: 2 },
    }).setDepth(30);
    this.decorGroup.add(flag);
  }

  _addVertexZone() {
    const towerPositions = [[25, 5], [29, 5], [33, 5]];
    this.vertexTowers = [];
    for (const [tx, ty] of towerPositions) {
      const glow = this.add.rectangle(tx * TILE_PX + 16, ty * TILE_PX + 34, 44, 82, 0x29e6d0, 0.08).setDepth(18);
      const tower = this._addTileImage(tx, ty, T.VERTEX_TOWER, 3, 30);
      const tower2 = this._addTileImage(tx, ty + 1, T.VERTEX_TOWER, 3, 30);
      this.vertexTowers.push({ glow, tower, tower2 });
    }
    const consoleBase = this.add.rectangle(27.2 * TILE_PX, 9.4 * TILE_PX, 196, 42, 0x062b32, 1).setDepth(25).setStrokeStyle(2, 0x02909a, 1);
    const consoleText = this.add.text(27.2 * TILE_PX, 9.1 * TILE_PX, 'VERTEX AI · PROMPT STACK · SAFETY FILTERS', {
      fontFamily: 'monospace', fontSize: '8px', color: '#29E6D0', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(26);
    const towerLabel = this.add.text(29 * TILE_PX, 3.2 * TILE_PX, 'AI LAB', {
      fontFamily: 'monospace', fontSize: '16px', color: '#C9A227', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(35);
    this.decorGroup.addMultiple([consoleBase, consoleText, towerLabel]);
    this.time.addEvent({
      delay: 3800,
      loop: true,
      callback: () => {
        if (!this.killSwitchActive && Phaser.Math.Between(0, 100) < 42) this._agent('garrison')?.showBalloon('balloon_vertex', 1600);
      },
    });
  }

  _addPondZone() {
    const center = tileToWorld(10, 20);
    const ice = this.add.ellipse(center.x, center.y, 392, 204, 0x9edff0, 0.48).setDepth(10).setStrokeStyle(4, 0xffffff, 0.55);
    const ice2 = this.add.ellipse(center.x - 18, center.y - 6, 284, 126, 0xd8f7ff, 0.28).setDepth(11);
    this.rippleSprites = [];
    for (const [dx, dy] of [[0, 0], [-64, 28], [72, -26], [42, 46]]) {
      const r = this.add.sprite(center.x + dx, center.y + dy, 'pond_ripple', 0).setScale(2).setDepth(12).play('pond_ripple_anim');
      this.rippleSprites.push(r);
    }
    this.decorGroup.addMultiple([ice, ice2, ...this.rippleSprites]);

    for (const [tx, ty] of [[2, 16], [4, 15], [16, 15], [17, 18], [2, 23], [6, 25], [15, 25], [18, 24]]) {
      this._addPine(tx, ty);
    }
    const pondLabel = this.add.text(center.x, 15.15 * TILE_PX, "STARK'S POND — frozen build lane", {
      fontFamily: 'monospace', fontSize: '9px', color: '#061011', backgroundColor: 'rgba(216,247,255,0.72)', padding: { x: 4, y: 2 },
    }).setOrigin(0.5).setDepth(35);
    this.decorGroup.add(pondLabel);
  }

  _addBusStopZone() {
    const baseX = 26.5 * TILE_PX;
    const baseY = 17.5 * TILE_PX;
    const pole1 = this.add.rectangle(baseX - 86, baseY + 60, 8, 106, 0x444444, 1).setDepth(24);
    const pole2 = this.add.rectangle(baseX + 86, baseY + 60, 8, 106, 0x444444, 1).setDepth(24);
    const roof = this.add.rectangle(baseX, baseY, 210, 26, 0x8b1111, 1).setDepth(28).setStrokeStyle(2, 0xffd34e, 1);
    const back = this.add.rectangle(baseX, baseY + 55, 198, 78, 0x1a2a2a, 0.82).setDepth(23).setStrokeStyle(2, 0x284343, 1);
    const bench = this.add.rectangle(baseX, baseY + 88, 160, 16, 0x7a4a21, 1).setDepth(29);
    const sign = this.add.rectangle(baseX - 138, baseY + 22, 74, 42, 0xf6d04d, 1).setDepth(30).setStrokeStyle(3, 0x111111, 1);
    const signText = this.add.text(baseX - 138, baseY + 11, 'SOUTH\nPARK', {
      fontFamily: 'monospace', fontSize: '11px', color: '#111111', fontStyle: 'bold', align: 'center',
    }).setOrigin(0.5).setDepth(31);
    const snowBank = this.add.ellipse(baseX + 2, baseY + 119, 250, 42, 0xffffff, 0.38).setDepth(18);
    this.decorGroup.addMultiple([pole1, pole2, roof, back, bench, sign, signText, snowBank]);
    this._addSouthParkSign(33.2 * TILE_PX, 24.7 * TILE_PX, 'SP', 'BUS STOP', 0.95);
  }

  _addPine(tx, ty) {
    const { x, y } = tileToWorld(tx, ty);
    const trunk = this.add.rectangle(x, y + 22, 10, 24, 0x5c3317, 1).setDepth(22);
    const leaf1 = this.add.triangle(x, y - 20, 0, 42, 28, 42, 14, 0, 0x1f6f36, 1).setDepth(23);
    const leaf2 = this.add.triangle(x, y - 4, 0, 42, 34, 42, 17, 0, 0x2d8a44, 1).setDepth(24);
    const snow = this.add.triangle(x - 2, y - 18, 4, 16, 22, 16, 13, 0, 0xffffff, 0.72).setDepth(25);
    this.decorGroup.addMultiple([trunk, leaf1, leaf2, snow]);
  }

  _addTileImage(tx, ty, frame, scale = 2, depth = 20) {
    const pos = topLeftOfTile(tx, ty);
    const img = this.add.image(pos.x, pos.y, this.tilesKey, frame).setOrigin(0, 0).setScale(scale).setDepth(depth);
    this.decorGroup.add(img);
    return img;
  }

  _addSouthParkSign(x, y, line1, line2, scale = 1) {
    const sign = this.add.container(x, y).setDepth(32).setScale(scale);
    const bg = this.add.rectangle(0, 0, 104, 42, 0xf6d04d, 1).setStrokeStyle(3, 0x111111, 1);
    const t1 = this.add.text(0, -9, line1, { fontFamily: 'monospace', fontSize: '13px', color: '#111', fontStyle: 'bold' }).setOrigin(0.5);
    const t2 = this.add.text(0, 9, line2, { fontFamily: 'monospace', fontSize: '9px', color: '#111', fontStyle: 'bold' }).setOrigin(0.5);
    sign.add([bg, t1, t2]);
    this.decorGroup.add(sign);
    return sign;
  }

  // ── Agents ─────────────────────────────────────────────────────────────────

  _spawnAgents() {
    for (const bp of AGENT_BLUEPRINTS) {
      const pos = tileToWorld(bp.tx, bp.ty);
      const sprite = this.add.sprite(pos.x, pos.y, `sp_${bp.key}`, 0)
        .setOrigin(0.5, 0.78)
        .setScale((bp.scale || 1) * WORLD_SCALE)
        .setInteractive({ useHandCursor: true, pixelPerfect: false })
        .play(`walk_${bp.key}`);
      sprite.name = bp.id;
      sprite.setData('agentId', bp.id);
      this.agentGroup.add(sprite);

      const meta = safeMeta(bp.key, bp.role, bp.catchphrase);
      const brain = new AgentBrain(this, {
        ...bp,
        sprite,
        homeX: pos.x,
        homeY: pos.y,
        idleRadius: bp.id === 'cartman' ? 18 : 32,
        speed: bp.id === 'cartman' ? 8 : 11,
        stationMode: bp.zone === 'pond' ? 'skate' : 'wander',
        skateRx: bp.id === 'wendy' ? 50 : 38,
        skateRy: bp.id === 'wendy' ? 24 : 18,
        meta,
      });
      this.agents.set(bp.id, brain);
      this._wireAgentInteractions(sprite, brain, meta);
    }
  }

  _wireAgentInteractions(sprite, brain, meta) {
    sprite.on('pointerover', () => {
      brain.hovered = true;
      brain.facePoint(this.input.activePointer.worldX, this.input.activePointer.worldY);
      sprite.setTint(0xffffcc);
      this.hoveredAgentId = brain.config.id;
      this.hoverStartedAt = this.time.now;
      this._showAgentTooltip(brain, meta);
    });
    sprite.on('pointermove', (pointer) => {
      brain.facePoint(pointer.worldX, pointer.worldY);
      this._moveTooltip(pointer.worldX, pointer.worldY, brain);
    });
    sprite.on('pointerout', () => {
      brain.hovered = false;
      sprite.clearTint();
      this.hoveredAgentId = null;
      this.hoverStartedAt = 0;
      this.cameraInterest = null;
      this._hideTooltip();
    });
    sprite.on('pointerdown', (_pointer) => {
      this.playBlip(440, 0.06, 'square');
      this.onAgentClick?.(brain.config.id);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aurora:agentClick', { detail: { agentId: brain.config.id } }));
      }
      if (brain.config.id === 'cartman') {
        this._showDialog("Cartman: 'Comandante, comandos via Telegram OU pelo input lá em cima!'", 3700);
      } else {
        this._showFloatingTooltip(`${meta.role}\n“${meta.catchphrase}”`, sprite.x, sprite.y - 62, 3000);
      }
    });
  }

  _bootBrains() {
    for (const brain of this.agents.values()) brain.boot(this.time.now);
  }

  _updateAgents(time, delta) {
    for (const brain of this.agents.values()) brain.update(time, delta);
  }

  _agent(id) {
    return this.agents.get(id) || null;
  }

  // ── HUD, tooltips, dialogs ─────────────────────────────────────────────────

  _createHud() {
    this.hud = this.add.container(12, 10).setDepth(10000).setScrollFactor(0);
    const bg = this.add.rectangle(0, 0, 620, 42, 0x000000, 0.70).setOrigin(0, 0).setStrokeStyle(2, 0xc9a227, 1);
    this.hudTitle = this.add.text(12, 7, "🚸 SOUTH PARK ELEMENTARY — Maestro's Office", {
      fontFamily: 'monospace', fontSize: '12px', color: '#FFFFFF', fontStyle: 'bold',
    });
    this.hudMetrics = this.add.text(12, 24, '', { fontFamily: 'monospace', fontSize: '12px', color: '#FFFFFF' });
    this.finopsBar = this.add.rectangle(12, 38, 596, 3, 0x00aa44, 1).setOrigin(0, 0);
    this.hud.add([bg, this.hudTitle, this.hudMetrics, this.finopsBar]);
    this._renderHudMetrics();
  }

  _renderHudMetrics() {
    if (!this.hudMetrics) return;
    const m = { ...DEFAULT_METRICS, ...this.metrics };
    this.hudMetrics.setText(`Findings: ${m.findingsCount}/${m.findingsTotal || 55} · Fase: ${m.phase || '—'} · Agentes: ${m.activeAgents}/${m.totalAgents || 23} · ETA: ${m.eta || '—'}`);
  }

  _showAgentTooltip(brain, meta) {
    this._hideTooltip();
    const text = `${meta.name} — ${meta.role}\n“${meta.catchphrase}”`;
    this.tooltip = this.add.text(brain.sprite.x, brain.sprite.y - 76, text, {
      fontFamily: 'monospace', fontSize: '9px', color: '#111111', backgroundColor: '#F6D04D',
      padding: { x: 6, y: 4 }, align: 'center', wordWrap: { width: 220 },
    }).setOrigin(0.5, 1).setDepth(10020);
  }

  _moveTooltip(worldX, worldY, brain) {
    if (!this.tooltip) return;
    this.tooltip.setPosition(brain.sprite.x, brain.sprite.y - (brain.config.scale > 1.2 ? 88 : 66));
  }

  _hideTooltip() {
    if (this.tooltip) {
      this.tooltip.destroy();
      this.tooltip = null;
    }
  }

  _showFloatingTooltip(text, x, y, duration = 3000) {
    const tip = this.add.text(x, y, text, {
      fontFamily: 'monospace', fontSize: '10px', color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.78)',
      padding: { x: 8, y: 5 }, align: 'center', wordWrap: { width: 240 },
    }).setOrigin(0.5, 1).setDepth(10010);
    this.tweens.add({ targets: tip, y: y - 10, duration: duration, alpha: 0.96, onComplete: () => tip.destroy() });
    this.time.delayedCall(duration - 260, () => this.tweens.add({ targets: tip, alpha: 0, duration: 220 }));
  }

  _showDialog(text, duration = 3400) {
    if (this.dialog) this.dialog.destroy(true);
    const width = Math.min(620, this.scale.width - 60);
    const x = this.scale.width / 2;
    const y = this.scale.height - 92;
    this.dialog = this.add.container(x, y).setScrollFactor(0).setDepth(10030);
    const box = this.add.rectangle(0, 0, width, 64, 0x101820, 0.92).setStrokeStyle(3, 0xf6d04d, 1);
    const label = this.add.text(0, 0, text, {
      fontFamily: 'monospace', fontSize: '14px', color: '#FFFFFF', align: 'center', wordWrap: { width: width - 28 },
    }).setOrigin(0.5);
    this.dialog.add([box, label]);
    this.dialog.setAlpha(0);
    this.tweens.add({ targets: this.dialog, alpha: 1, y: y - 10, duration: 170, ease: 'Back.Out' });
    this.time.delayedCall(duration, () => {
      if (!this.dialog) return;
      const old = this.dialog;
      this.dialog = null;
      this.tweens.add({ targets: old, alpha: 0, y: old.y + 8, duration: 190, onComplete: () => old.destroy(true) });
    });
  }

  _showCenterBanner(text, color, duration) {
    const banner = this.add.text(this.scale.width / 2, this.scale.height / 2, text, {
      fontFamily: 'monospace', fontSize: '18px', color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.82)',
      padding: { x: 14, y: 8 }, align: 'center', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10040).setTint(color);
    this.tweens.add({ targets: banner, scale: 1.08, duration: 180, yoyo: true, repeat: 1 });
    this.time.delayedCall(duration, () => this.tweens.add({ targets: banner, alpha: 0, duration: 220, onComplete: () => banner.destroy() }));
  }

  // ── Camera and input ───────────────────────────────────────────────────────

  _setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.setZoom(1.5);
    cam.centerOn(10 * TILE_PX, 6.5 * TILE_PX);
    cam.setLerp(0.11, 0.11);
    cam.setBackgroundColor('#061011');
  }

  _setupInput() {
    this.keys = this.input.keyboard.addKeys({
      up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT',
      w: 'W', a: 'A', s: 'S', d: 'D', f: 'F', m: 'M',
    });
    this.input.keyboard.on('keydown-F', () => this._toggleFullscreen());
    this.input.keyboard.on('keydown-M', () => this.toggleBgm());
    this.input.addPointer(2);

    this.input.on('pointerdown', (ptr, objects) => {
      if (objects?.length) return;
      this.drag.active = true;
      this.drag.x = ptr.x;
      this.drag.y = ptr.y;
      this.drag.scrollX = this.cameras.main.scrollX;
      this.drag.scrollY = this.cameras.main.scrollY;
    });
    this.input.on('pointerup', () => { this.drag.active = false; });
    this.input.on('pointerupoutside', () => { this.drag.active = false; });
    this.input.on('pointermove', (ptr) => {
      if (!this.drag.active || this.input.pointer1.isDown && this.input.pointer2.isDown) return;
      const cam = this.cameras.main;
      cam.stopFollow();
      this.cameraInterest = null;
      cam.scrollX = this.drag.scrollX - (ptr.x - this.drag.x) / cam.zoom;
      cam.scrollY = this.drag.scrollY - (ptr.y - this.drag.y) / cam.zoom;
    });
    this.input.on('wheel', (_ptr, _objs, _dx, dy) => {
      const cam = this.cameras.main;
      cam.setZoom(clamp(cam.zoom - dy * 0.001, 0.9, 2.2));
    });
  }

  _updateCameraFromInput(delta) {
    const cam = this.cameras.main;
    const k = this.keys;
    if (!k) return;
    const speed = (delta / 1000) * 280 / cam.zoom;
    const dx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const dy = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    if (dx || dy) {
      cam.stopFollow();
      this.cameraInterest = null;
      cam.scrollX += dx * speed;
      cam.scrollY += dy * speed;
    }
  }

  _updateHoverCamera(time) {
    if (!this.hoveredAgentId) return;
    const brain = this._agent(this.hoveredAgentId);
    if (!brain) return;
    if (!this.cameraInterest && time - this.hoverStartedAt > 1500) {
      this.cameraInterest = brain.sprite;
      this.cameras.main.startFollow(brain.sprite, true, 0.055, 0.055);
    }
  }

  _toggleFullscreen() {
    if (!this.scale) return;
    if (this.scale.isFullscreen) this.scale.stopFullscreen();
    else this.scale.startFullscreen();
  }

  _cinematicIntro() {
    const cam = this.cameras.main;
    cam.fadeIn(800, 0, 0, 0);
    cam.pan(10 * TILE_PX, 6.5 * TILE_PX, 900, 'Sine.easeInOut');
    this._showCenterBanner('Bem-vindo, Comandante Baesso', 0xf6d04d, 1800);
  }

  // ── Event effects ─────────────────────────────────────────────────────────

  _pulseVertexTower() {
    for (const item of this.vertexTowers || []) {
      this.tweens.add({ targets: item.glow, alpha: 0.34, duration: 120, yoyo: true, repeat: 4 });
      this.tweens.add({ targets: [item.tower, item.tower2], tint: 0xf6d04d, duration: 100, yoyo: true, repeat: 3, onComplete: () => {
        item.tower.clearTint(); item.tower2.clearTint();
      }});
    }
    this.playBlip(880, 0.07, 'sine');
  }

  _hardcapAlarm() {
    this._agent('cartman')?.shakeAndShout();
    this._flashFinopsBar();
    this._showDialog("Cartman: 'FREIO 5 HARD CAP! Ninguém gasta um centavo sem autorização!'", 3600);
    const cam = this.cameras.main;
    cam.shake(450, 0.006);
    cam.flash(260, 190, 0, 0);
  }

  _flashFinopsBar() {
    if (!this.finopsBar) return;
    this.tweens.add({
      targets: this.finopsBar,
      fillColor: { from: 0x00aa44, to: 0xff0000 },
      alpha: { from: 1, to: 0.3 },
      duration: 120,
      yoyo: true,
      repeat: 8,
      onUpdate: () => this.finopsBar.setFillStyle(0xff0000, this.finopsBar.alpha),
      onComplete: () => this.finopsBar.setFillStyle(0x00aa44, 1),
    });
  }

  _writeChalkStatus(text, color = '#E8F6E8') {
    if (!this.chalkStatusText) return;
    this.chalkStatusText.setText(text).setColor(color);
    this.tweens.add({ targets: this.chalkStatusText, alpha: 0.35, duration: 140, yoyo: true, repeat: 4 });
  }

  _emitDustAtAgent(agentId, count = 6, tint = 0xf1f1dd) {
    const brain = this._agent(agentId);
    if (!brain) return;
    for (let i = 0; i < count; i++) {
      const p = this.add.image(brain.sprite.x + between(-12, 12), brain.sprite.y + between(2, 14), 'dust_puff')
        .setScale(floatBetween(1.2, 2.2))
        .setTint(tint)
        .setAlpha(0.72)
        .setDepth(2000);
      this.fxGroup.add(p);
      this.tweens.add({
        targets: p,
        x: p.x + between(-18, 18),
        y: p.y - between(10, 28),
        alpha: 0,
        scale: p.scale * 1.4,
        duration: between(420, 780),
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  _setRedTint(active) {
    const tint = 0xff5555;
    for (const obj of [...this.agentGroup.getChildren(), ...this.decorGroup.getChildren()]) {
      if (obj.setTint) active ? obj.setTint(tint) : obj.clearTint();
    }
    if (this.tileLayer?.setTint) active ? this.tileLayer.setTint(tint) : this.tileLayer.clearTint();
  }

  // ── Environment animation and performance culling ──────────────────────────

  _animateEnvironment(time) {
    if (this.killSwitchActive) return;
    for (const [idx, item] of (this.vertexTowers || []).entries()) {
      item.glow.alpha = 0.07 + Math.sin(time * 0.004 + idx) * 0.035;
    }
    for (const [idx, ripple] of (this.rippleSprites || []).entries()) {
      ripple.alpha = 0.55 + Math.sin(time * 0.002 + idx) * 0.20;
      ripple.rotation = Math.sin(time * 0.001 + idx) * 0.04;
    }
  }

  _updateWorldCulling() {
    const cam = this.cameras.main;
    const margin = 96;
    const view = new Phaser.Geom.Rectangle(
      cam.worldView.x - margin,
      cam.worldView.y - margin,
      cam.worldView.width + margin * 2,
      cam.worldView.height + margin * 2,
    );
    const check = (obj) => {
      if (!obj || obj.scrollFactorX === 0) return;
      const x = obj.x ?? 0;
      const y = obj.y ?? 0;
      const visible = Phaser.Geom.Rectangle.Contains(view, x, y) || obj.type === 'Container';
      if (obj.setVisible) obj.setVisible(visible);
    };
    this.agentGroup.children.iterate(check);
    this.fxGroup.children.iterate(check);
  }

  // ── Metrics hooks and audio ────────────────────────────────────────────────

  _setupMetricsHooks() {
    this.events.on('metrics-updated', (metrics) => this.updateMetrics(metrics));
    this.time.addEvent({ delay: 2000, loop: true, callback: () => {
      const latest = this.data.get('metrics');
      if (latest) this.updateMetrics(latest);
    }});
  }

  _ensureAudio() {
    if (this.audio.ctx) return;
    const Ctx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!Ctx) return;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0.035;
    master.connect(ctx.destination);
    this.audio.ctx = ctx;
    this.audio.master = master;
  }

  toggleBgm() {
    this._ensureAudio();
    if (!this.audio.ctx) return;
    if (this.audio.ctx.state === 'suspended') this.audio.ctx.resume();
    this.audio.muted = !this.audio.muted;
    if (!this.audio.muted) {
      this._showCenterBanner('BGM procedural: ON', 0x29e6d0, 900);
      this.audio.timer = this.time.addEvent({ delay: 380, loop: true, callback: () => {
        const seq = [196, 247, 262, 330, 294, 247, 196, 165];
        const note = seq[Math.floor(this.time.now / 380) % seq.length];
        this.playBlip(note, 0.11, 'sine', 0.018);
      }});
    } else {
      this._showCenterBanner('BGM procedural: OFF', 0xf6d04d, 900);
      this.audio.timer?.remove(false);
      this.audio.timer = null;
    }
  }

  playBlip(freq = 440, duration = 0.07, type = 'square', volume = 0.05) {
    this._ensureAudio();
    const ctx = this.audio.ctx;
    const master = this.audio.master;
    if (!ctx || !master || ctx.state === 'suspended') return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }
}
