import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Zap, Loader, FileText, DollarSign } from "lucide-react";

const fmt = (v) => v != null ? Number(v).toLocaleString("pt-BR") : "---";
const fmtBRL = (v) => v != null ? `R$ ${(Number(v) / 1e6).toFixed(1)}M` : "---";

export default function AnomaliesPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch("/api/datalake/anomalias-kpis");
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
          <p className="text-sm text-muted-foreground">Carregando anomalias (Benford)...</p>
        </div>
      </div>
    );
  }

  const r = data?.resumo || {};

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-4">
            <button onClick={() => navigate("/painel")} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted rounded">
              <ArrowLeft size={16} /> Voltar ao Painel
            </button>
          </div>
          <h1 className="text-3xl font-bold text-foreground">Detecao de Anomalias</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {data?.mensagem || "Lei de Benford e detecao de valores redondos nos gastos CEAP"}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="p-4 bg-card border border-border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <FileText size={16} className="text-blue-500" />
                  <p className="text-sm font-medium text-muted-foreground">Total de Notas</p>
                </div>
                <div className="text-3xl font-bold text-foreground">{fmt(r.total_notas)}</div>
                <p className="text-xs text-muted-foreground mt-2">Notas fiscais analisadas</p>
              </div>

              <div className="p-4 bg-card border border-border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign size={16} className="text-green-500" />
                  <p className="text-sm font-medium text-muted-foreground">Total Valor</p>
                </div>
                <div className="text-3xl font-bold text-foreground">{fmtBRL(r.total_valor)}</div>
                <p className="text-xs text-muted-foreground mt-2">Soma dos gastos CEAP</p>
              </div>

              <div className="p-4 bg-card border border-orange-500/30 rounded-lg bg-orange-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} className="text-orange-600" />
                  <p className="text-sm font-medium text-orange-600">Valores Redondos</p>
                </div>
                <div className="text-3xl font-bold text-orange-600">{fmt(r.notas_valor_redondo)}</div>
                <p className="text-xs text-orange-600/70 mt-2">{r.pct_valor_redondo}% do total</p>
              </div>

              <div className={`p-4 bg-card border rounded-lg ${r.pct_valor_redondo > 15 ? "border-red-500/30 bg-red-500/5" : "border-border"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Zap size={16} className={r.pct_valor_redondo > 15 ? "text-red-600" : "text-muted-foreground"} />
                  <p className={`text-sm font-medium ${r.pct_valor_redondo > 15 ? "text-red-600" : "text-muted-foreground"}`}>Flag</p>
                </div>
                <div className={`text-2xl font-bold ${r.pct_valor_redondo > 15 ? "text-red-600" : "text-foreground"}`}>
                  {r.pct_valor_redondo > 15 ? "ALERTA" : "NORMAL"}
                </div>
                <p className={`text-xs mt-2 ${r.pct_valor_redondo > 15 ? "text-red-600/70" : "text-muted-foreground"}`}>
                  {r.pct_valor_redondo > 15 ? "Mais de 15% valores redondos" : "Dentro do esperado"}
                </p>
              </div>
            </div>

            {data.benford?.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-foreground mb-4">Lei de Benford - Primeiro Digito</h2>
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="text-center p-3 font-medium text-muted-foreground">Digito</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">% Real</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">% Esperado</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Desvio</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Visual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.benford.map((b, i) => {
                          const absDesvio = Math.abs(b.desvio);
                          const isAnomalo = absDesvio > 3;
                          return (
                            <tr key={i} className={`border-b border-border/50 ${isAnomalo ? "bg-red-500/5" : "hover:bg-muted/30"}`}>
                              <td className="p-3 text-center font-bold text-foreground">{b.digito}</td>
                              <td className="p-3 text-right text-foreground">{b.pct_real}%</td>
                              <td className="p-3 text-right text-muted-foreground">{b.pct_esperado}%</td>
                              <td className={`p-3 text-right font-bold ${isAnomalo ? "text-red-600" : "text-foreground"}`}>
                                {b.desvio > 0 ? "+" : ""}{b.desvio.toFixed(2)}%
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${isAnomalo ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${Math.min(b.pct_real * 2.5, 100)}%` }} />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Azul = real | Vermelho = desvio maior que 3%</p>
              </div>
            )}

            {data.parlamentaresSuspeitos?.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-foreground mb-4">Parlamentares com Maior Desvio de Benford (1o Digito)</h2>
                <div className="bg-card border border-orange-500/30 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-orange-500/5">
                          <th className="text-left p-3 font-medium text-orange-600">#</th>
                          <th className="text-left p-3 font-medium text-orange-600">Parlamentar</th>
                          <th className="text-right p-3 font-medium text-orange-600">Total Notas</th>
                          <th className="text-right p-3 font-medium text-orange-600">Desvio D1</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.parlamentaresSuspeitos.map((p, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-orange-500/5">
                            <td className="p-3 text-muted-foreground">{i + 1}</td>
                            <td className="p-3 font-medium text-foreground">{p.nome_parlamentar}</td>
                            <td className="p-3 text-right text-foreground">{fmt(p.total_notas)}</td>
                            <td className="p-3 text-right text-orange-600 font-bold">{Number(p.desvio_d1).toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {data.valoresRedondos?.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-foreground mb-4">Parlamentares com Mais Valores Redondos</h2>
                <div className="bg-card border border-red-500/30 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-red-500/5">
                          <th className="text-left p-3 font-medium text-red-600">#</th>
                          <th className="text-left p-3 font-medium text-red-600">Parlamentar</th>
                          <th className="text-right p-3 font-medium text-red-600">Qtd Redondos</th>
                          <th className="text-right p-3 font-medium text-red-600">Total R$</th>
                          <th className="text-right p-3 font-medium text-red-600">% Redondo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.valoresRedondos.map((p, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-red-500/5">
                            <td className="p-3 text-muted-foreground">{i + 1}</td>
                            <td className="p-3 font-medium text-foreground">{p.nome_parlamentar}</td>
                            <td className="p-3 text-right text-red-600 font-bold">{fmt(p.qtd_redondos)}</td>
                            <td className="p-3 text-right text-foreground">R$ {(p.total_redondos / 1e3).toFixed(1)}k</td>
                            <td className="p-3 text-right text-red-600 font-bold">{Number(p.pct_redondos).toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

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
