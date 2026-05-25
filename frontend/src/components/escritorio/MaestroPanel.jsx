import { Activity, FileCheck2, Loader2, ShieldAlert } from "lucide-react";

import { CREWS, MAESTRO, totalAgentes } from "../../constants/legiao100.js";

/**
 * Painel do Maestro Supremo — resumo agregado da Legião + logs em tempo real.
 *
 * @param {{
 *   status: string|null,
 *   alvo: string|null,
 *   agentStatusMap: Record<string,string>,
 *   logs: Array<{ts?: any, agent_id?: string, message?: string}>,
 *   pdfUrl: string|null,
 *   findingsCount: number|null,
 * }} props
 */
export default function MaestroPanel({
  status,
  alvo,
  agentStatusMap = {},
  logs = [],
  pdfUrl = null,
  findingsCount = null,
}) {
  const total = totalAgentes();
  const counts = Object.values(agentStatusMap).reduce(
    (acc, st) => {
      acc[st] = (acc[st] || 0) + 1;
      return acc;
    },
    { pending: 0, running: 0, done: 0, error: 0 },
  );
  counts.pending = Math.max(total - (counts.running + counts.done + counts.error), 0);

  const crewProgress = CREWS.map((crew) => {
    const done = crew.agentes.filter(
      (a) => agentStatusMap[a.id] === "done",
    ).length;
    return { id: crew.id, nome: crew.nome, emoji: crew.emoji, done, total: crew.agentes.length };
  });

  return (
    <aside className="flex w-full max-w-sm shrink-0 flex-col gap-4 rounded-2xl border border-teal-500/30 bg-[#0b1218] p-5">
      <div className="flex items-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-500/80 to-teal-700/80 text-3xl shadow-lg ring-2 ring-teal-400">
          <span aria-hidden="true">{MAESTRO.avatar}</span>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-300">
            Maestro Supremo
          </p>
          <p className="text-sm font-semibold text-slate-100">{MAESTRO.nome}</p>
          {alvo ? (
            <p className="mt-0.5 text-[11px] text-slate-400">Alvo: {alvo}</p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Metric label="Total" value={total} icon={<Activity className="size-3.5" />} tone="slate" />
        <Metric
          label="Em curso"
          value={counts.running || 0}
          icon={<Loader2 className="size-3.5 animate-spin" />}
          tone="teal"
        />
        <Metric label="Concluídos" value={counts.done || 0} icon={<FileCheck2 className="size-3.5" />} tone="emerald" />
        <Metric label="Erros" value={counts.error || 0} icon={<ShieldAlert className="size-3.5" />} tone="rose" />
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Progresso por crew
        </p>
        <ul className="mt-2 space-y-1">
          {crewProgress.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-md bg-slate-900/60 px-2 py-1 text-[11px] text-slate-300"
            >
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true">{c.emoji}</span>
                <span className="truncate">{c.nome}</span>
              </span>
              <span className="font-mono font-semibold text-teal-300">
                {c.done}/{c.total}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Logs em tempo real
        </p>
        <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-slate-800 bg-black/40 p-2 font-mono text-[10px] leading-snug text-slate-300">
          {logs.length === 0 ? (
            <p className="text-slate-600">— sem eventos ainda —</p>
          ) : (
            logs.slice(-20).map((entry, i) => (
              <p key={i} className="truncate">
                <span className="text-teal-400">{entry.agent_id || "sys"}</span>{" "}
                <span className="text-slate-500">›</span> {entry.message || ""}
              </p>
            ))
          )}
        </div>
      </div>

      {status === "done" && pdfUrl ? (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-emerald-500"
        >
          <FileCheck2 className="size-4" />
          Abrir dossiê PDF
          {findingsCount ? ` (${findingsCount} findings)` : ""}
        </a>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-700 px-3 py-2 text-center text-[11px] text-slate-500">
          {status === "running"
            ? "A consolidar dossiê — aguardando os 10 eixos…"
            : status === "error"
              ? "Falha durante consolidação. Verifique logs."
              : "Dossiê aparece aqui quando concluído."}
        </p>
      )}
    </aside>
  );
}

function Metric({ label, value, icon, tone }) {
  const toneCls = {
    slate: "border-slate-700 bg-slate-900/60 text-slate-200",
    teal: "border-teal-500/40 bg-teal-500/10 text-teal-200",
    emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    rose: "border-rose-500/40 bg-rose-500/10 text-rose-200",
  }[tone || "slate"];
  return (
    <div className={`flex items-center gap-2 rounded-md border px-2.5 py-2 ${toneCls}`}>
      <span className="opacity-80">{icon}</span>
      <div className="flex flex-col leading-tight">
        <span className="text-[9px] uppercase tracking-wider opacity-70">{label}</span>
        <span className="font-mono text-base font-bold">{value}</span>
      </div>
    </div>
  );
}
