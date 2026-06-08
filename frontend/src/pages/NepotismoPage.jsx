import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Loader, Users, DollarSign, FileText, Link2 } from "lucide-react";
import { fmt, fmtBRLM as fmtBRL } from "../utils/formatBRL.js";

export default function NepotismoPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch("/api/datalake/nepotismo-kpis");
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
          <p className="text-sm text-muted-foreground">Carregando análise de nepotismo...</p>
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
          <h1 className="text-3xl font-bold text-foreground">Análise de Nepotismo</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {data?.mensagem || "Fornecedores compartilhados e concentração de gastos"}
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
                  <p className="text-sm font-medium text-muted-foreground">Fornecedores</p>
                </div>
                <div className="text-3xl font-bold text-foreground">{fmt(r.total_fornecedores)}</div>
                <p className="text-xs text-muted-foreground mt-2">Fornecedores distintos</p>
              </div>

              <div className="p-4 bg-card border border-border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Users size={16} className="text-purple-500" />
                  <p className="text-sm font-medium text-muted-foreground">Parlamentares</p>
                </div>
                <div className="text-3xl font-bold text-foreground">{fmt(r.total_parlamentares)}</div>
                <p className="text-xs text-muted-foreground mt-2">Com gastos CEAP</p>
              </div>

              <div className="p-4 bg-card border border-border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Link2 size={16} className="text-green-500" />
                  <p className="text-sm font-medium text-muted-foreground">Transações</p>
                </div>
                <div className="text-3xl font-bold text-foreground">{fmt(r.total_transacoes)}</div>
                <p className="text-xs text-muted-foreground mt-2">Notas fiscais analisadas</p>
              </div>

              <div className="p-4 bg-card border border-border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign size={16} className="text-orange-500" />
                  <p className="text-sm font-medium text-muted-foreground">Total Movimentado</p>
                </div>
                <div className="text-3xl font-bold text-foreground">{fmtBRL(r.total_valor)}</div>
                <p className="text-xs text-muted-foreground mt-2">Via CEAP</p>
              </div>
            </div>

            {data.fornecedoresCompartilhados?.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-foreground mb-4">Fornecedores Compartilhados (20+ parlamentares)</h2>
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="text-left p-3 font-medium text-muted-foreground">#</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Fornecedor</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Parlamentares</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Total Recebido</th>
                          <th className="text-right p-3 font-medium text-muted-foreground">Notas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.fornecedoresCompartilhados.map((f, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="p-3 text-muted-foreground">{i + 1}</td>
                            <td className="p-3 font-medium text-foreground">{f.nome_fornecedor}</td>
                            <td className="p-3 text-right text-foreground">{fmt(f.qtd_parlamentares)}</td>
                            <td className="p-3 text-right text-foreground">{fmtBRL(f.total_recebido)}</td>
                            <td className="p-3 text-right text-foreground">{fmt(f.qtd_notas)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {data.concentracaoFornecedores?.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-foreground mb-4">Parlamentares com Alta Concentração (3 ou menos fornecedores)</h2>
                <div className="bg-card border border-red-500/30 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-red-500/5">
                          <th className="text-left p-3 font-medium text-red-600">#</th>
                          <th className="text-left p-3 font-medium text-red-600">Parlamentar</th>
                          <th className="text-right p-3 font-medium text-red-600">Fornecedores</th>
                          <th className="text-right p-3 font-medium text-red-600">Notas</th>
                          <th className="text-right p-3 font-medium text-red-600">Total Gasto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.concentracaoFornecedores.map((p, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-red-500/5">
                            <td className="p-3 text-muted-foreground">{i + 1}</td>
                            <td className="p-3 font-medium text-foreground">{p.nome_parlamentar}</td>
                            <td className="p-3 text-right text-red-600 font-bold">{p.fornecedores_distintos}</td>
                            <td className="p-3 text-right text-foreground">{fmt(p.total_notas)}</td>
                            <td className="p-3 text-right text-foreground">R$ {Number(p.total_gasto).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {data.engenharia_pendente?.length > 0 && (
              <div className="mb-8 p-4 bg-yellow-500/5 border border-yellow-500/30 rounded-lg">
                <h3 className="text-sm font-bold text-yellow-600 mb-2">Engenharia Pendente</h3>
                <ul className="text-xs text-yellow-600/80 space-y-1">
                  {data.engenharia_pendente.map((item, i) => (
                    <li key={i}>• {item}</li>
                  ))}
                </ul>
              </div>
            )}

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
