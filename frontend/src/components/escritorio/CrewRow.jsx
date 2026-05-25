import AgentAvatar from "./AgentAvatar.jsx";

/**
 * Uma linha de 10 agentes da mesma crew.
 *
 * @param {{
 *   crew: { id: string, nome: string, emoji: string, missao: string, agentes: Array, forensic?: boolean },
 *   agentStatusMap: Record<string, string>,
 * }} props
 */
export default function CrewRow({ crew, agentStatusMap = {} }) {
  const totals = crew.agentes.reduce(
    (acc, a) => {
      const st = agentStatusMap[a.id] || "pending";
      acc[st] = (acc[st] || 0) + 1;
      return acc;
    },
    { pending: 0, running: 0, done: 0, error: 0 },
  );

  return (
    <div
      className={[
        "flex items-center gap-4 rounded-xl border px-4 py-3",
        crew.forensic
          ? "border-teal-500/50 bg-teal-500/5"
          : "border-slate-800 bg-slate-900/40",
      ].join(" ")}
    >
      <div className="flex w-44 shrink-0 flex-col">
        <div className="flex items-center gap-2">
          <span className="text-2xl leading-none" aria-hidden="true">
            {crew.emoji}
          </span>
          <p className="text-sm font-semibold text-slate-100">{crew.nome}</p>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-slate-500 line-clamp-2">
          {crew.missao}
        </p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-teal-300">
          {totals.done}/{crew.agentes.length} done
          {totals.running > 0 ? ` · ${totals.running} em curso` : ""}
          {totals.error > 0 ? ` · ${totals.error} erro` : ""}
        </p>
      </div>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {crew.agentes.map((agent) => (
          <AgentAvatar
            key={agent.id}
            agent={agent}
            status={agentStatusMap[agent.id] || "pending"}
          />
        ))}
      </div>
    </div>
  );
}
