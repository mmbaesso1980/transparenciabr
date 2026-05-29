/**
 * useMaestroLive.js — Hook live do Maestro v1.0+ para /maestro-hq
 *
 * Listeners Firestore (projeto transparenciabr):
 *  - maestro_audit_log/* (últimos 50 eventos, desc por timestamp)
 *  - maestro_memory/* (contador de lições + última gravada)
 *  - maestro_rollback/* (últimos 10 snapshots)
 *  - maestro_control/kill_switch (estado on/off + razão)
 *  - maestro_control/finops_window (queima Vertex janela 1h)
 *
 * Fallback: se Firestore falhar, retorna mock data para DX local.
 *
 * Issue: #252 v1.1 Maestro HQ wire-up
 */

import { useEffect, useState } from 'react';
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

const MOCK_FALLBACK = {
  events: [
    { id: 'mock-1', tool: 'telegram_send', timestamp: new Date().toISOString(), latency_ms: 240, cost_brl: 0.0 },
    { id: 'mock-2', tool: 'vertex_invoke', timestamp: new Date(Date.now() - 60000).toISOString(), latency_ms: 8200, cost_brl: 0.15 },
    { id: 'mock-3', tool: 'firestore_write', timestamp: new Date(Date.now() - 120000).toISOString(), latency_ms: 50, cost_brl: 0.0 },
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

        // 1. Audit log (últimos 50)
        const auditQ = query(
          collection(db, 'maestro_audit_log'),
          orderBy('timestamp', 'desc'),
          limit(50)
        );
        const u1 = onSnapshot(
          auditQ,
          (snap) => {
            if (!mounted) return;
            setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
            setIsLive(true);
          },
          (err) => {
            console.warn('[useMaestroLive] audit_log error', err);
            if (mounted) {
              setError(err.message);
              setEvents(MOCK_FALLBACK.events);
            }
          }
        );
        unsubscribers.push(u1);

        // 2. Memory count (lê coleção e conta)
        const memQ = query(collection(db, 'maestro_memory'));
        const u2 = onSnapshot(
          memQ,
          (snap) => {
            if (!mounted) return;
            const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            const latest = docs.sort(
              (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
            )[0];
            setMemory({ count: docs.length, latest_topic: latest?.id || null });
          },
          (err) => console.warn('[useMaestroLive] memory error', err)
        );
        unsubscribers.push(u2);

        // 3. Rollback snapshots (últimos 10)
        const snapQ = query(
          collection(db, 'maestro_rollback'),
          orderBy('created_at', 'desc'),
          limit(10)
        );
        const u3 = onSnapshot(
          snapQ,
          (snap) => {
            if (!mounted) return;
            setSnapshots(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          },
          (err) => console.warn('[useMaestroLive] rollback error', err)
        );
        unsubscribers.push(u3);

        // 4. Kill switch
        const ksDoc = doc(db, 'maestro_control', 'kill_switch');
        const u4 = onSnapshot(
          ksDoc,
          (d) => {
            if (!mounted) return;
            setKillSwitch(d.exists() ? d.data() : { active: false });
          },
          (err) => console.warn('[useMaestroLive] killswitch error', err)
        );
        unsubscribers.push(u4);

        // 5. FinOps window
        const finopsDoc = doc(db, 'maestro_control', 'finops_window');
        const u5 = onSnapshot(
          finopsDoc,
          (d) => {
            if (!mounted) return;
            setFinops(
              d.exists()
                ? { soft_cap: SOFT_CAP_BRL, hard_cap: HARD_CAP_BRL, ...d.data() }
                : { burn_brl: 0, soft_cap: SOFT_CAP_BRL, hard_cap: HARD_CAP_BRL }
            );
          },
          (err) => console.warn('[useMaestroLive] finops error', err)
        );
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
      unsubscribers.forEach((u) => {
        try { u(); } catch (e) { /* noop */ }
      });
    };
  }, []);

  return { events, memory, snapshots, killSwitch, finops, isLive, error };
}
