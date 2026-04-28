import { AlertTriangle, Link2, TrendingUp } from "lucide-react";
import { useMemo } from "react";

import {
  normalizeDespesaCatalogoRow,
  pickRiskScore,
  mergeCeapInvestigationRows,
} from "../../utils/dataParsers.js";

function normalizeSupplierLabel(row) {
  const n = String(row?.titulo ?? "").trim();
  return n || "Fornecedor";
}

function heuristicSuspectSupplier(title, valor) {
  const u = title.toUpperCase();
  const ossHints =
    /\bOSS\b|ORGANIZAC[AÃ]O\s+SOCIAL|SOCIAL\s+DE\s+SAÚDE|FUNDA[ÇC][ÃA]O|ASSOCIAC[AÃ]O/i.test(
      title,
    );
  const healthHints =
    /\bLABORAT|CL[IÍ]NICA|HOSPITAL|SA[UÚ]DE|FARM[ÁA]CIA|DIGN[ÓO]STIC/i.test(
      u,
    );
  const highValue = Number.isFinite(valor) && valor >= 1_000_000;
  return (ossHints || healthHints) && highValue;
}

/**
 * Bento premium: riscos, top fornecedores, conexões suspeitas (dados do `transparency_reports`).
 */
export default function DossierPremiumInsights({ record }) {
  const risk = useMemo(
    () => pickRiskScore(record) ?? null,
    [record],
  );

  const riskTags = useMemo(() => {
    const tags = Array.isArray(record?.tags_semanticas_risco)
      ? record.tags_semanticas_risco
      : [];
    if (tags.length) return tags.map((t) => String(t));
    const out = [];
    if (record?.investigacao_prisma_ceap?.anomalia_benford) {
      out.push("Anomalia Benford (amostra CEAP)");
    }
    if (Number(record?.metricas_k_means?.total_distinct_cnpj) > 40) {
      out.push("Muitos fornecedores distintos (diversificação de CNPJ)");
    }
    if (Number(record?.nivel_exposicao) >= 3) {
      out.push("Nível de exposição elevado no snapshot");
    }
    if (out.length === 0) {
      out.push("Aguardando cruzamentos BigQuery / motores em lote");
    }
    return out;
  }, [record]);

  const { topSuppliers, suspectLinks } = useMemo(() => {
    const raw = record?.investigacao_prisma_ceap?.despesas_ceap_catalogo;
    const cat = Array.isArray(raw)
      ? raw
          .map((r, i) => normalizeDespesaCatalogoRow(r, i))
          .filter(Boolean)
      : mergeCeapInvestigationRows(record);
    const sorted = [...cat].sort((a, b) => b.rawValue - a.rawValue);
    const top = sorted.slice(0, 8);
    const suspects = top
      .filter((r) => heuristicSuspectSupplier(r.titulo, r.rawValue))
      .map((r) => ({
        fornecedor: r.titulo,
        valor: r.rawValue,
        reason: "OSS/saúde + valor milionário (heurística; cruzar CNES)",
      }));
    return { topSuppliers: top, suspectLinks: suspects };
  }, [record]);

  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-3">
      <section className="glass-card min-h-[18rem] border border-[#7f1d1d]/30 bg-gradient-to-b from-[#1a0a0a]/90 to-[#0d1117]/95 p-5">
        <div className="flex items-center gap-2 border-b border-[#30363D] pb-3">
          <AlertTriangle className="size-5 text-amber-400" strokeWidth={1.75} />
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[#F0F4FC]">
              Resumo de riscos
            </h2>
            <p className="text-sm text-[#8B949E]">Sinalizadores do documento e Prisma CEAP</p>
          </div>
        </div>
        <div className="mt-4">
          {risk != null ? (
            <p className="font-data text-4xl font-semibold text-[#f97316]">
              {Math.round(risk)}
              <span className="ml-2 text-base font-normal text-[#8B949E]">/ 100</span>
            </p>
          ) : (
            <p className="text-sm text-[#8B949E]">Índice agregado indisponível.</p>
          )}
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-[#C9D1D9]">
            {riskTags.map((t) => (
              <li
                key={t}
                className="flex gap-2 rounded-lg border border-[#30363D]/80 bg-[#0d1117]/60 px-3 py-2"
              >
                <span className="text-amber-400" aria-hidden>
                  ▸
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="glass-card min-h-[18rem] border border-[#1e3a5f]/40 bg-gradient-to-b from-[#0a1628]/95 to-[#0d1117]/95 p-5">
        <div className="flex items-center gap-2 border-b border-[#30363D] pb-3">
          <TrendingUp className="size-5 text-[#58A6FF]" strokeWidth={1.75} />
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[#F0F4FC]">
              Top fornecedores
            </h2>
            <p className="text-sm text-[#8B949E]">Por valor líquido (CEAP / catálogo)</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {topSuppliers.length === 0 ? (
            <p className="text-sm text-[#8B949E]">Sem catálogo de despesas neste registo.</p>
          ) : (
            topSuppliers.map((row, idx) => {
              const label = normalizeSupplierLabel(row);
              const denom = topSuppliers[0]?.rawValue || 1;
              const pct = Math.min(100, (row.rawValue / denom) * 100);
              return (
                <div key={String(row.ref ?? idx)} className="space-y-1">
                  <div className="flex justify-between gap-2 text-xs text-[#C9D1D9]">
                    <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
                    <span className="shrink-0 font-data text-[#7DD3FC]">
                      {row.valorLabel ?? row.rawValue.toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#21262D]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#58A6FF] to-[#a78bfa]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="glass-card min-h-[18rem] border border-[#4c1d95]/35 bg-gradient-to-b from-[#13082a]/95 to-[#0d1117]/95 p-5">
        <div className="flex items-center gap-2 border-b border-[#30363D] pb-3">
          <Link2 className="size-5 text-[#c4b5fd]" strokeWidth={1.75} />
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[#F0F4FC]">
              Conexões suspeitas
            </h2>
            <p className="text-sm text-[#8B949E]">
              Heurística OSS/saúde + valor — validar com CNES (D.R.A.C.U.L.A.)
            </p>
          </div>
        </div>
        <ul className="mt-4 space-y-3 text-sm">
          {suspectLinks.length === 0 ? (
            <li className="rounded-lg border border-[#30363D] bg-[#0d1117]/70 px-3 py-3 text-[#8B949E]">
              Nenhuma conexão milionária com padrão OSS/saúde na amostra atual.
            </li>
          ) : (
            suspectLinks.map((s) => (
              <li
                key={s.fornecedor}
                className="rounded-lg border border-[#f85149]/35 bg-[#1a0a0a]/60 px-3 py-3"
              >
                <p className="font-semibold text-[#F0F4FC]">{s.fornecedor}</p>
                <p className="mt-1 text-xs text-[#f85149]">{s.reason}</p>
                <p className="mt-1 font-data text-[#C9D1D9]">
                  {(s.valor || 0).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </p>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
