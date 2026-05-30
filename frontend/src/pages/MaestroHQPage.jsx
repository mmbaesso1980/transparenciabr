/**
 * MaestroHQPage.jsx — Maestro HQ v2.0 — Capricho Extraordinário Cartman Edition
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';

import { useMaestroLive } from '../hooks/useMaestroLive.js';
import { useUserClaims } from '../hooks/useUserClaims.js';
import FinopsBar from '../components/escritorio-hq/FinopsBar.jsx';
import KillSwitchButton from '../components/escritorio-hq/KillSwitchButton.jsx';
import { getFirestoreDb } from '../lib/firebase.js';

const COMANDANTE_EMAILS = new Set(['mmbaesso@hotmail.com', 'manusalt13@gmail.com']);
const COMANDANTE_CHAT_ID = 6483072695;

const COMMAND_PLACEHOLDERS = [
  '/maestro resumir últimos eventos',
  '/maestro queimar 5 reais Vertex',
  '/maestro abrir dossiê PROCON-PA',
  '/maestro estado da Legião 100',
  '/maestro contar piada do Cartman',
];

const HEADER_QUOTES = [
  'Respect mah authoritah!',
  "I'm not fat, I'm big-boned.",
  "Screw you guys, I'm going home — but only after closing all tickets.",
  'Kewl!',
  'Goddammit Kyle.',
  'Não denunciamos. Mostramos.',
];

const STAN_WISDOM = [
  'Dude, this is pretty wack.',
  "I learned somethin' today.",
  "We don't need a war on freedom.",
  'Sometimes the right answer is to calm down and read the logs.',
  'If it smells like panic, put it behind a freio.',
  'The truth is usually less loud than the rumor.',
  'Dude, evidence first. Always.',
  'You cannot fix production with vibes alone.',
  'A good rollback is just compassion with timestamps.',
  'Maybe we should ask Wendy to check the Firestore rules.',
];

const EVENT_CHARACTERS = {
  cartman: { hat: '#40A7E3', trim: '#F6D04D', coat: '#D9291C', skin: '#F2C8A2', hair: '#6B2D12', caption: 'Respect mah authoritah!' },
  garrison: { hat: '#8B6B43', trim: '#FFFFFF', coat: '#4FA35A', skin: '#F2C8A2', hair: '#BDBDBD', caption: "Mr. Garrison's chalk duty" },
  kenny: { hat: '#F07A20', trim: '#6B2D12', coat: '#F07A20', skin: '#C77F4A', hair: '#6B2D12', caption: 'Mmph mmph! Telegram.' },
  stan: { hat: '#2F6DE0', trim: '#D9291C', coat: '#7A3B20', skin: '#F2C8A2', hair: '#3B2314', caption: 'Stan is reasoning.' },
  kyle: { hat: '#3BB54A', trim: '#1D7D32', coat: '#F07A20', skin: '#F2C8A2', hair: '#F07A20', caption: 'Kyle checked GitHub.' },
  token: { hat: '#2B2B2B', trim: '#FFFFFF', coat: '#6D4C41', skin: '#8D5524', hair: '#111111', caption: 'Token ran shell.' },
  wendy: { hat: '#7B3FA1', trim: '#6E2B8A', coat: '#F48CC8', skin: '#F2C8A2', hair: '#111111', caption: 'Wendy wrote Firestore.' },
  butters: { hat: '#F7D25C', trim: '#F7D25C', coat: '#8DD7F7', skin: '#F2C8A2', hair: '#F7D25C', caption: 'Oh hamburgers!' },
  tweek: { hat: '#F7D25C', trim: '#FFFFFF', coat: '#8DD7F7', skin: '#F2C8A2', hair: '#F7D25C', caption: 'Tweek is twitchy.' },
};

const SNOWFLAKES = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  left: (i * 17 + 9) % 100,
  size: 2 + (i % 4),
  delay: -(i * 0.7),
  duration: 9 + (i % 7),
  drift: i % 2 === 0 ? 18 : -18,
  opacity: 0.25 + ((i % 5) * 0.1),
}));

function useRotatingIndex(length, intervalMs) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!length) return undefined;
    const timer = setInterval(() => setIndex((n) => (n + 1) % length), intervalMs);
    return () => clearInterval(timer);
  }, [length, intervalMs]);
  return index;
}

function useAnimatedNumber(target, duration = 600) {
  const [value, setValue] = useState(Number(target) || 0);
  const previous = useRef(Number(target) || 0);

  useEffect(() => {
    const next = Number(target) || 0;
    const from = previous.current;
    if (from === next) return undefined;
    let raf = 0;
    const started = performance.now();
    const tick = (now) => {
      const pct = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - pct, 3);
      setValue(from + (next - from) * eased);
      if (pct < 1) raf = requestAnimationFrame(tick);
      else previous.current = next;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return Math.round(value);
}

function relativeTime(iso) {
  if (!iso) return '?';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '?';
  if (ms < 60000) return `${Math.max(0, Math.floor(ms / 1000))}s atrás`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}min atrás`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h atrás`;
  return `${Math.floor(ms / 86400000)}d atrás`;
}

function shortText(value, max = 38) {
  const text = String(value || 'unknown');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function eventCharacterFor(ev) {
  const key = `${ev?.event || ''} ${ev?.tool || ''}`.toLowerCase();
  if (key.includes('freio')) return 'cartman';
  if (key.includes('vertex')) return 'garrison';
  if (key.includes('telegram')) return 'kenny';
  if (key.includes('reason')) return 'stan';
  if (key.includes('github')) return 'kyle';
  if (key.includes('shell')) return 'token';
  if (key.includes('firestore')) return 'wendy';
  if (key.includes('task.complete') || key.includes('task_complete')) return 'butters';
  return 'tweek';
}

function KidPixelIcon({ type = 'tweek', size = 24 }) {
  const pal = EVENT_CHARACTERS[type] || EVENT_CHARACTERS.tweek;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={pal.caption} style={{ imageRendering: 'pixelated', display: 'block' }}>
      <rect x="5" y="20" width="14" height="2" fill="rgba(0,0,0,.35)" />
      <rect x="7" y="13" width="10" height="7" rx="2" fill={pal.coat} />
      <rect x="11" y="13" width="2" height="7" fill={pal.trim} opacity=".9" />
      <rect x="4" y="15" width="4" height="4" rx="1" fill={pal.coat} />
      <rect x="16" y="15" width="4" height="4" rx="1" fill={pal.coat} />
      <circle cx="12" cy="9" r="7" fill={pal.skin} />
      {type === 'kenny' ? (
        <>
          <circle cx="12" cy="9" r="8" fill={pal.hat} />
          <circle cx="12" cy="9" r="5" fill={pal.trim} />
          <circle cx="12" cy="9" r="3.6" fill={pal.skin} />
        </>
      ) : type === 'kyle' ? (
        <>
          <rect x="4" y="2" width="16" height="5" rx="1" fill={pal.hat} />
          <rect x="3" y="5" width="4" height="6" rx="1" fill={pal.hat} />
          <rect x="17" y="5" width="4" height="6" rx="1" fill={pal.hat} />
        </>
      ) : type === 'wendy' ? (
        <>
          <rect x="5" y="2" width="14" height="5" rx="2" fill={pal.hat} />
          <rect x="7" y="1" width="10" height="3" rx="1" fill={pal.hat} />
          <rect x="5" y="7" width="14" height="2" fill={pal.hair} />
        </>
      ) : (
        <>
          <rect x="5" y="2" width="14" height="4" rx="1" fill={pal.hat} />
          <rect x="4" y="5" width="16" height="3" rx="1" fill={pal.trim} />
          <rect x="8" y="1" width="8" height="2" rx="1" fill={pal.hat} />
          {(type === 'butters' || type === 'tweek' || type === 'garrison') && <rect x="7" y="7" width="10" height="2" fill={pal.hair} />}
        </>
      )}
      <ellipse cx="9" cy="9" rx="2.2" ry="2.8" fill="#fff" />
      <ellipse cx="15" cy="9" rx="2.2" ry="2.8" fill="#fff" />
      <rect x="9" y="9" width="1.5" height="1.5" fill="#111" />
      <rect x="14" y="9" width="1.5" height="1.5" fill="#111" />
      <rect x="10" y="13" width="4" height="1.2" fill={pal.hair} />
    </svg>
  );
}

function CartmanPixelAvatar({ size = 64, center = false, isLive = false }) {
  const ref = useRef(null);
  const scale = size / 160;

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onMove = (event) => {
      const rect = el.getBoundingClientRect();
      const dx = Math.max(-2, Math.min(2, ((event.clientX - (rect.left + rect.width / 2)) / rect.width) * 4));
      const dy = Math.max(-2, Math.min(2, ((event.clientY - (rect.top + rect.height / 2)) / rect.height) * 4));
      el.style.setProperty('--pupil-x', `${dx}px`);
      el.style.setProperty('--pupil-y', `${dy}px`);
    };
    const onLeave = () => {
      el.style.setProperty('--pupil-x', '0px');
      el.style.setProperty('--pupil-y', '0px');
    };
    window.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  const px = (n) => n * scale;
  const breathing = center ? 'cartmanBreath 3s ease-in-out infinite' : 'cartmanBreathTiny 3s ease-in-out infinite';

  return (
    <div style={{ position: 'relative', width: size, height: center ? size + 18 : size, flex: '0 0 auto' }}>
      <div
        ref={ref}
        className={`cartmanAvatar ${center ? 'cartmanCenter' : 'cartmanHeader'} ${isLive ? 'cartmanLive' : ''}`}
        title="Cartman = Maestro"
        aria-label={center ? 'Avatar grande do Cartman Maestro' : 'Avatar do Cartman Maestro'}
        style={{
          '--pupil-x': '0px',
          '--pupil-y': '0px',
          width: size,
          height: size,
          position: 'relative',
          imageRendering: 'pixelated',
          animation: breathing,
          transformOrigin: '50% 82%',
          filter: center ? 'drop-shadow(0 16px 24px rgba(0,0,0,.35))' : 'drop-shadow(0 7px 10px rgba(0,0,0,.35))',
        }}
      >
        {/* head: 60% of total height */}
        <div style={{ position: 'absolute', left: px(30), top: px(20), width: px(100), height: px(96), background: '#F2C8A2', border: `${Math.max(1, px(2))}px solid #D8A37B`, borderRadius: '50% 50% 46% 46%' }} />
        {/* hair tuft under hat */}
        <div style={{ position: 'absolute', left: px(47), top: px(50), width: px(66), height: px(16), background: '#6B2D12', borderRadius: px(8) }} />
        {/* hat and trim */}
        <div style={{ position: 'absolute', left: px(26), top: px(15), width: px(108), height: px(36), background: '#40A7E3', borderRadius: `${px(24)}px ${px(24)}px ${px(10)}px ${px(10)}px`, border: `${Math.max(1, px(2))}px solid #135B8A` }} />
        <div style={{ position: 'absolute', left: px(22), top: px(43), width: px(116), height: px(14), background: '#F6D04D', borderRadius: px(8), border: `${Math.max(1, px(2))}px solid #C9A227` }} />
        <div style={{ position: 'absolute', left: px(72), top: px(2), width: px(16), height: px(20), background: '#40A7E3', transform: 'rotate(45deg)', border: `${Math.max(1, px(2))}px solid #135B8A` }} />
        <div style={{ position: 'absolute', left: px(75), top: px(0), width: px(10), height: px(10), background: '#F6D04D', borderRadius: '50%', border: `${Math.max(1, px(1))}px solid #C9A227` }} />
        {/* cheeks */}
        <div style={{ position: 'absolute', left: px(38), top: px(82), width: px(18), height: px(14), background: 'rgba(239, 112, 116, .42)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', right: px(38), top: px(82), width: px(18), height: px(14), background: 'rgba(239, 112, 116, .42)', borderRadius: '50%' }} />
        {/* eyes */}
        <div className="cartmanEye leftEye" style={{ position: 'absolute', left: px(45), top: px(62), width: px(31), height: px(39), background: '#fff', borderRadius: '50%', border: `${Math.max(1, px(2))}px solid #111`, overflow: 'hidden' }}>
          <div className="cartmanPupil" style={{ position: 'absolute', left: '50%', top: '50%', width: px(6), height: px(8), marginLeft: px(-3), marginTop: px(-4), background: '#111', borderRadius: '50%', transform: 'translate(var(--pupil-x), var(--pupil-y))' }} />
          <div className="cartmanRedEye" style={{ position: 'absolute', inset: 0, background: 'rgba(255,0,0,.55)', opacity: 0 }} />
        </div>
        <div className="cartmanEye rightEye" style={{ position: 'absolute', right: px(45), top: px(62), width: px(31), height: px(39), background: '#fff', borderRadius: '50%', border: `${Math.max(1, px(2))}px solid #111`, overflow: 'hidden' }}>
          <div className="cartmanPupil" style={{ position: 'absolute', left: '50%', top: '50%', width: px(6), height: px(8), marginLeft: px(-3), marginTop: px(-4), background: '#111', borderRadius: '50%', transform: 'translate(var(--pupil-x), var(--pupil-y))' }} />
          <div className="cartmanRedEye" style={{ position: 'absolute', inset: 0, background: 'rgba(255,0,0,.55)', opacity: 0 }} />
        </div>
        {/* mouth */}
        <div className="cartmanMouth" style={{ position: 'absolute', left: px(66), top: px(101), width: px(29), height: px(5), background: '#6B2D12', borderRadius: px(5), border: `${Math.max(1, px(1))}px solid #431B0B` }} />
        {/* body and mittens */}
        <div style={{ position: 'absolute', left: px(36), top: px(112), width: px(88), height: px(40), background: '#D9291C', borderRadius: `${px(18)}px ${px(18)}px ${px(8)}px ${px(8)}px`, border: `${Math.max(1, px(2))}px solid #8E160D` }} />
        <div style={{ position: 'absolute', left: px(77), top: px(113), width: px(8), height: px(38), background: '#F6D04D', borderLeft: `${Math.max(1, px(1))}px solid #C9A227`, borderRight: `${Math.max(1, px(1))}px solid #C9A227` }} />
        <div style={{ position: 'absolute', left: px(22), top: px(124), width: px(25), height: px(20), background: '#F6D04D', borderRadius: '48% 35% 45% 55%', border: `${Math.max(1, px(2))}px solid #C9A227`, transform: 'rotate(12deg)' }} />
        <div style={{ position: 'absolute', right: px(22), top: px(124), width: px(25), height: px(20), background: '#F6D04D', borderRadius: '35% 48% 55% 45%', border: `${Math.max(1, px(2))}px solid #C9A227`, transform: 'rotate(-12deg)' }} />
      </div>
      {center && <div style={{ position: 'absolute', left: '12%', right: '12%', bottom: 1, height: 18, background: 'radial-gradient(ellipse at center, rgba(0,0,0,.42), rgba(0,0,0,0) 70%)', borderRadius: '50%' }} />}
    </div>
  );
}

function CommandInput({ user }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('idle');
  const [lastCommands, setLastCommands] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const inputRef = useRef(null);
  const placeholderIndex = useRotatingIndex(COMMAND_PLACEHOLDERS.length, 4000);
  const canWrite = Boolean(user?.email && COMANDANTE_EMAILS.has(user.email));
  const commandIds = useMemo(() => lastCommands.map((cmd) => cmd.id).join('|'), [lastCommands]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!commandIds) return undefined;
    const db = getFirestoreDb();
    if (!db) return undefined;
    const unsubs = commandIds.split('|').filter(Boolean).map((id) => onSnapshot(doc(db, 'maestro_commands_inbox', id), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setLastCommands((prev) => prev.map((cmd) => (cmd.id === id ? {
        ...cmd,
        status: data.status || cmd.status || 'queued',
        updatedAt: data.updated_at || data.processed_at || data.ts || cmd.updatedAt,
      } : cmd)));
    }, () => {
      setLastCommands((prev) => prev.map((cmd) => (cmd.id === id ? { ...cmd, status: 'offline' } : cmd)));
    }));
    return () => unsubs.forEach((unsub) => { try { unsub(); } catch (_) { /* noop */ } });
  }, [commandIds]);

  async function submit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || status === 'sending') return;
    if (!canWrite) {
      setStatus('error');
      setErrorMessage('Somente o Comandante (mmbaesso@hotmail.com ou manusalt13@gmail.com) pode escrever no inbox.');
      setTimeout(() => setStatus('idle'), 2200);
      return;
    }
    setStatus('sending');
    setErrorMessage('');
    try {
      const db = getFirestoreDb();
      if (!db) throw new Error('Firestore não inicializado');
      const ref = await addDoc(collection(db, 'maestro_commands_inbox'), {
        text: trimmed,
        ts: serverTimestamp(),
        chat_id: COMANDANTE_CHAT_ID,
        source: 'hq-web',
        status: 'queued',
        created_by_uid: user?.uid || null,
        created_by_email: user?.email || null,
      });
      setLastCommands((prev) => [{ id: ref.id, text: trimmed, status: 'queued' }, ...prev].slice(0, 3));
      setText('');
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setStatus('error');
      setErrorMessage(err?.message || 'Falha ao enfileirar comando.');
      setTimeout(() => setStatus('idle'), 2600);
    }
  }

  const buttonLabel = status === 'sending' ? 'Enviando' : status === 'success' ? 'Enfileirado' : status === 'error' ? 'Erro' : 'Enviar';

  return (
    <form onSubmit={submit} style={{ width: '100%', maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label htmlFor="maestro-command-input" style={{ color: '#F6D04D', fontWeight: 900, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Comando Direto — Firestore inbox
        </label>
        <span style={{ color: canWrite ? '#9BE6B2' : '#FF9A9A', fontSize: 11, fontWeight: 700 }}>
          {canWrite ? `writer autorizado: ${user?.email}` : 'somente o Comandante (mmbaesso@hotmail.com / manusalt13@gmail.com) escreve'} · Ctrl/Cmd+K to focus
        </span>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
        <input
          id="maestro-command-input"
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={COMMAND_PLACEHOLDERS[placeholderIndex]}
          aria-label="Enviar comando ao Maestro"
          disabled={!canWrite}
          style={{
            flex: 1,
            minWidth: 0,
            height: 60,
            background: 'linear-gradient(180deg, rgba(7,18,18,.98), rgba(12,34,34,.98))',
            border: '2px solid rgba(1,105,111,.78)',
            color: '#F8FAFC',
            padding: '0 18px',
            borderRadius: 16,
            fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
            fontSize: 15,
            outline: 'none',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.04), 0 10px 24px rgba(0,0,0,.20)',
            transition: 'border-color .18s ease, box-shadow .18s ease, transform .18s ease',
            opacity: canWrite ? 1 : 0.62,
          }}
          className="commandInputGlow"
        />
        <button
          type="submit"
          disabled={!text.trim() || status === 'sending' || !canWrite}
          aria-label="Enviar comando direto ao Maestro"
          className={`commandSubmit ${status === 'error' ? 'commandShake' : ''}`}
          style={{
            height: 60,
            minWidth: 150,
            background: status === 'sending' ? '#F6D04D' : status === 'success' ? '#00AA44' : '#D9291C',
            color: status === 'sending' ? '#2B1B00' : '#fff',
            border: '2px solid #F6D04D',
            borderRadius: 16,
            padding: '0 18px',
            fontWeight: 950,
            letterSpacing: '.04em',
            cursor: (!text.trim() || status === 'sending' || !canWrite) ? 'not-allowed' : 'pointer',
            boxShadow: '0 14px 28px rgba(217,41,28,.25), inset 0 -4px 0 rgba(0,0,0,.18)',
            display: 'inline-flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8,
            opacity: (!text.trim() || status === 'sending' || !canWrite) ? 0.7 : 1,
            transition: 'transform .16s ease, filter .16s ease, background .16s ease',
          }}
        >
          {status === 'sending' && <span className="spinner" aria-hidden="true" />}
          {status === 'success' && <span aria-hidden="true">✓</span>}
          {buttonLabel}
        </button>
      </div>
      <div role="status" aria-live="polite" style={{ minHeight: 18, color: status === 'error' ? '#FF9A9A' : '#A8C7C7', fontSize: 12 }}>
        {status === 'success' && 'Comando enfileirado. O worker atualizará queued → processing → done.'}
        {status === 'sending' && 'Transmitindo para o inbox do Maestro…'}
        {status === 'error' && errorMessage}
        {status === 'idle' && 'Digite uma ordem objetiva. O Maestro respeita freios, finops e audit log.'}
      </div>
      {lastCommands.length > 0 && (
        <div aria-label="Últimos comandos enviados" tabIndex={0} style={{ display: 'grid', gap: 7, padding: 10, borderRadius: 14, background: 'rgba(7,18,18,.72)', border: '1px solid rgba(1,105,111,.55)', boxShadow: 'inset 0 0 24px rgba(1,168,156,.06)' }}>
          {lastCommands.map((cmd) => <CommandStatusRow key={cmd.id} command={cmd} />)}
        </div>
      )}
    </form>
  );
}

function CommandStatusRow({ command }) {
  const color = command.status === 'done' ? '#9BE6B2' : command.status === 'processing' ? '#F6D04D' : command.status === 'offline' ? '#FF9A9A' : '#9FD6FF';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', fontSize: 11 }}>
      <span style={{ color: '#D7EEEE', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{command.text}</span>
      <span style={{ color, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em' }}>{command.status || 'queued'}</span>
    </div>
  );
}

function metricStatus(kind, current, total) {
  if (kind === 'findings') {
    if (current > 45) return 'critical';
    if (current >= 30) return 'warning';
    return 'healthy';
  }
  if (kind === 'agents') {
    const pct = total ? current / total : 0;
    if (pct < 0.2) return 'critical';
    if (pct < 0.5) return 'warning';
    return 'healthy';
  }
  return 'healthy';
}

function MetricIcon({ type, color }) {
  const common = { width: 34, height: 34, viewBox: '0 0 34 34', style: { imageRendering: 'pixelated', display: 'block' }, 'aria-hidden': true };
  if (type === 'medal') return <svg {...common}><rect x="12" y="3" width="4" height="10" fill="#2F6DE0"/><rect x="18" y="3" width="4" height="10" fill="#D9291C"/><circle cx="17" cy="20" r="10" fill={color}/><circle cx="17" cy="20" r="5" fill="#F6D04D"/></svg>;
  if (type === 'people') return <svg {...common}><circle cx="12" cy="12" r="5" fill="#F2C8A2"/><circle cx="22" cy="12" r="5" fill="#F2C8A2"/><rect x="6" y="18" width="12" height="10" rx="3" fill={color}/><rect x="16" y="18" width="12" height="10" rx="3" fill="#40A7E3"/></svg>;
  if (type === 'hourglass') return <svg {...common}><rect x="9" y="5" width="16" height="4" fill={color}/><path d="M11 9h12l-4 8 4 8H11l4-8-4-8z" fill="#0D1E1E" stroke={color} strokeWidth="3"/><rect x="9" y="25" width="16" height="4" fill={color}/><rect x="15" y="13" width="4" height="8" fill="#F6D04D"/></svg>;
  return <svg {...common}><circle cx="17" cy="17" r="12" fill="#0D1E1E" stroke={color} strokeWidth="4"/><rect x="16" y="8" width="3" height="10" fill={color}/><rect x="17" y="17" width="8" height="3" fill={color}/></svg>;
}

function MetricCard({ label, kind, icon, current = 0, total = null, text = null }) {
  const animated = useAnimatedNumber(current);
  const status = metricStatus(kind, current, total);
  const palette = status === 'critical' ? { color: '#FF5A4F', bg: 'rgba(217,41,28,.18)', border: 'rgba(255,90,79,.55)' }
    : status === 'warning' ? { color: '#F6D04D', bg: 'rgba(246,208,77,.14)', border: 'rgba(246,208,77,.48)' }
      : { color: '#6EE7A8', bg: 'rgba(0,170,68,.14)', border: 'rgba(110,231,168,.42)' };
  return (
    <div style={{ background: `linear-gradient(180deg, ${palette.bg}, rgba(7,18,18,.92))`, border: `1px solid ${palette.border}`, borderRadius: 18, padding: 12, minHeight: 92, boxShadow: '0 14px 24px rgba(0,0,0,.18), inset 0 0 0 1px rgba(255,255,255,.035)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.06)', borderRadius: 12 }}><MetricIcon type={icon} color={palette.color} /></div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#86AAAA', fontSize: 10, fontWeight: 950, letterSpacing: '.1em', textTransform: 'uppercase' }}>{label}</div>
          <div style={{ color: '#F8FAFC', fontSize: 20, fontWeight: 950, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {text || (total !== null ? `${animated}/${total}` : animated)}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 8, color: palette.color, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em' }}>{status}</div>
    </div>
  );
}

function ClassroomEventFeed({ events = [], maxItems = 20 }) {
  const visible = events.slice(0, maxItems);
  return (
    <div style={{ background: '#8A5A26', border: '3px solid #C8913D', borderRadius: 18, padding: 10, boxShadow: '0 18px 36px rgba(0,0,0,.34), inset 0 0 0 3px rgba(75,42,14,.55)' }}>
      <div style={{ background: '#133F31', border: '2px solid #0A2A20', borderRadius: 11, padding: 14, minHeight: 520, maxHeight: 680, overflowY: 'auto', boxShadow: 'inset 0 0 44px rgba(0,0,0,.34)', color: '#E9F6DF', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10, borderBottom: '1px dashed rgba(233,246,223,.28)', paddingBottom: 9 }}>
          <div>
            <h4 style={{ margin: 0, color: '#F6D04D', fontSize: 14, letterSpacing: '.04em' }}>Mr. Garrison's Class Whiteboard</h4>
            <div style={{ color: 'rgba(233,246,223,.72)', fontSize: 11 }}>Audit log live ({visible.length}) · chalk edition</div>
          </div>
          <KidPixelIcon type="garrison" size={30} />
        </div>
        {visible.length === 0 ? (
          <div style={{ color: 'rgba(233,246,223,.70)', fontStyle: 'italic', textAlign: 'center', padding: 28, border: '1px dashed rgba(233,246,223,.25)', borderRadius: 10 }}>
            Sem eventos ainda. O Maestro está no recreio.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {visible.map((ev) => {
              const type = eventCharacterFor(ev);
              const pal = EVENT_CHARACTERS[type];
              return (
                <li key={ev.id} style={{ display: 'grid', gridTemplateColumns: '30px 1fr auto', gap: 9, alignItems: 'center', padding: '8px 7px', borderRadius: 10, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(233,246,223,.12)' }} title={pal.caption}>
                  <KidPixelIcon type={type} size={24} />
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ color: '#D6FFD6', fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortText(ev.tool || ev.event, 34)}</strong>
                    <span style={{ color: 'rgba(233,246,223,.68)', fontSize: 10 }}>
                      {relativeTime(ev.timestamp)}{ev.latency_ms ? ` · ${ev.latency_ms}ms` : ''}
                    </span>
                  </span>
                  {Number(ev.cost_brl) > 0 && <span style={{ color: '#F6D04D', fontSize: 10, fontWeight: 900 }}>R$ {Number(ev.cost_brl).toFixed(3)}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Snowflakes() {
  return <div aria-hidden="true" className="snowLayer">{SNOWFLAKES.map((flake) => <span key={flake.id} className="snowflake" style={{ left: `${flake.left}%`, width: flake.size, height: flake.size, opacity: flake.opacity, animationDelay: `${flake.delay}s`, animationDuration: `${flake.duration}s`, '--drift': `${flake.drift}px` }} />)}</div>;
}

function QuoteBar() {
  const quoteIndex = useRotatingIndex(HEADER_QUOTES.length, 6000);
  return (
    <div style={{ position: 'relative', height: 34, overflow: 'hidden', borderRadius: 999, background: 'linear-gradient(90deg, rgba(217,41,28,.15), rgba(246,208,77,.12), rgba(1,105,111,.18))', border: '1px solid rgba(246,208,77,.26)', boxShadow: 'inset 0 0 24px rgba(246,208,77,.05)' }}>
      <div className="quoteScan" aria-hidden="true" />
      {HEADER_QUOTES.map((quote, i) => (
        <div key={quote} className="quoteItem" style={{ opacity: i === quoteIndex ? 1 : 0, transform: i === quoteIndex ? 'translateY(0)' : 'translateY(8px)', position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#F6D04D', fontSize: 12, fontWeight: 900, letterSpacing: '.04em', transition: 'opacity .7s ease, transform .7s ease' }}>
          “{quote}”
        </div>
      ))}
    </div>
  );
}

function StanWisdomBox() {
  const quoteIndex = useRotatingIndex(STAN_WISDOM.length, 8000);
  return (
    <div style={{ position: 'fixed', left: 18, bottom: 18, width: 252, zIndex: 5, background: 'linear-gradient(180deg, rgba(20,42,52,.96), rgba(9,25,31,.96))', border: '2px solid rgba(47,109,224,.8)', borderRadius: 18, padding: 12, color: '#EAF4FF', boxShadow: '0 20px 40px rgba(0,0,0,.32)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
        <KidPixelIcon type="stan" size={28} />
        <div style={{ color: '#9FD6FF', fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '.09em' }}>Stan Marsh's Wisdom Box</div>
      </div>
      <div style={{ position: 'relative', minHeight: 34 }}>
        {STAN_WISDOM.map((quote, i) => <p key={quote} style={{ position: i === quoteIndex ? 'relative' : 'absolute', inset: 0, margin: 0, color: '#EAF4FF', fontSize: 12, lineHeight: 1.35, opacity: i === quoteIndex ? 1 : 0, transition: 'opacity .8s ease' }}>“{quote}”</p>)}
      </div>
    </div>
  );
}

function RoadSignFooter() {
  return (
    <footer style={{ marginTop: 28, display: 'grid', placeItems: 'center', paddingBottom: 82 }}>
      <div style={{ position: 'relative', width: 'min(520px, 92vw)', background: '#F6D04D', color: '#201600', border: '4px solid #201600', borderRadius: 18, padding: '16px 22px', textAlign: 'center', fontWeight: 950, letterSpacing: '.06em', boxShadow: '0 18px 34px rgba(0,0,0,.35), inset 0 0 0 3px rgba(255,255,255,.25)', transform: 'rotate(-1deg)' }}>
        <div style={{ position: 'absolute', left: '12%', bottom: -38, width: 10, height: 38, background: '#5A3A15', border: '2px solid #201600', borderTop: 0 }} />
        <div style={{ position: 'absolute', right: '12%', bottom: -38, width: 10, height: 38, background: '#5A3A15', border: '2px solid #201600', borderTop: 0 }} />
        MAESTRO HQ — Belém ↔ South Park, CO
        <div style={{ marginTop: 5, fontSize: 10, letterSpacing: '.02em', fontWeight: 800 }}>Maestro worker v2.1.4 · 19 tools · 6 freios · “Não denunciamos. Mostramos.”</div>
      </div>
    </footer>
  );
}

function SideCard({ title, children }) {
  return (
    <div style={{ background: 'linear-gradient(180deg, rgba(26,42,42,.95), rgba(9,26,26,.95))', border: '1px solid rgba(1,105,111,.85)', borderRadius: 16, padding: 13, fontSize: 12, boxShadow: '0 16px 30px rgba(0,0,0,.20), inset 0 0 0 1px rgba(255,255,255,.03)' }}>
      <div style={{ color: '#F6D04D', fontWeight: 950, marginBottom: 8, letterSpacing: '.04em' }}>{title}</div>
      {children}
    </div>
  );
}

export default function MaestroHQPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useUserClaims?.() || { user: null, loading: false };
  const { events, memory, snapshots, killSwitch, finops, isLive, error, hqMetrics } = useMaestroLive();

  useEffect(() => {
    if (authLoading) return;
    if (!user || !COMANDANTE_EMAILS.has(user.email)) {
      console.warn('[MaestroHQ] acesso restrito ao Comandante (mmbaesso@hotmail.com / manusalt13@gmail.com)');
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

  const findingsCount = Number(hqMetrics?.findingsCount || 0);
  const findingsTotal = Number(hqMetrics?.findingsTotal || 55);
  const activeAgents = Number(hqMetrics?.activeAgents || 0);
  const totalAgents = Number(hqMetrics?.totalAgents || 23);

  return (
    <div style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden', background: 'radial-gradient(circle at 20% -10%, rgba(64,167,227,.20), transparent 36%), radial-gradient(circle at 100% 0%, rgba(217,41,28,.13), transparent 34%), linear-gradient(180deg, #101820 0%, #082020 48%, #051010 100%)', color: '#E5E7EB', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', padding: 20 }}>
      <Snowflakes />
      <style>{`
        @keyframes snowFall { 0% { transform: translate3d(0,-12vh,0); } 100% { transform: translate3d(var(--drift),112vh,0); } }
        @keyframes cartmanBreath { 0%,100% { transform: scale(1); } 50% { transform: scale(1.02); } }
        @keyframes cartmanBreathTiny { 0%,100% { transform: scale(1); } 50% { transform: scale(1.02); } }
        @keyframes mouthLive { 0%,48%,100% { height: 5px; border-radius: 8px; } 52%,82% { height: 13px; border-radius: 45%; transform: translateY(-3px); } }
        @keyframes commandFocusPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(1,168,156,.28), inset 0 0 0 1px rgba(255,255,255,.04), 0 10px 24px rgba(0,0,0,.20); } 50% { box-shadow: 0 0 0 7px rgba(1,168,156,.08), 0 0 26px rgba(1,168,156,.35), inset 0 0 0 1px rgba(255,255,255,.05); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shake { 10%,90% { transform: translateX(-1px); } 20%,80% { transform: translateX(2px); } 30%,50%,70% { transform: translateX(-4px); } 40%,60% { transform: translateX(4px); } }
        @keyframes quoteScan { 0% { transform: translateX(-120%); } 100% { transform: translateX(120%); } }
        .snowLayer { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
        .snowflake { position: absolute; top: -20px; border-radius: 999px; background: rgba(255,255,255,.9); filter: blur(.2px); animation: snowFall linear infinite; }
        .cartmanCenter:hover .cartmanRedEye { opacity: 1 !important; }
        .cartmanLive .cartmanMouth { animation: mouthLive 1.5s steps(2,end) infinite; }
        .commandInputGlow:focus { border-color: #01A89C !important; animation: commandFocusPulse 1.9s ease-in-out infinite; }
        .commandSubmit:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.05); }
        .commandShake { animation: shake .42s cubic-bezier(.36,.07,.19,.97) both; }
        .spinner { width: 15px; height: 15px; border: 3px solid rgba(43,27,0,.22); border-top-color: #2B1B00; border-radius: 50%; animation: spin .75s linear infinite; }
        .quoteScan { position:absolute; inset:0; width:40%; background:linear-gradient(90deg, transparent, rgba(255,255,255,.13), transparent); animation: quoteScan 4s linear infinite; }
        @media (max-width: 1180px) { .maestroGrid { grid-template-columns: 1fr !important; } .leftColumn, .rightColumn, .centerColumn { grid-column: 1 !important; grid-row: auto !important; } .stanBoxMobile { display:none !important; } }
        @media (prefers-reduced-motion: reduce) { .snowflake, .cartmanAvatar, .cartmanMouth, .spinner, .quoteScan, .commandInputGlow:focus { animation: none !important; } * { scroll-behavior: auto !important; transition-duration: .01ms !important; } }
      `}</style>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <header style={{ marginBottom: 18, borderBottom: '1px solid rgba(1,105,111,.75)', paddingBottom: 14 }}>
          <QuoteBar />
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <CartmanPixelAvatar size={64} isLive={isLive} />
              <div>
                <h1 style={{ margin: 0, color: '#F6D04D', fontFamily: 'DM Sans, Inter, sans-serif', fontSize: 30, lineHeight: 1, letterSpacing: '-.03em', textShadow: '0 4px 18px rgba(246,208,77,.18)' }}>
                  MAESTRO HQ v2.0 — Cartman Edition
                </h1>
                <p style={{ margin: '6px 0 0', color: '#A8C7C7', fontSize: 13 }}>
                  Painel de comando — TransparênciaBR · Comandante Baesso · capricho extraordinário
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ padding: '7px 12px', borderRadius: 999, background: isLive ? '#00AA44' : '#F6D04D', color: isLive ? '#FFFFFF' : '#1B1600', fontSize: 11, fontWeight: 950, boxShadow: isLive ? '0 0 0 4px rgba(0,170,68,.14)' : '0 0 0 4px rgba(246,208,77,.14)' }}>
                {isLive ? '● LIVE' : '◌ MOCK'}
              </span>
              <Link to="/escritorio" style={{ color: '#D7EEEE', fontSize: 12, fontWeight: 700, textDecoration: 'none' }} aria-label="Voltar ao escritório">
                ← Voltar ao escritório
              </Link>
            </div>
          </div>
          {error && <div style={{ color: '#FF9A9A', fontSize: 11, marginTop: 8 }}>Firestore: {error} (usando fallback mock)</div>}
        </header>

        <div className="maestroGrid" style={{ display: 'grid', gridTemplateColumns: '300px minmax(520px, 1fr) 340px', gap: 18, alignItems: 'start' }}>
          <main className="centerColumn" style={{ gridColumn: 2, gridRow: 1, background: 'linear-gradient(180deg, rgba(13,30,30,.96), rgba(7,18,18,.96))', border: '1px solid rgba(1,105,111,.82)', borderRadius: 24, padding: 24, minHeight: 642, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 18, boxShadow: '0 24px 60px rgba(0,0,0,.28), inset 0 0 0 1px rgba(255,255,255,.035)' }}>
            <CartmanPixelAvatar size={160} center isLive={isLive} />
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ color: '#F6D04D', margin: 0, fontFamily: 'DM Sans, Inter, sans-serif', fontSize: 32, lineHeight: 1, letterSpacing: '-.04em' }}>Maestro Supremo</h2>
              <div title="Cartman = Maestro" style={{ marginTop: 8, color: '#FF6A5E', fontWeight: 950, fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase' }}>Respect mah authoritah!</div>
            </div>
            <p style={{ color: '#A8C7C7', textAlign: 'center', maxWidth: 640, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              Comandando a Legião 100 + 11ª Crew Forense. Tom INFORMATIVO, freios invioláveis, audit log imutável, finops sem drama.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(122px, 1fr))', gap: 10, width: '100%', maxWidth: 760 }}>
              <MetricCard label="Findings" kind="findings" icon="medal" current={findingsCount} total={findingsTotal} />
              <MetricCard label="Fase" kind="phase" icon="clock" current={0} text={shortText(hqMetrics?.phase || 'idle', 14)} />
              <MetricCard label="Agentes" kind="agents" icon="people" current={activeAgents} total={totalAgents} />
              <MetricCard label="ETA" kind="eta" icon="hourglass" current={0} text={hqMetrics?.eta || '—'} />
            </div>
            <CommandInput user={user} />
            <Link to="/escritorio-hq" style={{ color: '#F6D04D', fontSize: 12, textDecoration: 'none', fontWeight: 900, borderBottom: '1px solid rgba(246,208,77,.5)' }} aria-label="Abrir HQ Phaser cena completa" tabIndex={-1}>
              Abrir HQ Phaser cena completa →
            </Link>
          </main>

          <aside className="leftColumn" style={{ gridColumn: 1, gridRow: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FinopsBar burn_brl={finops.burn_brl || 0} soft_cap={finops.soft_cap} hard_cap={finops.hard_cap} />
            <div aria-label="Controle de kill switch do Maestro"><KillSwitchButton active={killSwitch.active} reason={killSwitch.reason} onActivate={activateKillSwitch} onDeactivate={deactivateKillSwitch} /></div>
            <SideCard title="Memória tática">
              <div style={{ fontSize: 32, color: '#01A89C', fontWeight: 950, lineHeight: 1 }}>{memory.count}</div>
              <div style={{ fontSize: 11, color: '#A8C7C7', marginTop: 4 }}>lições gravadas{memory.latest_topic && <><br />última: <code>{memory.latest_topic}</code></>}</div>
            </SideCard>
            <SideCard title={`Snapshots (${snapshots.length})`}>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 190, overflowY: 'auto' }}>
                {snapshots.map((s) => <li key={s.id} style={{ padding: '6px 0', borderBottom: '1px solid rgba(1,105,111,.28)', fontSize: 11 }}><div style={{ color: '#D7EEEE', fontWeight: 700 }}>{s.id}</div><div style={{ color: '#A8C7C7', fontSize: 10 }}>{s.trigger || '?'}</div></li>)}
                {snapshots.length === 0 && <li style={{ color: '#A8C7C7', fontStyle: 'italic' }}>nenhum snapshot</li>}
              </ul>
            </SideCard>
          </aside>

          <aside className="rightColumn" style={{ gridColumn: 3, gridRow: 1 }}>
            <ClassroomEventFeed events={events} />
          </aside>
        </div>

        <div className="stanBoxMobile"><StanWisdomBox /></div>
        <RoadSignFooter />
      </div>
    </div>
  );
}
