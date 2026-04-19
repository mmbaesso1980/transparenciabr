import { useMemo, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";

import { getRiskColor, getRiskGlow } from "../utils/colorUtils.js";

const FALLBACK_POLITICO = "#6ea8ff";
const LINK_COLOR = "rgba(148, 163, 184, 0.35)";

/** Normaliza payload Firestore ({ nodes, links }) para o formato do force-graph */
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

function GraphEmpty({ embedded }) {
  const box = embedded
    ? "flex h-full min-h-[160px] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#30363D] bg-[#0D1117]/80 px-4 py-8 text-center"
    : "flex min-h-[280px] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border-strong)] px-6 py-12 text-center";
  return (
    <div className={box}>
      <p className="text-sm font-medium text-[#C9D1D9]">Rede indisponível</p>
      <p className="max-w-sm text-xs leading-relaxed text-[#8B949E]">
        Aguardando grafo relacional persistido no Firestore (campo{" "}
        <span className="font-mono text-[11px] text-[#58A6FF]">grafo_rede</span>
        ou equivalente derivado do pipeline BigQuery).
      </p>
    </div>
  );
}

/** Grafo de força 2D — apenas dados persistidos no Firestore (sem dados sintéticos). */
function nodeRadius(node) {
  switch (node.tipo) {
    case "politico":
      return 12;
    case "alerta":
      return 8;
    case "empresa":
      return 9;
    case "familiar":
      return 8;
    default:
      return 8;
  }
}

export default function NetworkGraph({
  politicianId,
  embedded = false,
  graphPayload = null,
}) {
  const fgRef = useRef(null);

  const graphData = useMemo(
    () => normalizeFirestoreGraph(graphPayload),
    [graphPayload],
  );

  const shellClass = embedded
    ? "flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-[#30363D]"
    : "w-full overflow-hidden rounded-2xl border border-[var(--border-subtle)]";

  const shellStyle = embedded
    ? { flex: "1 1 auto", background: "#080b14", minHeight: 0 }
    : {
        height: "min(70vh, 520px)",
        background: "var(--bg-void)",
      };

  const innerWrapClass = embedded
    ? "relative min-h-0 flex-1 w-full"
    : undefined;
  const innerWrapStyle = embedded ? { flex: "1 1 auto", minHeight: 0 } : undefined;

  if (!graphData?.nodes?.length) {
    return (
      <div className={shellClass} style={shellStyle}>
        <div className={innerWrapClass} style={innerWrapStyle}>
          <GraphEmpty embedded={embedded} />
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass} style={shellStyle} key={politicianId}>
      <div className={innerWrapClass} style={innerWrapStyle}>
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        backgroundColor="#080b14"
        linkColor={() => LINK_COLOR}
        linkWidth={1.25}
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
        onEngineStop={() => fgRef.current?.zoomToFit?.(400, 80)}
      />
      </div>
    </div>
  );
}
