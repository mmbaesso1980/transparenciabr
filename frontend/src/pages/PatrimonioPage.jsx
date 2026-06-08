import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, TrendingUp, AlertTriangle, Loader, Users, FileText } from "lucide-react";
import { fmt } from "../utils/formatBRL.js";

export default function PatrimonioPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch("/api/datalake/patrimonio-kpis");
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
          <p className="text-sm text-muted-foreground">Carregando dados de patrimônio...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-4">
            <button onClick={() => navigate("/painel")} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted rounded">
              <ArrowLeft size={16} /> Voltar ao Painel
            </button>
          </div>
          <h1 className="text-3xl font-bold text-foreground">Patrimônio Declarado</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {data?.status === "parcial" ? "⚠️ " : ""}{data?.mensagem || "Análise patrimonial via dossiês Aurora 360"}
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
                  <Users size={16} className="text-blue-500" />
                  <p className="text-sm font-medium text-muted-foreground">Parlamentares com Dossiê</p>
                </div>
                <div className="text-3xl font-bold text-foreground">{fmt(data.total_parlamentares_dossie)}</div>
                <p className="text-xs text-muted-foreground mt-2">Dossiês Aurora 360 gerados</p>
              </div>

              <div className="p-4 bg-card border border-yellow-500/30 rounded-lg bg-yellow-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} className="text-yellow-600" />
                  <p className="text-sm font-medium text-yellow-600">Status</p>
                </div>
                <div className="text-2xl font-bold text-yellow-600">Parcial</div>
                <p className="text-xs text-yellow-600/70 mt-2">Dados TSE ainda não ingeridos no BigQuery</p>
              </div>

              <div className="p-4 bg-card border border-border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <FileText size={16} className="text-green-500" />
                  <p className="text-sm font-medium text-muted-foreground">Fonte</p>
                </div>
                <div className="text-lg font-bold text-foreground">tb_dossie_aurora_360</div>
                <p className="text-xs text-muted-foreground mt-2">BigQuery TransparênciaBR</p>
              </div>
            </div>

            {/* Lista de Parlamentares */}
            {data.parlamentares?.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-foreground mb-4">Parlamentares com Dossiê Aurora 360</h2>
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="text-left p-3 font-medium text-muted-foreground">#</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">ID</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Nome</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.parlamentares.map((p, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="p-3 text-muted-foreground">{i + 1}</td>
                            <td className="p-3 text-muted-foreground font-mono text-xs">{p.parlamentar_id}</td>
                            <td className="p-3 font-medium text-foreground">{p.nome}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Engenharia Pendente */}
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
