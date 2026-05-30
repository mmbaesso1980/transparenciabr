/**
 * AuthContext — Radar Jurídico INSS
 *
 * Contexto de autenticação Firebase.
 * Reutiliza a mesma lógica do frontend principal
 * (frontend/src/context/AuthContext.jsx).
 *
 * Expõe:
 *   user: objeto Firebase User (null se não autenticado)
 *   loading: true durante inicialização
 *   getIdToken(): Promise<string> — token para chamadas ao backend
 *
 * TODO(maestro): implementar onAuthStateChanged e getIdToken
 * Referência: frontend/src/context/AuthContext.jsx
 *             frontend/src/hooks/useUserClaims.js
 */

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO(maestro): onAuthStateChanged já é o padrão — apenas confirmar
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  /**
   * Retorna o ID token atual para autenticar chamadas ao backend.
   * Force refresh a cada 55 minutos (tokens expiram em 60 min).
   *
   * TODO(maestro): adicionar lógica de refresh automático com retry
   */
  async function getIdToken(forceRefresh = false) {
    if (!user) throw new Error("Usuário não autenticado");
    return user.getIdToken(forceRefresh);
  }

  return (
    <AuthContext.Provider value={{ user, loading, getIdToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
