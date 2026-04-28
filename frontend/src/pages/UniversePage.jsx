import ForceGraph2D from "react-force-graph-2d";
import {
  Activity,
  Hexagon,
  Lock,
  Radar,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";

import BrandLogo from "../components/BrandLogo.jsx";
import CreditosGOD from "../components/CreditosGOD.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useCreditosGOD } from "../context/CreditosGODContext.jsx";
import { buildMockUniversoOrbes } from "../data/mockUniversoOrbes.js";
import { getRiskColor, getRiskGlow } from "../utils/colorUtils.js";

function tierRadius(node) {
  switch (node.tier) {
    case "grande":
      return 18;
    case "medio":
      return 12;
    case "pequeno":
      return 8;
    default:
      return 10;
  }
}

/**
 * Universo de Orbes — grafo 2D neon + Bento HUD + economia de créditos.
 */
export default function UniversePage() {
  const fgRef = useRef(null);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { canAuditar, consumirAuditoria, custoAuditoriaConexao, saldo } =
    useCreditosGOD();

  const graphData = useMemo(() => buildMockUniversoOrbes(), []);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalNodeLabel, setModalNodeLabel] = useState("");

  const requestAuditOrNavigate = useCallback(
    (node) => {
      if (!node?.critical) {
        if (node?.tipo === "politico" && node?.dossieId) {
          navigate(`/dossie/${encodeURIComponent(node.dossieId)}`);
        }
        return;
      }

      if (!isAuthenticated || !canAuditar) {
        setModalNodeLabel(String(node.label ?? node.id));
        setModalOpen(true);
        return;
      }

      const ok = consumirAuditoria();
      if (!ok) {
        setModalNodeLabel(String(node.label ?? node.id));
        setModalOpen(true);
        return;
      }
      if (node?.dossieId) {
        navigate(`/dossie/${encodeURIComponent(node.dossieId)}`);
      } else {
        navigate("/dashboard");
      }
    },
    [canAuditar, consumirAuditoria, isAuthenticated, navigate],
  );

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#020308] text-[#F0F4FC]">
      <Helmet>
        <title>Universo de Orbes — TransparênciaBR</title>
        <meta
          name="description"
          content="Malha de partidos, políticos e fornecedores — protocolo A.S.M.O.D.E.U.S."
        />
      </Helmet>

      {/* Grafo fullscreen */}
      <div className="absolute inset-0 z-0">
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          backgroundColor="#020308"
          linkCanvasObjectMode="replace"
          linkCanvasObject={(link, ctx) => {
            const s = link.source;
            const t = link.target;
            const risk = typeof link.risk === "number" ? link.risk : 50;
            const high = risk >= 72;
            ctx.save();
            ctx.shadowBlur = high ? 22 : 12;
            ctx.shadowColor = high ? "rgba(239,68,68,0.95)" : "rgba(250,204,21,0.75)";
            ctx.strokeStyle = high ? "rgba(248,113,113,0.88)" : "rgba(253,224,71,0.55)";
            ctx.lineWidth = high ? 2.4 : 1.6;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(t.x, t.y);
            ctx.stroke();
            ctx.strokeStyle = high ? "rgba(254,202,202,0.35)" : "rgba(254,240,138,0.28)";
            ctx.lineWidth = high ? 5 : 3.5;
            ctx.shadowBlur = high ? 28 : 16;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(t.x, t.y);
            ctx.stroke();
            ctx.restore();
          }}
          nodeLabel={(n) =>
            `${n.label}${n.critical ? " · CRÍTICO" : ""}${n.tipo ? ` (${n.tipo})` : ""}`
          }
          nodeCanvasObject={(node, ctx, globalScale) => {
            const r = tierRadius(node);
            const score =
              typeof node.riskScore === "number" ? node.riskScore : 50;
            const fill = getRiskColor(score);
            const glow = getRiskGlow(score);
            const ring = node.critical ? "rgba(239,68,68,0.55)" : "transparent";

            ctx.save();
            if (ring !== "transparent") {
              ctx.strokeStyle = ring;
              ctx.lineWidth = 3 / globalScale;
              ctx.shadowColor = "rgba(239,68,68,0.8)";
              ctx.shadowBlur = 16 * glow;
              ctx.beginPath();
              ctx.arc(node.x, node.y, r + 4 / globalScale, 0, 2 * Math.PI, false);
              ctx.stroke();
            }
            ctx.shadowColor = fill;
            ctx.shadowBlur = 14 * glow;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.restore();

            if (globalScale > 0.35) {
              ctx.font = `${11 / globalScale}px var(--font-sans), ui-sans-serif, system-ui, sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillStyle = "rgba(240,244,252,0.92)";
              const lbl = String(node.label || node.id).slice(0, 28);
              ctx.fillText(lbl, node.x, node.y + r + 3 / globalScale);
            }
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            const r = tierRadius(node) + 6;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
            ctx.fill();
          }}
          onNodeClick={(node) => {
            requestAuditOrNavigate(node);
          }}
          enableNodeDrag
          cooldownTicks={160}
          onEngineStop={() => fgRef.current?.zoomToFit?.(400, 80)}
        />
      </div>

      {/* Vinheta neon */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[5] bg-[radial-gradient(ellipse_at_center,transparent_0%,#020308_78%),radial-gradient(circle_at_15%_85%,rgba(88,166,255,0.12),transparent_42%),radial-gradient(circle_at_90%_12%,rgba(239,68,68,0.08),transparent_38%)]"
      />

      {/* HUD */}
      <header className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#30363D]/60 bg-[#020308]/75 px-4 py-3 backdrop-blur-md sm:px-8">
        <BrandLogo to="/" />
        <nav
          className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8B949E] sm:gap-4"
          aria-label="Navegação universo"
        >
          <Link className="text-[#F0F4FC] hover:text-[#58A6FF]" to="/login">
            Modo GOD
          </Link>
          <Link className="hover:text-[#58A6FF]" to="/dashboard">
            Painel
          </Link>
          <Link className="hover:text-[#58A6FF]" to="/dossie/220645">
            Dossiê demo
          </Link>
        </nav>
        <CreditosGOD />
      </header>

      {/* Bento overlays */}
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
              Orbes grandes: partidos. Médias: políticos. Pequenas: fornecedores. Arestas de risco
              brilham em vermelho ou âmbar.
            </p>
          </div>
          <div className="rounded-2xl border border-[#58A6FF]/25 bg-[#0d1117]/50 p-4 backdrop-blur-md">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8B949E]">
              <Zap className="size-3.5 text-amber-400" strokeWidth={2} />
              Economia
            </div>
            <p className="mt-2 text-sm text-[#C9D1D9]">
              Auditar uma <strong className="text-amber-200">conexão crítica</strong> consome{" "}
              <strong>{custoAuditoriaConexao}</strong> créditos no Modo GOD.
            </p>
            <p className="mt-1 font-data text-xs text-[#8B949E]">
              Saldo atual: {saldo.toLocaleString("pt-BR")} Cr
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
                <span className="text-[#8B949E]">Nós ativos</span>
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
              Missão
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[#AAB4C8]">
              Clique num fornecedor ou ligação de alto risco para desbloquear a auditoria forense
              (créditos + sessão MOD GOD).
            </p>
          </div>
          <div className="rounded-2xl border border-[#30363D]/60 bg-[#0d1117]/40 p-3 backdrop-blur-md">
            <div className="flex items-center gap-2 text-[10px] text-[#484F58]">
              <Activity className="size-3" strokeWidth={2} />
              <Hexagon className="size-3" strokeWidth={2} />
              <span>Malha simulada · Data Lake em GCS</span>
            </div>
          </div>
        </aside>
      </div>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="orb-modal-title"
        >
          <div className="max-w-md rounded-2xl border border-amber-500/40 bg-[#0d1117]/95 p-6 shadow-[0_0_60px_rgba(245,158,11,0.2)]">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/35 bg-amber-500/10 text-amber-200">
                <Lock className="size-5" strokeWidth={2} />
              </span>
              <div>
                <h2 id="orb-modal-title" className="text-lg font-semibold text-[#F0F4FC]">
                  Acesso restrito
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[#C9D1D9]">
                  Acesso restrito: use {custoAuditoriaConexao} créditos do Modo GOD para auditar esta
                  conexão
                  {modalNodeLabel ? (
                    <>
                      {" "}
                      (<span className="text-amber-200/95">{modalNodeLabel}</span>)
                    </>
                  ) : null}
                  .
                </p>
                <p className="mt-2 text-xs text-[#8B949E]">
                  {!isAuthenticated
                    ? "Inicie sessão para ativar o protocolo completo."
                    : !canAuditar
                      ? "Saldo insuficiente para esta auditoria."
                      : ""}
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl bg-[#F0F4FC] px-4 py-2.5 text-sm font-semibold text-[#080b14] transition hover:bg-white"
                onClick={() => setModalOpen(false)}
              >
                Fechar
              </button>
              <Link
                to="/login"
                className="rounded-xl border border-[#58A6FF]/45 bg-[#58A6FF]/15 px-4 py-2.5 text-sm font-semibold text-[#58A6FF] transition hover:bg-[#58A6FF]/25"
                onClick={() => setModalOpen(false)}
              >
                Entrar — Modo GOD
              </Link>
              <Link
                to="/creditos"
                className="rounded-xl border border-[#30363D] px-4 py-2.5 text-sm font-medium text-[#C9D1D9] transition hover:border-[#58A6FF]/40"
                onClick={() => setModalOpen(false)}
              >
                Créditos
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
