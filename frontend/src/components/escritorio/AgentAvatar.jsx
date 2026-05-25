import { AlertTriangle, Check } from "lucide-react";

/**
 * Avatar individual de um agente da Legião 100 com estado visual.
 *
 * Estados:
 *   - "pending" — cinza opaco
 *   - "running" — pulsante teal + ring
 *   - "done"    — verde sólido com check
 *   - "error"   — vermelho com triângulo
 */
export default function AgentAvatar({ agent, status = "pending", size = 44 }) {
  const tone = {
    pending: {
      bg: "bg-slate-800/60",
      ring: "ring-slate-700/60",
      text: "text-slate-400",
      animate: "",
    },
    running: {
      bg: "bg-teal-500/20",
      ring: "ring-teal-400",
      text: "text-teal-100",
      animate: "animate-pulse",
    },
    done: {
      bg: "bg-emerald-600/80",
      ring: "ring-emerald-400",
      text: "text-white",
      animate: "",
    },
    error: {
      bg: "bg-rose-700/80",
      ring: "ring-rose-400",
      text: "text-white",
      animate: "",
    },
  }[status] || {
    bg: "bg-slate-800/60",
    ring: "ring-slate-700/60",
    text: "text-slate-400",
    animate: "",
  };

  const tooltip = `${agent.nome}\n${agent.papel}`;

  return (
    <div className="group relative flex flex-col items-center" title={tooltip}>
      <div
        className={[
          "flex items-center justify-center rounded-full ring-2 transition-all",
          tone.bg,
          tone.ring,
          tone.text,
          tone.animate,
        ].join(" ")}
        style={{ width: size, height: size }}
        role="img"
        aria-label={`${agent.nome} — ${status}`}
      >
        <span className="text-lg leading-none" aria-hidden="true">
          {agent.avatar || "⚙️"}
        </span>
        {status === "done" ? (
          <Check
            className="absolute -bottom-1 -right-1 size-4 rounded-full bg-emerald-600 p-0.5 text-white ring-2 ring-[#0e1117]"
            strokeWidth={3}
          />
        ) : null}
        {status === "error" ? (
          <AlertTriangle
            className="absolute -bottom-1 -right-1 size-4 rounded-full bg-rose-700 p-0.5 text-white ring-2 ring-[#0e1117]"
            strokeWidth={2.5}
          />
        ) : null}
      </div>
      <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-56 -translate-x-1/2 rounded-md border border-teal-500/30 bg-[#0b1218] px-3 py-2 text-xs text-slate-200 shadow-xl group-hover:block">
        <p className="font-semibold text-teal-300">{agent.nome}</p>
        <p className="mt-1 text-[11px] leading-snug text-slate-400">
          {agent.papel}
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
          status: {status}
        </p>
      </div>
    </div>
  );
}
