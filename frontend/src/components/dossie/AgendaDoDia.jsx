import { CalendarClock } from "lucide-react";
import { useMemo } from "react";

function fmtDataHoje() {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

/** Mock robusto — substituído por `politico.agenda_do_dia` quando existir no Firestore. */
const MOCK_AGENDA_HOJE = [
  {
    hora: "09:30",
    titulo: "Reunião de líderes — definição da pauta da semana",
    local: "Sala de líderes",
  },
  {
    hora: "10:00",
    titulo: "Comissão de Constituição e Justiça (CCJ)",
    local: "Anexo II, sala 12",
  },
  {
    hora: "14:30",
    titulo: "Sessão deliberativa ordinária — Plenário",
    local: "Plenário Ulysses Guimarães",
  },
  {
    hora: "16:45",
    titulo: "Audiência pública — transparência em transferências voluntárias",
    local: "Anexo I, auditório Nereu Ramos",
  },
];

/**
 * @param {{ politico?: Record<string, unknown> | null }} props
 */
export default function AgendaDoDia({ politico = null }) {
  const items = useMemo(() => {
    const raw = politico?.agenda_do_dia;
    if (Array.isArray(raw)) {
      return raw.length
        ? raw.map((ev, i) => ({
            hora: String(ev?.hora ?? ev?.horario ?? "—"),
            titulo: String(ev?.titulo ?? ev?.evento ?? "Evento"),
            local:
              typeof ev?.local === "string" && ev.local.trim()
                ? ev.local
                : undefined,
            key: `${ev?.id ?? i}`,
          }))
        : [];
    }
    return MOCK_AGENDA_HOJE.map((ev, i) => ({
      ...ev,
      key: `mock-${i}`,
    }));
  }, [politico]);

  const empty =
    Array.isArray(politico?.agenda_do_dia) && politico.agenda_do_dia.length === 0;

  return (
    <section className="glass-card flex min-h-[18rem] w-full max-w-full min-w-0 flex-col overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-[#30363D] px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarClock
            className="size-4 text-[#58A6FF]"
            strokeWidth={1.75}
            aria-hidden
          />
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-[#F0F4FC]">
              Agenda do dia
            </h2>
            <p className="text-[11px] capitalize text-[#8B949E]">{fmtDataHoje()}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-0 px-4 py-4">
        {empty ? (
          <p className="py-8 text-center text-sm text-[#8B949E]">
            Sem compromissos oficiais registrados para hoje.
          </p>
        ) : (
          <ol className="relative flex flex-col gap-0 border-l border-[#30363D] pl-6">
            {items.map((ev, idx) => (
              <li key={ev.key ?? idx} className="relative pb-8 last:pb-0">
                <span
                  className="absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-[#58A6FF] bg-[#080B14]"
                  aria-hidden
                />
                <p className="font-data text-[11px] font-semibold tabular-nums text-[#7DD3FC]">
                  {ev.hora}
                </p>
                <p className="mt-1 text-sm font-medium leading-snug text-[#F0F4FC]">
                  {ev.titulo}
                </p>
                {ev.local ? (
                  <p className="mt-1 text-xs text-[#8B949E]">{ev.local}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
