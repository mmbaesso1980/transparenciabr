/**
 * @file PlataformaStatus.jsx
 * @description Onda 7 — Despertar dos Bancos. Banner global que mostra o
 * estado real da plataforma (Data Lake, classificações, ingestão) consumindo
 * a CF pública getSprintStatus + getDashboardKPIs. Aparece na home como prova
 * de que não é vaporware: tem dado real circulando.
 *
 * Filosofia: 'Toda nota é suspeita até prova contrária. Não fazemos denúncia
 * — apresentamos fatos.' Os números aqui são auditáveis a qualquer momento
 * abrindo a CF no navegador.
 */

import { useEffect, useState } from "react";
import { Database, Activity, FileCheck2, Layers } from "lucide-react";

const SPRINT_URL =
  "https://southamerica-east1-transparenciabr.cloudfunctions.net/getSprintStatus";
const DASH_URL =
  "https://southamerica-east1-transparenciabr.cloudfunctions.net/getDashboardKPIs";

const fmtBRL = (v) =>
  Number.isFinite(Number(v))
    ? Number(v).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      })
    : "—";

const fmtNum = (v) =>
  Number.isFinite(Number(v)) ? Number(v).toLocaleString("pt-BR") : "—";

const fmtMB = (bytes) =>
  Number.isFinite(Number(bytes))
    ? `${(Number(bytes) / 1024 / 1024).toFixed(1)} MB`
    : "—";

export default function PlataformaStatus() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    sprint: null,
    dash: null,
  });

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const [sprintRes, dashRes] = await Promise.all([
          fetch(SPRINT_URL, { signal: ctrl.signal }).then((r) => r.json()),
          fetch(DASH_URL, { signal: ctrl.signal }).then((r) => r.json()),
        ]);
        setState({
          loading: false,
          error: null,
          sprint: sprintRes,
          dash: dashRes,
        });
      } catch (e) {
        if (e.name === "AbortError") return;
        setState({ loading: false, error: e.message, sprint: null, dash: null });
      }
    })();
    return () => ctrl.abort();
  }, []);

  if (state.loading) {
    return (
      <div className="mx-auto w-full max-w-6xl rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-5 text-sm text-white/50">
        Consultando o estado real da plataforma…
      </div>
    );
  }
  if (state.error || !state.sprint || !state.dash) return null;

  const dash = state.dash;
  const ing = state.sprint.ingestao || {};
  const ceapTotal = Object.values(ing.ceap || {}).reduce(
    (a, v) => a + (v?.bytes || 0),
    0,
  );
  const senadoTotal = Object.values(ing.ceaps_senado || {}).reduce(
    (a, v) => a + (v?.bytes || 0),
    0,
  );

  const generated = state.sprint.generated_at
    ? new Date(state.sprint.generated_at).toLocaleString("pt-BR")
    : "—";

  return (
    <section className="mx-auto w-full max-w-6xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.32em] text-cyan-300">
          Estado da plataforma · ao vivo
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">
          atualizado: {generated}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<FileCheck2 className="size-4" strokeWidth={1.75} />}
          label="Notas classificadas"
          value={fmtNum(dash.total_notas_classificadas)}
          hint={`${dash.total_anos_cobertos ?? "—"} anos · ${dash.files_scanned ?? "—"} arquivos`}
          accent="cyan"
        />
        <Stat
          icon={<Layers className="size-4" strokeWidth={1.75} />}
          label="Parlamentares cobertos"
          value={fmtNum(dash.total_parlamentares_cobertos)}
          hint={`Cobertura: ${dash.cobertura_pct ?? "—"}% do universo`}
          accent="violet"
        />
        <Stat
          icon={<Database className="size-4" strokeWidth={1.75} />}
          label="Valor total no Data Lake"
          value={fmtBRL(dash.valor_total_classificado_brl)}
          hint="CEAP classificada por Aurora"
          accent="amber"
        />
        <Stat
          icon={<Activity className="size-4" strokeWidth={1.75} />}
          label="Ingestão CEAP"
          value={fmtMB(ceapTotal)}
          hint={`${Object.keys(ing.ceap || {}).length} anos · Senado: ${fmtMB(senadoTotal)}`}
          accent="emerald"
        />
      </div>

      <p className="mt-3 text-[10px] uppercase tracking-widest text-white/30">
        Fontes auditáveis: getSprintStatus · getDashboardKPIs · getDossieCeapKPIs
      </p>
    </section>
  );
}

function Stat({ icon, label, value, hint, accent = "cyan" }) {
  const map = {
    cyan: "border-cyan-400/20 bg-cyan-400/[0.04] text-cyan-200",
    violet: "border-violet-400/20 bg-violet-400/[0.04] text-violet-200",
    amber: "border-amber-400/20 bg-amber-400/[0.04] text-amber-200",
    emerald: "border-emerald-400/20 bg-emerald-400/[0.04] text-emerald-200",
  };
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${map[accent] ?? map.cyan}`}
    >
      <div className="flex items-center gap-2 opacity-80">
        {icon}
        <p className="text-[10px] font-semibold uppercase tracking-widest">
          {label}
        </p>
      </div>
      <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-white">
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-[10px] uppercase tracking-wider text-white/40">
          {hint}
        </p>
      )}
    </div>
  );
}
