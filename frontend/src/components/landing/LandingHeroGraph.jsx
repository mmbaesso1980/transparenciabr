import ForceGraph2D from "react-force-graph-2d";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getRiskColor, getRiskGlow } from "../../utils/colorUtils.js";

function safePositive(n, fallback) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function tierRadius(node) {
  switch (node.tier) {
    case "grande":
      return 22;
    case "medio":
      return 11;
    case "pequeno":
      return 7;
    default:
      return 9;
  }
}

function drawRadialOrb(ctx, x, y, r, fill, glowStrength) {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(r) ||
    r <= 0 ||
    typeof fill !== "string" ||
    !fill.length
  ) {
    return;
  }
  const gs = safePositive(glowStrength, 0.35);
  const innerR = safePositive(r * 0.12, 1);
  const outerR = safePositive(r * 1.35, r);

  const grd = ctx.createRadialGradient(
    x - r * 0.35,
    y - r * 0.35,
    innerR,
    x,
    y,
    outerR,
  );
  grd.addColorStop(0, "rgba(255,255,255,0.95)");
  grd.addColorStop(0.22, fill);
  grd.addColorStop(0.72, fill);
  grd.addColorStop(1, "rgba(0,0,0,0)");

  ctx.save();
  ctx.shadowColor = fill;
  ctx.shadowBlur = 18 * gs;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI, false);
  ctx.fillStyle = grd;
  ctx.fill();

  ctx.shadowBlur = 28 * gs;
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

/**
 * Grafo fullscreen — void UK-data, glow radial, ligações pulsantes.
 *
 * @param {{
 *   graphData: { nodes: object[], links: object[] },
 *   onNodeClick: (node: object) => void,
 *   empty?: boolean,
 * }} props
 */
export default function LandingHeroGraph({ graphData, onNodeClick, empty = false }) {
  const fgRef = useRef(null);
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 1200, h: 800 });
  const [pulse, setPulse] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr && cr.width > 0 && cr.height > 0) {
        setDims({ w: Math.floor(cr.width), h: Math.floor(cr.height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const tick = () => {
      setPulse((t) => (t + 0.016) % 6283);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const pulseAlpha = useMemo(() => 0.38 + Math.sin(pulse * 0.002) * 0.12, [pulse]);

  const handleClick = useCallback(
    (node) => {
      if (node && typeof onNodeClick === "function") onNodeClick(node);
    },
    [onNodeClick],
  );

  const linkPaint = useCallback(
    (link, ctx) => {
      const s = link.source;
      const t = link.target;
      if (!s || !t) return;
      const sx = s.x;
      const sy = s.y;
      const tx = t.x;
      const ty = t.y;
      if (![sx, sy, tx, ty].every(Number.isFinite)) return;
      const risk = typeof link.risk === "number" && Number.isFinite(link.risk) ? link.risk : 40;
      const warm = risk >= 60;
      const a = pulseAlpha * (warm ? 0.85 : 0.55);
      ctx.save();
      ctx.strokeStyle = warm
        ? `rgba(248,113,113,${a + 0.12})`
        : `rgba(147,197,253,${a + 0.08})`;
      ctx.lineWidth = warm ? 2.2 : 1.35;
      ctx.shadowBlur = warm ? 14 : 9;
      ctx.shadowColor = warm ? "rgba(239,68,68,0.55)" : "rgba(96,165,250,0.45)";
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      ctx.strokeStyle = warm
        ? `rgba(254,202,202,${a * 0.45})`
        : `rgba(186,230,253,${a * 0.4})`;
      ctx.lineWidth = warm ? 5 : 3.5;
      ctx.shadowBlur = warm ? 22 : 14;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.restore();
    },
    [pulseAlpha],
  );

  if (empty || !graphData?.nodes?.length) {
    return (
      <div ref={containerRef} className="absolute inset-0 bg-[#02040a]">
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 50% 40%, rgba(88,166,255,0.08) 0%, transparent 55%)",
          }}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="absolute inset-0 touch-none">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        backgroundColor="#02040a"
        width={dims.w}
        height={dims.h}
        linkCanvasObjectMode="replace"
        linkCanvasObject={linkPaint}
        nodeLabel={(n) =>
          `${n.label || n.id}${n.tipo ? ` · ${n.tipo}` : ""}`
        }
        nodePointerAreaPaint={(node, color, ctx) => {
          if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
          const base = tierRadius(node);
          const r = safePositive(base + 8, 12);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
          ctx.fill();
        }}
        nodeCanvasObject={(node, ctx, globalScale) => {
          if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;

          const rawR = tierRadius(node);
          const r = safePositive(rawR, 9);

          const scoreRaw =
            typeof node.riskScore === "number" ? node.riskScore : 45;
          const score = Number.isFinite(scoreRaw)
            ? Math.min(100, Math.max(0, scoreRaw))
            : 45;

          const hueRaw =
            node.tipo === "partido" && typeof node.partyHue === "number"
              ? node.partyHue
              : null;
          const fill =
            hueRaw != null && Number.isFinite(hueRaw)
              ? `hsl(${Math.min(360, Math.max(0, hueRaw))}, 72%, 58%)`
              : getRiskColor(score);

          let glow = getRiskGlow(score);
          if (!Number.isFinite(glow)) glow = 0.35;
          glow = Math.min(2, Math.max(0.08, glow));
          const glowBoost = node.tier === "grande" ? 0.35 : 0;

          drawRadialOrb(ctx, node.x, node.y, r, fill, glow + glowBoost);

          const gs = safePositive(globalScale, 1);

          if (node.tipo === "fornecedor" && node.critical) {
            const ringExtra = safePositive(4 / gs, 4);
            const outerR = safePositive(r + ringExtra, r + 2);
            ctx.save();
            ctx.strokeStyle = "rgba(239,68,68,0.75)";
            ctx.lineWidth = safePositive(2.5 / gs, 1);
            ctx.shadowColor = "rgba(239,68,68,0.9)";
            ctx.shadowBlur = 16;
            ctx.beginPath();
            ctx.arc(node.x, node.y, outerR, 0, 2 * Math.PI, false);
            ctx.stroke();
            ctx.restore();
          }

          if (gs > 0.28) {
            const fontPx = safePositive(10 / gs, 8);
            const dy = safePositive(r + 3 / gs, r + 2);
            ctx.font = `${fontPx}px var(--font-sans), ui-sans-serif, system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = "rgba(240,244,252,0.88)";
            const lbl = String(node.label || node.id).slice(0, 26);
            ctx.fillText(lbl, node.x, node.y + dy);
          }
        }}
        onNodeClick={handleClick}
        enableNodeDrag
        d3VelocityDecay={0.22}
        d3AlphaDecay={0.022}
        warmupTicks={120}
        cooldownTicks={Infinity}
        onEngineTick={() => {
          const fg = fgRef.current;
          if (!fg) return;
          const data = fg.graphData();
          const nodes = data.nodes || [];
          for (const n of nodes) {
            if (n.tipo === "partido") {
              const mass = Number.isFinite(Number(n.mass)) ? Number(n.mass) : 10;
              const k = Math.min(0.99, Math.max(0, mass * 0.018));
              const vx = Number.isFinite(n.vx) ? n.vx : 0;
              const vy = Number.isFinite(n.vy) ? n.vy : 0;
              n.vx = vx * (1 - k);
              n.vy = vy * (1 - k);
            }
          }
        }}
        onEngineStop={() => fgRef.current?.zoomToFit?.(480, 100)}
        nodeVal={(n) => {
          const m = n?.mass;
          return Number.isFinite(Number(m)) ? Math.max(1, Number(m)) : 4;
        }}
      />
    </div>
  );
}

