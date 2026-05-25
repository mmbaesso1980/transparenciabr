/**
 * mockData.js — Dados simulados para desenvolvimento
 *
 * __DEV_ONLY__ — desabilitado em produção via import.meta.env.PROD
 *
 * Simula 20 agentes ciclando estados em uma timeline de 60 segundos.
 * Também simula os 6 revisores e o Maestro.
 */

// ── IDs dos agentes ───────────────────────────────────────────────────────────
export const AGENT_IDS = [
  'agent_dossier_compiler',
  'agent_vendor_intelligence',
  'agent_patrimony_analyzer',
  'agent_travel_auditor',
  'agent_contracts_mapper',
  'agent_nepotism_detector',
  'agent_amendments_tracker',
  'agent_pep_screener',
  'agent_company_web',
  'agent_ceap_analyzer',
  'agent_risk_scorer',
  'agent_source_validator',
  'agent_timeline_builder',
  'agent_network_mapper',
  'agent_anomaly_detector',
  'agent_financial_auditor',
  'agent_public_data_collector',
  'agent_media_monitor',
  'agent_legal_cross_checker',
  'agent_synthesis_builder',
];

export const REVISOR_IDS = [
  'revisor_fonte_primaria',
  'revisor_tom',
  'revisor_contraditorio',
  'revisor_falso_positivo',
  'revisor_mascara_pii',
  'revisor_severidade',
];

// Paletas por agente
export const AGENT_PALETTE = {
  revisor_fonte_primaria: 'revisor',
  revisor_tom:            'revisor',
  revisor_contraditorio:  'revisor',
  revisor_falso_positivo: 'revisor',
  revisor_mascara_pii:    'revisor',
  revisor_severidade:     'revisor',
  maestro:                'maestro',
};
// Todos os outros são forense
AGENT_IDS.forEach(id => { AGENT_PALETTE[id] = 'forense'; });

// ── Estado inicial ────────────────────────────────────────────────────────────
const STATES = ['idle', 'working', 'calling_vertex', 'done', 'error'];

function randState(t, offset) {
  // Timeline de 60s — cada agente percorre um ciclo baseado no offset
  const cycle = ((t + offset) % 60) / 60;
  if (cycle < 0.15) return 'idle';
  if (cycle < 0.40) return 'working';
  if (cycle < 0.60) return 'calling_vertex';
  if (cycle < 0.80) return 'working';
  if (cycle < 0.92) return 'done';
  if (cycle < 0.97) return 'error';
  return 'idle';
}

function randProgress(t, offset) {
  const cycle = ((t + offset) % 60) / 60;
  return Math.round(cycle * 100);
}

const MESSAGES = [
  'Consultando Portal da Transparência...',
  'Analisando contratos TSE...',
  'Verificando emendas parlamentares...',
  'Cruzando dados CEAP...',
  'Chamando Vertex AI Gemini 2.5 Pro...',
  'Calculando score de risco...',
  'Validando fontes primárias...',
  'Detectando padrões anômalos...',
  'Mapeando rede de empresas...',
  'Compilando findings...',
];

/**
 * Gera snapshot de estado de todos os agentes para um dado timestamp.
 * @param {number} t — segundos desde o início da simulação
 * @returns {object} { dossie, agents, reviewers }
 */
export function getMockSnapshot(t) {
  if (import.meta.env.PROD) return null;

  const agents = {};
  AGENT_IDS.forEach((id, i) => {
    const offset = (i * 3.7) % 60; // offsets variados para desfasar
    agents[id] = {
      agent_id:   id,
      state:      randState(t, offset),
      progress:   randProgress(t, offset),
      last_msg:   MESSAGES[i % MESSAGES.length],
      started_at: new Date(Date.now() - offset * 1000).toISOString(),
      finished_at: randState(t, offset) === 'done' ? new Date().toISOString() : null,
    };
  });

  const reviewers = {};
  REVISOR_IDS.forEach((id, i) => {
    const offset = 35 + (i * 3.1) % 20; // revisores começam mais tarde
    const revStates = ['idle', 'reviewing', 'approved', 'warnings', 'rejected'];
    const cycle = ((t + offset) % 60) / 60;
    let state = 'idle';
    if (cycle < 0.3) state = 'idle';
    else if (cycle < 0.7) state = 'reviewing';
    else if (cycle < 0.85) state = 'approved';
    else if (cycle < 0.95) state = 'warnings';
    else state = 'idle';

    reviewers[id] = {
      revisor_id:  id,
      state,
      warnings:    state === 'warnings' ? ['Verificar fonte primária'] : [],
      retries:     0,
      finished_at: state === 'approved' ? new Date().toISOString() : null,
    };
  });

  // Contagem de findings simulada
  const findingsCount = Math.min(55, Math.floor((t / 60) * 55) + 3);

  // Fase simulada
  let phase = 'ingest';
  if (t > 12) phase = 'analyze';
  if (t > 28) phase = 'synthesize';
  if (t > 44) phase = 'review';
  if (t > 56) phase = 'publish';

  const activeAgents = Object.values(agents).filter(
    a => a.state === 'working' || a.state === 'calling_vertex'
  ).length;

  const dossie = {
    status:    t >= 60 ? 'done' : 'running',
    phase,
    alvo: {
      nome:     'ALVO SIMULADO — DEMO',
      cpf_mask: '***.000.000-**',
      partido:  'DEMO',
      cargo:    'Deputado Federal',
    },
    created_at:  new Date(Date.now() - t * 1000).toISOString(),
    updated_at:  new Date().toISOString(),
    pdf_url:     null,
  };

  return {
    dossie,
    agents,
    reviewers,
    findingsCount,
    findingsTotal: 55,
    phase,
    activeAgents,
    totalAgents: AGENT_IDS.length + REVISOR_IDS.length + 1, // +1 maestro
    etaSeconds: Math.max(0, 60 - t),
    status: dossie.status,
  };
}

/**
 * Hook simples de mock: retorna dados que atualizam a cada 2s.
 * Chame em useEffect com cleanup.
 *
 * @param {function} onUpdate — callback(snapshot)
 * @returns {function} cleanup
 */
export function startMockListener(onUpdate) {
  if (import.meta.env.PROD) return () => {};

  const startTime = Date.now();
  let raf;

  function tick() {
    const t = ((Date.now() - startTime) / 1000) % 60;
    onUpdate(getMockSnapshot(t));
    raf = setTimeout(tick, 2000);
  }

  tick();
  return () => clearTimeout(raf);
}
