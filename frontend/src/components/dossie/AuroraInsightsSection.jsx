/**
 * AuroraInsightsSection — Dossiê Aurora 360 completo.
 * Preview: score de risco, alertas Benford, top fornecedores.
 * Full: CEAP + Emendas + Benford + Z-Score + Suspeitas + Base Eleitoral + Temporal.
 */
import { useState } from "react";
import { AlertTriangle, BarChart3, Building2, Calendar, FileWarning, MapPin, Shield, TrendingUp, Zap } from "lucide-react";
import { useDossieAurora } from "../../hooks/useDossieAurora.js";

function formatBRL(val) {
  if (val == null) return "—";
  return Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function RiskBadge({ score }) {
  if (score == null) return null;
  const s = Number(score);
  const color = s >= 85 ? "text-[#f85149] bg-[#f85149]/15" :
    s >= 70 ? "text-[#FFA657] bg-[#FFA657]/15" :
    s >= 40 ? "text-[#FDE047] bg-[#FDE047]/15" :
    "text-[#4ADE80] bg-[#4ADE80]/15";
  const label = s >= 85 ? "CRÍTICO" : s >= 70 ? "ALTO" : s >= 40 ? "MÉDIO" : "BAIXO";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-mono text-xs font-bold ${color}`}>
      <Shield className="size-3" /> {label} ({s})
    </span>
  );
}

function SectionHeader({ icon, title, subtitle, color = "text-[#7DD3FC]" }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={color}>{icon}</span>
      <h3 className="text-sm font-bold uppercase tracking-wider text-[#8B949E]">{title}</h3>
      {subtitle && <span className="text-xs text-[#484F58]">{subtitle}</span>}
    </div>
  );
}

function CollapsibleSection({ title, icon, color, count, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-[#30363D] bg-[#0D1117]/60 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 p-4 text-left hover:bg-[#161B22]/60 transition-colors"
      >
        <span className={color || "text-[#7DD3FC]"}>{icon}</span>
        <span className="text-sm font-bold uppercase tracking-wider text-[#8B949E] flex-1">{title}</span>
        {count != null && (
          <span className="font-mono text-xs text-[#58A6FF] bg-[#58A6FF]/10 px-2 py-0.5 rounded-full">{count}</span>
        )}
        <span className="text-[#484F58] text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

export default function AuroraInsightsSection({ politicoId, mode = "preview" }) {
  const { data, loading, error } = useDossieAurora(politicoId, mode);

  if (loading) {
    return (
      <div className="glass-card animate-pulse p-5">
        <div className="h-4 w-48 rounded bg-[#21262D]" />
        <div className="mt-3 h-20 rounded bg-[#21262D]" />
      </div>
    );
  }
  if (error || !data) return null;

  const resumo = data.resumo || data.alertas_consolidados;
  const scoreRisco = resumo?.score_risco ?? data.alertas_consolidados?.score_risco;

  return (
    <section className="glass-card overflow-hidden p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <BarChart3 className="size-5 text-[#7DD3FC]" strokeWidth={1.75} />
        <h2 className="text-2xl font-bold tracking-tight text-[#F0F4FC] md:text-3xl">
          Aurora 360 — Inteligência Forense
        </h2>
        <RiskBadge score={scoreRisco} />
      </div>

      {/* ── Preview Mode ── */}
      {data.mode === "preview" && data.resumo && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="CEAP Total" value={formatBRL(data.resumo.total_ceap_brl)} icon={<TrendingUp className="size-4" />} />
            <StatCard label="Notas Fiscais" value={String(data.resumo.total_notas || 0)} icon={<FileWarning className="size-4" />} />
            <StatCard label="Notas Redondas" value={String(data.resumo.notas_redondas || 0)} alert={data.resumo.notas_redondas > 50} icon={<AlertTriangle className="size-4" />} />
            <StatCard label="Alertas Benford" value={String(data.resumo.benford_alertas || 0)} alert={data.resumo.benford_alertas >= 3} icon={<Shield className="size-4" />} />
          </div>
          {data.paywall && (
            <div className="rounded-xl border border-[#30363D] bg-[#161B22] p-4">
              <p className="text-xs font-bold text-[#FDE047]">{data.paywall.msg}</p>
            </div>
          )}
        </>
      )}

      {/* ── Full Mode ── */}
      {data.mode === "full" && (
        <>
          {/* KPIs Grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="CEAP Total" value={formatBRL(data.ceap?.total_brl)} icon={<TrendingUp className="size-4" />} />
            <StatCard label="Notas Fiscais" value={String(data.ceap?.total_notas || 0)} icon={<FileWarning className="size-4" />} />
            <StatCard label="Emendas" value={formatBRL(data.emendas?.total_empenhado)} icon={<Zap className="size-4" />} />
            <StatCard label="Notas Redondas" value={String(data.ceap?.notas_redondas || 0)} alert={data.ceap?.notas_redondas > 50} icon={<AlertTriangle className="size-4" />} />
            <StatCard label="Score Risco" value={String(scoreRisco || 0)} alert={scoreRisco >= 70} icon={<Shield className="size-4" />} />
          </div>

          {/* ── SUSPEITAS (destaque principal) ── */}
          {(data.sacanagens?.notas_suspeitas?.length > 0 || data.sacanagens?.fornecedores_concentrados?.length > 0) && (
            <CollapsibleSection
              title="Suspeitas Detectadas"
              icon={<AlertTriangle className="size-4" />}
              color="text-[#f85149]"
              count={`${(data.sacanagens?.notas_suspeitas?.length || 0) + (data.sacanagens?.fornecedores_concentrados?.length || 0)} alertas`}
              defaultOpen={true}
            >
              {/* Notas suspeitas */}
              {data.sacanagens?.notas_suspeitas?.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-bold text-[#f85149] mb-2">
                    Notas com Valores Redondos / Altos ({data.sacanagens.notas_suspeitas.length})
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {data.sacanagens.notas_suspeitas.map((s, i) => {
                      const docUrl = s.numero_documento && /^\d+$/.test(String(s.numero_documento))
                        ? `https://www.camara.leg.br/cota-parlamentar/documentos/publ/${s.numero_documento}.pdf`
                        : null;
                      return (
                      <div key={i} className="flex items-center justify-between rounded-lg border border-[#f85149]/20 bg-[#0D1117]/80 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-[#C9D1D9]">{s.fornecedor}</p>
                          <p className="text-[10px] text-[#484F58]">{s.tipo} · {s.data}</p>
                        </div>
                        <div className="ml-2 text-right shrink-0 flex items-center gap-2">
                          {docUrl ? (
                            <a href={docUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-sm font-bold text-[#f85149] hover:underline">{formatBRL(s.valor)}</a>
                          ) : (
                            <span className="font-mono text-sm font-bold text-[#f85149]">{formatBRL(s.valor)}</span>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            s.alerta === 'VALOR_REDONDO_MIL' ? 'bg-[#f85149]/20 text-[#f85149]' :
                            s.alerta === 'VALOR_ALTO' ? 'bg-[#FFA657]/20 text-[#FFA657]' :
                            'bg-[#FDE047]/20 text-[#FDE047]'
                          }`}>{s.alerta}</span>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Fornecedores concentrados */}
              {data.sacanagens?.fornecedores_concentrados?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-[#FFA657] mb-2">
                    Fornecedores com Alta Concentração ({data.sacanagens.fornecedores_concentrados.length})
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {data.sacanagens.fornecedores_concentrados.map((f, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border border-[#FFA657]/20 bg-[#0D1117]/80 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-[#C9D1D9]">{f.nome}</p>
                          <p className="text-[10px] text-[#484F58]">{f.notas} notas · {f.meses} meses · {f.primeira} → {f.ultima}</p>
                        </div>
                        <span className="ml-2 shrink-0 font-mono text-sm font-bold text-[#FFA657]">{formatBRL(f.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CollapsibleSection>
          )}

          {/* ── EMENDAS ── */}
          {data.emendas?.total > 0 && (
            <CollapsibleSection
              title="Emendas Parlamentares"
              icon={<Zap className="size-4" />}
              color="text-[#FFA657]"
              count={`${data.emendas.total} emendas · ${data.emendas.suspeitas} suspeitas`}
              defaultOpen={data.emendas.suspeitas > 0}
            >
              <div className="grid gap-2 sm:grid-cols-3 mb-3">
                <div className="rounded-lg bg-[#161B22] p-3 text-center">
                  <p className="text-[10px] uppercase text-[#8B949E]">Empenhado</p>
                  <p className="font-mono text-lg font-bold text-[#58A6FF]">{formatBRL(data.emendas.total_empenhado)}</p>
                </div>
                <div className="rounded-lg bg-[#161B22] p-3 text-center">
                  <p className="text-[10px] uppercase text-[#8B949E]">Pago</p>
                  <p className="font-mono text-lg font-bold text-[#4ADE80]">{formatBRL(data.emendas.total_pago)}</p>
                </div>
                <div className="rounded-lg bg-[#161B22] p-3 text-center">
                  <p className="text-[10px] uppercase text-[#8B949E]">Suspeitas</p>
                  <p className="font-mono text-lg font-bold text-[#f85149]">{data.emendas.suspeitas}</p>
                </div>
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {data.emendas.lista.map((e, i) => {
                  const emendaLink = e.ano
                    ? `https://portaldatransparencia.gov.br/emendas?ano=${e.ano}`
                    : null;
                  return (
                  <div key={i} className={`flex justify-between rounded-lg border px-3 py-2 ${
                    e.suspeita ? "border-[#f85149]/30 bg-[#f85149]/5" : "border-[#30363D] bg-[#0D1117]/80"
                  }`}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[#C9D1D9]">{e.descricao}</p>
                      <p className="text-[10px] text-[#484F58]">{e.funcao} · {e.municipio}/{e.estado} · {e.ano}</p>
                    </div>
                    <div className="ml-2 text-right shrink-0">
                      {emendaLink ? (
                        <a href={emendaLink} target="_blank" rel="noopener noreferrer" className={`font-mono text-sm font-bold hover:underline ${e.suspeita ? "text-[#f85149]" : "text-[#58A6FF]"}`}>
                          {formatBRL(e.valor_empenhado)}
                        </a>
                      ) : (
                        <p className={`font-mono text-sm font-bold ${e.suspeita ? "text-[#f85149]" : "text-[#58A6FF]"}`}>
                          {formatBRL(e.valor_empenhado)}
                        </p>
                      )}
                      {e.suspeita && <span className="text-[10px] text-[#f85149]">SUSPEITA</span>}
                    </div>
                  </div>
                  );
                })}
              </div>
            </CollapsibleSection>
          )}

          {/* ── BENFORD ── */}
          {data.benford?.alertas?.length > 0 && (
            <CollapsibleSection
              title="Análise de Benford"
              icon={<BarChart3 className="size-4" />}
              color="text-[#f85149]"
              count={`${data.benford.alertas.length} desvios`}
            >
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {data.benford.distribuicao?.map((b, i) => {
                  const isAlert = data.benford.alertas.some(a => a.digito === b.digito);
                  return (
                    <div key={i} className={`rounded-lg border p-3 text-center ${
                      isAlert ? "border-[#f85149]/30 bg-[#f85149]/5" : "border-[#30363D] bg-[#161B22]"
                    }`}>
                      <span className={`font-mono text-2xl font-bold ${isAlert ? "text-[#f85149]" : "text-[#58A6FF]"}`}>{b.digito}</span>
                      <div className="mt-1 text-[10px] text-[#8B949E]">
                        Obs: {Number(b.observado).toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-[#484F58]">
                        Esp: {Number(b.teorico).toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>
          )}

          {/* ── Z-SCORE OUTLIERS ── */}
          {data.zscore?.outliers?.length > 0 && (
            <CollapsibleSection
              title="Outliers Z-Score (Dias Anômalos)"
              icon={<TrendingUp className="size-4" />}
              color="text-[#FDE047]"
              count={`${data.zscore.outliers.length} dias`}
            >
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {data.zscore.outliers.map((z, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-[#FDE047]/20 bg-[#0D1117]/80 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="size-3 text-[#484F58]" />
                      <span className="font-mono text-sm text-[#C9D1D9]">{z.data}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-bold text-[#FDE047]">{formatBRL(z.gasto_dia)}</span>
                      <span className="text-[10px] bg-[#FDE047]/15 text-[#FDE047] px-1.5 py-0.5 rounded">z={z.zscore}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* ── TOP FORNECEDORES ── */}
          {data.ceap?.top_fornecedores?.length > 0 && (
            <CollapsibleSection
              title="Top Fornecedores"
              icon={<Building2 className="size-4" />}
              color="text-[#58A6FF]"
              count={data.ceap.top_fornecedores.length}
            >
              <div className="space-y-2">
                {data.ceap.top_fornecedores.map((f, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between">
                        <span className="truncate text-sm text-[#C9D1D9]">{f.nome}</span>
                        <span className="ml-2 shrink-0 font-mono text-xs text-[#8B949E]">{f.pct}%</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-[#21262D]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#58A6FF] to-[#7DD3FC]"
                          style={{ width: `${Math.min(100, f.pct * 2)}%` }}
                        />
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-[#58A6FF]">{formatBRL(f.total)}</span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* ── GASTOS MENSAIS ── */}
          {data.ceap?.gastos_mensais?.length > 0 && (
            <CollapsibleSection
              title="Evolução Mensal de Gastos"
              icon={<Calendar className="size-4" />}
              color="text-[#7DD3FC]"
              count={`${data.ceap.gastos_mensais.length} meses`}
            >
              {(() => {
                const maxVal = Math.max(...data.ceap.gastos_mensais.map(g => g.total));
                return (
                  <div className="space-y-1">
                    {data.ceap.gastos_mensais.map((g, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-16 shrink-0 font-mono text-[10px] text-[#8B949E]">{g.mes}</span>
                        <div className="flex-1 h-4 rounded bg-[#21262D] overflow-hidden">
                          <div
                            className="h-full rounded bg-gradient-to-r from-[#58A6FF]/80 to-[#7DD3FC]"
                            style={{ width: `${(g.total / maxVal) * 100}%` }}
                          />
                        </div>
                        <span className="w-24 shrink-0 text-right font-mono text-[10px] text-[#C9D1D9]">{formatBRL(g.total)}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CollapsibleSection>
          )}

          {/* ── BASE ELEITORAL ── */}
          {data.base_eleitoral?.length > 0 && (
            <CollapsibleSection
              title="Base Eleitoral (Destino das Emendas)"
              icon={<MapPin className="size-4" />}
              color="text-[#4ADE80]"
              count={`${data.base_eleitoral.length} municípios`}
            >
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {data.base_eleitoral.map((b, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-[#30363D] bg-[#0D1117]/80 px-3 py-2">
                    <div>
                      <p className="text-sm text-[#C9D1D9]">{b.municipio}</p>
                      <p className="text-[10px] text-[#484F58]">
                        {b.n_documentos} docs{b.populacao ? ` · Pop: ${Number(b.populacao).toLocaleString("pt-BR")}` : ""}
                        {b.idh ? ` · IDH: ${b.idh}` : ""}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-bold text-[#4ADE80]">{formatBRL(b.total_emendas)}</span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* ── TIPO DESPESAS ── */}
          {data.ceap?.tipo_despesas?.length > 0 && (
            <CollapsibleSection
              title="Despesas por Tipo"
              icon={<FileWarning className="size-4" />}
              color="text-[#58A6FF]"
              count={data.ceap.tipo_despesas.length}
            >
              <div className="space-y-1.5">
                {data.ceap.tipo_despesas.map((t, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-[#30363D] bg-[#0D1117]/80 px-3 py-2">
                    <span className="truncate text-sm text-[#C9D1D9]">{t.tipo}</span>
                    <div className="ml-2 text-right shrink-0">
                      <span className="font-mono text-sm text-[#58A6FF]">{formatBRL(t.total)}</span>
                      <span className="ml-2 font-mono text-[10px] text-[#484F58]">{t.notas} notas</span>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* ── ALERTAS CONSOLIDADOS ── */}
          {data.alertas_consolidados && (
            <div className="rounded-xl border border-[#30363D] bg-[#0D1117]/60 p-4">
              <SectionHeader icon={<Shield className="size-4" />} title="Alertas Consolidados AURORA" color="text-[#f85149]" />
              <div className="flex flex-wrap gap-3">
                <MiniStat label="Benford" value={data.alertas_consolidados.benford_desvios} alert />
                <MiniStat label="Redondas" value={data.alertas_consolidados.notas_redondas} />
                <MiniStat label=">10k" value={data.alertas_consolidados.notas_acima_10k} alert />
                <MiniStat label="Emendas Susp." value={data.alertas_consolidados.emendas_suspeitas} alert />
                <MiniStat label="Z-Score" value={data.alertas_consolidados.zscore_outliers || 0} alert />
                <MiniStat label="Forn. Conc." value={data.alertas_consolidados.fornecedores_concentrados || 0} alert />
                <MiniStat label="RISCO" value={data.alertas_consolidados.score_risco} alert={data.alertas_consolidados.score_risco >= 70} />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function StatCard({ label, value, icon, alert }) {
  return (
    <div className={`rounded-xl border p-3 ${alert ? "border-[#f85149]/40 bg-[#f85149]/8" : "border-[#30363D] bg-[#0D1117]/60"}`}>
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[#8B949E]">
        {icon} {label}
      </div>
      <p className={`mt-1 font-mono text-lg font-bold ${alert ? "text-[#f85149]" : "text-[#58A6FF]"}`}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value, alert }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-[#8B949E]">{label}:</span>
      <span className={`font-mono text-sm font-bold ${alert ? "text-[#f85149]" : "text-[#58A6FF]"}`}>{String(value)}</span>
    </div>
  );
}
