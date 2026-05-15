import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Users, DollarSign, AlertTriangle, Loader } from "lucide-react";

export default function GabinetePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch("/api/datalake/gabinete-kpis");
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
          <p className="text-sm text-muted-foreground">Carregando dados de gabinete...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => navigate("/painel")}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted rounded"
            >
              <ArrowLeft size={16} />
              Voltar ao Painel
            </button>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Folha do Gabinete</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Análise de servidores, salários e potenciais nepotismos
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          </div>
        )}

        {data ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* KPI 1: Total de Servidores */}
            <div className="p-4 bg-card border border-border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Users size={16} className="text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">Total de Servidores</p>
              </div>
              <div className="text-3xl font-bold text-foreground">
                {data.total_servidores || "—"}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Lotados no gabinete</p>
            </div>

            {/* KPI 2: Folha Total */}
            <div className="p-4 bg-card border border-border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={16} className="text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">Folha Total</p>
              </div>
              <div className="text-3xl font-bold text-foreground">
                {data.total_verba ? `R$ ${(data.total_verba / 1e6).toFixed(1)}M` : "—"}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Soma de salários</p>
            </div>

            {/* KPI 3: Maior Salário */}
            <div className="p-4 bg-card border border-border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-yellow-500" />
                <p className="text-sm font-medium text-muted-foreground">Maior Salário</p>
              </div>
              <div className="text-3xl font-bold text-foreground">
                {data.maior_salario ? `R$ ${(data.maior_salario / 1e3).toFixed(0)}k` : "—"}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Outlier de remuneração</p>
            </div>

            {/* KPI 4: Familiares Detectados */}
            <div className="p-4 bg-card border border-red-500/30 rounded-lg bg-red-500/5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-red-600" />
                <p className="text-sm font-medium text-red-600">Familiares</p>
              </div>
              <div className="text-3xl font-bold text-red-600">
                {data.familiares_detectados || "0"}
              </div>
              <p className="text-xs text-red-600/70 mt-2">Potencial nepotismo</p>
            </div>
          </div>
        ) : null}

        {!data && !error && (
          <div className="p-6 bg-card border border-border rounded-lg">
            <p className="text-sm font-medium text-foreground">Dados Indisponíveis</p>
            <p className="text-xs text-muted-foreground mt-2">
              A análise de gabinete ainda não foi processada para este parlamentar
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
