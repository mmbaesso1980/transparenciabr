import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { getFunctions, httpsCallable } from "firebase/functions";
import { AlertCircle, Coins, Loader2, LogIn, Sparkles } from "lucide-react";

import { getFirebaseApp, getFirebaseAuth, getFirestoreDb } from "../lib/firebase.js";
import { useAuth } from "../context/AuthContext.jsx";

// Catálogo oficial Sprint 2.7 — R$ 0,20-0,30 por crédito
// 1 dossiê = 200 créditos · 1 nota fiscal = 100 créditos
const PACKAGES = [
  {
    id: "starter_500",
    credits: 500,
    label: "Starter",
    priceDisplay: "R$ 149",
    pricePerCreditDisplay: "R$ 0,30 / crédito",
    blurb: "~2 dossiês + 1 nota fiscal isolada. Ideal para validar o produto.",
    highlight: false,
  },
  {
    id: "jornalista_1500",
    credits: 1500,
    label: "Jornalista",
    priceDisplay: "R$ 379",
    pricePerCreditDisplay: "R$ 0,25 / crédito",
    blurb: "~7 dossiês completos. Pacote mais popular em redações.",
    highlight: true,
  },
  {
    id: "investigador_4000",
    credits: 4000,
    label: "Investigador",
    priceDisplay: "R$ 799",
    pricePerCreditDisplay: "R$ 0,20 / crédito",
    blurb: "~20 dossiês. Volume para auditoria contínua e investigações de longo curso.",
    highlight: false,
  },
];

/**
 * Link opcional Stripe Payment Link (teste) — definir em .env quando sem Functions.
 */
function mockCheckoutUrl(credits) {
  const base =
    import.meta.env.VITE_STRIPE_PAYMENT_LINK_URL?.trim() ||
    "https://checkout.stripe.com/test";
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}client_reference_id=mock&prefilled_email=test@example.com&metadata[credits]=${credits}`;
}

export default function CreditosPage() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [diag, setDiag] = useState({ firebase: false, firestore: false });

  // Diagnóstico de readiness no mount — informa o motivo real de falha
  useEffect(() => {
    setDiag({
      firebase: !!getFirebaseApp(),
      firestore: !!getFirestoreDb(),
    });
  }, [user]);

  const blockingReason = (() => {
    if (authLoading) return null; // ainda carregando
    if (!isAuthenticated) return "auth";
    if (!diag.firebase) return "firebase";
    if (!diag.firestore) return "firestore";
    return null;
  })();

  const startCheckout = useCallback(
    async (pkg) => {
      setError(null);

      // Bloquear ANTES de tentar — sem cair em URL fake
      if (!isAuthenticated) {
        setError("Você precisa estar autenticado para comprar créditos.");
        return;
      }
      const app = getFirebaseApp();
      const auth = getFirebaseAuth();
      const dbReady = !!getFirestoreDb();
      if (!app || !auth?.currentUser || !dbReady) {
        setError(
          "Firebase ainda não está pronto neste cliente. Recarregue a página e tente de novo.",
        );
        return;
      }

      setBusyId(pkg.id);

      try {
        await auth.currentUser.getIdToken(true);

        const functions = getFunctions(app, "southamerica-east1");
        const createCheckoutSession = httpsCallable(functions, "createCheckoutSession");

        const result = await createCheckoutSession({
          packageId: pkg.id,
          credits: pkg.credits,
          origin: typeof window !== "undefined" ? window.location.origin : "",
        });

        const payload = result?.data;
        const url = payload?.url;
        if (!url) {
          setError(
            "Stripe respondeu sem URL de checkout. Confira se STRIPE_SECRET_KEY foi configurada nas Functions.",
          );
          return;
        }
        window.location.href = url;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Mensagens humanas para erros mais comuns
        if (msg.includes("STRIPE_SECRET_KEY") || msg.includes("failed-precondition")) {
          setError(
            "Stripe ainda não foi configurado em produção. Rode: firebase functions:secrets:set STRIPE_SECRET_KEY",
          );
        } else if (msg.includes("not-found") || msg.includes("functions/not-found")) {
          setError(
            "Cloud Function 'createCheckoutSession' não está implantada nesta região (southamerica-east1).",
          );
        } else if (msg.includes("unauthenticated")) {
          setError("Sessão expirou. Saia e entre novamente.");
        } else {
          setError(msg);
        }
      } finally {
        setBusyId(null);
      }
    },
    [isAuthenticated],
  );

  return (
    <div className="min-h-full bg-[#080B14] px-4 py-8 text-[#F0F4FC] sm:px-6">
      <Helmet>
        <title>Créditos investigativos | Transparência BR</title>
        <meta
          name="description"
          content="Monetização segura via Stripe — créditos para o Motor Forense TransparênciaBR e análises forenses."
        />
      </Helmet>

      <div className="mx-auto max-w-5xl">
        <header className="mb-10 text-center">
          <div className="mx-auto mb-4 flex justify-center">
            <span className="glass inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-1.5 text-xs font-medium tracking-wide text-[#9ECFE8]">
              <Sparkles className="size-4" aria-hidden />
              GATEWAY MONETIZAÇÃO · STRIPE
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#F0F4FC]">
            Créditos investigativos
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#8B949E]">
            Pagamento processado pelo Stripe. Após confirmação, o webhook credita automaticamente
            o saldo em <span className="font-mono text-[#58A6FF]">usuarios/&#123;uid&#125;</span>.
          </p>
        </header>

        {blockingReason === "auth" ? (
          <div className="mb-8 flex flex-col items-center gap-3 rounded-2xl border border-[#fbbf24]/40 bg-[#fbbf24]/10 px-5 py-5 text-center sm:flex-row sm:text-left">
            <AlertCircle className="size-6 shrink-0 text-[#fbbf24]" strokeWidth={1.75} />
            <div className="flex-1 text-sm leading-relaxed text-[#fde68a]">
              <strong className="font-semibold text-[#fef3c7]">Faça login para comprar créditos.</strong> Você não está autenticado neste navegador.
              <br />
              <span className="text-xs opacity-80">
                Sem login, o sistema não consegue creditar os créditos no seu UID após o pagamento.
              </span>
            </div>
            <Link
              to="/login?redirect=%2Fcreditos"
              className="inline-flex items-center gap-2 rounded-xl bg-[#fbbf24] px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-[#02040a] transition hover:bg-[#fcd34d]"
            >
              <LogIn className="size-4" strokeWidth={2} />
              Entrar agora
            </Link>
          </div>
        ) : null}

        {blockingReason && blockingReason !== "auth" ? (
          <div className="mb-8 rounded-2xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-5 py-4 text-sm text-[#fecdd3]">
            <strong className="font-semibold">Cliente Firebase indisponível.</strong> Recarregue a página (motivo: {blockingReason}).
          </div>
        ) : null}

        {error ? (
          <div className="mb-6 rounded-xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-4 py-3 text-sm text-[#fecdd3]">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 md:grid-cols-3">
          {PACKAGES.map((pkg) => (
            <article
              key={pkg.id}
              className={[
                "glass flex flex-col rounded-2xl border p-6 shadow-[var(--shadow-elevated)] transition-transform",
                pkg.highlight
                  ? "border-[#00f5d4]/35 bg-[rgba(0,245,212,0.06)] ring-1 ring-[#00f5d4]/20"
                  : "border-[var(--border-strong)] bg-[rgba(18,21,38,0.65)]",
              ].join(" ")}
            >
              {pkg.highlight ? (
                <span className="mb-3 inline-flex w-fit rounded-full bg-[#00f5d4]/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#00f5d4]">
                  Recomendado
                </span>
              ) : (
                <span className="mb-3 inline-flex w-fit rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#8B949E]">
                  Pacote
                </span>
              )}
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#21262D] text-[#FBD87F]">
                  <Coins className="size-5" strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[#F0F4FC]">{pkg.label}</h2>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#58A6FF]">
                    {pkg.priceDisplay}
                  </p>
                </div>
              </div>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-[#8B949E]">{pkg.blurb}</p>
              <p className="mt-3 font-mono text-xs text-[#5c6784]">
                {pkg.credits.toLocaleString("pt-BR")} créditos · {pkg.pricePerCreditDisplay}
              </p>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => startCheckout(pkg)}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1f3b5c] to-[#152238] px-4 py-3 text-sm font-semibold text-[#F0F4FC] shadow-lg transition hover:brightness-110 disabled:opacity-60"
              >
                {busyId === pkg.id ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    A redirecionar…
                  </>
                ) : (
                  <>Comprar com Stripe</>
                )}
              </button>
            </article>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-xs leading-relaxed text-[#5c6784]">
          Modo desenvolvimento: se as Cloud Functions ou a chave Stripe não estiverem configuradas,
          abre-se um URL de demonstração (Stripe test / link configurável em{" "}
          <span className="font-mono">VITE_STRIPE_PAYMENT_LINK_URL</span>). Em produção, configure{" "}
          <span className="font-mono">STRIPE_SECRET_KEY</span> e{" "}
          <span className="font-mono">STRIPE_WEBHOOK_SECRET</span> nas Functions.
        </p>
      </div>
    </div>
  );
}
