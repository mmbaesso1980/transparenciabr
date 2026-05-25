/**
 * EscritorioHQPage.jsx — Escritório Virtual AURORA HQ
 *
 * Rota: /escritorio-hq
 *
 * Container React que:
 *  1. Monta a cena Phaser 3 (AuroraOfficeScene)
 *  2. Escuta Firestore: dossies_v1/{slug}/agents/* + review/*
 *  3. Exibe sidebar direita com painel do agente clicado
 *  4. Botão "voltar para tabela" → /escritorio
 */

import Phaser from 'phaser';
import {
  collection,
  onSnapshot,
  doc,
} from 'firebase/firestore';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';

import { getFirestoreDb } from '../lib/firebase.js';
import AuroraOfficeScene from '../components/escritorio-hq/AuroraOfficeScene.js';
import { startMockListener } from '../components/escritorio-hq/mockData.js';

// ── Constantes ────────────────────────────────────────────────────────────────
const CANVAS_W = 1024;
const CANVAS_H = 768;

const STATE_LABELS = {
  idle:           'Aguardando',
  working:        'Trabalhando',
  calling_vertex: 'Consultando Vertex AI',
  reviewing:      'Revisando',
  done:           'Concluído',
  error:          'Erro',
};

const STATE_COLORS = {
  idle:           '#6B7280',
  working:        '#01696F',
  calling_vertex: '#C9A227',
  reviewing:      '#7B2D8E',
  done:           '#00AA44',
  error:          '#CC0000',
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function EscritorioHQPage() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();

  const slug = searchParams.get('slug') || '';

  const containerRef = useRef(null);
  const gameRef      = useRef(null);
  const sceneRef     = useRef(null);

  const [selectedAgent, setSelectedAgent]   = useState(null);
  const [agentData, setAgentData]           = useState({});
  const [dossieData, setDossieData]         = useState(null);
  const [firestoreOk, setFirestoreOk]       = useState(true);
  const [isMockMode, setIsMockMode]         = useState(false);
  const [sidebarOpen, setSidebarOpen]       = useState(false);

  // ── Inicializa Phaser ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const config = {
      type:       Phaser.CANVAS,
      width:      CANVAS_W,
      height:     CANVAS_H,
      parent:     containerRef.current,
      backgroundColor: '#0D1E1E',
      scene:      [AuroraOfficeScene],
      fps:        { target: 30, forceSetTimeOut: true },
      scale: {
        mode:           Phaser.Scale.FIT,
        autoCenter:     Phaser.Scale.CENTER_BOTH,
        width:          CANVAS_W,
        height:         CANVAS_H,
      },
      render: {
        pixelArt:    true,
        antialias:   false,
        roundPixels: true,
      },
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    // Aguarda cena ficar ativa
    game.events.once('ready', () => {
      const scene = game.scene.getScene('AuroraOfficeScene');
      sceneRef.current = scene;

      scene.setAgentClickCallback((agentId) => {
        setSelectedAgent(agentId);
        setSidebarOpen(true);
      });
    });

    // Escuta evento DOM de click (fallback)
    const handleAgentClick = (e) => {
      setSelectedAgent(e.detail.agentId);
      setSidebarOpen(true);
    };
    window.addEventListener('aurora:agentClick', handleAgentClick);

    return () => {
      window.removeEventListener('aurora:agentClick', handleAgentClick);
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
        sceneRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Firestore listener ─────────────────────────────────────────────────────
  useEffect(() => {
    const db = getFirestoreDb();

    // Se não há Firestore ou não há slug → mock mode (dev)
    if (!db || !slug) {
      if (!import.meta.env.PROD) {
        setIsMockMode(true);
        setFirestoreOk(false);
        return;
      }
      setFirestoreOk(false);
      return;
    }

    const unsubFns = [];

    // Listener: documento principal do dossie
    const dossieRef = doc(db, 'dossies_v1', slug);
    const unsubDossie = onSnapshot(dossieRef, (snap) => {
      if (snap.exists()) {
        setDossieData(snap.data());
      }
    }, () => { setFirestoreOk(false); });
    unsubFns.push(unsubDossie);

    // Listener: subcoleção agents
    const agentsRef = collection(db, 'dossies_v1', slug, 'agents');
    const unsubAgents = onSnapshot(agentsRef, (snap) => {
      const updates = {};
      snap.forEach(d => { updates[d.id] = d.data(); });
      setAgentData(prev => {
        const next = { ...prev, ...updates };
        // Aplicar ao Phaser
        if (sceneRef.current) {
          for (const [id, data] of Object.entries(updates)) {
            sceneRef.current.updateAgentState(id, data, false);
          }
        }
        return next;
      });
    }, () => {});
    unsubFns.push(unsubAgents);

    // Listener: subcoleção review (revisores)
    const reviewRef = collection(db, 'dossies_v1', slug, 'review');
    const unsubReview = onSnapshot(reviewRef, (snap) => {
      const updates = {};
      snap.forEach(d => { updates[d.id] = d.data(); });
      setAgentData(prev => {
        const next = { ...prev, ...updates };
        if (sceneRef.current) {
          for (const [id, data] of Object.entries(updates)) {
            sceneRef.current.updateAgentState(id, data, true);
          }
        }
        return next;
      });
    }, () => {});
    unsubFns.push(unsubReview);

    return () => unsubFns.forEach(u => u());
  }, [slug]);

  // ── Mock listener (dev sem Firestore) ────────────────────────────────────
  useEffect(() => {
    if (!isMockMode) return;

    const cleanup = startMockListener((snapshot) => {
      if (sceneRef.current) {
        sceneRef.current.applySnapshot(snapshot);
      }
      if (snapshot) {
        setDossieData(snapshot.dossie);
        setAgentData(prev => ({
          ...prev,
          ...snapshot.agents,
          ...snapshot.reviewers,
        }));
      }
    });

    return cleanup;
  }, [isMockMode]);

  // ── Atualiza lousa quando dossie muda ─────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current || !dossieData) return;

    const activeAgents = Object.values(agentData).filter(
      a => a.state === 'working' || a.state === 'calling_vertex' ||
           a.state === 'reviewing'
    ).length;

    sceneRef.current.updateWhiteboard({
      findingsCount: dossieData.findings_count || 0,
      findingsTotal: 55,
      phase:         dossieData.phase  || '',
      status:        dossieData.status || '',
      activeAgents,
      totalAgents:   27,
      etaSeconds:    null,
    });
  }, [dossieData, agentData]);

  // ── Dados do agente selecionado ───────────────────────────────────────────
  const selectedData = selectedAgent ? agentData[selectedAgent] : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display:        'flex',
        flexDirection:  'column',
        height:         '100dvh',
        background:     '#0A1A1A',
        color:          '#E8E8E8',
        fontFamily:     'DM Sans, Inter, sans-serif',
        overflow:       'hidden',
      }}
    >
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <header
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '8px 16px',
          background:     '#0D1E1E',
          borderBottom:   '1px solid #01696F44',
          flexShrink:     0,
          zIndex:         20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Logo */}
          <svg width="24" height="24" viewBox="0 0 24 24" aria-label="AURORA HQ" fill="none">
            <polygon points="12,2 22,20 2,20" stroke="#01696F" strokeWidth="1.5" fill="none"/>
            <circle cx="12" cy="14" r="3" fill="#01696F" opacity="0.8"/>
          </svg>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#02909A', letterSpacing: '0.08em' }}>
            AURORA HQ
          </span>
          {dossieData?.alvo?.nome && (
            <span style={{ fontSize: 12, color: '#6B9E9E', marginLeft: 8 }}>
              — {dossieData.alvo.nome}
            </span>
          )}
          {isMockMode && (
            <span
              style={{
                fontSize:   10,
                color:      '#C9A227',
                background: '#1A1500',
                border:     '1px solid #C9A22744',
                padding:    '2px 6px',
                borderRadius: 4,
              }}
            >
              SIMULAÇÃO DEV
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Status badge */}
          {dossieData && (
            <StatusBadge status={dossieData.status} phase={dossieData.phase} />
          )}

          {/* Botão "ver tabela" */}
          <Link
            to={slug ? `/escritorio?slug=${slug}` : '/escritorio'}
            style={{
              fontSize:     12,
              color:        '#02909A',
              border:       '1px solid #01696F55',
              padding:      '4px 12px',
              borderRadius: 4,
              textDecoration: 'none',
              fontWeight:   600,
            }}
            aria-label="Voltar para visualização em tabela"
          >
            ← Ver tabela
          </Link>
        </div>
      </header>

      {/* ── Canvas + Sidebar ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Canvas Phaser */}
        <div
          ref={containerRef}
          style={{
            flex:       1,
            overflow:   'hidden',
            position:   'relative',
            cursor:     'grab',
            minWidth:   0,
          }}
          aria-label="Escritório virtual AURORA — mapa 2D dos agentes"
        />

        {/* Sidebar agente selecionado */}
        {sidebarOpen && (
          <AgentSidebar
            agentId={selectedAgent}
            data={selectedData}
            onClose={() => setSidebarOpen(false)}
          />
        )}
      </div>

      {/* ── Legenda mobile ──────────────────────────────────────────────── */}
      <footer
        style={{
          display:      'flex',
          gap:          16,
          padding:      '6px 16px',
          background:   '#0D1E1E',
          borderTop:    '1px solid #01696F22',
          flexShrink:   0,
          flexWrap:     'wrap',
          fontSize:     10,
          color:        '#6B9E9E',
        }}
      >
        <LegendItem color="#01696F" label="Forense" />
        <LegendItem color="#7B2D8E" label="Revisor" />
        <LegendItem color="#C9A227" label="Maestro" />
        <LegendItem color="#C9A227" label="Vertex AI" />
        <span style={{ marginLeft: 'auto', opacity: 0.5 }}>
          Scroll/pinch para zoom · Arrastar para mover
        </span>
      </footer>
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function StatusBadge({ status, phase }) {
  const COLORS = {
    running:   { bg: '#01340C', text: '#00CC44', border: '#00CC4444' },
    reviewing: { bg: '#1A0A2A', text: '#9C3DB5', border: '#9C3DB544' },
    done:      { bg: '#003010', text: '#00AA44', border: '#00AA4444' },
    error:     { bg: '#2A0000', text: '#CC0000', border: '#CC000044' },
    queued:    { bg: '#1A1A00', text: '#C9A227', border: '#C9A22744' },
  };

  const PHASE_LABELS = {
    ingest: 'COLETA', analyze: 'ANÁLISE', synthesize: 'SÍNTESE',
    review: 'REVISÃO', publish: 'PUBLICAÇÃO',
  };

  const c = COLORS[status] || COLORS.queued;
  const label = phase ? PHASE_LABELS[phase] || status?.toUpperCase() : status?.toUpperCase();

  return (
    <span
      style={{
        fontSize:     10,
        color:        c.text,
        background:   c.bg,
        border:       `1px solid ${c.border}`,
        padding:      '3px 8px',
        borderRadius: 4,
        fontWeight:   700,
        letterSpacing: '0.06em',
      }}
    >
      {label || '—'}
    </span>
  );
}

function LegendItem({ color, label }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span
        style={{
          width: 10, height: 10,
          background: color,
          borderRadius: 2,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  );
}

function AgentSidebar({ agentId, data, onClose }) {
  if (!agentId) return null;

  const state = data?.state || 'idle';
  const stateColor = STATE_COLORS[state] || '#6B7280';

  // Formata o ID para exibição
  const displayName = agentId
    .replace(/^agent_/, '')
    .replace(/^revisor_/, 'Revisor: ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  return (
    <aside
      style={{
        width:        320,
        flexShrink:   0,
        background:   '#0D1E1E',
        borderLeft:   '1px solid #01696F33',
        display:      'flex',
        flexDirection: 'column',
        overflow:     'hidden',
        zIndex:       15,
      }}
      aria-label={`Painel do agente ${displayName}`}
    >
      {/* Header sidebar */}
      <div
        style={{
          padding:      '12px 16px',
          borderBottom: '1px solid #01696F22',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: '#6B9E9E', marginBottom: 2 }}>
            AGENTE
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#E8E8E8' }}>
            {displayName}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border:     'none',
            color:      '#6B9E9E',
            fontSize:   18,
            cursor:     'pointer',
            lineHeight: 1,
            padding:    4,
          }}
          aria-label="Fechar painel"
        >
          ×
        </button>
      </div>

      {/* Estado */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #01696F22' }}>
        <div style={{ fontSize: 10, color: '#6B9E9E', marginBottom: 6 }}>ESTADO</div>
        <span
          style={{
            fontSize:   11,
            fontWeight: 700,
            color:      stateColor,
            background: `${stateColor}18`,
            border:     `1px solid ${stateColor}44`,
            padding:    '3px 10px',
            borderRadius: 4,
          }}
        >
          {STATE_LABELS[state] || state}
        </span>

        {typeof data?.progress === 'number' && (
          <div style={{ marginTop: 10 }}>
            <div
              style={{
                display:        'flex',
                justifyContent: 'space-between',
                fontSize:       10,
                color:          '#6B9E9E',
                marginBottom:   4,
              }}
            >
              <span>Progresso</span>
              <span>{data.progress}%</span>
            </div>
            <div style={{ height: 4, background: '#1A2A2A', borderRadius: 2 }}>
              <div
                style={{
                  height:      4,
                  width:       `${data.progress}%`,
                  background:  stateColor,
                  borderRadius: 2,
                  transition:  'width 0.5s ease',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Última mensagem */}
      {data?.last_msg && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #01696F22' }}>
          <div style={{ fontSize: 10, color: '#6B9E9E', marginBottom: 6 }}>
            ÚLTIMA MENSAGEM
          </div>
          <p
            style={{
              fontSize:   11,
              color:      '#C0D0D0',
              margin:     0,
              lineHeight: 1.5,
              fontStyle:  'italic',
            }}
          >
            {data.last_msg}
          </p>
        </div>
      )}

      {/* Raw JSON */}
      <div style={{ padding: '12px 16px', flex: 1, overflow: 'auto' }}>
        <div style={{ fontSize: 10, color: '#6B9E9E', marginBottom: 6 }}>
          LOG JSON
        </div>
        <pre
          style={{
            fontSize:   9,
            color:      '#4A9E8E',
            background: '#071212',
            padding:    10,
            borderRadius: 4,
            margin:     0,
            overflow:   'auto',
            maxHeight:  '100%',
            lineHeight: 1.6,
          }}
        >
          {JSON.stringify(data || { state: 'idle' }, null, 2)}
        </pre>
      </div>

      {/* Timestamps */}
      {(data?.started_at || data?.finished_at) && (
        <div
          style={{
            padding:    '8px 16px',
            borderTop:  '1px solid #01696F22',
            fontSize:   9,
            color:      '#4A6A6A',
          }}
        >
          {data.started_at && (
            <div>Início: {new Date(data.started_at).toLocaleTimeString('pt-BR')}</div>
          )}
          {data.finished_at && (
            <div>Fim: {new Date(data.finished_at).toLocaleTimeString('pt-BR')}</div>
          )}
        </div>
      )}
    </aside>
  );
}
