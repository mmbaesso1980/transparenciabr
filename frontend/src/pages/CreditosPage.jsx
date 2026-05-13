import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion, AnimatePresence } from "framer-motion";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Coins,
  FileText,
  Loader2,
  LogIn,
  Receipt,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

import { getFirebaseApp, getFirebaseAuth, getFirestoreDb } from "../lib/firebase.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useUserCredits } from "../hooks/useUserCredits.js";
import { CREDIT_PRICE_DOSSIE_MATADOR } from "../data/creditPricing.js";

// =============================================================================
// CATÁLOGO Sprint 2.7 — preservado verbatim do repo (NÃO ALTERAR PREÇOS / IDs)
// =============================================================================
const PACKAGES = [
  {
    id: "starter_500",
    credits: 500,
    label: "Starter",
    price: 149,
    priceDisplay: "R$ 149",
    perCredit: 0.30,
    pricePerCreditDisplay: "R$ 0,30",
    blurb: "Ideal para validar o produto e testar dossiês pontuais.",
    highlight: false,
    icon: Sparkles,
    accent: "#22d3ee",
    estimate: { dossies: 2, notas: 1 },
    perks: [
      "≈ 2 dossiês completos",
      "≈ 1 nota fiscal isolada",
      "Sinalizações ilimitadas",
      "Histórico 30 dias",
    ],
  },
  {
    id: "jornalista_1500",
    credits: 1500,
    label: "Jornalista",
    price: 379,
    priceDisplay: "R$ 379",
    perCredit: 0.25,
    pricePerCreditDisplay: "R$ 0,25",
    blurb: "Mais popular em redações. Volume para reportagem semanal.",
    highlight: true,
    icon: TrendingUp,
    accent: "#a78bfa",
    estimate: { dossies: 7, notas: 5 },
    perks: [
      "≈ 7 dossiês completos",
      "≈ 5 notas fiscais detalhadas",
      "Exportação PDF premium",
      "Histórico ilimitado",
      "Suporte prioritário",
    ],
  },
  {
    id: "investigador_4000",
    credits: 4000,
    label: "Investigador",
    price: 799,
    priceDisplay: "R$ 799",
    perCredit: 0.20,
    pricePerCreditDisplay: "R$ 0,20",
    blurb: "Volume para auditoria contínua e investigações de longo curso.",
    highlight: false,
    icon: Shield,
    accent: "#fbbf24",
    estimate: { dossies: 20, notas: 15 },
    perks: [
      "≈ 20 dossiês completos",
      "≈ 15 notas fiscais detalhadas",
      "API de export (CSV/JSON)",
      "Comparativo entre parlamentares",
      "Suporte humano dedicado",
      "Acesso antecipado a features",
    ],
  },
];

const FAQ = [
  {
    q: "Como funcionam os créditos?",
    a: `Cada análise consome créditos: 1 dossiê matador = ${CREDIT_PRICE_DOSSIE_MATADOR} créditos, 1 nota fiscal detalhada = 100 créditos. Créditos comprados não expiram; a cota diária gratuita (300) reinicia quando você retorna em outro dia — ver regras no perfil.`,
  },
  {
    q: "Posso pedir reembolso?",
    a: "Sim. Garantimos 7 dias de devolução integral, sem perguntas, para créditos não utilizados. Basta enviar um e-mail e devolvemos no mesmo método de pagamento.",
  },
  {
    q: "O pagamento é seguro?",
    a: "Sim. Todo o processamento é feito pelo Stripe (PCI-DSS Nível 1). Não armazenamos dados de cartão em nossos servidores. O webhook do Stripe credita automaticamente seu saldo após confirmação.",
  },
  {
    q: "Posso emitir nota fiscal?",
    a: "Sim. Após a compra, envie e-mail para fiscal@transparenciabr.app com seu CNPJ ou CPF e emitimos a NFS-e em até 2 dias úteis.",
  },
];

function num(n) {
  return Number(n || 0).toLocaleString("pt-BR");
}

// =============================================================================
// CreditosPage premium — Stripe-vibe / Linear hover-lift / glass / tabular-nums
// =============================================================================
export default function CreditosPage() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { credits: currentCredits } = useUserCredits();
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [diag, setDiag] = useState({ firebase: false, firestore: false });
  const [openFaq, setOpenFaq] = useState(null);
  const [calcDossies, setCalcDossies] = useState(5);

  // Diagnóstico de readiness no mount
  useEffect(() => {
    setDiag({
      firebase: !!getFirebaseApp(),
      firestore: !!getFirestoreDb(),
    });
  }, [user]);

  const blockingReason = (() => {
    if (authLoading) return null;
    if (!isAuthenticated) return "auth";
    if (!diag.firebase) return "firebase";
    if (!diag.firestore) return "firestore";
    return null;
  })();

  // Calculadora — sugere o melhor pacote dado N dossiês/mês
  const recommendedPkg = useMemo(() => {
    const need = calcDossies * CREDIT_PRICE_DOSSIE_MATADOR;
    const eligible = PACKAGES.filter((p) => p.credits >= need);
    if (eligible.length === 0) return PACKAGES[PACKAGES.length - 1];
    return eligible.reduce((best, p) => (p.perCredit < best.perCredit ? p : best), eligible[0]);
  }, [calcDossies]);

  const startCheckout = useCallback(
    async (pkg) => {
      setError(null);
      if (!isAuthenticated) {
        // Visitante: redireciona para login com retorno para /creditos
        navigate(`/login?redirect=${encodeURIComponent(`/creditos?pkg=${pkg.id}`)}`);
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
    [isAuthenticated, navigate],
  );

  return (
    <div className="min-h-full bg-[#080B14] px-4 py-10 text-[#F0F4FC] sm:px-6">
      <Helmet>
        <title>Créditos investigativos | Transparência BR</title>
        <meta
          name="description"
          content="Investigue sem limites. Pacotes de créditos para o Motor Forense TransparênciaBR — pagamento seguro via Stripe, garantia de 7 dias."
        />
      </Helmet>

      <div className="mx-auto max-w-6xl">
        {/* ========================== HERO ========================== */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center"
        >
          <div className="mx-auto mb-5 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/5 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-300">
              <Sparkles className="size-3.5" aria-hidden />
              Pagamento seguro · Stripe
            </span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-[#F0F4FC] sm:text-5xl">
            Investigue sem limites
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-[#8B949E]">
            Créditos que não expiram. Pague apenas pelas análises que fizer.
            Garantia de 7 dias e suporte humano em todos os pacotes.
          </p>

          {/* Saldo atual */}
          {isAuthenticated && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mx-auto mt-6 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm backdrop-blur-md"
            >
              <Coins className="size-4 text-amber-300" strokeWidth={1.75} />
              <span className="text-[#8B949E]">Saldo atual</span>
              <span className="font-mono text-base font-semibold tabular-nums text-cyan-300">
                {num(currentCredits)} créditos
              </span>
            </motion.div>
          )}
        </motion.header>

        {/* ========================== ALERTAS ========================== */}
        {blockingReason === "auth" && (
          <div className="mb-8 flex flex-col items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-5 py-5 text-center sm:flex-row sm:text-left">
            <AlertCircle className="size-6 shrink-0 text-amber-300" strokeWidth={1.75} />
            <div className="flex-1 text-sm leading-relaxed text-amber-100">
              <strong className="font-semibold text-amber-50">
                Faça login para comprar créditos.
              </strong>{" "}
              Sem login, o sistema não credita seu UID após o pagamento.
            </div>
            <Link
              to="/login?redirect=%2Fcreditos"
              className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-[#02040a] transition hover:bg-amber-300"
            >
              <LogIn className="size-4" strokeWidth={2} />
              Entrar agora
            </Link>
          </div>
        )}

        {blockingReason && blockingReason !== "auth" && (
          <div className="mb-8 rounded-2xl border border-rose-400/40 bg-rose-400/10 px-5 py-4 text-sm text-rose-200">
            <strong className="font-semibold">Cliente Firebase indisponível.</strong> Recarregue a
            página (motivo: {blockingReason}).
          </div>
        )}

        {error && (
          <div className="mb-8 rounded-2xl border border-rose-400/40 bg-rose-400/10 px-5 py-4 text-sm text-rose-200">
            {error}
          </div>
        )}

        {/* ========================== 3 CARDS ========================== */}
        <div className="grid gap-6 md:grid-cols-3">
          {PACKAGES.map((pkg, idx) => {
            const Icon = pkg.icon;
            return (
              <motion.article
                key={pkg.id}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.1 + idx * 0.08 }}
                whileHover={{ y: -4 }}
                className={[
                  "relative flex flex-col rounded-3xl border p-6 backdrop-blur-md transition-shadow",
                  pkg.highlight
                    ? "border-cyan-400/40 bg-gradient-to-br from-cyan-400/[0.06] via-violet-500/[0.04] to-transparent shadow-[0_0_60px_-15px_rgba(34,211,238,0.35)]"
                    : "border-[#30363D] bg-[#0D1117]/80 hover:border-[#3a4150]",
                ].join(" ")}
              >
                {pkg.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#02040a] shadow-lg">
                      <Zap className="size-3" strokeWidth={2.5} />
                      Mais popular
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div
                    className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-white/5"
                    style={{
                      background: `linear-gradient(135deg, ${pkg.accent}22, ${pkg.accent}08)`,
                      color: pkg.accent,
                    }}
                  >
                    <Icon className="size-5" strokeWidth={1.75} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-[#F0F4FC]">{pkg.label}</h2>
                    <p className="text-xs text-[#8B949E]">{num(pkg.credits)} créditos</p>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-4xl font-semibold tabular-nums text-[#F0F4FC]">
                      {pkg.priceDisplay}
                    </span>
                    <span className="text-xs text-[#8B949E]">à vista</span>
                  </div>
                  <p className="mt-1 text-xs text-[#8B949E]">
                    {pkg.pricePerCreditDisplay} por crédito
                  </p>
                </div>

                <p className="mt-5 text-sm leading-relaxed text-[#8B949E]">{pkg.blurb}</p>

                <ul className="mt-5 space-y-2.5">
                  {pkg.perks.map((perk, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-[#cbd5e1]">
                      <Check
                        className="mt-0.5 size-4 shrink-0"
                        strokeWidth={2.25}
                        style={{ color: pkg.accent }}
                      />
                      <span>{perk}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-6">
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => startCheckout(pkg)}
                    className={[
                      "inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60",
                      pkg.highlight
                        ? "bg-gradient-to-r from-cyan-400 to-violet-500 text-[#02040a] shadow-[0_0_24px_-6px_rgba(34,211,238,0.55)] hover:brightness-110"
                        : "border border-white/10 bg-white/5 text-[#F0F4FC] hover:border-cyan-400/30 hover:bg-cyan-400/5",
                    ].join(" ")}
                  >
                    {busyId === pkg.id ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        A redirecionar…
                      </>
                    ) : (
                      <>Comprar {pkg.label}</>
                    )}
                  </button>
                </div>
              </motion.article>
            );
          })}
        </div>

        {/* ========================== TABELA COMPARATIVA ========================== */}
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-16"
        >
          <h2 className="mb-6 text-xl font-semibold tracking-tight text-[#F0F4FC]">
            Compare os pacotes
          </h2>
          <div className="overflow-hidden rounded-2xl border border-[#30363D] bg-[#0D1117]/60 backdrop-blur-md">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#30363D] bg-white/[0.02]">
                    <th className="px-5 py-4 text-left text-xs font-medium uppercase tracking-wider text-[#8B949E]">
                      Recurso
                    </th>
                    {PACKAGES.map((pkg) => (
                      <th
                        key={pkg.id}
                        className="px-5 py-4 text-center text-xs font-semibold"
                        style={{ color: pkg.highlight ? "#22d3ee" : "#F0F4FC" }}
                      >
                        {pkg.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363D]/60">
                  <tr>
                    <td className="px-5 py-3.5 text-[#cbd5e1]">Créditos</td>
                    {PACKAGES.map((p) => (
                      <td
                        key={p.id}
                        className="px-5 py-3.5 text-center font-mono tabular-nums text-[#F0F4FC]"
                      >
                        {num(p.credits)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-5 py-3.5 text-[#cbd5e1]">Preço por crédito</td>
                    {PACKAGES.map((p) => (
                      <td
                        key={p.id}
                        className="px-5 py-3.5 text-center font-mono tabular-nums text-[#8B949E]"
                      >
                        {p.pricePerCreditDisplay}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-5 py-3.5 text-[#cbd5e1]">{`Dossiês matador (~${CREDIT_PRICE_DOSSIE_MATADOR} cr)`}</td>
                    {PACKAGES.map((p) => (
                      <td
                        key={p.id}
                        className="px-5 py-3.5 text-center font-mono tabular-nums text-[#F0F4FC]"
                      >
                        ≈ {p.estimate.dossies}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-5 py-3.5 text-[#cbd5e1]">Notas fiscais (~100 cr)</td>
                    {PACKAGES.map((p) => (
                      <td
                        key={p.id}
                        className="px-5 py-3.5 text-center font-mono tabular-nums text-[#F0F4FC]"
                      >
                        ≈ {p.estimate.notas}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-5 py-3.5 text-[#cbd5e1]">Histórico</td>
                    <td className="px-5 py-3.5 text-center text-[#8B949E]">30 dias</td>
                    <td className="px-5 py-3.5 text-center text-cyan-300">Ilimitado</td>
                    <td className="px-5 py-3.5 text-center text-cyan-300">Ilimitado</td>
                  </tr>
                  <tr>
                    <td className="px-5 py-3.5 text-[#cbd5e1]">Exportação PDF premium</td>
                    <td className="px-5 py-3.5 text-center text-[#5c6784]">—</td>
                    <td className="px-5 py-3.5 text-center">
                      <Check className="mx-auto size-4 text-cyan-300" strokeWidth={2.5} />
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <Check className="mx-auto size-4 text-amber-300" strokeWidth={2.5} />
                    </td>
                  </tr>
                  <tr>
                    <td className="px-5 py-3.5 text-[#cbd5e1]">API export (CSV/JSON)</td>
                    <td className="px-5 py-3.5 text-center text-[#5c6784]">—</td>
                    <td className="px-5 py-3.5 text-center text-[#5c6784]">—</td>
                    <td className="px-5 py-3.5 text-center">
                      <Check className="mx-auto size-4 text-amber-300" strokeWidth={2.5} />
                    </td>
                  </tr>
                  <tr>
                    <td className="px-5 py-3.5 text-[#cbd5e1]">Suporte</td>
                    <td className="px-5 py-3.5 text-center text-[#8B949E]">E-mail</td>
                    <td className="px-5 py-3.5 text-center text-cyan-300">Prioritário</td>
                    <td className="px-5 py-3.5 text-center text-amber-300">Humano dedicado</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </motion.section>

        {/* ========================== CALCULADORA ========================== */}
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-16 rounded-3xl border border-[#30363D] bg-gradient-to-br from-cyan-400/[0.04] via-violet-500/[0.03] to-transparent p-8 backdrop-blur-md"
        >
          <div className="grid gap-8 md:grid-cols-2 md:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/5 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-cyan-300">
                <Receipt className="size-3" />
                Calculadora
              </span>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[#F0F4FC]">
                Quantos dossiês por mês você precisa?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#8B949E]">
                Recomendamos o pacote com melhor custo por crédito para o seu volume.
              </p>

              <div className="mt-6">
                <label className="text-xs font-medium uppercase tracking-wider text-[#8B949E]">
                  Dossiês por mês:{" "}
                  <span className="font-mono text-base text-cyan-300 tabular-nums">
                    {calcDossies}
                  </span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={25}
                  value={calcDossies}
                  onChange={(e) => setCalcDossies(Number(e.target.value))}
                  className="mt-3 w-full accent-cyan-400"
                />
                <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-[#5c6784]">
                  <span>1</span>
                  <span>25+</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0D1117]/80 p-6">
              <p className="text-xs uppercase tracking-wider text-[#8B949E]">Recomendação</p>
              <h3 className="mt-1 font-mono text-3xl font-semibold tabular-nums text-cyan-300">
                {recommendedPkg.label}
              </h3>
              <p className="mt-2 text-sm text-[#8B949E]">{recommendedPkg.blurb}</p>
              <div className="mt-5 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#8B949E]">Créditos necessários</span>
                  <span className="font-mono tabular-nums text-[#F0F4FC]">
                    {num(calcDossies * CREDIT_PRICE_DOSSIE_MATADOR)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8B949E]">Pacote sugerido</span>
                  <span className="font-mono tabular-nums text-[#F0F4FC]">
                    {num(recommendedPkg.credits)} cr
                  </span>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-2">
                  <span className="font-medium text-[#F0F4FC]">Investimento</span>
                  <span className="font-mono text-lg font-semibold tabular-nums text-cyan-300">
                    {recommendedPkg.priceDisplay}
                  </span>
                </div>
              </div>
              <button
                onClick={() => startCheckout(recommendedPkg)}
                disabled={busyId !== null}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2.5 text-sm font-semibold text-[#02040a] transition hover:brightness-110 disabled:opacity-60"
              >
                {busyId === recommendedPkg.id ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    A redirecionar…
                  </>
                ) : (
                  <>Comprar {recommendedPkg.label}</>
                )}
              </button>
            </div>
          </div>
        </motion.section>

        {/* ========================== FAQ ========================== */}
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-16"
        >
          <h2 className="mb-6 text-xl font-semibold tracking-tight text-[#F0F4FC]">
            Perguntas frequentes
          </h2>
          <div className="space-y-3">
            {FAQ.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className="overflow-hidden rounded-2xl border border-[#30363D] bg-[#0D1117]/60 backdrop-blur-md"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-white/[0.02]"
                  >
                    <span className="text-sm font-medium text-[#F0F4FC]">{item.q}</span>
                    <ChevronDown
                      className={[
                        "size-4 shrink-0 text-[#8B949E] transition-transform",
                        isOpen ? "rotate-180" : "",
                      ].join(" ")}
                      strokeWidth={2}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                      >
                        <p className="px-5 pb-4 text-sm leading-relaxed text-[#8B949E]">
                          {item.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </motion.section>

        {/* ========================== TRUST STRIP ========================== */}
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-16 grid gap-4 rounded-2xl border border-[#30363D] bg-[#0D1117]/40 p-6 backdrop-blur-md sm:grid-cols-3"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
              <Shield className="size-5" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F0F4FC]">Stripe seguro</p>
              <p className="text-xs text-[#8B949E]">PCI-DSS Nível 1 · não armazenamos cartão</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
              <Check className="size-5" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F0F4FC]">Garantia de 7 dias</p>
              <p className="text-xs text-[#8B949E]">Reembolso integral, sem perguntas</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-400/10 text-violet-300">
              <Users className="size-5" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F0F4FC]">Suporte humano</p>
              <p className="text-xs text-[#8B949E]">E-mail respondido em até 24h úteis</p>
            </div>
          </div>
        </motion.section>

        <p className="mx-auto mt-12 max-w-3xl text-center text-xs leading-relaxed text-[#5c6784]">
          Precisa de NF-e? Envie CNPJ/CPF para{" "}
          <span className="font-mono text-cyan-300/80">fiscal@transparenciabr.app</span> após a
          compra. Modo desenvolvimento: se as Cloud Functions ou a chave Stripe não estiverem
          configuradas, retorna erro descritivo (sem URL fake).
        </p>
      </div>
    </div>
  );
}
