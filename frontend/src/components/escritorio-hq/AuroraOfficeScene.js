/**
 * AuroraOfficeScene.js — Cena Phaser 3 principal do escritório AURORA HQ
 *
 * Mapa: 32×24 tiles de 16px = 512×384 pixels base; escala 2× = 1024×768 view
 *
 * Zonas:
 *   Sala Forense     — x:8-24, y:8-16  (16 baias, grid 4×4 + extra)
 *   Sala de Revisão  — x:0-7,  y:4-12  (6 mesas 2×3)
 *   Sala do Maestro  — x:8-24, y:0-7   (mesa grande + lousa)
 *   Copa/Café        — x:25-31, y:16-23 (sofás + máquina de café)
 *
 * Câmera: pan via drag, zoom via scroll/pinch.
 * Click em sprite → emite evento customEvent 'agentClick' com agentId.
 */

import Phaser from 'phaser';
import { createAgentSprite, createTileSet, createBalloons } from './SpriteFactory.js';
import {
  AgentController,
  forenseAgentHomePos,
  revisorAgentHomePos,
  MAESTRO_POS,
  VERTEX_POS,
  REVISOR_STATE_MAP,
} from './AgentStateMachine.js';
import { createWhiteboard } from './Whiteboard.js';
import { AGENT_IDS, REVISOR_IDS, AGENT_PALETTE } from './mockData.js';

// ── Constantes do mapa ────────────────────────────────────────────────────────
const MAP_W      = 32;
const MAP_H      = 24;
const TILE_BASE  = 16;
const SCALE      = 2;
const TILE_PX    = TILE_BASE * SCALE; // 32px por tile no canvas renderizado

// ── Layout do mapa (0 = floor teal, 1 = floor dark, 2 = wall_h, etc.) ────────
// Gerado proceduralmente em buildMap()
function buildMapData() {
  const map = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) {
      // Padrão base: chão teal
      row.push(0);
    }
    map.push(row);
  }

  // Paredes externas
  for (let x = 0; x < MAP_W; x++) {
    map[0][x]        = 2; // wall top
    map[MAP_H-1][x]  = 2; // wall bottom
  }
  for (let y = 0; y < MAP_H; y++) {
    map[y][0]        = 3; // wall left
    map[y][MAP_W-1]  = 3; // wall right
  }

  // Divisória Sala Forense / Revisão (x=7)
  for (let y = 4; y < MAP_H-1; y++) map[y][7] = 3;

  // Divisória Sala Maestro / Forense (y=7)
  for (let x = 1; x < MAP_W-1; x++) map[7][x] = 2;

  // Copa: x:25-31, y:16-23 — chão escuro
  for (let y = 16; y < MAP_H; y++) {
    for (let x = 25; x < MAP_W; x++) {
      map[y][x] = 13;
    }
  }

  // Aberturas (portas) nas paredes divisórias
  map[7][12]  = 0; // porta maestro → forense
  map[7][16]  = 0;
  map[10][7]  = 0; // porta revisão → corredor
  map[14][7]  = 0;
  map[16][25] = 0; // porta forense → copa

  return map;
}

// ── Cena ─────────────────────────────────────────────────────────────────────
export default class AuroraOfficeScene extends Phaser.Scene {
  constructor() {
    super({ key: 'AuroraOfficeScene' });
    this._agentControllers = new Map(); // agentId → AgentController
    this._sprites          = new Map(); // agentId → Phaser.GameObjects.Sprite
    this._whiteboard       = null;
    this._onAgentClick     = null;      // callback injected from React
    this._isDragging       = false;
    this._dragStartX       = 0;
    this._dragStartY       = 0;
    this._camX             = 0;
    this._camY             = 0;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  preload() {
    // Todos os assets são procedurais — nada a carregar via rede
  }

  create() {
    // 1. Criar texturas procedurais
    const tilesKey = createTileSet(this, 'aurora_tiles');
    createBalloons(this);

    // Criar sprite atlas para cada paleta
    createAgentSprite(this, 'agent_forense',  'forense');
    createAgentSprite(this, 'agent_revisor',  'revisor');
    createAgentSprite(this, 'agent_maestro',  'maestro');

    // 2. Renderizar o mapa
    this._renderMap(tilesKey);

    // 3. Adicionar decoração (móveis fixos)
    this._addFurniture(tilesKey);

    // 4. Adicionar torre Vertex
    this._addVertexTower(tilesKey);

    // 5. Spawnar sprites dos agentes
    this._spawnAgents();

    // 6. Criar lousa
    this._whiteboard = createWhiteboard(this);

    // 7. Câmera — define bounds e zoom inicial
    const worldW = MAP_W * TILE_PX;
    const worldH = MAP_H * TILE_PX;
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setZoom(1);
    // Centraliza na sala forense inicialmente
    this.cameras.main.scrollX = 8 * TILE_PX - this.cameras.main.width / 2;
    this.cameras.main.scrollY = 8 * TILE_PX - this.cameras.main.height / 2;

    // 8. Input — pan e zoom
    this._setupInput();

    // 9. Textos de zona
    this._addZoneLabels();

    // 10. Black Mirror mode: ativa idle wandering em todos
    for (const ctrl of this._agentControllers.values()) {
      ctrl.setState('idle');
    }

    // 11. Coordenador de conversas em pares
    this._chatPending = null;
    this._chatListener = (e) => {
      const { controller } = e.detail;
      if (this._chatPending && this._chatPending !== controller) {
        // Forma par
        const partner = this._chatPending;
        this._chatPending = null;
        controller.startChatWith(partner);
        partner.startChatWith(controller);
      } else {
        // Primeiro a pedir — espera 3s por par; senão desiste
        this._chatPending = controller;
        this.time.delayedCall(3000, () => {
          if (this._chatPending === controller) this._chatPending = null;
        });
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('aurora:requestChat', this._chatListener);
    }
  }

  shutdown() {
    if (typeof window !== 'undefined' && this._chatListener) {
      window.removeEventListener('aurora:requestChat', this._chatListener);
    }
  }

  update(time, delta) {
    // Atualiza posição dos balões
    for (const ctrl of this._agentControllers.values()) {
      ctrl.updateBalloonPos();
    }
  }

  // ── Mapa ───────────────────────────────────────────────────────────────────

  _renderMap(tilesKey) {
    const mapData = buildMapData();
    const TILE_NAMES = [
      'floor_teal','floor_dark','wall_h','wall_v',
      'desk','chair','monitor','sofa','coffee','whiteboard',
      'vertex_tower','door','plant','floor_copa',
    ];

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const tileId = mapData[y][x];
        const px_x   = x * TILE_PX;
        const px_y   = y * TILE_PX;

        this.add.image(px_x, px_y, tilesKey, tileId)
          .setOrigin(0, 0)
          .setScale(SCALE)
          .setDepth(0);
      }
    }
  }

  // ── Móveis ─────────────────────────────────────────────────────────────────

  _addFurniture(tilesKey) {
    // Sala Forense — 16 mesas (grid 4 cols × 4 rows)
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const tx = 10 + col * 3;
        const ty = 9  + row * 2;
        this._placeTile(tilesKey, tx,   ty,   'desk',    2);
        this._placeTile(tilesKey, tx,   ty+1, 'chair',   2);
        this._placeTile(tilesKey, tx+1, ty,   'monitor', 2);
      }
    }

    // Sala de Revisão — 6 mesas (2 cols × 3 rows)
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 2; col++) {
        const tx = 2 + col * 3;
        const ty = 5 + row * 2;
        this._placeTile(tilesKey, tx,   ty,   'desk',    2);
        this._placeTile(tilesKey, tx,   ty+1, 'chair',   2);
        this._placeTile(tilesKey, tx+1, ty,   'monitor', 2);
      }
    }

    // Sala do Maestro — mesa grande (3 tiles)
    for (let col = 0; col < 3; col++) {
      this._placeTile(tilesKey, 14 + col, 3, 'desk', 2);
    }
    this._placeTile(tilesKey, 15, 4, 'chair', 2);
    this._placeTile(tilesKey, 15, 2, 'monitor', 2);
    // Lousa na sala Maestro
    for (let col = 0; col < 4; col++) {
      this._placeTile(tilesKey, 9 + col, 1, 'whiteboard', 2);
    }

    // Copa — sofás e máquina de café
    this._placeTile(tilesKey, 26, 18, 'sofa',   2);
    this._placeTile(tilesKey, 27, 18, 'sofa',   2);
    this._placeTile(tilesKey, 26, 20, 'sofa',   2);
    this._placeTile(tilesKey, 29, 17, 'coffee', 2);

    // Plantas decorativas
    this._placeTile(tilesKey, 1,  1,  'plant', 2);
    this._placeTile(tilesKey, 30, 1,  'plant', 2);
    this._placeTile(tilesKey, 1,  22, 'plant', 2);
    this._placeTile(tilesKey, 30, 22, 'plant', 2);

    // Portas
    this._placeTile(tilesKey, 12, 7, 'door', 2);
    this._placeTile(tilesKey, 7,  10, 'door', 2);
    this._placeTile(tilesKey, 25, 16, 'door', 2);
  }

  _addVertexTower(tilesKey) {
    const { tx, ty } = VERTEX_POS;
    // Torre Vertex (2×3 tiles)
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 2; col++) {
        this._placeTile(tilesKey, tx + col, ty + row - 1, 'vertex_tower', 2, 5);
      }
    }

    // Label "VERTEX AI"
    this.add.text(tx * TILE_PX + TILE_PX, (ty - 1) * TILE_PX - 6, 'VERTEX AI', {
      fontFamily: 'monospace',
      fontSize:   '7px',
      color:      '#C9A227',
      fontStyle:  'bold',
    }).setOrigin(0.5, 1).setDepth(6);
  }

  _placeTile(tilesKey, tx, ty, frameName, scale = 2, depth = 2) {
    this.add.image(tx * TILE_PX, ty * TILE_PX, tilesKey, frameName)
      .setOrigin(0, 0)
      .setScale(scale)
      .setDepth(depth);
  }

  // ── Agentes ────────────────────────────────────────────────────────────────

  _spawnAgents() {
    const extraPos = {
      vertex: VERTEX_POS,
      maestro: MAESTRO_POS,
    };

    // Agentes forenses
    AGENT_IDS.forEach((id, i) => {
      const homePos = forenseAgentHomePos(i);
      this._spawnAgent(id, 'agent_forense', homePos, extraPos, 4);
    });

    // Revisores
    REVISOR_IDS.forEach((id, i) => {
      const homePos = revisorAgentHomePos(i);
      this._spawnAgent(id, 'agent_revisor', homePos, extraPos, 4);
    });

    // Maestro
    this._spawnAgent('maestro', 'agent_maestro', MAESTRO_POS, extraPos, 4);
  }

  _spawnAgent(id, textureKey, homePos, extraPos, depth = 4) {
    const px_x = homePos.tx * TILE_PX + TILE_PX / 2;
    const px_y = homePos.ty * TILE_PX + TILE_PX / 2;

    const sprite = this.add.sprite(px_x, px_y, textureKey, 0)
      .setOrigin(0.5, 0.5)
      .setScale(SCALE)
      .setDepth(depth)
      .setInteractive({ useHandCursor: true });

    sprite.on('pointerdown', () => {
      this._onAgentClick?.(id);
      // Dispara evento DOM para React
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aurora:agentClick', { detail: { agentId: id } }));
      }
    });

    // Hover highlight
    sprite.on('pointerover', () => sprite.setAlpha(0.8));
    sprite.on('pointerout',  () => sprite.setAlpha(1));

    const ctrl = new AgentController(this, sprite, homePos, extraPos);
    this._agentControllers.set(id, ctrl);
    this._sprites.set(id, sprite);
  }

  // ── Input — pan e zoom ────────────────────────────────────────────────────

  _setupInput() {
    const cam = this.cameras.main;

    // Mouse drag
    this.input.on('pointerdown', (ptr) => {
      this._isDragging = true;
      this._dragStartX = ptr.x + cam.scrollX;
      this._dragStartY = ptr.y + cam.scrollY;
    });

    this.input.on('pointermove', (ptr) => {
      if (!this._isDragging) return;
      cam.scrollX = this._dragStartX - ptr.x;
      cam.scrollY = this._dragStartY - ptr.y;
    });

    this.input.on('pointerup', () => { this._isDragging = false; });

    // Wheel zoom
    this.input.on('wheel', (ptr, objs, dx, dy) => {
      const newZoom = Phaser.Math.Clamp(cam.zoom - dy * 0.001, 0.5, 2.5);
      cam.setZoom(newZoom);
    });

    // Pinch zoom (touch)
    this.input.addPointer(1);
    this.input.on('pointermove', () => {
      if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
        const d1 = Phaser.Math.Distance.Between(
          this.input.pointer1.x, this.input.pointer1.y,
          this.input.pointer2.x, this.input.pointer2.y,
        );
        if (this._lastPinchDist) {
          const delta = d1 - this._lastPinchDist;
          cam.setZoom(Phaser.Math.Clamp(cam.zoom + delta * 0.005, 0.5, 2.5));
        }
        this._lastPinchDist = d1;
      } else {
        this._lastPinchDist = null;
      }
    });
  }

  // ── Rótulos de zona ───────────────────────────────────────────────────────

  _addZoneLabels() {
    const labels = [
      { x: 16 * TILE_PX, y: 0 * TILE_PX + 2, text: '▲ SALA DO MAESTRO',   color: '#C9A227' },
      { x: 12 * TILE_PX, y: 8 * TILE_PX + 2,  text: '◼ SALA FORENSE',      color: '#02909A' },
      { x:  3 * TILE_PX, y: 4 * TILE_PX + 2,  text: '◼ REVISÃO',           color: '#9C3DB5' },
      { x: 28 * TILE_PX, y:16 * TILE_PX + 2,  text: '☕ COPA',              color: '#6B6B6B' },
      { x: 27 * TILE_PX, y: 8 * TILE_PX + 2,  text: '⚡ VERTEX AI',        color: '#C9A227' },
    ];

    for (const l of labels) {
      this.add.text(l.x, l.y, l.text, {
        fontFamily: 'monospace',
        fontSize:   '8px',
        color:      l.color,
        fontStyle:  'bold',
        alpha:      0.7,
      }).setOrigin(0.5, 0).setDepth(8);
    }
  }

  // ── API pública (chamada pelo React) ──────────────────────────────────────

  /**
   * Injeta callback para click em agente.
   * @param {function} fn — (agentId: string) => void
   */
  setAgentClickCallback(fn) {
    this._onAgentClick = fn;
  }

  /**
   * Atualiza o estado de um agente via dados do Firestore.
   * @param {string} agentId
   * @param {object} data — { state, progress, last_msg }
   * @param {boolean} isRevisor
   */
  updateAgentState(agentId, data, isRevisor = false) {
    const ctrl = this._agentControllers.get(agentId);
    if (!ctrl) return;

    let state = data.state || 'idle';
    if (isRevisor) {
      state = REVISOR_STATE_MAP[state] || 'idle';
    }
    ctrl.setState(state);
  }

  /**
   * Atualiza a lousa com dados do dossie.
   * @param {object} snapshot
   */
  updateWhiteboard(snapshot) {
    if (this._whiteboard) {
      this._whiteboard.update(snapshot);
    }
  }

  /**
   * Aplica snapshot completo (agentes + revisores + lousa).
   * @param {object} snapshot — formato de mockData.getMockSnapshot()
   */
  applySnapshot(snapshot) {
    if (!snapshot) return;

    // Agentes forenses
    if (snapshot.agents) {
      for (const [id, data] of Object.entries(snapshot.agents)) {
        this.updateAgentState(id, data, false);
      }
    }

    // Revisores
    if (snapshot.reviewers) {
      for (const [id, data] of Object.entries(snapshot.reviewers)) {
        this.updateAgentState(id, data, true);
      }
    }

    // Maestro
    if (snapshot.dossie) {
      const maestroState =
        snapshot.dossie.status === 'running'  ? 'working'  :
        snapshot.dossie.status === 'done'     ? 'done'     :
        snapshot.dossie.status === 'error'    ? 'error'    : 'idle';
      this.updateAgentState('maestro', { state: maestroState }, false);
    }

    // Lousa
    this.updateWhiteboard(snapshot);
  }
}
