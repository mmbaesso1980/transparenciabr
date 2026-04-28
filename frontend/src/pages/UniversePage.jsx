import {
  Activity,
  Hexagon,
  Lock,
  Radar,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";

import BrandLogo from "../components/BrandLogo.jsx";
import LandingHeroGraph from "../components/landing/LandingHeroGraph.jsx";
import CreditosGOD from "../components/CreditosGOD.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useCreditosGOD } from "../context/CreditosGODContext.jsx";
import { useTransparencyReportsUniverso } from "../hooks/useTransparencyReportsUniverso.js";

/**
 * Vista expandida do Universo — mesmo grafo Firestore que a landing, HUD lateral.
 */
export default function UniversePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { canAuditar, consumirAuditoria, custoAuditoriaConexao, saldo } =
    useCreditosGOD();

  const { graphData, loading, error } = useTransparencyReportsUniverso(180);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalPolitico, setModalPolitico] = useState({ id: "", nome: "" });

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

  const handleNodeClick = useCallback(
    (node) => {
      if (!node || node.tipo === "partido") return;
      const pid = node.politicoId;
      if (!pid) return;

      if (node.tipo === "fornecedor" && node.critical) {
        if (!isAuthenticated || !canAuditar) {
          setModalPolitico({ id: pid, nome: node.label || "Fornecedor CEAP" });
          setModalOpen(true);
          return;
        }
        const ok = consumirAuditoria();
        if (!ok) {
          setModalPolitico({ id: pid, nome: node.label || "" });
          setModalOpen(true);
          return;
        }
      }

      openGate(node.label, pid);
    },
    [canAuditar, consumirAuditoria, isAuthenticated, openGate],
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
        <BrandLogo to="/" />
        <nav
          className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8B949E] sm:gap-4"
          aria-label="Navegação universo"
        >
          <Link className="text-[#F0F4FC] hover:text-[#58A6FF]" to="/">
            Início
          </Link>
          <Link className="hover:text-[#58A6FF]" to="/login">
            Entrar
          </Link>
          <Link className="hover:text-[#58A6FF]" to="/dashboard">
            Painel
          </Link>
        </nav>
        <CreditosGOD />
      </header>

      <div className="pointer-events-none absolute inset-0 z-10 flex justify-between gap-4 p-4 pt-[4.5rem] sm:p-6 sm:pt-[5rem]">
        <aside className="pointer-events-auto flex max-h-[calc(100dvh-6rem)] w-[min(100%,320px)] flex-col gap-3 overflow-y-auto">
          <div className="rounded-2xl border border-[#30363D]/80 bg-[#0a0e17]/55 p-4 shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur-md">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#58A6FF]">
              <Sparkles className="size-3.5" strokeWidth={2} />
              A.S.M.O.D.E.U.S.
            </div>
            <h1 className="mt-2 text-lg font-semibold leading-tight tracking-tight text-[#F0F4FC]">
              Universo de Orbes
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-[#8B949E]">
              Dados reais <code className="text-[#58A6FF]">transparency_reports</code>. Partidos
              ancoram; políticos orbitam; fornecedores CEAP (top 3 por valor) em vermelho.
            </p>
            {loading ? (
              <p className="mt-2 text-[11px] text-[#8B949E]">A sincronizar…</p>
            ) : null}
          </div>
          <div className="rounded-2xl border border-[#58A6FF]/25 bg-[#0d1117]/50 p-4 backdrop-blur-md">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8B949E]">
              <Zap className="size-3.5 text-amber-400" strokeWidth={2} />
              Economia
            </div>
            <p className="mt-2 text-sm text-[#C9D1D9]">
              Auditar uma <strong className="text-amber-200">conexão crítica</strong> (fornecedor)
              consome <strong>{custoAuditoriaConexao}</strong> créditos.
            </p>
            <p className="mt-1 font-data text-xs text-[#8B949E]">
              Saldo: {saldo.toLocaleString("pt-BR")} Cr
            </p>
          </div>
        </aside>

        <aside className="pointer-events-auto flex max-h-[calc(100dvh-6rem)] w-[min(100%,300px)] flex-col gap-3 overflow-y-auto">
          <div className="rounded-2xl border border-[#30363D]/80 bg-[#0a0e17]/55 p-4 backdrop-blur-md">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8B949E]">
              <Radar className="size-3.5 text-[#A78BFA]" strokeWidth={2} />
              Radar
            </div>
            <ul className="mt-3 space-y-2 font-data text-xs text-[#C9D1D9]">
              <li className="flex justify-between gap-2">
                <span className="text-[#8B949E]">Nós</span>
                <span>{graphData.nodes.length}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-[#8B949E]">Ligações</span>
                <span>{graphData.links.length}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-[#8B949E]">Críticos</span>
                <span className="text-red-300">
                  {graphData.nodes.filter((n) => n.critical).length}
                </span>
              </li>
            </ul>
          </div>
          <div className="rounded-2xl border border-[#30363D]/80 bg-[#0a0e17]/55 p-4 backdrop-blur-md">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8B949E]">
              <Target className="size-3.5 text-[#4ADE80]" strokeWidth={2} />
              Funil
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[#AAB4C8]">
              Clique num político ou use a pesquisa na página inicial — login para o dossiê completo.
            </p>
          </div>
          <div className="rounded-2xl border border-[#30363D]/60 bg-[#0d1117]/40 p-3 backdrop-blur-md">
            <div className="flex items-center gap-2 text-[10px] text-[#484F58]">
              <Activity className="size-3" strokeWidth={2} />
              <Hexagon className="size-3" strokeWidth={2} />
              <span>{error && error !== "firebase_unavailable" ? error : "Firestore · amostra"}</span>
            </div>
          </div>
        </aside>
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
