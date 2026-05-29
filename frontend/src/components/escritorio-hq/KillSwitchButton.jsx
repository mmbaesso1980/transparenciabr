/**
 * KillSwitchButton.jsx — Botão STOP do Maestro (F3 kill-switch)
 *
 * Pede senha do dia: SHA256(YYYY-MM-DD + "asmodeus_maestro_v1")[:8] em UTC.
 * Validação client-side antes de enviar para Firestore.
 *
 * Quando ativo: indicador vermelho pulsante + razão visível.
 */

import { useState } from 'react';

async function sha256(text) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function todayUtcIso() {
  return new Date().toISOString().slice(0, 10);
}

async function expectedSenha() {
  const today = todayUtcIso();
  const hash = await sha256(today + 'asmodeus_maestro_v1');
  return hash.slice(0, 8);
}

export default function KillSwitchButton({ active, reason, onActivate, onDeactivate }) {
  const [open, setOpen] = useState(false);
  const [senha, setSenha] = useState('');
  const [razao, setRazao] = useState('');
  const [err, setErr] = useState(null);

  async function handleConfirm() {
    setErr(null);
    const expected = await expectedSenha();
    if (senha.trim() !== expected) {
      setErr('Senha do dia incorreta.');
      return;
    }
    if (active) {
      onDeactivate?.(razao || 'manual deactivation');
    } else {
      if (!razao.trim()) {
        setErr('Informe a razão da ativação.');
        return;
      }
      onActivate?.(razao);
    }
    setOpen(false);
    setSenha('');
    setRazao('');
  }

  return (
    <div>
      <button
        onClick={() => setOpen(true)}
        style={{
          background: active ? '#CC0000' : '#1a2a2a',
          color: '#fff',
          border: active ? '2px solid #ff4444' : '1px solid #01696F',
          borderRadius: 6,
          padding: '8px 16px',
          fontFamily: 'Inter, sans-serif',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          animation: active ? 'killpulse 1.5s infinite' : 'none',
        }}
      >
        {active ? '🔴 KILL ATIVO — retomar' : '⛔ Kill Switch'}
      </button>
      {active && reason && (
        <div style={{ fontSize: 11, color: '#ff6666', marginTop: 4 }}>
          Razão: {reason}
        </div>
      )}

      {open && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }} onClick={() => setOpen(false)}>
          <div style={{
            background: '#0D1E1E',
            border: '2px solid #01696F',
            borderRadius: 10,
            padding: 24,
            minWidth: 340,
            color: '#E5E7EB',
            fontFamily: 'Inter, sans-serif',
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', color: active ? '#ff4444' : '#C9A227' }}>
              {active ? 'Desativar Kill Switch' : 'Ativar Kill Switch (F3)'}
            </h3>
            <p style={{ fontSize: 12, color: '#9CA3AF', margin: '0 0 12px' }}>
              {active
                ? 'Maestro será religado e retomará operação.'
                : 'Maestro parará no próximo turno do reason loop.'}
            </p>

            <label style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
              Senha do dia (8 chars):
            </label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              maxLength={8}
              autoFocus
              style={{
                width: '100%',
                background: '#1a2a2a',
                border: '1px solid #01696F',
                color: '#fff',
                padding: 8,
                borderRadius: 4,
                fontFamily: 'monospace',
                marginBottom: 12,
              }}
            />

            <label style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
              Razão:
            </label>
            <input
              type="text"
              value={razao}
              onChange={(e) => setRazao(e.target.value)}
              placeholder={active ? 'opcional' : 'obrigatório'}
              style={{
                width: '100%',
                background: '#1a2a2a',
                border: '1px solid #01696F',
                color: '#fff',
                padding: 8,
                borderRadius: 4,
                marginBottom: 12,
              }}
            />

            {err && (
              <div style={{ color: '#ff6666', fontSize: 12, marginBottom: 8 }}>{err}</div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'transparent',
                  color: '#9CA3AF',
                  border: '1px solid #4B5563',
                  padding: '8px 16px',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >Cancelar</button>
              <button
                onClick={handleConfirm}
                style={{
                  background: active ? '#01696F' : '#CC0000',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 4,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >{active ? 'Religar Maestro' : 'CONFIRMAR STOP'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes killpulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,68,68,0.7); }
          50%      { box-shadow: 0 0 0 12px rgba(255,68,68,0); }
        }
      `}</style>
    </div>
  );
}
