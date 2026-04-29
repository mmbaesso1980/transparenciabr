import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { signOut } from "../lib/firebase.js";

/**
 * /logout — desloga e redireciona para /
 * Útil quando você precisa de um "botão sair" só por URL.
 */
export default function LogoutPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await signOut();
      } finally {
        if (!cancelled) navigate("/", { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--bg-void)] text-[var(--text-secondary)]">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Encerrando sessão…
      </div>
    </div>
  );
}
