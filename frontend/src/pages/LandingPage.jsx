import { Loader2, Lock, Search, Shield, Sparkles } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";

import BrandLogo from "../components/BrandLogo.jsx";
import CreditosGOD from "../components/CreditosGOD.jsx";
import LandingHeroGraph from "../components/landing/LandingHeroGraph.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useTransparencyReportsUniverso } from "../hooks/useTransparencyReportsUniverso.js";

/**
 * Vitrine pública (/) — grafo Firestore real, estética data.gov.uk / void neon,
 * barreira de sessão + redirect para dossiê após login.
 */
export default function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { graphData, loading, error, findPoliticoByQuery } =
    useTransparencyReportsUniverso(180);

  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingPolitico, setPendingPolitico] = useState({
    id: "",
    nome: "",
  });

  const emptyGraph = !loading && (!graphData.nodes?.length || error === "firebase_unavailable");

  const openGate = useCallback((nome, politicoId) => {
    const id = String(politicoId || "").trim();
    const name = String(nome || "").trim() || "este parlamentar";
    if (!id) return;
    if (isAuthenticated) {
      navigate(`/dossie/${encodeURIComponent(id)}`);
      return;
    }
    setPendingPolitico({ id, nome: name });
    setModalOpen(true);
  }, [isAuthenticated, navigate]);

  const handleSearch = useCallback(
    (e) => {
      e.preventDefault();
      const match = findPoliticoByQuery(query);
      if (!match) {
        setPendingPolitico({ id: "", nome: "" });
        setModalOpen(true);
        return;
      }
      openGate(match.nome, match.id);
    },
    [findPoliticoByQuery, openGate, query],
  );

  const handleNodeClick = useCallback(
    (node) => {
      if (!node || typeof node !== "object") return;
      if (node.tipo === "partido") return;
      const pid = node.politicoId;
      if (!pid) return;
      openGate(node.label, pid);
    },
    [openGate],
  );

  const loginHref = useMemo(() => {
    if (!pendingPolitico.id) return "/login";
    return `/login?redirect=${encodeURIComponent(`/dossie/${pendingPolitico.id}`)}`;
  }, [pendingPolitico.id]);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#02040a] text-[#F0F4FC]">
      <Helmet>
        <title>Motor Forense TransparênciaBR — Fiscalização com IA e OSINT</title>
        <meta
          name="description"
          content="Malha viva de transparência: partidos, parlamentares e fornecedores CEAP. Conta para dossiê completo."
        />
        <meta property="og:title" content="Motor Forense TransparênciaBR" />
        <meta property="og:type" content="website" />
      </Helmet>

      <div className="absolute inset-0 z-0">
        <LandingHeroGraph
          graphData={graphData}
          onNodeClick={handleNodeClick}
          empty={emptyGraph}
        />
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[5] bg-[radial-gradient(ellipse_at_50%_15%,rgba(88,166,255,0.07),transparent_50%),radial-gradient(ellipse_at_70%_80%,rgba(239,68,68,0.05),transparent_45%)]"
      />

      <header className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#30363D]/50 bg-[#02040a]/65 px-4 py-3 backdrop-blur-md sm:px-8">
        <BrandLogo to="/" />
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-[#30363D]/90 bg-[#0d1117]/80 px-3 py-1.5 font-data text-[10px] uppercase tracking-[0.18em] text-[#8B949E] md:inline-flex">
            <Shield className="size-3.5 text-[#58A6FF]" strokeWidth={1.75} aria-hidden />
            Canal público
          </span>
          <CreditosGOD />
          <Link
            to="/login"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#FDE047]/35 bg-[#FDE047]/10 px-3 text-xs font-semibold uppercase tracking-wide text-[#FDE047] transition hover:bg-[#FDE047]/18"
          >
            <Lock className="size-3.5" strokeWidth={2} aria-hidden />
            <span className="hidden sm:inline">Entrar</span>
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-4xl flex-col items-center justify-center px-4 pb-24 pt-10 text-center sm:px-6">
        <div className="pointer-events-none mb-6 inline-flex items-center gap-2 rounded-full border border-[#58A6FF]/30 bg-[#0d1117]/55 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#9CCBFF] backdrop-blur-md">
          <Sparkles className="size-3.5 text-[#58A6FF]" strokeWidth={2} aria-hidden />
          A.S.M.O.D.E.U.S. · dados.gov.uk BR
        </div>

        <h1 className="pointer-events-none max-w-3xl text-balance text-4xl font-semibold leading-[1.12] tracking-tight text-[#F0F4FC] drop-shadow-[0_4px_32px_rgba(0,0,0,0.85)] sm:text-5xl md:text-[3rem]">
          Motor Forense TransparênciaBR
        </h1>
        <p className="pointer-events-none mt-4 max-w-2xl text-lg leading-relaxed text-[#AAB4C8] sm:text-xl">
          Inteligência artificial e OSINT na fiscalização pública — a malha respira com dados reais do Firestore.
        </p>

        <form
          onSubmit={handleSearch}
          className="pointer-events-auto mt-10 w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0d1117]/55 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-md"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0">
            <label className="sr-only" htmlFor="landing-search">
              Pesquisar político
            </label>
            <input
              id="landing-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquise seu político..."
              autoComplete="off"
              className="min-h-12 flex-1 rounded-xl border border-transparent bg-[#080b14]/90 px-4 text-base text-[#F0F4FC] outline-none ring-0 placeholder:text-[#6e7681] focus:border-[#58A6FF]/45 sm:rounded-l-xl sm:rounded-r-none sm:px-5"
            />
            <button
              type="submit"
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#58A6FF] px-6 text-sm font-bold uppercase tracking-wide text-[#02040a] shadow-[0_0_28px_rgba(88,166,255,0.35)] transition hover:bg-[#79b8ff] sm:rounded-l-none sm:rounded-r-xl"
            >
              {loading ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : (
                <Search className="size-5" strokeWidth={2} aria-hidden />
              )}
              Buscar
            </button>
          </div>
          <p className="mt-3 px-2 text-left text-[11px] leading-relaxed text-[#8B949E]">
            {loading
              ? "A carregar transparency_reports…"
              : error && error !== "firebase_unavailable"
                ? `Firestore: ${error}`
                : emptyGraph
                  ? "Sem dados no grafo (configure Firebase ou aguarde ingestão)."
                  : `${graphData.nodes.length} nós · ${graphData.links.length} ligações (amostra).`}
          </p>
        </form>

        <div className="pointer-events-auto mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/universo"
            className="rounded-xl border border-[#30363D] bg-[#0d1117]/70 px-5 py-2.5 text-sm font-medium text-[#C9D1D9] backdrop-blur-md transition hover:border-[#58A6FF]/40"
          >
            Vista Universo expandida
          </Link>
          <Link
            to="/dossie/220645"
            className="rounded-xl border border-[#58A6FF]/35 px-5 py-2.5 text-sm font-medium text-[#58A6FF] transition hover:bg-[#58A6FF]/10"
          >
            Dossiê público exemplo
          </Link>
        </div>
      </main>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gate-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[#58A6FF]/25 bg-[#0d1117]/95 p-6 shadow-[0_0_60px_rgba(88,166,255,0.18)]">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#58A6FF]/35 bg-[#58A6FF]/12 text-[#58A6FF]">
                <Lock className="size-5" strokeWidth={2} aria-hidden />
              </span>
              <div className="text-left">
                <h2 id="gate-title" className="text-lg font-semibold text-[#F0F4FC]">
                  Inicie sessão
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[#C9D1D9]">
                  Faça login para abrir o dossiê investigativo de{" "}
                  <strong className="text-[#F0F4FC]">
                    {pendingPolitico.nome || "o parlamentar"}
                  </strong>{" "}
                  e ganhe <strong className="text-[#FBD87F]">300 créditos</strong> na sua conta (cota diária freemium).
                </p>
                {!pendingPolitico.id ? (
                  <p className="mt-2 text-xs text-amber-200/90">
                    Não encontrámos correspondência para a pesquisa. Ajuste o nome ou use o grafo.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl border border-[#30363D] px-4 py-2.5 text-sm font-medium text-[#C9D1D9] hover:bg-[#21262D]"
                onClick={() => setModalOpen(false)}
              >
                Fechar
              </button>
              <Link
                to={loginHref}
                state={pendingPolitico.id ? { from: `/dossie/${pendingPolitico.id}` } : undefined}
                className="rounded-xl bg-[#F0F4FC] px-4 py-2.5 text-sm font-semibold text-[#02040a] hover:bg-white"
                onClick={() => setModalOpen(false)}
              >
                Ir para login
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
