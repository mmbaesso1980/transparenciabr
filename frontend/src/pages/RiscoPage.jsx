import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle, TrendingUp, Loader, Shield } from "lucide-react";

const fmt = (v) => v != null ? Number(v).toLocaleString("pt-BR") : "---";
const fmtBRL = (v) => v != null ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "---";

export default function RiscoPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch("/api/datalake/risco-kpis");
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
          <p className="text-sm text-muted-foreground">Carregando score de risco...</p>
        </div>
      </div>
    );
  }

  const ranking = data?.ranking || [];
  const distribuicao = data?.distribuicao || [];
  const metodologia = data?.metodologia || {};
  const maxScore = ranking.length > 0 ? Math.max(...ranking.map(r => r.score_risco || 0)) : 0;
  const avgScore = ranking.length > 0 ? Math.round(ranking.reduce((s, r) => s + (r.score_risco || 0), 0) / ranking.length) : 0;

  const getScoreColor = (score) => {
    if (score >= 80) return "text-red-600";
    if (score >= 60) return "text-orange-600";
    if (score >= 40) return "text-yellow-600";
    return "text-green-600";
  };

  const getScoreLabel = (score) => {
    if (score >= 80) return "CRITICO";
    if (score >= 60) return "ALTO";
    if (score >= 40) return "MEDIO";
    return "BAIXO";
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-4">
            <button onClick={() => navigate("/painel")} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted rounded">
              <ArrowLeft size={16} /> Voltar ao Painel
            </button>
          </div>
          <h1 className="text-3xl font-bold text-foreground">Score de Risco Composto</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {data?.mensagem || "Score de risco composto baseado em gastos CEAP, concentração de fornecedores e volume de emendas."}
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="p-4 bg-card border border-border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Shield size={16} className="text-blue-500" />
                  <p className="text-sm font-medium text-muted-foreground">Parlamentares Analisados</p>
                </div>
                <div className="text-3xl font-bold text-foreground">{fmt(ranking.length)}</div>
                <p className="text-xs text-muted-foreground mt-2">Com dados CEAP + Emendas</p>
              </div>

              <div className="p-4 bg-card border border-border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={16} className="text-green-500" />
                  <p className="text-sm font-medium text-muted-foreground">Score Medio</p>
                </div>
                <div className={`text-3xl font-bold ${getScoreColor(avgScore)}`}>{avgScore}/100</div>
                <p className="text-xs text-muted-foreground mt-2">{getScoreLabel(avgScore)}</p>
              </div>

              <div className="p-4 bg-card border border-red-500/30 rounded-lg bg-red-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} className="text-red-600" />
                  <p className="text-sm font-medium text-red-600">Score Maximo</p>
                </div>
                <div className="text-3xl font-bold text-red-600">{maxScore}/100</div>
                <p className="text-xs text-red-600/70 mt-2">{getScoreLabel(maxScore)}</p>
              </div>
            </div>

            {/* Distribuição por Faixa */}
            {distribuicao.length > 0 && (
              <div className="mb-8 p-6 bg-card border border-border rounded-lg">
                <h2 className="text-xl font-bold text-foreground mb-4">Distribuição por Faixa de Risco</h2>
                <div className="space-y-3">
                  {distribuicao.map((d, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="w-48 text-sm font-medium text-foreground">{d.faixa_risco}</div>
                      <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${d.faixa_risco.includes("Alto") ? "bg-red-500" : d.faixa_risco.includes("Médio") ? "bg-orange-500" : d.faixa_risco.includes("Baixo") ? "bg-yellow-500" : "bg-green-500"}`}
                          style={{ width: `${Math.min(100, (d.qtd_parlamentares / 500) * 100)}%` }}
                        />
                      </div>
                      <div className="w-24 text-right text-sm font-bold text-foreground">{d.qtd_parlamentares} parl.</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Metodologia */}
            {metodologia.componentes && (
              <div className="mb-8 p-6 bg-card border border-border rounded-lg">
                <h2 className="text-xl font-bold text-foreground mb-4">Metodologia do Score</h2>
                <p className="text-sm text-muted-foreground mb-3">Escala: {metodologia.escala}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {metodologia.componentes.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                      <div className="w-2 h-2 rounded-full bg-accent-primary" />
                      <span className="text-sm text-foreground">{c}</span>
                    </div>
                  ))}
                </div>
                {metodologia.pendente?.length > 0 && (
                  <div className="mt-4 p-3 bg-yellow-500/5 border border-yellow-500/30 rounded">
                    <p className="text-xs font-bold text-yellow-600 mb-1">Pendente para score completo:</p>
                    <p className="text-xs text-yellow-600/80">{metodologia.pendente.join(", ")}</p>
                  </div>
                )}
              </div>
            )}

            {/* Top Parlamentares por Risco */}
            {ranking.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-foreground mb-4">Top {ranking.length} Parlamentares por Score de Risco</h2>
                <div className="bg-card border border-red-500/30 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-red-500/5">
                          <th className="text-left p-3 font-medium text-red-600">#</th>
                          <th className="text-left p-3 font-medium text-red-600">Parlamentar</th>
                          <th className="text-right p-3 font-medium text-red-600">Score</th>
                          <th className="text-right p-3 font-medium text-red-600">Total CEAP</th>
                          <th className="text-right p-3 font-medium text-red-600">Notas</th>
                          <th className="text-right p-3 font-medium text-red-600">Concentração</th>
                          <th className="text-right p-3 font-medium text-red-600">Emendas</th>
                          <th className="text-left p-3 font-medium text-red-600">Barra</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ranking.map((p, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-red-500/5">
                            <td className="p-3 text-muted-foreground">{i + 1}</td>
                            <td className="p-3 font-medium text-foreground">{p.nome_parlamentar}</td>
                            <td className={`p-3 text-right font-bold ${getScoreColor(p.score_risco)}`}>{p.score_risco}</td>
                            <td className="p-3 text-right text-foreground">R$ {(p.total_ceap / 1e6).toFixed(2)}M</td>
                            <td className="p-3 text-right text-foreground">{fmt(p.qtd_notas)}</td>
                            <td className="p-3 text-right text-foreground">{p.concentracao_top_fornecedor}%</td>
                            <td className="p-3 text-right text-foreground">{fmt(p.qtd_emendas)}</td>
                            <td className="p-3">
                              <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${p.score_risco >= 80 ? "bg-red-500" : p.score_risco >= 60 ? "bg-orange-500" : p.score_risco >= 40 ? "bg-yellow-500" : "bg-green-500"}`}
                                  style={{ width: `${p.score_risco}%` }}
                                />
                              </div>
                            </td>
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
                Fonte: {data.source} | Atualizado: {data.updatedAt ? new Date(data.updatedAt).toLocaleString("pt-BR") : "---"}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
