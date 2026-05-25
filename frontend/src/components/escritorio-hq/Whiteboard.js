/**
 * Whiteboard.js — Lousa central com KPIs ao vivo
 *
 * Exibe via Phaser Text (não BitmapFont):
 *   - Findings coletados: N/55
 *   - Fase atual: ingest | analyze | synthesize | review | publish
 *   - ETA estimado
 *   - Agentes ativos / total
 *
 * Posição: tile x:12-20, y:0-2 (Sala do Maestro)
 */

const TILE_PX = 32; // escala 2x de tiles 16px

// Cores palette TransparênciaBR
const COL = {
  bg:       0x1A2A2A,
  border:   0x01696F,
  text:     0xE8E8E8,
  accent:   0x02909A,
  gold:     0xC9A227,
  error:    0xCC0000,
  success:  0x00AA44,
};

const PHASE_LABELS = {
  ingest:     'COLETA',
  analyze:    'ANÁLISE',
  synthesize: 'SÍNTESE',
  review:     'REVISÃO',
  publish:    'PUBLICAÇÃO',
  queued:     'AGUARDANDO',
  running:    'EXECUTANDO',
  error:      'ERRO',
  done:       'CONCLUÍDO',
};

const PHASE_ORDER = ['ingest', 'analyze', 'synthesize', 'review', 'publish'];

/**
 * Cria a lousa central como objeto Phaser Container.
 *
 * @param {Phaser.Scene} scene
 * @returns {{ container: Phaser.GameObjects.Container, update: (data: object) => void }}
 */
export function createWhiteboard(scene) {
  // Posição pixel da lousa (tile 12,0 → escalado)
  const x = 12 * TILE_PX;
  const y = 0;
  const W = 8 * TILE_PX;  // 8 tiles de largura
  const H = 3 * TILE_PX;  // 3 tiles de altura

  // Background
  const bg = scene.add.rectangle(x, y, W, H, COL.bg, 0.92).setOrigin(0, 0);

  // Borda teal
  const border = scene.add.rectangle(x, y, W, H).setOrigin(0, 0);
  border.setStrokeStyle(2, COL.border);

  // Título
  const title = scene.add.text(x + W / 2, y + 4, 'AURORA HQ — WAR ROOM', {
    fontFamily: 'monospace',
    fontSize:   '9px',
    color:      '#02909A',
    fontStyle:  'bold',
  }).setOrigin(0.5, 0);

  // Linha de findings
  const findingsText = scene.add.text(x + 6, y + 16, 'Findings: 0/55', {
    fontFamily: 'monospace',
    fontSize:   '8px',
    color:      '#E8E8E8',
  });

  // Barra de progresso findings
  const pbBg = scene.add.rectangle(x + 6, y + 26, W - 12, 4, 0x333333).setOrigin(0, 0);
  const pbFill = scene.add.rectangle(x + 6, y + 26, 0, 4, COL.accent).setOrigin(0, 0);

  // Fase
  const phaseText = scene.add.text(x + 6, y + 34, 'Fase: —', {
    fontFamily: 'monospace',
    fontSize:   '8px',
    color:      '#C9A227',
  });

  // Agentes
  const agentsText = scene.add.text(x + 6, y + 44, 'Agentes: 0/22', {
    fontFamily: 'monospace',
    fontSize:   '8px',
    color:      '#E8E8E8',
  });

  // ETA
  const etaText = scene.add.text(x + W - 6, y + 44, 'ETA: —', {
    fontFamily: 'monospace',
    fontSize:   '8px',
    color:      '#E8E8E8',
  }).setOrigin(1, 0);

  // Container agrupa todos
  const container = scene.add.container(0, 0, [
    bg, border, title,
    findingsText, pbBg, pbFill,
    phaseText, agentsText, etaText,
  ]);
  container.setDepth(10);

  // Tween de pulso na borda quando working
  let borderTween = null;

  /**
   * Atualiza a lousa com dados do Firestore/mock.
   *
   * @param {object} data
   * @param {number}  data.findingsCount   — total de findings coletados
   * @param {number}  data.findingsTotal   — meta (ex: 55)
   * @param {string}  data.phase           — fase atual
   * @param {number}  data.activeAgents    — agentes em estado working/calling_vertex
   * @param {number}  data.totalAgents     — total de agentes (22)
   * @param {number}  [data.etaSeconds]    — segundos estimados
   * @param {string}  data.status          — status geral do dossie
   */
  function update(data = {}) {
    const {
      findingsCount = 0,
      findingsTotal = 55,
      phase = '',
      activeAgents = 0,
      totalAgents  = 22,
      etaSeconds,
      status = '',
    } = data;

    // Findings
    findingsText.setText(`Findings: ${findingsCount}/${findingsTotal}`);
    const pct = findingsTotal > 0 ? findingsCount / findingsTotal : 0;
    pbFill.setSize((W - 12) * pct, 4);

    // Cor da barra (vermelho < 30%, amarelo < 70%, teal acima)
    if (pct < 0.3) pbFill.setFillStyle(COL.error);
    else if (pct < 0.7) pbFill.setFillStyle(COL.gold);
    else pbFill.setFillStyle(COL.success);

    // Fase
    const phaseLabel = PHASE_LABELS[phase] || PHASE_LABELS[status] || '—';
    phaseText.setText(`Fase: ${phaseLabel}`);

    // Indicador de progresso de fase (bullets)
    const phaseIdx = PHASE_ORDER.indexOf(phase);
    // (omitimos a barra de fases por espaço, apenas cor)
    if (status === 'error') {
      phaseText.setColor('#CC0000');
    } else if (status === 'done') {
      phaseText.setColor('#00AA44');
    } else {
      phaseText.setColor('#C9A227');
    }

    // Agentes
    agentsText.setText(`Agentes: ${activeAgents}/${totalAgents}`);

    // ETA
    if (etaSeconds != null && etaSeconds > 0) {
      const mins = Math.floor(etaSeconds / 60);
      const secs = etaSeconds % 60;
      etaText.setText(`ETA: ${mins}m${String(secs).padStart(2, '0')}s`);
    } else if (status === 'done') {
      etaText.setText('ETA: concluído');
    } else {
      etaText.setText('ETA: —');
    }

    // Pulse borda quando ativos
    if (activeAgents > 0 && !borderTween) {
      borderTween = scene.tweens.add({
        targets:  border,
        alpha:    { from: 1, to: 0.3 },
        duration: 600,
        yoyo:     true,
        repeat:   -1,
      });
    } else if (activeAgents === 0 && borderTween) {
      borderTween.stop();
      borderTween = null;
      border.setAlpha(1);
    }
  }

  return { container, update };
}
