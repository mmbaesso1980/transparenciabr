import Phaser from 'phaser';

/**
 * AgentStateMachine.js — Controla a máquina de estados de cada agente sprite
 *
 * Estado Firestore → Animação Phaser
 *
 * Estados:
 *   idle           → frame 0 (idle), posição na baia
 *   working        → frame 3 (work), balão "..."
 *   calling_vertex → frame 1 (walk), agente anda até torre Vertex, pulse dourado
 *   reviewing      → frame 3 (work), sprite na sala de revisão c/ prancheta
 *   done           → frame 1 (walk), anda até Maestro, entrega papel, volta
 *   error          → frame 0 (idle), balão ⚠️ vermelho piscando
 */

// Mapeamento estado → config de animação
export const STATE_ANIM = {
  idle:           { frame: 0, balloon: null,           loop: false },
  working:        { frame: 3, balloon: 'balloon_work', loop: true  },
  calling_vertex: { frame: 1, balloon: 'balloon_vertex', loop: true },
  reviewing:      { frame: 3, balloon: null,           loop: true  },
  done:           { frame: 1, balloon: 'balloon_done', loop: false },
  error:          { frame: 0, balloon: 'balloon_error', loop: true  },
};

// Mapeamento estado Firestore revisor → estado interno
export const REVISOR_STATE_MAP = {
  idle:      'idle',
  reviewing: 'reviewing',
  approved:  'done',
  warnings:  'working',
  rejected:  'error',
};

const TILE_PX   = 32; // 16px tile × escala 2 = 32px no canvas renderizado

/**
 * Converte coordenada de tile para pixel (centro do tile).
 */
export function tileToPixel(tx, ty) {
  return {
    x: tx * TILE_PX + TILE_PX / 2,
    y: ty * TILE_PX + TILE_PX / 2,
  };
}

/**
 * AgentController — instância por sprite no escritório.
 */
export class AgentController {
  /**
   * @param {Phaser.Scene}    scene
   * @param {Phaser.GameObjects.Sprite} sprite
   * @param {object} homePos   { tx, ty } — posição de baia em tiles
   * @param {object} extraPositions — { vertex, maestro } em tiles
   */
  constructor(scene, sprite, homePos, extraPositions = {}) {
    this.scene   = scene;
    this.sprite  = sprite;
    this.homePos = homePos;
    this.extraPositions = extraPositions;

    this.currentState   = null;  // null inicial pra primeiro setState('idle') disparar _startIdleWandering
    this.balloon        = null;
    this.balloonTween   = null;
    this.moveTween      = null;
    this.blinkTimer     = null;
    this.pulseTween     = null;

    // Balloon sprite (se não tiver configurado externamente)
    this._balloonSprite = null;
  }

  /**
   * Aplica novo estado ao sprite.
   * @param {string} newState — estado Firestore
   */
  setState(newState) {
    if (newState === this.currentState) return;
    this._clearEffects();
    this.currentState = newState;

    const config = STATE_ANIM[newState] || STATE_ANIM.idle;

    // Atualiza frame
    this.sprite.setFrame(config.frame);

    switch (newState) {
      case 'idle':
        this._goHome();
        this._startIdleWandering();
        break;

      case 'working':
        this._goHome();
        this._startWorkAnim();
        this._showBalloon('balloon_work');
        break;

      case 'calling_vertex':
        this._walkTo(this.extraPositions.vertex || this.homePos, () => {
          this._startPulse('#C9A227');
        });
        this._showBalloon('balloon_vertex');
        break;

      case 'done':
        this._walkTo(this.extraPositions.maestro || this.homePos, () => {
          this._showBalloon('balloon_done');
          this.scene.time.delayedCall(1500, () => {
            this._walkTo(this.homePos, () => {
              this.sprite.setFrame(0);
            });
          });
        });
        break;

      case 'reviewing':
        this._startWorkAnim();
        break;

      case 'error':
        this._goHome();
        this._startErrorBlink();
        break;

      default:
        this._goHome();
    }
  }

  // ── Internos ────────────────────────────────────────────────────────────────

  _goHome() {
    const { x, y } = tileToPixel(this.homePos.tx, this.homePos.ty);
    if (this.moveTween) this.moveTween.stop();
    this.sprite.setPosition(x, y);
    this.sprite.setFrame(STATE_ANIM[this.currentState]?.frame ?? 0);
  }

  // ── Comportamento Black Mirror: bonecos vivem sozinhos ────────────────────

  /**
   * Inicia comportamento idle vivo: vagueia, vai pra copa, conversa em pares.
   * Comandante Baesso · USS Callister mode.
   */
  _startIdleWandering() {
    if (this.idleTimer) this.idleTimer.remove();
    // Cada 6-14s decide próxima ação idle
    const next = () => Phaser.Math.Between(6000, 14000);
    this.idleTimer = this.scene.time.addEvent({
      delay:    next(),
      callback: () => {
        if (this.currentState !== 'idle') return;
        const action = Phaser.Math.Between(0, 100);
        if (action < 35) {
          // Caminha aleatório (1-3 tiles do home)
          this._wanderRandom();
        } else if (action < 55) {
          // Vai pra copa tomar café
          this._goCoffee();
        } else if (action < 75) {
          // Procura par e conversa
          this._tryChat();
        } else if (action < 85) {
          // Vira de lado (mudar frame)
          this.sprite.setFrame(Phaser.Math.Between(0, 1));
        }
        // resto: fica parado mesmo
        this.idleTimer.delay = next();
      },
      loop: true,
    });
  }

  _wanderRandom() {
    const dx = Phaser.Math.Between(-2, 2);
    const dy = Phaser.Math.Between(-1, 1);
    const target = {
      tx: this.homePos.tx + dx,
      ty: this.homePos.ty + dy,
    };
    this._walkTo(target, () => {
      this.scene.time.delayedCall(Phaser.Math.Between(1500, 3500), () => {
        if (this.currentState === 'idle') this._walkTo(this.homePos, () => this.sprite.setFrame(0));
      });
    });
  }

  _goCoffee() {
    // Posições aleatórias da copa
    const coffeeSpots = [
      { tx: 27, ty: 18 }, { tx: 28, ty: 19 }, { tx: 29, ty: 18 },
      { tx: 27, ty: 20 }, { tx: 28, ty: 21 },
    ];
    const spot = coffeeSpots[Phaser.Math.Between(0, coffeeSpots.length - 1)];
    this._walkTo(spot, () => {
      this._showBalloon('balloon_work'); // "..." enquanto toma café
      this.scene.time.delayedCall(Phaser.Math.Between(3000, 6000), () => {
        this._hideBalloon();
        if (this.currentState === 'idle') this._walkTo(this.homePos, () => this.sprite.setFrame(0));
      });
    });
  }

  _tryChat() {
    // Dispara evento DOM — a cena coordena pares
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aurora:requestChat', {
        detail: { sprite: this.sprite, homePos: this.homePos, controller: this },
      }));
    }
  }

  /** Chamado externamente pela cena para iniciar conversa com outro agente */
  startChatWith(otherCtrl) {
    if (this.currentState !== 'idle') return;
    // Anda até meio-caminho do outro agente
    const mid = {
      tx: Math.floor((this.homePos.tx + otherCtrl.homePos.tx) / 2),
      ty: Math.floor((this.homePos.ty + otherCtrl.homePos.ty) / 2),
    };
    this._walkTo(mid, () => {
      this._showBalloon('balloon_work');
      this.scene.time.delayedCall(Phaser.Math.Between(2500, 5000), () => {
        this._hideBalloon();
        if (this.currentState === 'idle') this._walkTo(this.homePos, () => this.sprite.setFrame(0));
      });
    });
  }

  _walkTo(pos, onComplete) {
    if (this.moveTween) this.moveTween.stop();
    const { x, y } = tileToPixel(pos.tx || pos.x || 0, pos.ty || pos.y || 0);
    this.sprite.setFrame(1); // walk frame
    this.moveTween = this.scene.tweens.add({
      targets:  this.sprite,
      x, y,
      duration: 800,
      ease:     'Linear',
      onComplete: () => {
        if (onComplete) onComplete();
      },
    });
  }

  _startWorkAnim() {
    // Alterna entre frames 2 e 3 (sit/work) para simular digitação
    this.workTimer = this.scene.time.addEvent({
      delay:    400,
      repeat:   -1,
      callback: () => {
        const f = this.sprite.frame.name === 3 ? 2 : 3;
        this.sprite.setFrame(f);
      },
    });
  }

  _showBalloon(textureKey) {
    if (!this._balloonSprite) {
      this._balloonSprite = this.scene.add.image(
        this.sprite.x,
        this.sprite.y - 20,
        textureKey,
      );
      this._balloonSprite.setDepth(this.sprite.depth + 1);
    } else {
      this._balloonSprite.setTexture(textureKey);
    }
  }

  _hideBalloon() {
    if (this._balloonSprite) {
      this._balloonSprite.destroy();
      this._balloonSprite = null;
    }
  }

  _startPulse(color) {
    this.pulseTween = this.scene.tweens.add({
      targets:  this.sprite,
      alpha:    { from: 1, to: 0.4 },
      duration: 400,
      yoyo:     true,
      repeat:   -1,
    });
  }

  _startErrorBlink() {
    this.pulseTween = this.scene.tweens.add({
      targets:  this.sprite,
      alpha:    { from: 1, to: 0 },
      duration: 300,
      yoyo:     true,
      repeat:   -1,
    });
    this._showBalloon('balloon_error');
  }

  _clearEffects() {
    if (this.workTimer)    { this.workTimer.remove();   this.workTimer   = null; }
    if (this.moveTween)    { this.moveTween.stop();     this.moveTween   = null; }
    if (this.pulseTween)   { this.pulseTween.stop();    this.pulseTween  = null; }
    if (this.blinkTimer)   { this.blinkTimer.remove();  this.blinkTimer  = null; }
    if (this.idleTimer)    { this.idleTimer.remove();   this.idleTimer   = null; }
    this._hideBalloon();
    this.sprite.setAlpha(1);
  }

  /** Atualiza a posição do balão para acompanhar o sprite (chamar em update) */
  updateBalloonPos() {
    if (this._balloonSprite) {
      this._balloonSprite.setPosition(this.sprite.x, this.sprite.y - 20);
    }
  }

  destroy() {
    this._clearEffects();
    if (this.sprite) this.sprite.destroy();
  }
}

// ── Factory de layout de baias ────────────────────────────────────────────────

/**
 * Retorna posição home (tile) para agente forensico por índice (0-15, grid 4×4).
 * Sala Forense: x:8-24, y:8-16 (centro do mapa 32×24)
 */
export function forenseAgentHomePos(index) {
  const col = index % 4;
  const row = Math.floor(index / 4);
  return { tx: 10 + col * 3, ty: 9 + row * 2 };
}

/**
 * Retorna posição home para revisor (0-5, layout 2×3).
 * Sala de Revisão: x:1-6, y:5-10
 */
export function revisorAgentHomePos(index) {
  const col = index % 2;
  const row = Math.floor(index / 2);
  return { tx: 2 + col * 3, ty: 5 + row * 2 };
}

/** Posição do Maestro */
export const MAESTRO_POS = { tx: 16, ty: 3 };

/** Posição da torre Vertex AI */
export const VERTEX_POS  = { tx: 28, ty: 10 };
