import { onAuthStateChanged } from "firebase/auth";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { getFirebaseAuth } from "../lib/firebase.js";

const AuthContext = createContext({
  user: null,
  loading: true,
  isAuthenticated: false,
  isAnonymous: false,
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return undefined;
    }
    const unsub = onAuthStateChanged(auth, (current) => {
      setUser(current);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const value = useMemo(() => {
    const isAnonymous = !!user?.isAnonymous;
    const isAuthenticated = !!user && !isAnonymous;
    return { user, loading, isAuthenticated, isAnonymous };
  }, [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
