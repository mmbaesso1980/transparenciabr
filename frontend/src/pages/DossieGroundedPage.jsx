import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, useParams } from "react-router-dom";

import BrandLogo from "../components/BrandLogo.jsx";

/**
 * Dossiê factual gerado por backend RAG (ex.: getDossiePolitico v3).
 * URL da API: VITE_VERTEX_DOSSIE_GROUNDED_URL (sem fallback para URL não deployada).
 */
const GROUNDED_URL = import.meta.env.VITE_VERTEX_DOSSIE_GROUNDED_URL?.trim() || "";

function pickMarkdown(payload) {
  if (!payload || typeof payload !== "object") return "";
  return (
    payload.dossie_factual ||
    payload.dossie_grounded ||
    payload.dossie ||
    ""
  );
}

export default function DossieGroundedPage() {
  const { nome } = useParams();
  const query = useMemo(() => {
    const raw = nome != null ? String(nome) : "";
    try {
      return decodeURIComponent(raw.replace(/\+/g, "%20"));
    } catch {
      return raw;
    }
  }, [nome]);

  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!GROUNDED_URL || !query || query.length < 2) {
      setPayload(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPayload(null);
    const u = new URL(GROUNDED_URL);
    u.searchParams.set("q", query);
    fetch(u.toString(), {
      headers: { Accept: "application/json" },
    })
      .then(async (r) => {
        const text = await r.text();
        let j = null;
        try {
          j = JSON.parse(text);
        } catch {
          throw new Error(r.ok ? "Resposta não é JSON" : `HTTP ${r.status}`);
        }
        if (!r.ok) {
          throw new Error(j?.error || `HTTP ${r.status}`);
        }
        return j;
      })
      .then((j) => {
        if (!cancelled) setPayload(j);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const md = pickMarkdown(payload);

  return (
    <div className="min-h-dvh bg-[#0B0F1A] text-[#E2E8F0]">
      <Helmet>
        <title>{query ? `Dossiê factual · ${query}` : "Dossiê factual"} — TransparênciaBR</title>
      </Helmet>

      <header className="border-b border-white/10 bg-[#080B14]/90 px-4 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4">
          <BrandLogo to="/" variant="full" size="sm" />
          <nav className="flex flex-wrap gap-3 text-sm font-medium text-[#94A3B8]">
            <Link to="/politica/busca" className="hover:text-[#22d3ee]">
              Busca Vertex
            </Link>
            <Link to="/metodologia" className="hover:text-[#22d3ee]">
              Metodologia
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {!GROUNDED_URL ? (
          <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-6">
            <div className="flex gap-3">
              <AlertTriangle className="size-6 shrink-0 text-amber-400" aria-hidden />
              <div>
                <p className="font-semibold text-amber-100">Backend RAG não configurado neste build</p>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                  Defina <span className="font-mono text-[#67e8f9]">VITE_VERTEX_DOSSIE_GROUNDED_URL</span> no
                  ambiente de build (URL HTTPS da Cloud Function v3 ou proxy). Sem isso, esta página não chama
                  serviços externos.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#64748B]">
            Dossiê factual (RAG)
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
            {query || "—"}
          </h1>
          {payload?.elapsed_ms != null ? (
            <p className="mt-2 font-mono text-xs text-[#64748B]">
              Latência {payload.elapsed_ms} ms
              {payload.modelo ? ` · ${payload.modelo}` : ""}
            </p>
          ) : null}
        </div>

        {loading ? (
          <div className="mt-12 flex items-center gap-3 text-[#94A3B8]">
            <Loader2 className="size-6 animate-spin text-[#22d3ee]" aria-hidden />
            <span>A carregar evidências e texto…</span>
          </div>
        ) : null}

        {error ? (
          <p className="mt-8 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </p>
        ) : null}

        {!loading && !error && GROUNDED_URL && md ? (
          <article className="prose prose-invert prose-headings:text-slate-100 prose-p:text-slate-300 prose-a:text-[#22d3ee] mt-10 max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
          </article>
        ) : null}

        {!loading && !error && GROUNDED_URL && payload && !md ? (
          <pre className="mt-8 overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-4 text-left font-mono text-xs text-[#94A3B8]">
            {JSON.stringify(payload, null, 2)}
          </pre>
        ) : null}

        <footer className="mt-16 border-t border-white/10 pt-8 text-xs leading-relaxed text-[#64748B]">
          Texto gerado com base em evidências indexadas quando o backend está configurado. Não constitui
          denúncia; cruza dados públicos e metodologia da TransparênciaBR.{" "}
          <Link className="text-[#22d3ee] hover:underline" to="/metodologia">
            Metodologia
          </Link>
          .
        </footer>
      </main>
    </div>
  );
}
