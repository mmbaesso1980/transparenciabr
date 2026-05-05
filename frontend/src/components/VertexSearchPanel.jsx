import { useState, useCallback } from "react";
import { Search, Loader2, AlertTriangle, FileText, Database } from "lucide-react";

/**
 * VertexSearchPanel — busca consolidada nos 10 datastores Vertex AI Search via Cloud Function v2.
 *
 * Endpoint: getDossiePoliticoV2
 * Retorna: { resumo, evidencias[], searches_raw[] }
 */

const ENDPOINT_URL =
  import.meta.env.VITE_VERTEX_SEARCH_URL ||
  "https://getdossiepoliticov2-evkxdmnelq-uc.a.run.app";

const FONTE_LABELS = {
  "tbr-fs2-politicos": { label: "Políticos", icon: "👤", tone: "teal" },
  "tbr-fs2-alertas-bodes": { label: "Alertas CEAP", icon: "⚠️", tone: "warning" },
  "tbr-fs2-ghosts": { label: "Servidores Suspeitos", icon: "👻", tone: "error" },
  "tbr-fs2-dossies": { label: "Dossiês", icon: "📁", tone: "primary" },
  "tbr-fs2-espectro": { label: "Espectro Político", icon: "📊", tone: "primary" },
  "tbr-fs2-voting": { label: "Votações", icon: "🗳️", tone: "primary" },
  "tbr-fs2-malha-saude": { label: "Rede Saúde", icon: "🏥", tone: "primary" },
  "tbr-fs2-transparency": { label: "Transparência", icon: "📋", tone: "primary" },
  "tbr-fs2-neutrality": { label: "Neutralidade", icon: "⚖️", tone: "primary" },
  "tbr-fs2-diarios-atos": { label: "Diários Oficiais", icon: "📜", tone: "primary" },
};

const TONE_CLASS = {
  teal: "border-teal-500/40 bg-teal-500/10 text-teal-200",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  error: "border-rose-500/40 bg-rose-500/10 text-rose-200",
  primary: "border-cyan-500/40 bg-cyan-500/10 text-cyan-200",
};

function ResumoCard({ resumo, total, elapsed }) {
  if (!resumo) return null;
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-5">
      <div className="mb-2 flex items-center gap-2 text-sm uppercase tracking-wider text-slate-400">
        <FileText className="h-4 w-4" />
        Síntese factual
        <span className="ml-auto text-xs text-slate-500">
          {total} evidências · {elapsed}ms
        </span>
      </div>
      <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-slate-200">
        {resumo}
      </pre>
    </div>
  );
}

function EvidenciaCard({ ev }) {
  const meta = FONTE_LABELS[ev.fonte] || { label: ev.fonte, icon: "📄", tone: "primary" };
  const tone = TONE_CLASS[meta.tone];
  const dados = ev.dados || {};
  // Heurística pra extrair título legível do struct
  const titulo =
    dados.nome ||
    dados.title ||
    dados.titulo ||
    dados.deputado ||
    dados.servidor_nome ||
    dados.cnpj ||
    ev.id;

  // Campos secundários relevantes
  const subline = [
    dados.siglaPartido && `${dados.siglaPartido}/${dados.siglaUf || ""}`,
    dados.cargo,
    dados.valor && `R$ ${Number(dados.valor).toLocaleString("pt-BR")}`,
    dados.score && `Score ${Number(dados.score).toFixed(2)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={`rounded-lg border ${tone} p-4 transition hover:bg-slate-800/40`}>
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider opacity-80">
        <span>{meta.icon}</span>
        <span>{meta.label}</span>
        <span className="ml-auto font-mono opacity-60">#{ev.id}</span>
      </div>
      <div className="text-base font-semibold text-white">{titulo}</div>
      {subline && <div className="mt-1 text-sm opacity-80">{subline}</div>}
      {ev.snippet && (
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{ev.snippet}</p>
      )}
    </div>
  );
}

function FontesPills({ searches }) {
  if (!searches?.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {searches.map((s) => {
        const meta = FONTE_LABELS[s.datastore] || { label: s.datastore, icon: "📄" };
        const isErr = !!s.error;
        const isEmpty = !isErr && !s.count;
        const cls = isErr
          ? "border-rose-600/50 bg-rose-900/20 text-rose-300"
          : isEmpty
          ? "border-slate-700 bg-slate-800/30 text-slate-500"
          : "border-teal-600/40 bg-teal-900/20 text-teal-300";
        return (
          <span
            key={s.datastore}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${cls}`}
            title={s.error || `${s.count} resultados`}
          >
            <span>{meta.icon}</span>
            {meta.label}
            <span className="font-mono opacity-70">{isErr ? "erro" : s.count}</span>
          </span>
        );
      })}
    </div>
  );
}

export default function VertexSearchPanel() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const handleSubmit = useCallback(
    async (e) => {
      e?.preventDefault?.();
      if (query.trim().length < 2) return;
      setLoading(true);
      setError(null);
      try {
        const url = `${ENDPOINT_URL}?q=${encodeURIComponent(query.trim())}`;
        const r = await fetch(url, { method: "GET" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = await r.json();
        setData(json);
      } catch (err) {
        setError(err.message || "Falha na busca");
      } finally {
        setLoading(false);
      }
    },
    [query]
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-teal-400">
          <Database className="h-3.5 w-3.5" />
          Vertex AI Search · 10 fontes
        </div>
        <h1 className="text-3xl font-bold text-white">Busca Consolidada</h1>
        <p className="text-sm text-slate-400">
          Consulte simultaneamente políticos, servidores fantasmas, alertas CEAP, dossiês,
          espectro, votações, rede de saúde, diários oficiais e relatórios. Toda nota é suspeita
          até prova contrária.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Ex: "Erika Hilton", "ghost servidor PA", "decreto 2025"'
            className="w-full rounded-lg border border-slate-700 bg-slate-900 py-3 pl-10 pr-4 text-base text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={loading || query.trim().length < 2}
          className="rounded-lg bg-teal-600 px-6 py-3 font-semibold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Buscar"}
        </button>
      </form>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-rose-200">
          <AlertTriangle className="h-5 w-5" />
          {error}
        </div>
      )}

      {data && !loading && (
        <div className="space-y-6">
          <FontesPills searches={data.searches_raw} />
          <ResumoCard
            resumo={data.resumo}
            total={data.total_evidencias}
            elapsed={data.elapsed_ms}
          />
          {data.evidencias?.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {data.evidencias.map((ev, i) => (
                <EvidenciaCard key={`${ev.fonte}-${ev.id}-${i}`} ev={ev} />
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-slate-500">
              Nenhuma evidência encontrada nas 10 fontes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
