/**
 * Ocean Ways — Hook: useAuth
 *
 * Retorna estado de autenticação Firebase do usuário.
 *
 * Returns:
 *   { user, loading, signOut }
 *
 * TODO (Maestro):
 *   [ ] Implementar com Firebase onAuthStateChanged
 *   [ ] Criar AuthContext e AuthProvider (usar com useContext)
 *   [ ] Implementar signOut que chama firebase signOut + redirect para /
 */

// import { useState, useEffect, createContext, useContext } from 'react'
// import { getAuth, onAuthStateChanged, signOut as fbSignOut } from 'firebase/auth'

/**
 * @returns {{ user: Object|null, loading: boolean, signOut: Function }}
 *
 * TODO (Maestro): implementar com Firebase Auth
 */
export function useAuth() {
  // TODO: implementar
  return {
    user: null,
    loading: false,
    signOut: async () => { /* TODO */ },
  }
}
