/**
 * Ocean Ways — Hook: useCredits
 *
 * Retorna saldo de créditos do usuário autenticado.
 * Lê do Firestore users/{uid} em tempo real (onSnapshot).
 *
 * Returns:
 *   { balance, creditsMonthly, creditsTopup, plan, loading, error }
 *
 * TODO (Maestro):
 *   [ ] Implementar com Firebase onSnapshot para saldo em tempo real
 *   [ ] Retornar loading=true enquanto aguarda primeiro snapshot
 *   [ ] Tratar erro se usuário não autenticado (retornar balance=0)
 */

// import { useState, useEffect } from 'react'
// import { doc, onSnapshot } from 'firebase/firestore'
// import { useAuth } from './useAuth'
// import { db } from '../services/firebase'

/**
 * @returns {{ balance: number, creditsMonthly: number, creditsTopup: number, plan: string, loading: boolean, error: Error|null }}
 *
 * TODO (Maestro): implementar
 */
export function useCredits() {
  // TODO: implementar com Firestore onSnapshot
  return {
    balance: 0,
    creditsMonthly: 0,
    creditsTopup: 0,
    plan: 'FREE',
    loading: false,
    error: null,
  }
}
