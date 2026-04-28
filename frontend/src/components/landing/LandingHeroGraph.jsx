import ForceGraph2D from "react-force-graph-2d";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getRiskColor, getRiskGlow } from "../../utils/colorUtils.js";

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
  const grd = ctx.createRadialGradient(
    x - r * 0.35,
    y - r * 0.35,
    r * 0.12,
    x,
    y,
    r * 1.35,
  );
  grd.addColorStop(0, "rgba(255,255,255,0.95)");
  grd.addColorStop(0.22, fill);
  grd.addColorStop(0.72, fill);
  grd.addColorStop(1, "rgba(0,0,0,0)");

  ctx.save();
  ctx.shadowColor = fill;
  ctx.shadowBlur = 18 * glowStrength;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI, false);
  ctx.fillStyle = grd;
  ctx.fill();

  ctx.shadowBlur = 28 * glowStrength;
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
      if (!s || !t || s.x == null || t.x == null) return;
      const risk = typeof link.risk === "number" ? link.risk : 40;
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
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();

      ctx.strokeStyle = warm
        ? `rgba(254,202,202,${a * 0.45})`
        : `rgba(186,230,253,${a * 0.4})`;
      ctx.lineWidth = warm ? 5 : 3.5;
      ctx.shadowBlur = warm ? 22 : 14;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
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
          const r = tierRadius(node) + 8;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
          ctx.fill();
        }}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const r = tierRadius(node);
          const score =
            typeof node.riskScore === "number" ? node.riskScore : 45;
          const fill =
            node.tipo === "partido" && typeof node.partyHue === "number"
              ? `hsl(${node.partyHue}, 72%, 58%)`
              : getRiskColor(score);
          const glow = getRiskGlow(score);
          drawRadialOrb(ctx, node.x, node.y, r, fill, glow + (node.tier === "grande" ? 0.35 : 0));

          if (node.tipo === "fornecedor" && node.critical) {
            ctx.save();
            ctx.strokeStyle = "rgba(239,68,68,0.75)";
            ctx.lineWidth = 2.5 / globalScale;
            ctx.shadowColor = "rgba(239,68,68,0.9)";
            ctx.shadowBlur = 16;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r + 4 / globalScale, 0, 2 * Math.PI, false);
            ctx.stroke();
            ctx.restore();
          }

          if (globalScale > 0.28) {
            ctx.font = `${10 / globalScale}px var(--font-sans), ui-sans-serif, system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = "rgba(240,244,252,0.88)";
            const lbl = String(node.label || node.id).slice(0, 26);
            ctx.fillText(lbl, node.x, node.y + r + 3 / globalScale);
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
              const k = (n.mass || 10) * 0.018;
              n.vx = (n.vx || 0) * (1 - k);
              n.vy = (n.vy || 0) * (1 - k);
            }
          }
        }}
        onEngineStop={() => fgRef.current?.zoomToFit?.(480, 100)}
        nodeVal={(n) => n.mass ?? 4}
      />
    </div>
  );
}

