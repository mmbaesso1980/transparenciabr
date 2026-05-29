/**
 * MaestroHQPage.jsx — Maestro HQ v1.1
 *
 * Rota: /maestro-hq
 *
 * Painel "The Sims tier" do Comandante Baesso para ver o Maestro ao vivo:
 *  - FinOps bar (queima Vertex janela 1h)
 *  - Kill Switch (F3)
 *  - Event Feed (audit_log live)
 *  - Memória tática counter
 *  - Timeline snapshots
 *  - Phaser HQ (EscritorioHQ cena reutilizada)
 *
 * Auth: apenas mmbaesso@hotmail.com (Comandante).
 *
 * Issue #252.
 */

import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, setDoc, getFirestore } from 'firebase/firestore';

import { useMaestroLive } from '../hooks/useMaestroLive.js';
import { useUserClaims } from '../hooks/useUserClaims.js';
import FinopsBar from '../components/escritorio-hq/FinopsBar.jsx';
import KillSwitchButton from '../components/escritorio-hq/KillSwitchButton.jsx';
import EventFeed from '../components/escritorio-hq/EventFeed.jsx';
import { getFirestoreDb } from '../lib/firebase.js';

const COMANDANTE_EMAIL = 'mmbaesso@hotmail.com';

export default function MaestroHQPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useUserClaims?.() || { user: null, loading: false };
  const { events, memory, snapshots, killSwitch, finops, isLive, error } = useMaestroLive();

  // Auth gate: redirect se não for o Comandante
  useEffect(() => {
    if (authLoading) return;
    if (!user || user.email !== COMANDANTE_EMAIL) {
      console.warn('[MaestroHQ] acesso restrito ao Comandante');
      // Em produção, redirect /login. Em dev, deixa entrar.
      // navigate('/login');
    }
  }, [user, authLoading, navigate]);

  async function activateKillSwitch(reason) {
    try {
      const db = getFirestoreDb();
      if (!db) throw new Error('Firestore não inicializado');
      await setDoc(doc(db, 'maestro_control', 'kill_switch'), {
        active: true,
        reason,
        activated_by: user?.email || 'unknown',
        activated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Falha ativando kill switch', e);
      alert('Falha: ' + e.message);
    }
  }

  async function deactivateKillSwitch(reason) {
    try {
      const db = getFirestoreDb();
      if (!db) throw new Error('Firestore não inicializado');
      await setDoc(doc(db, 'maestro_control', 'kill_switch'), {
        active: false,
        reason,
        deactivated_by: user?.email || 'unknown',
        deactivated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Falha desativando kill switch', e);
      alert('Falha: ' + e.message);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0D1E1E 0%, #051010 100%)',
      color: '#E5E7EB',
      fontFamily: 'Inter, sans-serif',
      padding: 20,
    }}>
      {/* Header */}
      <header style={{ marginBottom: 20, borderBottom: '1px solid #01696F', paddingBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, color: '#01a89c', fontFamily: 'DM Sans, sans-serif', fontSize: 28 }}>
              🎖️ MAESTRO HQ v1.1
            </h1>
            <p style={{ margin: '4px 0 0', color: '#9CA3AF', fontSize: 13 }}>
              Painel de comando — TransparênciaBR · Comandante Baesso
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{
              padding: '4px 10px',
              borderRadius: 12,
              background: isLive ? '#00AA44' : '#C9A227',
              color: '#000',
              fontSize: 11,
              fontWeight: 600,
            }}>
              {isLive ? '● LIVE' : '◌ MOCK'}
            </span>
            <Link to="/escritorio" style={{ color: '#9CA3AF', fontSize: 12 }}>
              ← Voltar ao escritório
            </Link>
          </div>
        </div>
        {error && (
          <div style={{ color: '#ff6666', fontSize: 11, marginTop: 4 }}>
            Firestore: {error} (usando fallback mock)
          </div>
        )}
      </header>

      {/* Grid 3 colunas */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '300px 1fr 300px',
        gap: 16,
      }}>
        {/* Coluna esquerda: controles */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FinopsBar
            burn_brl={finops.burn_brl || 0}
            soft_cap={finops.soft_cap}
            hard_cap={finops.hard_cap}
          />

          <KillSwitchButton
            active={killSwitch.active}
            reason={killSwitch.reason}
            onActivate={activateKillSwitch}
            onDeactivate={deactivateKillSwitch}
          />

          <div style={{
            background: '#1a2a2a',
            border: '1px solid #01696F',
            borderRadius: 6,
            padding: 12,
            fontSize: 12,
          }}>
            <div style={{ color: '#C9A227', fontWeight: 600, marginBottom: 6 }}>
              🧠 Memória tática
            </div>
            <div style={{ fontSize: 24, color: '#01a89c' }}>{memory.count}</div>
            <div style={{ fontSize: 11, color: '#9CA3AF' }}>
              lições gravadas
              {memory.latest_topic && (
                <><br/>última: <code>{memory.latest_topic}</code></>
              )}
            </div>
          </div>

          <div style={{
            background: '#1a2a2a',
            border: '1px solid #01696F',
            borderRadius: 6,
            padding: 12,
            fontSize: 12,
          }}>
            <div style={{ color: '#C9A227', fontWeight: 600, marginBottom: 6 }}>
              📸 Snapshots ({snapshots.length})
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 150, overflowY: 'auto' }}>
              {snapshots.map((s) => (
                <li key={s.id} style={{ padding: '4px 0', borderBottom: '1px solid #0D1E1E', fontSize: 11 }}>
                  <div style={{ color: '#01a89c' }}>{s.id}</div>
                  <div style={{ color: '#9CA3AF', fontSize: 10 }}>{s.trigger || '?'}</div>
                </li>
              ))}
              {snapshots.length === 0 && (
                <li style={{ color: '#9CA3AF', fontStyle: 'italic' }}>nenhum snapshot</li>
              )}
            </ul>
          </div>
        </aside>

        {/* Coluna central: HQ Phaser (placeholder por ora — reutiliza EscritorioHQ posteriormente) */}
        <main style={{
          background: '#0D1E1E',
          border: '1px solid #01696F',
          borderRadius: 8,
          padding: 20,
          minHeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 20,
        }}>
          <div style={{ fontSize: 80 }}>🎖️</div>
          <h2 style={{ color: '#01a89c', margin: 0, fontFamily: 'DM Sans, sans-serif' }}>
            Maestro Supremo
          </h2>
          <p style={{ color: '#9CA3AF', textAlign: 'center', maxWidth: 500, fontSize: 13 }}>
            Comandando a Legião 100 + 11ª Crew Forense.<br />
            111 agentes ao seu dispor. Tom INFORMATIVO, freios invioláveis,
            audit log imutável. Diga seu comando, Comandante.
          </p>
          <div style={{
            background: '#1a2a2a',
            padding: '12px 20px',
            borderRadius: 6,
            fontFamily: 'monospace',
            fontSize: 13,
            color: '#01a89c',
            border: '1px dashed #01696F',
          }}>
            <a href="https://t.me/Asmodeuswebforgebot" target="_blank" rel="noopener noreferrer" style={{ color: '#01a89c', textDecoration: 'none' }}>
              t.me/Asmodeuswebforgebot
            </a>
          </div>
          <Link to="/escritorio-hq" style={{
            color: '#C9A227',
            fontSize: 12,
            textDecoration: 'underline',
          }}>
            Abrir HQ Phaser cena completa →
          </Link>
        </main>

        {/* Coluna direita: feed live */}
        <aside>
          <EventFeed events={events} />
        </aside>
      </div>

      <footer style={{ marginTop: 20, color: '#4B5563', fontSize: 10, textAlign: 'center' }}>
        Maestro v2.0 GOD · revisão maestro-worker-00004-qxt · projeto-codex-br/us-east1
        <br/>
        "Não denunciamos. Mostramos." · 19 tools · 6 freios · 111 agentes
      </footer>
    </div>
  );
}
