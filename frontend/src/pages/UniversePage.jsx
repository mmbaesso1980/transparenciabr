import { ArrowRight, Loader2, Lock, Search } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";

import BrandLogo from "../components/BrandLogo.jsx";
import LandingHeroGraph from "../components/landing/LandingHeroGraph.jsx";
import PoliticianOrb from "../components/PoliticianOrb.jsx";
import UserOrb from "../components/UserOrb.jsx";
import { INVESTIGATION_CATEGORIES } from "../constants/investigationCategories.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useCreditosGOD } from "../context/CreditosGODContext.jsx";
import { useTransparencyReportsUniverso } from "../hooks/useTransparencyReportsUniverso.js";
import { useUserCredits } from "../hooks/useUserCredits.js";

const LEFT_BENTO = INVESTIGATION_CATEGORIES.slice(0, 3);
const RIGHT_BENTO = INVESTIGATION_CATEGORIES.slice(3, 6);

/**
 * Centro visual ASMODEUS — grafo 3D, âncoras para o painel, busca forense com fly-to.
 */
export default function UniversePage() {
  const navigate = useNavigate();
  const graphRef = useRef(null);
  const { isAuthenticated, user } = useAuth();
  const { saldo } = useCreditosGOD();
  const { credits } = useUserCredits();
  const creditDisplay = Number.isFinite(credits) ? credits : saldo;

  const { graphData, loading, error, findPoliticoByQuery } =
    useTransparencyReportsUniverso(180);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalPolitico, setModalPolitico] = useState({ id: "", nome: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  const emptyGraph =
    !loading && (!graphData.nodes?.length || error === "firebase_unavailable");

  const openGate = useCallback(
    (nome, politicoId) => {
      const id = String(politicoId || "").trim();
      const name = String(nome || "").trim() || "este parlamentar";
      if (!id) return;
      if (isAuthenticated) {
        navigate(`/dossie/${encodeURIComponent(id)}`);
        return;
      }
      setModalPolitico({ id, nome: name });
      setModalOpen(true);
    },
    [isAuthenticated, navigate],
  );

  const resolvePoliticoIdFromNode = useCallback(
    (node) => {
      if (!node || typeof node !== "object") return "";
      if (node.tipo === "politico" && node.politicoId) {
        return String(node.politicoId);
      }
      if (node.tipo === "fornecedor" && node.politicoId) {
        return String(node.politicoId);
      }
      if (node.tipo !== "fornecedor") return "";
      const nid = String(node.id);
      for (const L of graphData.links) {
        const sid = String(typeof L.source === "object" ? L.source?.id : L.source);
        const tid = String(typeof L.target === "object" ? L.target?.id : L.target);
        if (tid === nid && sid.startsWith("pol_")) {
          const m = sid.match(/^pol_(.+)$/);
          return m ? m[1] : "";
        }
      }
      return "";
    },
    [graphData.links],
  );

  const handleNodeClick = useCallback(
    (node) => {
      if (!node || node.tipo === "partido") return;
      const pid = resolvePoliticoIdFromNode(node);
      if (!pid) return;
      openGate(node.label, pid);
    },
    [openGate, resolvePoliticoIdFromNode],
  );

  const handleSearchSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      const match = findPoliticoByQuery(searchQuery);
      if (!match) {
        setModalPolitico({ id: "", nome: "" });
        setModalOpen(true);
        return;
      }
      await graphRef.current?.flyToPoliticianId?.(match.id);
      openGate(match.nome, match.id);
    },
    [findPoliticoByQuery, openGate, searchQuery],
  );

  const loginHref = useMemo(() => {
    if (!modalPolitico.id) return "/login";
    return `/login?redirect=${encodeURIComponent(`/dossie/${modalPolitico.id}`)}`;
  }, [modalPolitico.id]);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#02040a] text-[#F0F4FC]">
      <Helmet>
        <title>Universo de Orbes — TransparênciaBR</title>
        <meta
          name="description"
          content="Malha de partidos, políticos e fornecedores — dados transparency_reports."
        />
      </Helmet>

      <div className="absolute inset-0 z-0">
        <LandingHeroGraph
          ref={graphRef}
          graphData={graphData}
          onNodeClick={handleNodeClick}
          empty={emptyGraph}
        />
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[5] bg-[radial-gradient(ellipse_at_center,transparent_0%,#02040a_72%),radial-gradient(circle_at_15%_85%,rgba(88,166,255,0.1),transparent_42%),radial-gradient(circle_at_90%_12%,rgba(239,68,68,0.06),transparent_38%)]"
      />

      <header className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#30363D]/60 bg-[#02040a]/75 px-4 py-3 backdrop-blur-md sm:px-8">
        <BrandLogo to="/" variant="full" size="md" />
        <nav
          className="flex flex-wrap items-center gap-2 sm:gap-3"
          aria-label="Navegação universo"
        >
          <Link
            to="/dashboard"
            className="inline-flex h-9 items-center rounded-lg border border-[#58A6FF]/45 bg-transparent px-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[#7DD3FC] shadow-[0_0_24px_rgba(88,166,255,0.12)] backdrop-blur-sm transition hover:border-[#7DD3FC]/70 hover:bg-[#58A6FF]/10 hover:text-[#F0F4FC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7DD3FC]"
          >
            Painel
          </Link>
        </nav>
        {isAuthenticated ? (
          <Link
            to="/perfil"
            aria-label="Abrir perfil e configurações"
            className="group inline-flex h-9 items-center gap-2.5 rounded-full border border-[#30363D] bg-[#0d1117]/80 pl-1 pr-3.5 text-[13px] text-[#E6EDF3] shadow-sm transition hover:border-[#58A6FF]/60 hover:bg-[#0d1117] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7DD3FC]"
          >
            <UserOrb user={user} size={28} />
            <span className="flex flex-col items-start leading-tight">
              <span className="max-w-[140px] truncate text-[12.5px] font-semibold tracking-tight text-[#F0F4FC] sm:max-w-[200px]">
                {firstName(user) || "Analista"}
              </span>
              <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#7DD3FC]/85">
                {Number.isFinite(creditDisplay)
                  ? `${creditDisplay.toLocaleString("pt-BR")} créditos`
                  : "…"}
              </span>
            </span>
          </Link>
        ) : null}
      </header>

      <div className="pointer-events-none absolute inset-0 z-10 flex justify-between gap-3 p-3 pt-[4.25rem] sm:gap-4 sm:p-6 sm:pt-[4.75rem]">
        <aside className="pointer-events-auto flex max-h-[calc(100dvh-7.5rem)] w-[min(100%,280px)] flex-col gap-2.5 overflow-y-auto sm:gap-3">
          {LEFT_BENTO.map((cat) => (
            <Link
              key={cat.seed}
              to={`/dashboard#${cat.dashboardHash}`}
              className="group rounded-2xl border border-[#21262D]/90 bg-[#080B14]/45 p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-md transition hover:-translate-y-0.5 hover:border-[#7DD3FC]/35 hover:bg-[#0D1117]/55 hover:shadow-[0_16px_48px_rgba(125,211,252,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7DD3FC] sm:p-4"
            >
              <div className="flex items-start gap-3">
                <PoliticianOrb
                  identity={cat.seed}
                  score={cat.score}
                  size={52}
                  withRing
                  ariaLabel={`Orbe ${cat.label}`}
                  className="shrink-0 transition-transform duration-500 group-hover:scale-105"
                />
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#8B949E]">
                    {cat.label}
                  </p>
                  <p className="font-data mt-0.5 text-lg font-semibold tracking-tight text-[#F0F4FC]">
                    {cat.headline}
                  </p>
                </div>
              </div>
              <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-[#AAB4C8]">
                {cat.body}
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7DD3FC] transition group-hover:gap-1.5 group-hover:text-[#F0F4FC]">
                Painel
                <ArrowRight className="size-3" strokeWidth={2.25} />
              </span>
            </Link>
          ))}
        </aside>

        <aside className="pointer-events-auto flex max-h-[calc(100dvh-7.5rem)] w-[min(100%,280px)] flex-col gap-2.5 overflow-y-auto sm:gap-3">
          {RIGHT_BENTO.map((cat) => (
            <Link
              key={cat.seed}
              to={`/dashboard#${cat.dashboardHash}`}
              className="group rounded-2xl border border-[#21262D]/90 bg-[#080B14]/45 p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-md transition hover:-translate-y-0.5 hover:border-[#7DD3FC]/35 hover:bg-[#0D1117]/55 hover:shadow-[0_16px_48px_rgba(125,211,252,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7DD3FC] sm:p-4"
            >
              <div className="flex items-start gap-3">
                <PoliticianOrb
                  identity={cat.seed}
                  score={cat.score}
                  size={52}
                  withRing
                  ariaLabel={`Orbe ${cat.label}`}
                  className="shrink-0 transition-transform duration-500 group-hover:scale-105"
                />
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#8B949E]">
                    {cat.label}
                  </p>
                  <p className="font-data mt-0.5 text-lg font-semibold tracking-tight text-[#F0F4FC]">
                    {cat.headline}
                  </p>
                </div>
              </div>
              <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-[#AAB4C8]">
                {cat.body}
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7DD3FC] transition group-hover:gap-1.5 group-hover:text-[#F0F4FC]">
                Painel
                <ArrowRight className="size-3" strokeWidth={2.25} />
              </span>
            </Link>
          ))}
        </aside>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-6 pt-16">
        <form
          onSubmit={handleSearchSubmit}
          className={`pointer-events-auto w-full max-w-2xl transition duration-300 ${
            searchFocused ? "scale-[1.02]" : "scale-100"
          }`}
        >
          <div className="rounded-2xl border border-white/[0.12] bg-[#0d1117]/72 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_0_1px_rgba(88,166,255,0.08)] backdrop-blur-xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0">
              <label className="sr-only" htmlFor="universe-forensic-search">
                Pesquisa forense no universo
              </label>
              <input
                id="universe-forensic-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="O que você procura? (Ex: Nome do político, CNPJ...)"
                autoComplete="off"
                className="min-h-12 flex-1 rounded-xl border border-transparent bg-[#080b14]/92 px-4 text-base text-[#F0F4FC] outline-none ring-0 placeholder:text-[#6e7681] focus:border-[#58A6FF]/45 sm:rounded-l-xl sm:rounded-r-none sm:px-5"
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
                Ir
              </button>
            </div>
          </div>
        </form>
      </div>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="uni-modal-title"
        >
          <div className="max-w-md rounded-2xl border border-[#58A6FF]/25 bg-[#0d1117]/95 p-6 shadow-[0_0_60px_rgba(88,166,255,0.15)]">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#58A6FF]/35 bg-[#58A6FF]/12 text-[#58A6FF]">
                <Lock className="size-5" strokeWidth={2} />
              </span>
              <div>
                <h2 id="uni-modal-title" className="text-lg font-semibold text-[#F0F4FC]">
                  Inicie sessão
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[#C9D1D9]">
                  Faça login para abrir o dossiê investigativo de{" "}
                  <strong className="text-[#F0F4FC]">{modalPolitico.nome}</strong> e ganhe{" "}
                  <strong className="text-[#FBD87F]">300 créditos</strong> (cota freemium).
                </p>
                {!modalPolitico.id ? (
                  <p className="mt-2 text-xs text-amber-200/90">
                    Não encontrámos correspondência. Ajuste o nome ou clique numa orbe.
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
                state={modalPolitico.id ? { from: `/dossie/${modalPolitico.id}` } : undefined}
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

function firstName(user) {
  if (!user) return "";
  const display = (user.displayName || "").trim();
  if (display) {
    return display.split(/\s+/)[0];
  }
  const email = (user.email || "").trim();
  return email.split("@")[0] || "";
}
