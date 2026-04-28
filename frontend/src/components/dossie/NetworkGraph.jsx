import { useMemo } from "react";

import { getRiskColor } from "../../utils/colorUtils.js";

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

function layoutCircle(nodes, cx, cy, R) {
  const n = nodes.length;
  const map = new Map();
  for (let i = 0; i < n; i++) {
    const ang = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
    map.set(nodes[i].id, {
      x: cx + R * Math.cos(ang),
      y: cy + R * Math.sin(ang),
    });
  }
  return map;
}

/**
 * Teia — SVG (sem workers / MIME). Dados reais do Firestore quando existem.
 */
export default function NetworkGraph({
  politicianId,
  embedded = false,
  graphPayload = null,
  centralLabel = "",
}) {
  const normalizedReal = useMemo(
    () => normalizeFirestoreGraph(graphPayload),
    [graphPayload],
  );

  const graphData = useMemo(() => {
    if (normalizedReal?.nodes?.length) return normalizedReal;
    return buildFallbackGraph(centralLabel);
  }, [normalizedReal, centralLabel]);

  const isPersisted = !!normalizedReal?.nodes?.length;

  const { positions, edgePaths, vbW, vbH } = useMemo(() => {
    const w = 520;
    const h = embedded ? 260 : 420;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.32;
    const pos = layoutCircle(graphData.nodes, cx, cy, R);
    const edges = [];
    for (const L of graphData.links) {
      const a = pos.get(String(L.source));
      const b = pos.get(String(L.target));
      if (a && b) edges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
    return { positions: pos, edgePaths: edges, vbW: w, vbH: h };
  }, [graphData, embedded]);

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
      <div
        className="relative min-h-0 flex-1 w-full"
        style={{ flex: embedded ? "1 1 auto" : undefined }}
      >
        <svg
          className="block h-full w-full"
          viewBox={`0 0 ${vbW} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Grafo de rede"
        >
          <rect
            width="100%"
            height="100%"
            fill="rgba(8,11,20,0.92)"
          />
          {edgePaths.map((e, i) => (
            <line
              key={`e-${i}`}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              stroke={LINK_COLOR}
              strokeWidth={1.35}
            />
          ))}
          {graphData.nodes.map((node) => {
            const p = positions.get(node.id);
            if (!p) return null;
            const r = nodeRadius(node);
            const score =
              typeof node.riskScore === "number" ? node.riskScore : 50;
            const fill = node.color || getRiskColor(score) || FALLBACK_POLITICO;
            return (
              <g key={node.id}>
                <circle cx={p.x} cy={p.y} r={r} fill={fill} opacity={0.95} />
                <text
                  x={p.x}
                  y={p.y + r + 12}
                  textAnchor="middle"
                  fill="rgba(240,244,252,0.92)"
                  fontSize={10}
                  fontFamily="system-ui, sans-serif"
                >
                  {String(node.label || node.id).slice(0, 22)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
