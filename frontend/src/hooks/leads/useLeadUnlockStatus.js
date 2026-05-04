/**
 * @file useLeadUnlockStatus.js
 * @description Hook para verificar o estado de desbloqueio de um lead no Firestore.
 *
 * Consulta a coleção /lead_unlocks/{oab}_{leadId}.
 *
 * Retorna:
 *   - status: 'loading' | 'BASICO' | 'CONTATOS' | 'PETICAO'
 *   - unlockData: dados do documento de desbloqueio (ou null)
 *   - error: erro ocorrido durante consulta (ou null)
 *
 * @param {string} leadId - ID único do lead
 * @param {string} oab    - Número OAB do advogado logado (ex: "SP123456")
 */

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { getFirestoreDb } from '../../lib/firebase.js';

/**
 * Estados possíveis do lead.
 * @enum {string}
 */
export const LEAD_STATUS = {
  BASICO:   'BASICO',
  CONTATOS: 'CONTATOS',
  PETICAO:  'PETICAO',
};

/**
 * @typedef {Object} UnlockData
 * @property {string}   leadId       - ID do lead
 * @property {string}   oab          - OAB do advogado
 * @property {Date}     unlockedAt   - Data/hora do desbloqueio
 * @property {Date}     expiresAt    - Data/hora de expiração (90 dias)
 * @property {Array}    peticoes     - Histórico de petições geradas
 */

/**
 * @typedef {Object} UseLeadUnlockStatusReturn
 * @property {'loading'|'BASICO'|'CONTATOS'|'PETICAO'} status
 * @property {UnlockData|null} unlockData
 * @property {Error|null}     error
 * @property {Function}       refetch - Força nova consulta ao Firestore
 */

/**
 * Hook principal.
 * @param {string} leadId
 * @param {string} oab
 * @returns {UseLeadUnlockStatusReturn}
 */
export function useLeadUnlockStatus(leadId, oab) {
  const [status, setStatus]         = useState('loading');
  const [unlockData, setUnlockData] = useState(null);
  const [error, setError]           = useState(null);
  const [tick, setTick]             = useState(0);

  useEffect(() => {
    if (!leadId || !oab) {
      setStatus(LEAD_STATUS.BASICO);
      return;
    }

    let cancelled = false;

    async function fetchStatus() {
      setStatus('loading');
      setError(null);

      try {
        const db = getFirestoreDb();
        if (!db) {
          setStatus(LEAD_STATUS.BASICO);
          setUnlockData(null);
          return;
        }
        const docRef  = doc(db, 'lead_unlocks', `${oab}_${leadId}`);
        const docSnap = await getDoc(docRef);

        if (cancelled) return;

        if (!docSnap.exists()) {
          setStatus(LEAD_STATUS.BASICO);
          setUnlockData(null);
          return;
        }

        const data = docSnap.data();

        // Converter Timestamps do Firestore para Date JS
        const parsed = {
          ...data,
          unlockedAt: data.unlockedAt?.toDate?.() ?? null,
          expiresAt:  data.expiresAt?.toDate?.()  ?? null,
          peticoes:   data.peticoes ?? [],
        };

        // Verificar expiração (90 dias)
        const agora = new Date();
        if (parsed.expiresAt && parsed.expiresAt < agora) {
          // Desbloqueio expirado — volta ao estado básico
          setStatus(LEAD_STATUS.BASICO);
          setUnlockData(null);
          return;
        }

        // Determinar estado com base nos dados
        if (parsed.peticoes.length > 0) {
          setStatus(LEAD_STATUS.PETICAO);
        } else {
          setStatus(LEAD_STATUS.CONTATOS);
        }

        setUnlockData(parsed);
      } catch (err) {
        if (!cancelled) {
          console.error('[useLeadUnlockStatus] Erro ao consultar Firestore:', err);
          setError(err);
          setStatus(LEAD_STATUS.BASICO); // fallback seguro
        }
      }
    }

    fetchStatus();

    return () => {
      cancelled = true;
    };
  }, [leadId, oab, tick]);

  /** Força nova consulta (útil após unlock ou geração de petição) */
  const refetch = () => setTick((t) => t + 1);

  return { status, unlockData, error, refetch };
}
