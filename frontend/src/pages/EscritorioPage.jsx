import { Rocket, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

import CrewRow from "../components/escritorio/CrewRow.jsx";
import MaestroPanel from "../components/escritorio/MaestroPanel.jsx";
import { CREWS } from "../constants/legiao100.js";
import { useDossieV1Status } from "../hooks/useDossieV1Status.js";

const DEFAULT_API_BASE =
  "https://southamerica-east1-transparenciabr.cloudfunctions.net";

const API_BASE = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_FUNCTIONS_URL ||
  DEFAULT_API_BASE
)
  .toString()
  .replace(/\/+$/, "");

function slugify(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Página /escritorio — sala de comando da Legião 100.
 *
 * Permite ao operador digitar o nome do parlamentar, disparar o pipeline
 * v1.0 (`POST {API}/iniciarDossieV1`) e acompanhar em tempo real, via
 * Firestore (`dossies_v1/{slug}`), o estado de cada um dos 110 agentes
 * + Maestro.
 */
export default function EscritorioPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const slugFromUrl = searchParams.get("slug") || "";
  const [nome, setNome] = useState("");
  const [activeSlug, setActiveSlug] = useState(slugFromUrl);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    setActiveSlug(slugFromUrl);
  }, [slugFromUrl]);

  const dossie = useDossieV1Status(activeSlug || null);

  const agentStatusMap = useMemo(() => {
    const out = {};
    if (dossie?.agents && typeof dossie.agents === "object") {
      for (const [k, v] of Object.entries(dossie.agents)) {
        out[k] = (v && typeof v === "object" && v.status) || "pending";
      }
    }
    return out;
  }, [dossie?.agents]);

  async function handleAtivar(e) {
    e?.preventDefault?.();
    const trimmed = nome.trim();
    if (!trimmed) {
      setSubmitError("Digite o nome do parlamentar.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const fallbackSlug = slugify(trimmed);
    try {
      const res = await fetch(`${API_BASE}/iniciarDossieV1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: trimmed }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok) {
        throw new Error(
          data?.error || data?.message || `HTTP ${res.status}`,
        );
      }
      const slug = data?.slug || fallbackSlug;
      setActiveSlug(slug);
      setSearchParams({ slug }, { replace: false });
    } catch (err) {
      // Mesmo com fetch falhando, permite acompanhar via slug local
      // (útil se o pipeline foi disparado por outra via).
      setActiveSlug(fallbackSlug);
      setSearchParams({ slug: fallbackSlug }, { replace: false });
      setSubmitError(
        `Falha ao chamar /iniciarDossieV1: ${err?.message || err}. A acompanhar via Firestore mesmo assim.`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[#0e1117] text-slate-100">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-6 py-8">
        <header className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-400">
            Escritório · Legião 100 · AURORA Forensic v1.0
          </p>
          <h1 className="text-3xl font-bold text-slate-50">
            Sala de comando do Maestro Supremo
          </h1>
          <p className="max-w-3xl text-sm text-slate-400">
            Digite o nome do parlamentar e ative a Legião. Os 110 agentes
            executam em paralelo (10 crews × 10 operadores + 10 especialistas
            da crew forense v1.0) sob coordenação do Maestro, que valida tom
            informativo e consolida o dossiê final.
          </p>
        </header>

        <form
          onSubmit={handleAtivar}
          className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 md:flex-row md:items-center"
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Digite o nome do parlamentar (ex.: Kim Kataguiri)"
              className="w-full rounded-xl border border-slate-700 bg-[#0b1218] py-3.5 pl-11 pr-4 text-base text-slate-100 placeholder:text-slate-600 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              disabled={submitting}
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !nome.trim()}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#01696F] px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Rocket className="size-4" />
            {submitting ? "A iniciar…" : "Ativar Legião 100"}
          </button>
        </form>

        {submitError ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {submitError}
          </div>
        ) : null}

        {activeSlug ? (
          <div className="rounded-xl border border-teal-500/40 bg-teal-500/5 px-4 py-2 text-xs text-teal-200">
            Acompanhando dossiê <span className="font-mono">{activeSlug}</span>
            {dossie.status ? ` · status: ${dossie.status}` : ""}
            {dossie.findingsCount != null
              ? ` · ${dossie.findingsCount} findings`
              : ""}
          </div>
        ) : null}

        <div className="flex flex-col gap-6 lg:flex-row">
          <section className="flex-1 space-y-3">
            {CREWS.map((crew) => (
              <CrewRow
                key={crew.id}
                crew={crew}
                agentStatusMap={agentStatusMap}
              />
            ))}
          </section>

          <MaestroPanel
            status={dossie.status}
            alvo={dossie.alvo || (activeSlug ? activeSlug : null)}
            agentStatusMap={agentStatusMap}
            logs={dossie.logs}
            pdfUrl={dossie.pdfUrl}
            findingsCount={dossie.findingsCount}
          />
        </div>

        {dossie.status === "done" && dossie.pdfUrl ? (
          <footer className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
              Dossiê pronto
            </p>
            <p className="mt-1 text-lg text-slate-100">
              {dossie.alvo || activeSlug} — {dossie.findingsCount || "?"}{" "}
              findings consolidados pelo Maestro.
            </p>
            <div className="mt-3 flex gap-3">
              <a
                href={dossie.pdfUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                Abrir PDF
              </a>
              <button
                type="button"
                onClick={() => navigate(`/politico/${activeSlug}`)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-teal-400 hover:text-teal-200"
              >
                Ver perfil público
              </button>
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
