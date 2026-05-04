/**
 * @file useUserCredits.js
 * @description Hook para obter e observar o saldo de créditos do advogado logado.
 *
 * Escuta em tempo real o documento /users/{uid} no Firestore.
 * Se o projeto já possuir este hook em outro caminho, este arquivo pode ser
 * descartado e substituído pela importação existente.
 *
 * Retorna:
 *   - credits:    número atual de créditos disponíveis
 *   - loading:    true enquanto aguarda primeira leitura
 *   - error:      erro ocorrido (ou null)
 *   - deductOptimistic(n): desconta localmente antes da resposta do servidor
 *                          (evita flash de UI inconsistente)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot }                          from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb }          from '../../lib/firebase.js';

/**
 * @typedef {Object} UseUserCreditsReturn
 * @property {number|null} credits
 * @property {boolean}     loading
 * @property {Error|null}  error
 * @property {Function}    deductOptimistic
 */

/**
 * Hook principal.
 * @returns {UseUserCreditsReturn}
 */
export function useUserCredits() {
  const [credits, setCredits] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // Ref para ajuste otimista: guarda a diferença aplicada localmente
  const optimisticDelta = useRef(0);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db   = getFirestoreDb();

    if (!auth || !db) {
      setLoading(false);
      setError(new Error('Firebase não inicializado'));
      return;
    }

    const user = auth.currentUser;

    if (!user) {
      setLoading(false);
      setError(new Error('Usuário não autenticado'));
      return;
    }

    const userRef   = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          const serverCredits = snap.data().credits ?? 0;
          // Aplicar delta otimista pendente sobre valor do servidor
          setCredits(serverCredits + optimisticDelta.current);
        } else {
          setCredits(0);
        }
        setLoading(false);
        setError(null);
        // Após sincronização, zerar delta (servidor já reflete a realidade)
        optimisticDelta.current = 0;
      },
      (err) => {
        console.error('[useUserCredits] Erro ao escutar créditos:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  /**
   * Deduz créditos localmente antes da confirmação do servidor.
   * Útil para feedback imediato na UI após chamada de Cloud Function.
   * @param {number} amount - Quantidade a deduzir
   */
  const deductOptimistic = useCallback((amount) => {
    optimisticDelta.current -= amount;
    setCredits((prev) => (prev !== null ? prev - amount : prev));
  }, []);

  return { credits, loading, error, deductOptimistic };
}
