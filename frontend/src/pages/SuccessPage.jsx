import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CheckCircle2, Coins, Loader2, ArrowRight } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";

import { getFirebaseAuth, getFirestoreDb } from "../lib/firebase.js";

/**
 * Página de sucesso pós-Checkout Stripe.
 * - Lê ?session_id=... da URL
 * - Faz onSnapshot em /usuarios/{uid} para mostrar o saldo em tempo real
 *   (o webhook stripeWebhook incrementa `creditos` ao receber checkout.session.completed)
 * - Se em até 30s o saldo não atualizar, mostra fallback com aviso
 */
export default function SuccessPage() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");

  const [credits, setCredits] = useState(null);
  const [waited, setWaited] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    if (!auth?.currentUser || !db) {
      setError("Sessão não detectada. Faça login para ver seu saldo atualizado.");
      return undefined;
    }

    const ref = doc(db, "usuarios", auth.currentUser.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data() || {};
        if (typeof data.creditos === "number") {
          setCredits(data.creditos);
        }
      },
      (err) => setError(err.message),
    );

    const t = setInterval(() => setWaited((w) => w + 1), 1000);

    return () => {
      unsub();
      clearInterval(t);
    };
  }, []);

  const stillWaiting = credits === null && waited < 30;

  return (
    <div className="min-h-screen bg-[#080B14] px-4 py-16 text-[#F0F4FC] sm:px-6">
      <Helmet>
        <title>Pagamento confirmado | TransparênciaBR</title>
      </Helmet>

      <div className="mx-auto max-w-2xl">
        <div className="glass rounded-3xl border border-[#00f5d4]/30 bg-[rgba(0,245,212,0.04)] p-10 text-center shadow-[var(--shadow-elevated)]">
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-[#00f5d4]/15 text-[#00f5d4]">
            <CheckCircle2 className="size-9" strokeWidth={1.75} />
          </div>

          <h1 className="text-3xl font-semibold tracking-tight">
            Pagamento confirmado
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#9ECFE8]">
            O Stripe processou sua compra. Seus créditos serão liberados em
            poucos segundos pelo webhook seguro.
          </p>

          {sessionId ? (
            <p className="mt-6 font-mono text-[10px] tracking-wider text-[#5c6784]">
              session_id: {sessionId.slice(0, 28)}…
            </p>
          ) : null}

          <div className="mt-8 flex flex-col items-center gap-4">
            {credits !== null ? (
              <div className="flex items-center gap-3 rounded-2xl border border-[#FBD87F]/40 bg-[#FBD87F]/10 px-5 py-3">
                <Coins className="size-5 text-[#FBD87F]" strokeWidth={1.75} />
                <span className="font-mono text-2xl font-semibold tabular-nums text-[#FBD87F]">
                  {credits.toLocaleString("pt-BR")} créditos
                </span>
              </div>
            ) : stillWaiting ? (
              <div className="flex items-center gap-2 text-sm text-[#9ECFE8]">
                <Loader2 className="size-4 animate-spin" />
                Aguardando confirmação do webhook ({waited}s)…
              </div>
            ) : (
              <div className="rounded-xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-4 py-3 text-xs text-[#fecdd3]">
                Webhook ainda não confirmou após 30s. Recarregue em alguns
                minutos ou contate o suporte com o session_id acima.
              </div>
            )}

            {error ? (
              <div className="text-xs text-[#fb7185]">{error}</div>
            ) : null}
          </div>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/universo"
              className="inline-flex items-center gap-2 rounded-xl bg-[#F0F4FC] px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-[#02040a] transition hover:bg-white"
            >
              Entrar no universo
              <ArrowRight className="size-4" strokeWidth={2} />
            </Link>
            <Link
              to="/creditos"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-[#9ECFE8] transition hover:text-[#F0F4FC]"
            >
              Comprar mais créditos
            </Link>
          </div>
        </div>

        <p className="mx-auto mt-6 max-w-xl text-center text-xs leading-relaxed text-[#5c6784]">
          Os créditos não expiram em 12 meses. Cada dossiê completo consome 200
          créditos · cada nota fiscal isolada, 100. Cancelamento e nota fiscal
          do pagamento ficam disponíveis em Perfil → Faturas (em breve).
        </p>
      </div>
    </div>
  );
}
