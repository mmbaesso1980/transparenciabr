import { Building2, Droplets, Hash, Layers } from "lucide-react";
import { useMemo } from "react";

function fmtBrl(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function fmtNum(n, digits = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

/** Converte saneamento para percentagem 0–100 para a barra visual. */
function saneamentoPct(m) {
  const rawPct = Number(m.esgoto_tratado_pct);
  if (Number.isFinite(rawPct)) {
    return Math.min(100, Math.max(0, rawPct));
  }
  const ratio = Number(m.indice_atendimento_esgoto);
  if (Number.isFinite(ratio)) {
    if (ratio <= 1) return Math.min(100, Math.max(0, ratio * 100));
    return Math.min(100, Math.max(0, ratio));
  }
  return null;
}

function leitosPorMil(m) {
  const mil = Number(m.leitos_por_mil);
  if (Number.isFinite(mil)) return mil;
  const hab = Number(m.leitos_por_habitante);
  if (Number.isFinite(hab)) return hab * 1000;
  return null;
}

function normalizeItem(m, idx) {
  const codigo =
    m?.codigo_ibge_municipio ??
    m?.id_municipio ??
    m?.codigo_ibge ??
    `idx-${idx}`;
  const nome =
    (typeof m?.nome_municipio === "string" && m.nome_municipio.trim()) ||
    (typeof m?.nome === "string" && m.nome.trim()) ||
    `Município ${codigo}`;
  const uf = String(m?.uf ?? m?.sigla_uf ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  const total =
    Number(
      m?.total_emendas_valor ??
        m?.total_emendas ??
        m?.valor_emenda ??
        m?.total_valor_emendas,
    ) || 0;
  const pop =
    m?.populacao != null ? Number(m.populacao) : Number(m?.populacao_ibge);
  const idh =
    m?.idh_municipal != null
      ? Number(m.idh_municipal)
      : m?.idh != null
        ? Number(m.idh)
        : Number(m?.idhm);
  const ideb =
    m?.ideb_anos_finais != null
      ? Number(m.ideb_anos_finais)
      : Number(m?.ideb);
  const sp = saneamentoPct(m);
  const lm = leitosPorMil(m);

  return {
    key: String(codigo),
    nome,
    uf: uf || "—",
    total_emendas: total,
    populacao: Number.isFinite(pop) ? pop : null,
    idh: Number.isFinite(idh) ? idh : null,
    ideb: Number.isFinite(ideb) ? ideb : null,
    saneamento_pct: sp,
    leitos_por_mil: Number.isFinite(lm) ? lm : null,
  };
}

/**
 * Hotpage — contexto socioeconómico injetado no único documento `politicos/{id}` (sem reads extra).
 *
 * @param {{ politico?: Record<string, unknown> | null, variant?: "full" | "bento" }} props
 */
export default function SocioeconomicBaseSection({ politico, variant = "full" }) {
  const municipiosRaw = politico?.contexto_socioeconomico?.municipios || [];

  const rows = useMemo(
    () => municipiosRaw.map((m, i) => normalizeItem(m, i)),
    [municipiosRaw],
  );

  const meta = politico?.contexto_socioeconomico;
  const fonte = typeof meta?.fonte === "string" ? meta.fonte : null;

  if (rows.length === 0) {
    if (variant === "bento") {
      return (
        <section className="glass-card flex min-h-[18rem] w-full max-w-full min-w-0 flex-col items-center justify-center overflow-hidden px-4 py-10 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full border border-[#30363D] bg-[#161B22]">
            <Layers className="size-6 text-[#484F58]" strokeWidth={1.5} aria-hidden />
          </div>
          <p className="text-sm font-medium tracking-tight text-[#C9D1D9]">
            Malha socioeconómica em preparação
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[12px] leading-relaxed text-[#8B949E]">
            Indicadores IBGE e correlatos serão embutidos após a sincronização.
          </p>
          {fonte ? (
            <p className="mt-4 font-data text-[10px] text-[#484F58]">Pipeline: {fonte}</p>
          ) : null}
        </section>
      );
    }
    return (
      <section className="col-span-12 max-w-full min-w-0 px-4 pb-6 sm:px-6">
        <div className="glass rounded-xl border border-[#30363D] bg-[#0D1117]/80 px-6 py-12 text-center backdrop-blur-md sm:px-8">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-[#30363D] bg-[#161B22]">
            <Layers className="size-6 text-[#484F58]" strokeWidth={1.5} aria-hidden />
          </div>
          <p className="text-sm font-medium tracking-tight text-[#C9D1D9]">
            Malha socioeconómica em preparação
          </p>
          <p className="mx-auto mt-3 max-w-lg text-[13px] leading-relaxed text-[#8B949E]">
            Processando indicadores IBGE/Censo, PNUD, INEP e SNIS para os municípios-alvo.
            Os cartões aparecem automaticamente após a sincronização BigQuery→Firestore — sem
            custo adicional de leitura nesta página.
          </p>
          {fonte ? (
            <p className="mt-6 font-mono text-[10px] text-[#484F58]">Pipeline: {fonte}</p>
          ) : null}
        </div>
      </section>
    );
  }

  if (variant === "bento") {
    return (
      <section className="glass-card flex max-h-[32rem] min-h-[24rem] w-full max-w-full min-w-0 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-end justify-between gap-2 border-b border-[#30363D] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Building2 className="size-4 shrink-0 text-[#7DD3FC]" strokeWidth={1.75} />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-tight text-[#F0F4FC]">
                IBGE · base eleitoral
              </h2>
              <p className="mt-0.5 text-[10px] text-[#8B949E]">
                PNUD · INEP · SNIS (agregado)
              </p>
            </div>
          </div>
          {fonte ? (
            <span className="font-data text-[9px] uppercase tracking-wide text-[#484F58]">
              {fonte}
            </span>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <div className="flex flex-col gap-3">
            {rows.map((row) => (
              <article
                key={row.key}
                className="glass flex flex-col overflow-hidden rounded-xl border border-[#30363D] bg-[#0D1117]/75 backdrop-blur-md"
              >
                <div className="border-b border-[#21262D] px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 text-[13px] font-semibold leading-snug text-[#F0F4FC]">
                      {row.nome}
                    </h3>
                    <span className="shrink-0 rounded-md border border-[#30363D] bg-[#21262D] px-2 py-0.5 font-data text-[10px] font-semibold text-[#7DD3FC]">
                      {row.uf}
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 font-data text-[9px] text-[#484F58]">
                    <Hash className="size-3 shrink-0" strokeWidth={2} />
                    IBGE {row.key}
                  </p>
                </div>

                <div className="flex flex-1 flex-col gap-2 px-3 py-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9px] font-medium uppercase tracking-wider text-[#8B949E]">
                        Emendas
                      </p>
                      <p className="mt-0.5 font-data text-xs font-semibold tabular-nums text-[#4ADE80]">
                        {fmtBrl(row.total_emendas)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-medium uppercase tracking-wider text-[#8B949E]">
                        População
                      </p>
                      <p className="mt-0.5 font-data text-xs tabular-nums">
                        {row.populacao != null ? fmtNum(row.populacao, 0) : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#30363D]/80 bg-[#161B22]/90 px-2.5 py-2">
                    <p className="text-[9px] font-medium uppercase tracking-wider text-[#8B949E]">
                      IDH
                    </p>
                    <p className="mt-0.5 font-data text-lg font-semibold tabular-nums tracking-tight text-[#a371f7]">
                      {row.idh != null ? fmtNum(row.idh, 3) : "—"}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-t border-[#21262D] pt-2">
                    <div>
                      <p className="text-[9px] font-medium uppercase tracking-wider text-[#8B949E]">
                        IDEB
                      </p>
                      <p className="mt-0.5 font-data text-xs tabular-nums text-[#F0F4FC]">
                        {row.ideb != null ? fmtNum(row.ideb, 1) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-medium uppercase tracking-wider text-[#8B949E]">
                        Leitos/mil
                      </p>
                      <p className="mt-0.5 font-data text-xs tabular-nums">
                        {row.leitos_por_mil != null ? fmtNum(row.leitos_por_mil, 2) : "—"}
                      </p>
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-[#8B949E]">
                        <Droplets className="size-3 text-[#7DD3FC]" strokeWidth={2} />
                        Saneamento
                      </span>
                      <span className="font-data text-[10px] tabular-nums text-[#8B949E]">
                        {row.saneamento_pct != null
                          ? `${fmtNum(row.saneamento_pct, 1)}%`
                          : "—"}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1e293b]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#0ea5e9] to-[#22d3ee]"
                        style={{
                          width:
                            row.saneamento_pct != null
                              ? `${Math.min(100, Math.max(0, row.saneamento_pct))}%`
                              : "0%",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="col-span-12 max-w-full min-w-0 overflow-x-auto px-4 pb-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="size-5 text-[#58A6FF]" strokeWidth={1.75} />
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-[#F0F4FC]">
              Base eleitoral — contexto socioeconómico
            </h2>
            <p className="mt-0.5 text-[11px] text-[#8B949E]">
              IBGE · PNUD · INEP · SNIS · CNES (agregado no servidor)
            </p>
          </div>
        </div>
        {fonte ? (
          <span className="font-mono text-[10px] uppercase tracking-wide text-[#484F58]">
            {fonte}
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <article
            key={row.key}
            className="glass flex flex-col overflow-hidden rounded-xl border border-[#30363D] bg-[#0D1117]/75 backdrop-blur-md transition hover:border-[#58A6FF]/25"
          >
            <div className="border-b border-[#21262D] px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 text-[15px] font-semibold leading-snug text-[#F0F4FC]">
                  {row.nome}
                </h3>
                <span className="shrink-0 rounded-md border border-[#30363D] bg-[#21262D] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#58A6FF]">
                  {row.uf}
                </span>
              </div>
              <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] text-[#484F58]">
                <Hash className="size-3.5 shrink-0" strokeWidth={2} />
                IBGE {row.key}
              </p>
            </div>

            <div className="flex flex-1 flex-col gap-3 px-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[#8B949E]">
                    Emendas destinadas
                  </p>
                  <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-[#3fb950]">
                    {fmtBrl(row.total_emendas)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[#8B949E]">
                    População
                  </p>
                  <p className="mt-1 font-mono text-sm tabular-nums text-[#C9D1D9]">
                    {row.populacao != null ? fmtNum(row.populacao, 0) : "—"}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-[#30363D]/80 bg-[#161B22]/90 px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[#8B949E]">
                  IDH (PNUD / malha)
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums tracking-tight text-[#a371f7]">
                  {row.idh != null ? fmtNum(row.idh, 3) : "—"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-[#21262D] pt-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[#8B949E]">
                    IDEB (finais)
                  </p>
                  <p className="mt-1 font-mono text-sm tabular-nums text-[#F0F4FC]">
                    {row.ideb != null ? fmtNum(row.ideb, 1) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[#8B949E]">
                    Leitos / mil hab.
                  </p>
                  <p className="mt-1 font-mono text-sm tabular-nums text-[#C9D1D9]">
                    {row.leitos_por_mil != null ? fmtNum(row.leitos_por_mil, 2) : "—"}
                  </p>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[#8B949E]">
                    <Droplets className="size-3.5 text-[#58A6FF]" strokeWidth={2} />
                    Saneamento (esgoto tratado)
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-[#8B949E]">
                    {row.saneamento_pct != null
                      ? `${fmtNum(row.saneamento_pct, 1)}%`
                      : "—"}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#1e293b]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#0ea5e9] to-[#22d3ee] transition-[width] duration-500"
                    style={{
                      width:
                        row.saneamento_pct != null
                          ? `${Math.min(100, Math.max(0, row.saneamento_pct))}%`
                          : "0%",
                    }}
                  />
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
