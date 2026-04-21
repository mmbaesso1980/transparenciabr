import { forwardRef, useMemo } from "react";

import {
  pickContextoSocioeconomicoRows,
  pickNome,
  pickRiskScore,
  pickUf,
} from "../../utils/dataParsers.js";

function fmtBrl(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function fmtInt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function fmtIdh(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function firstFiniteNumber(source, keys) {
  if (!source || typeof source !== "object") return null;
  for (const k of keys) {
    const n = Number(source[k]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function sumMunicipioEmendas(politico) {
  const raw = politico?.contexto_socioeconomico?.municipios;
  if (!Array.isArray(raw)) return null;
  let s = 0;
  let any = false;
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const v = Number(
      m.total_emendas_valor ??
        m.total_valor_emendas ??
        m.valor_total ??
        m.total_emendas ??
        m.total_gasto_municipio,
    );
    if (Number.isFinite(v)) {
      s += v;
      any = true;
    }
  }
  return any ? s : null;
}

function pickPartido(politico) {
  if (!politico || typeof politico !== "object") return "—";
  const v =
    politico.siglaPartido ??
    politico.partido ??
    politico.sigla_partido ??
    politico.siglaPartidoParlamentar;
  return typeof v === "string" && v.trim() ? v.trim() : "—";
}

function pickCargo(politico) {
  if (!politico || typeof politico !== "object") return "—";
  const v = politico.cargo ?? politico.cargo_parlamentar;
  return typeof v === "string" && v.trim() ? v.trim() : "—";
}

function pickFinancialBlock(politico) {
  const totalEmendas =
    firstFiniteNumber(politico, [
      "total_emendas_valor",
      "total_valor_emendas",
      "valor_total_emendas",
      "soma_emendas",
      "total_emendas",
    ]) ?? sumMunicipioEmendas(politico);

  const totalCeap =
    firstFiniteNumber(politico, [
      "total_ceap",
      "ceap_total",
      "gasto_ceap_total",
      "valor_total_ceap",
      "ceap_valor_total",
    ]) ??
    firstFiniteNumber(politico?.resumo_ceap, [
      "total",
      "valor_total",
      "soma",
    ]) ??
    firstFiniteNumber(politico?.resumo_financeiro, [
      "total_ceap",
      "ceap",
    ]);

  const custoMedioMensal =
    firstFiniteNumber(politico, [
      "ceap_custo_medio_mensal",
      "custo_medio_mensal_ceap",
      "custo_medio_mensal",
      "media_mensal_ceap",
    ]) ?? firstFiniteNumber(politico?.resumo_ceap, ["media_mensal", "custo_medio"]);

  return {
    totalEmendas,
    totalCeap,
    custoMedioMensal,
  };
}

function severityHigh(severidade) {
  const s = String(severidade ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return s === "alta" || s === "critica";
}

/**
 * Árvore React destinada exclusivamente à captura por html2pdf — mantida fora do fluxo visual.
 */
const DossiePDFContent = forwardRef(function DossiePDFContent(
  { politico, alertas },
  ref,
) {
  const nome = pickNome(politico) || "—";
  const cargo = pickCargo(politico);
  const partido = pickPartido(politico);
  const uf = pickUf(politico) || "—";
  const risk = pickRiskScore(politico);
  const geradoEm = useMemo(
    () =>
      new Date().toLocaleString("pt-BR", {
        dateStyle: "long",
        timeStyle: "short",
      }),
    [],
  );

  const top3 = useMemo(() => {
    const rows = pickContextoSocioeconomicoRows(politico);
    return rows.slice(0, 3);
  }, [politico]);

  const finance = useMemo(() => pickFinancialBlock(politico), [politico]);
  const listAlertas = Array.isArray(alertas) ? alertas : [];

  return (
    <div
      ref={ref}
      className="fixed left-[-9999px] top-0 z-[-10] box-border w-[210mm] bg-[#FFFFFF] p-[12mm] text-[12px] leading-snug text-[#0D1117] antialiased"
      aria-hidden="true"
    >
      <header className="border-b border-neutral-300 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#0D1117]">
              Motor Forense TransparênciaBR
            </p>
            <p className="text-[10px] text-neutral-600">TransparênciaBR · Dossiê forense</p>
          </div>
          <div className="text-right text-[10px] text-neutral-600">
            Emissão
            <br />
            <span className="font-mono text-[#0D1117]">{geradoEm}</span>
          </div>
        </div>
        <h1 className="mt-4 text-[20px] font-bold leading-tight text-[#0D1117]">{nome}</h1>
        <p className="mt-1 text-[13px] text-neutral-800">
          <span className="font-semibold">{cargo}</span>
          <span className="text-neutral-400"> · </span>
          <span>{partido}</span>
          <span className="text-neutral-400"> · </span>
          <span className="font-mono">{uf}</span>
        </p>
      </header>

      <section className="mt-5 border-b border-neutral-200 pb-4">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
          Índice de exposição
        </h2>
        <p className="mt-2 font-mono text-[28px] font-semibold tabular-nums text-[#0D1117]">
          {risk != null && Number.isFinite(Number(risk))
            ? `${Math.round(Number(risk))} / 100`
            : "—"}
        </p>
        <p className="mt-1 text-[11px] text-neutral-600">Risk score agregado (painel).</p>
      </section>

      <section className="mt-5 border-b border-neutral-200 pb-4">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
          Seção 1 · Resumo financeiro
        </h2>
        <ul className="mt-3 grid gap-2 font-mono text-[12px] tabular-nums">
          <li className="flex justify-between gap-4 border-b border-neutral-100 pb-2">
            <span className="text-neutral-600">Total de emendas (agreg.)</span>
            <span className="font-semibold text-[#0D1117]">
              {finance.totalEmendas != null ? fmtBrl(finance.totalEmendas) : "—"}
            </span>
          </li>
          <li className="flex justify-between gap-4 border-b border-neutral-100 pb-2">
            <span className="text-neutral-600">Total CEAP</span>
            <span className="font-semibold text-[#0D1117]">
              {finance.totalCeap != null ? fmtBrl(finance.totalCeap) : "—"}
            </span>
          </li>
          <li className="flex justify-between gap-4">
            <span className="text-neutral-600">Custo médio mensal (CEAP)</span>
            <span className="font-semibold text-[#0D1117]">
              {finance.custoMedioMensal != null
                ? fmtBrl(finance.custoMedioMensal)
                : "—"}
            </span>
          </li>
        </ul>
      </section>

      <section className="mt-5 border-b border-neutral-200 pb-4">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
          Seção 2 · Base eleitoral crítica (top 3)
        </h2>
        {top3.length === 0 ? (
          <p className="mt-3 text-[11px] text-neutral-600">
            Sem municípios rankeados neste documento.
          </p>
        ) : (
          <ol className="mt-3 list-decimal space-y-3 pl-5">
            {top3.map((m) => (
              <li key={m.codigo_ibge_municipio} className="pl-1">
                <p className="font-semibold text-[#0D1117]">
                  {m.nome_municipio}{" "}
                  <span className="font-mono text-[11px] font-normal text-neutral-600">
                    ({m.uf})
                  </span>
                </p>
                <div className="mt-1 grid gap-0.5 font-mono text-[11px] text-neutral-800 tabular-nums">
                  <p>
                    Emendas:{" "}
                    <span className="font-semibold">
                      {fmtBrl(m.total_emendas_valor)}
                    </span>
                  </p>
                  <p>
                    IDH: <span className="font-semibold">{fmtIdh(m.idh_municipal)}</span> ·
                    Pop.: {fmtInt(m.populacao)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-5 border-b border-neutral-200 pb-4">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
          Seção 3 · Alertas forenses (motor preditivo)
        </h2>
        {listAlertas.length === 0 ? (
          <p className="mt-3 text-[11px] text-neutral-600">
            Nenhum alerta incorporado neste relatório.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {listAlertas.map((a, idx) => {
              const warn = severityHigh(a.severidade);
              return (
                <li
                  key={`${a.tipo}-${idx}`}
                  className="rounded-md border border-neutral-200 bg-neutral-50 p-3"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    {warn ? (
                      <span className="select-none" aria-hidden="true">
                        ⚠️
                      </span>
                    ) : null}
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[#0D1117]">
                      {a.tipo}
                    </span>
                    {a.severidade ? (
                      <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] uppercase text-neutral-700">
                        {a.severidade}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-neutral-900">
                    {a.trecho}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="mt-8 border-t border-neutral-200 pt-3">
        <p className="text-[10px] leading-relaxed text-gray-500">
          Documento gerado automaticamente a partir de dados públicos (Câmara dos Deputados, Senado
          Federal, Portal da Transparência, TCU e outras fontes oficiais agregadas pela
          plataforma). Não substitui procedimentos jurídicos nem possui valor legal punitivo; trata-se
          de síntese informativa para análise.
        </p>
      </footer>
    </div>
  );
});

export default DossiePDFContent;
