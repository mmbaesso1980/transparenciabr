import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, TrendingUp, AlertTriangle, Loader, Users, DollarSign, Calendar, MapPin } from "lucide-react";

const fmt = (v) => v != null ? Number(v).toLocaleString("pt-BR") : "—";
const fmtBRL = (v) => v != null ? `R$ ${(Number(v) / 1e9).toFixed(2)}B` : "—";
const fmtBRLM = (v) => v != null ? `R$ ${(Number(v) / 1e6).toFixed(1)}M` : "—";

export default function EmendasPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch("/api/datalake/emendas-kpis");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        setData(payload);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader className="w-8 h-8 animate-spin text-accent-primary" />
          <p className="text-sm text-muted-foreground">Carregando dados de emendas do BigQuery...</p>
        </div>
      </div>
    );
  }

  const r = data?.resumo || {};

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-4">
            <button onClick={() => navigate("/painel")} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted rounded">
              <ArrowLeft size={16} /> Voltar ao Painel
            </button>
          </div>
          <h1 className="text-3xl font-bold text-foreground">Emendas Parlamentares</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Dados reais: {fmt(r.total_emendas)} emendas de {r.ano_min} a {r.ano_max} — Fonte: BigQuery
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          </div>
        )}

        {data && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="p-4 bg-card border border-border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={16} className="text-blue-500" />
                  <p className="text-sm font-medium text-muted-foreground">Total de Emendas</p>
                </div>
                <div className="text-3xl font-bold text-foreground">{fmt(r.total_emendas)}</div>
                <p className="text-xs text-muted-foreground mt-2">{fmt(r.total_autores)} autores distintos</p>
              </div>

              <div className="p-4 bg-card border border-border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign size={16} className="text-green-500" />
                  <p className="text-sm font-medium text-muted-foreground">Total Empenhado</p>
                </div>
                <div className="text-3xl font-bold text-foreground">{fmtBRL(r.total_empenhado)}</div>
                <p className="text-xs text-muted-foreground mt-2">Pago: {fmtBRL(r.total_pago)}</p>
              </div>

              <div className="p-4 bg-card border border-border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Users size={16} className="text-purple-500" />
                  <p className="text-sm font-medium text-muted-foreground">Autores</p>
                </div>
                <div className="text-3xl font-bold text-foreground">{fmt(r.total_autores)}</div>
                <p className="text-xs text-muted-foreground mt-2">Parlamentares e bancadas</p>
              </div>

              <div className="p-4 bg-card border border-orange-500/30 rounded-lg bg-orange-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar size={16} className="text-orange-600" />
                  <p className="text-sm font-medium text-orange-600">Período</p>
                </div>
                <div className="text-3xl font-bold text-orange-600">{r.ano_min}–{r.ano_max}</div>
                <p className="text-xs text-orange-600/70 mt-2">Liquidado: {fmtBRL(r.total_liquidado)}</p>
              </div>
            </div>

            {/* Top Autores */}
            {data.topAutores?.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-foreground mb-4">Top 20 Autores por Valor Empenhado</h2>
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="text-left p-3 font-medium text-muted-foreground">#</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Autor</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Emendas</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Empenhado</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Pago</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.topAutores.map((a, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="p-3 text-muted-foreground">{i + 1}</td>
                            <td className="p-3 font-medium text-foreground">{a.autor}</td>
                            <td className="p-3 text-right text-foreground">{fmt(a.qtd_emendas)}</td>
                            <td className="p-3 text-right text-foreground">{fmtBRLM(a.total_empenhado)}</td>
                            <td className="p-3 text-right text-foreground">{fmtBRLM(a.total_pago)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Por Função */}
            {data.porFuncao?.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-foreground mb-4">Distribuição por Função</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {data.porFuncao.map((f, i) => (
                    <div key={i} className="p-3 bg-card border border-border rounded-lg">
                      <p className="text-sm font-medium text-foreground">{f.funcao}</p>
                      <p className="text-lg font-bold text-foreground">{fmtBRLM(f.total_empenhado)}</p>
                      <p className="text-xs text-muted-foreground">{fmt(f.qtd)} emendas</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Por Ano */}
            {data.porAno?.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-foreground mb-4">Evolução por Ano</h2>
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="text-left p-3 font-medium text-muted-foreground">Ano</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Qtd</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Empenhado</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Pago</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.porAno.map((a, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="p-3 font-medium text-foreground">{a.ano}</td>
                            <td className="p-3 text-right text-foreground">{fmt(a.qtd)}</td>
                            <td className="p-3 text-right text-foreground">{fmtBRLM(a.total_empenhado)}</td>
                            <td className="p-3 text-right text-foreground">{fmtBRLM(a.total_pago)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Fonte */}
            <div className="p-4 bg-muted/30 border border-border rounded-lg">
              <p className="text-xs text-muted-foreground">
                Fonte: {data.source} | Atualizado: {data.updatedAt ? new Date(data.updatedAt).toLocaleString("pt-BR") : "—"}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
