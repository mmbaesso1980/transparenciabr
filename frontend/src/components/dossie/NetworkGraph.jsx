import { useMemo, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";

import { getRiskColor, getRiskGlow } from "../../utils/colorUtils.js";

const FALLBACK_POLITICO = "#6ea8ff";
const LINK_COLOR = "rgba(148, 163, 184, 0.45)";

/** Grafo demo — cadeia típica do protocolo (Motor Forense TransparênciaBR). */
function buildFallbackGraph(centralLabel) {
  const p = String(centralLabel || "Parlamentar alvo").slice(0, 48);
  return {
    nodes: [
      {
        id: "fn-politico",
        label: p,
        tipo: "politico",
        riskScore: 88,
        color: "#dc2626",
      },
      {
        id: "fn-municipio",
        label: "Município-base (CEAP)",
        tipo: "municipio",
        riskScore: 42,
        color: "#22c55e",
      },
      {
        id: "fn-empresa",
        label: "Empresa suspeita (fornecedor)",
        tipo: "empresa",
        riskScore: 71,
        color: "#f97316",
      },
      {
        id: "fn-contrato",
        label: "Contrato emergencial",
        tipo: "contrato",
        riskScore: 55,
        color: "#94a3b8",
      },
    ],
    links: [
      { source: "fn-politico", target: "fn-municipio" },
      { source: "fn-municipio", target: "fn-empresa" },
      { source: "fn-empresa", target: "fn-contrato" },
    ],
  };
}

function normalizeFirestoreGraph(raw) {
  if (!raw || typeof raw !== "object") return null;
  const nodesIn = raw.nodes ?? raw.vertices;
  const linksIn = raw.links ?? raw.edges ?? raw.arcos;
  if (!Array.isArray(nodesIn) || nodesIn.length === 0) return null;

  const nodes = nodesIn.map((n, idx) => {
    const risk = Number(n.riskScore ?? n.score ?? n.indice_risco ?? n.indice ?? 50);
    const score = Number.isFinite(risk) ? Math.min(100, Math.max(0, risk)) : 50;
    return {
      id: String(n.id ?? n.key ?? idx),
      label: String(n.label ?? n.nome ?? n.titulo ?? n.id ?? `#${idx}`),
      tipo: String(n.tipo ?? "no"),
      riskScore: score,
      color: n.color ?? getRiskColor(score),
    };
  });

  const nodeIds = new Set(nodes.map((n) => n.id));
  const links = [];
  if (Array.isArray(linksIn)) {
    for (const L of linksIn) {
      const s = L.source ?? L.origem ?? L.from;
      const t = L.target ?? L.destino ?? L.to;
      const sid = typeof s === "object" ? s?.id : s;
      const tid = typeof t === "object" ? t?.id : t;
      if (sid == null || tid == null) continue;
      const ss = String(sid);
      const tt = String(tid);
      if (!nodeIds.has(ss) || !nodeIds.has(tt)) continue;
      links.push({ source: ss, target: tt });
    }
  }

  return { nodes, links };
}

function nodeRadius(node) {
  switch (node.tipo) {
    case "politico":
      return 14;
    case "municipio":
      return 11;
    case "empresa":
      return 10;
    case "contrato":
      return 9;
    case "alerta":
      return 8;
    default:
      return 8;
  }
}

/**
 * Teia interativa — dados reais do Firestore quando existem; caso contrário, grafo simulado.
 * Container com glassmorphism para o Motor Forense TransparênciaBR.
 */
export default function NetworkGraph({
  politicianId,
  embedded = false,
  graphPayload = null,
  centralLabel = "",
}) {
  const fgRef = useRef(null);

  const normalizedReal = useMemo(
    () => normalizeFirestoreGraph(graphPayload),
    [graphPayload],
  );

  const graphData = useMemo(() => {
    if (normalizedReal?.nodes?.length) return normalizedReal;
    return buildFallbackGraph(centralLabel);
  }, [normalizedReal, centralLabel]);

  const isPersisted = !!normalizedReal?.nodes?.length;

  const outerClass = embedded
    ? "relative flex min-h-[280px] min-h-0 w-full max-w-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#30363D] bg-[#0D1117]/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md"
    : "relative w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-[#30363D] bg-[#0D1117]/75 backdrop-blur-md";

  const outerStyle = embedded
    ? { flex: "1 1 auto", minHeight: 0 }
    : { height: "min(70vh, 520px)" };

  const hint = isPersisted ? (
    <p className="pointer-events-none absolute bottom-2 left-3 z-10 font-mono text-[10px] text-[#8B949E]">
      Fonte: grafo persistido
    </p>
  ) : (
    <p className="pointer-events-none absolute bottom-2 left-3 z-10 font-mono text-[10px] text-[#f97316]/90">
      Modo demonstração — aguardando rede persistida
    </p>
  );

  return (
    <div className={outerClass} style={outerStyle} key={politicianId}>
      {hint}
      <div className="relative min-h-0 flex-1 w-full" style={{ flex: embedded ? "1 1 auto" : undefined }}>
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          backgroundColor="rgba(8,11,20,0.92)"
          linkColor={() => LINK_COLOR}
          linkWidth={1.35}
          nodeLabel="label"
          nodeCanvasObject={(node, ctx, globalScale) => {
            const label = node.label || node.id;
            const r = nodeRadius(node);
            const score =
              typeof node.riskScore === "number" ? node.riskScore : 50;
            const fill = node.color || getRiskColor(score) || FALLBACK_POLITICO;
            const glow = getRiskGlow(score);

            ctx.save();
            ctx.shadowColor = fill;
            ctx.shadowBlur = 12 * glow;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.restore();

            if (globalScale > 0.55) {
              ctx.font = `${10 / globalScale}px var(--font-sans), sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillStyle = "rgba(240,244,252,0.92)";
              ctx.fillText(label, node.x, node.y + r + 2 / globalScale);
            }
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            const r = nodeRadius(node) + 3;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
            ctx.fill();
          }}
          enableNodeDrag
          cooldownTicks={120}
          onEngineStop={() => fgRef.current?.zoomToFit?.(400, 90)}
        />
      </div>
    </div>
  );
}
