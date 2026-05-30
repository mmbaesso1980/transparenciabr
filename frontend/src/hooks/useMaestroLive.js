/**
 * useMaestroLive.js — Hook live do Maestro v1.2 para /maestro-hq e /escritorio-hq
 */

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  doc,
} from 'firebase/firestore';
import { getFirestoreDb } from '../lib/firebase.js';

const SOFT_CAP_BRL = 30.0;
const HARD_CAP_BRL = 80.0;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const TEN_MIN_MS = 10 * 60 * 1000;

function toMillis(v) {
  if (!v) return 0;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  const n = new Date(v).getTime();
  return Number.isFinite(n) ? n : 0;
}

function normalizeEvent(d) {
  const data = d.data();
  const ms = toMillis(data.ts || data.timestamp || data.created_at);
  return {
    id: d.id,
    ...data,
    event: data.event || data.tool || 'unknown',
    tool: data.tool || data.event || 'unknown',
    timestamp: ms ? new Date(ms).toISOString() : null,
    _ms: ms,
  };
}

const MOCK_FALLBACK = {
  events: [
    { id: 'mock-1', event: 'message.received', tool: 'message.received', timestamp: new Date().toISOString(), _ms: Date.now(), payload: { command_id: 'mock-cartman' } },
    { id: 'mock-2', event: 'reason.start', tool: 'reason.start', timestamp: new Date(Date.now() - 60000).toISOString(), _ms: Date.now() - 60000, payload: { command_id: 'mock-cartman' } },
    { id: 'mock-3', event: 'task.complete', tool: 'task.complete', timestamp: new Date(Date.now() - 120000).toISOString(), _ms: Date.now() - 120000, payload: { command_id: 'mock-cartman' } },
  ],
  memory: { count: 8, latest_topic: 'pkill-armadilha' },
  snapshots: [
    { id: 'snap-20260529-200748-abc123', trigger: 'pre-github-edit', created_at: new Date(Date.now() - 600000).toISOString() },
  ],
  killSwitch: { active: false, reason: null, activated_by: null },
  finops: { burn_brl: 4.20, soft_cap: SOFT_CAP_BRL, hard_cap: HARD_CAP_BRL, window_start: new Date(Date.now() - 1800000).toISOString() },
  isLive: false,
};

export function useMaestroLive() {
  const [events, setEvents]           = useState([]);
  const [memory, setMemory]           = useState({ count: 0, latest_topic: null });
  const [snapshots, setSnapshots]     = useState([]);
  const [killSwitch, setKillSwitch]   = useState({ active: false, reason: null, activated_by: null });
  const [finops, setFinops]           = useState({ burn_brl: 0, soft_cap: SOFT_CAP_BRL, hard_cap: HARD_CAP_BRL });
  const [isLive, setIsLive]           = useState(false);
  const [error, setError]             = useState(null);

  useEffect(() => {
    let unsubscribers = [];
    let mounted = true;

    async function setupListeners() {
      try {
        const db = getFirestoreDb();
        if (!db) throw new Error('Firestore não inicializado');

        const auditQ = query(
          collection(db, 'maestro_audit_log'),
          orderBy('ts', 'desc'),
          limit(200)
        );
        const u1 = onSnapshot(auditQ, (snap) => {
          if (!mounted) return;
          setEvents(snap.docs.map(normalizeEvent));
          setIsLive(true);
          setError(null);
        }, (err) => {
          console.warn('[useMaestroLive] audit_log error', err);
          if (mounted) {
            setError(err.message);
            setEvents(MOCK_FALLBACK.events);
          }
        });
        unsubscribers.push(u1);

        const u2 = onSnapshot(query(collection(db, 'maestro_memory')), (snap) => {
          if (!mounted) return;
          const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          const latest = docs.sort((a, b) => toMillis(b.updated_at) - toMillis(a.updated_at))[0];
          setMemory({ count: docs.length, latest_topic: latest?.id || null });
        }, (err) => console.warn('[useMaestroLive] memory error', err));
        unsubscribers.push(u2);

        const snapQ = query(collection(db, 'maestro_rollback'), orderBy('created_at', 'desc'), limit(10));
        const u3 = onSnapshot(snapQ, (snap) => {
          if (!mounted) return;
          setSnapshots(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }, (err) => console.warn('[useMaestroLive] rollback error', err));
        unsubscribers.push(u3);

        const u4 = onSnapshot(doc(db, 'maestro_control', 'kill_switch'), (d) => {
          if (!mounted) return;
          setKillSwitch(d.exists() ? d.data() : { active: false });
        }, (err) => console.warn('[useMaestroLive] killswitch error', err));
        unsubscribers.push(u4);

        const u5 = onSnapshot(doc(db, 'maestro_control', 'finops_window'), (d) => {
          if (!mounted) return;
          setFinops(d.exists()
            ? { soft_cap: SOFT_CAP_BRL, hard_cap: HARD_CAP_BRL, ...d.data() }
            : { burn_brl: 0, soft_cap: SOFT_CAP_BRL, hard_cap: HARD_CAP_BRL });
        }, (err) => console.warn('[useMaestroLive] finops error', err));
        unsubscribers.push(u5);
      } catch (err) {
        console.error('[useMaestroLive] setup failed, usando mock', err);
        if (mounted) {
          setError(err.message);
          setEvents(MOCK_FALLBACK.events);
          setMemory(MOCK_FALLBACK.memory);
          setSnapshots(MOCK_FALLBACK.snapshots);
          setKillSwitch(MOCK_FALLBACK.killSwitch);
          setFinops(MOCK_FALLBACK.finops);
          setIsLive(false);
        }
      }
    }

    setupListeners();
    return () => {
      mounted = false;
      unsubscribers.forEach((u) => { try { u(); } catch (e) { /* noop */ } });
    };
  }, []);

  const hqMetrics = useMemo(() => {
    const now = Date.now();
    const last24h = events.filter((ev) => ev._ms && now - ev._ms <= DAY_MS);
    const last1h = events.filter((ev) => ev._ms && now - ev._ms <= HOUR_MS);
    const recentReason = events.find((ev) => ev.event === 'reason.start' && ev._ms && now - ev._ms <= TEN_MIN_MS);
    const findingEvents = last24h.filter((ev) => /^finding\./.test(ev.event || '') || ev.event === 'task.complete');
    const commandIds = new Set(last1h.map((ev) => ev.payload?.command_id).filter(Boolean));
    return {
      findingsCount: findingEvents.length,
      findingsTotal: Math.max(55, findingEvents.length || 55),
      phase: recentReason?.payload?.command_id || 'idle',
      activeAgents: commandIds.size,
      totalAgents: 23,
      eta: '—',
      etaSeconds: null,
      status: commandIds.size > 0 ? 'running' : 'queued',
    };
  }, [events]);

  return { events, memory, snapshots, killSwitch, finops, isLive, error, hqMetrics };
}
