import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

import {
  fetchAlertasBodesRecent,
  fetchPoliticoUfMap,
  getFirebaseApp,
} from "../lib/firebase.js";

function fmtCriadoEm(value) {
  if (!value) return "—";
  try {
    if (typeof value.toDate === "function") {
      return value.toDate().toLocaleString("pt-BR");
    }
    if (value instanceof Date) return value.toLocaleString("pt-BR");
    if (typeof value.seconds === "number") {
      return new Date(value.seconds * 1000).toLocaleString("pt-BR");
    }
  } catch {
    /* ignore */
  }
  return String(value);
}

export default function AlertasPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [ufMap, setUfMap] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      if (!getFirebaseApp()) {
        if (!cancelled) {
          setError("missing_config");
          setRows([]);
          setLoading(false);
        }
        return;
      }
      try {
        const [alertas, ufByPol] = await Promise.all([
          fetchAlertasBodesRecent(500),
          fetchPoliticoUfMap(),
        ]);
        if (cancelled) return;
        setRows(alertas);
        setUfMap(ufByPol);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-full bg-[#080B14] px-4 py-6 text-[#F0F4FC] sm:px-6">
      <Helmet>
        <title>Alertas forenses | TransparênciaBR</title>
        <meta
          name="description"
          content="Lista recente da coleção alertas_bodes — motor BigQuery + Gemini."
        />
      </Helmet>

      <header className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 border-b border-[#30363D] pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#8B949E]">
            Sala de vigilância
          </p>
          <div className="mt-1 flex items-center gap-2">
            <AlertTriangle className="size-5 text-[#f85149]" strokeWidth={1.75} />
            <h1 className="text-2xl font-semibold tracking-tight">Alertas recentes</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-[#8B949E]">
            Documentos na coleção{" "}
            <span className="font-mono text-[#C9D1D9]">alertas_bodes</span> após sincronização do
            BigQuery (<span className="font-mono text-[#a371f7]">engines/05_sync_bodes.py</span>).
          </p>
        </div>
        <div className="font-mono text-xs text-[#8B949E]">
          Total:{" "}
          <span className="text-[#58A6FF]">{loading ? "…" : rows.length}</span>
        </div>
      </header>

      {error === "missing_config" ? (
        <p className="mx-auto mt-10 max-w-lg text-center text-sm text-[#8B949E]">
          Firebase não configurado — defina{" "}
          <code className="font-mono text-[#58A6FF]">VITE_FIREBASE_*</code>.
        </p>
      ) : null}

      {error && error !== "missing_config" ? (
        <p className="mx-auto mt-10 max-w-lg text-center text-sm text-[#f85149]">{error}</p>
      ) : null}

      <div className="mx-auto mt-8 max-w-6xl">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#30363D] border-t-[#58A6FF]" />
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-2xl border border-[#30363D] bg-[#0D1117]/60 px-6 py-12 text-center text-sm text-[#8B949E]">
            Nenhum alerta na coleção (ou índices Firestore em falta para ordenação).
          </p>
        ) : (
          <ul className="flex flex-col gap-0 divide-y divide-[#21262D] rounded-2xl border border-[#30363D] bg-[#0D1117]/70">
            {rows.map((a) => {
              const pid = String(a.politico_id ?? a.parlamentar_id ?? "").trim();
              const uf = pid ? ufMap[pid] : "";
              const tipo = String(a.tipo_risco ?? a.tipo ?? "—");
              const sev = String(a.severidade ?? a.criticidade ?? "");
              const msg = String(a.mensagem ?? a.trecho ?? "");
              const fonte = String(a.fonte ?? "");
              return (
                <li key={a.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-[#21262D] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[#f85149]">
                          {tipo}
                        </span>
                        {sev ? (
                          <span className="text-[10px] uppercase tracking-wider text-[#8B949E]">
                            {sev}
                          </span>
                        ) : null}
                        {fonte ? (
                          <span className="font-mono text-[10px] text-[#a371f7]">{fonte}</span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-[#C9D1D9]">{msg}</p>
                      <div className="mt-2 flex flex-wrap gap-3 font-mono text-[11px] text-[#8B949E]">
                        <span>
                          político:{" "}
                          {pid ? (
                            <Link
                              className="text-[#58A6FF] hover:underline"
                              to={`/dossie/${encodeURIComponent(pid)}`}
                            >
                              {pid}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </span>
                        {uf ? <span>UF {uf}</span> : null}
                        <span>{fmtCriadoEm(a.criado_em)}</span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
