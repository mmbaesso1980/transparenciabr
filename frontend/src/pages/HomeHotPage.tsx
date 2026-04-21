import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

import BrandMark from "../components/BrandMark";
import GlobalSearch from "../components/GlobalSearch.jsx";
import { fetchPoliticosCollection, getFirebaseApp } from "../lib/firebase.ts";

const STAGGER_MS = 40;

const cardBase =
  "flex min-h-[140px] flex-col justify-between rounded-[var(--radius)] border border-white/[0.08] bg-[var(--bg-2)] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.35)] transition hover:border-white/[0.14]";

function usePoliticosCount(): { n: number | null } {
  const [n, setN] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!getFirebaseApp()) {
        if (!cancelled) setN(null);
        return;
      }
      try {
        const rows = await fetchPoliticosCollection();
        if (!cancelled) setN(rows.length);
      } catch {
        if (!cancelled) setN(null);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { n };
}

export default function HomeHotPage() {
  const { n: politicosLoaded } = usePoliticosCount();
  const deputados = politicosLoaded != null ? Math.min(politicosLoaded, 513) : 513;
  const senadores = 81;
  const biTracked = "594";

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: STAGGER_MS / 1000, delayChildren: 0.06 },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div
      className="min-h-dvh bg-[var(--bg-0)] text-[var(--fg-hi)]"
      style={{ fontFamily: "var(--font-display)" }}
    >
      <header className="border-b border-white/[0.06] bg-[var(--bg-1)]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <BrandMark />
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--fg-lo)]">
                Transparência BR
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                Painel operacional
              </h1>
            </div>
          </div>
          <div className="w-full max-w-md">
            <GlobalSearch />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-[var(--radius)] border border-white/[0.08] bg-[var(--bg-1)] p-8 sm:p-12"
        >
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
            style={{ background: "var(--accent-grad)" }}
          />
          <div className="relative max-w-3xl space-y-4">
            <p className="text-sm text-[var(--fg-lo)]">Dados públicos · 2026</p>
            <h2 className="text-3xl font-semibold leading-tight tracking-tight text-[var(--fg-hi)] sm:text-4xl md:text-5xl">
              <motion.span
                className="inline-block"
                initial={{ opacity: 0.85 }}
                animate={{ opacity: [0.85, 1, 0.92, 1] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              >
                {deputados} deputados · {senadores} senadores · R$ {biTracked} Bi
                rastreados 2026
              </motion.span>
            </h2>
            <p className="max-w-xl text-base text-[var(--fg-lo)]">
              Infraestrutura forense para emendas, gastos e alertas — com contraste
              e estabilidade de layout (CLS controlado).
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                to="/ranking"
                className="inline-flex items-center justify-center rounded-[var(--radius)] bg-[var(--bg-2)] px-5 py-2.5 text-sm font-medium text-[var(--fg-hi)] ring-1 ring-white/[0.12] transition hover:ring-white/25"
              >
                Abrir ranking
              </Link>
            </div>
          </div>
        </motion.section>

        <motion.section
          variants={container}
          initial="hidden"
          animate="show"
          className="mt-10 grid min-h-[320px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          style={{ contentVisibility: "auto" }}
        >
          {[
            {
              t: "Emendas",
              d: "Parliamentares e execução orçamentária em tempo real.",
              href: "/ranking",
            },
            {
              t: "Gastos",
              d: "Rastreio de desembolsos e despesas classificadas.",
              href: "/ranking",
            },
            {
              t: "Alertas IA",
              d: "Sinais de risco e explicações geradas com contexto.",
              href: "/dossie/teste",
            },
            {
              t: "Ranking",
              d: "Comparator de parlamentares por métricas públicas.",
              href: "/ranking",
            },
          ].map((c) => (
            <motion.div key={c.t} variants={item}>
              <Link
                to={c.href}
                className={`${cardBase} block h-full min-h-[160px] text-left text-[var(--fg-hi)] no-underline`}
              >
                <h3 className="text-lg font-semibold">{c.t}</h3>
                <p className="text-sm leading-relaxed text-[var(--fg-lo)]">{c.d}</p>
              </Link>
            </motion.div>
          ))}
        </motion.section>

        {politicosLoaded == null && getFirebaseApp() ? (
          <p className="mt-8 text-center text-sm text-[var(--fg-lo)]">
            Sincronizando contagem com Firestore…
          </p>
        ) : null}
      </main>
    </div>
  );
}
