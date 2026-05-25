/**
 * RevisorCard — AURORA Forensic v1.1
 *
 * Card de um agente revisor individual. Exibe:
 *   - Ícone correspondente ao revisor
 *   - Nome e descrição curta
 *   - Badge de estado (idle / reviewing / approved / warnings / rejected)
 *   - Contador de warnings
 *   - Lista de warnings expansível
 */

import { useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  GraduationCap,
  Lock,
  Loader2,
  Scale,
  Search,
  TrafficCone,
  XCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Mapeamentos de metadados por revisor_id
// ---------------------------------------------------------------------------

const REVISOR_META = {
  revisor_fonte_primaria: {
    label: "Fonte Primária",
    descricao: "Garante URL pública verificável em cada finding",
    Icon: Search,
  },
  revisor_tom: {
    label: "Tom",
    descricao: "Verifica blocklist de linguagem acusatória",
    Icon: BookOpen,
  },
  revisor_contraditorio: {
    label: "Contraditório",
    descricao: "Template 3-partes em findings ≥ MÉDIA",
    Icon: Scale,
  },
  revisor_falso_positivo: {
    label: "Falso Positivo",
    descricao: "Regras FP-BANCADA + CONTRATO_RECORRENTE v1.1",
    Icon: GraduationCap,
  },
  revisor_mascara_pii: {
    label: "Máscara PII",
    descricao: "CPF mascarado + proteção Classe C (LGPD)",
    Icon: Lock,
  },
  revisor_severidade: {
    label: "Severidade",
    descricao: "Cap MÉDIA com prerrogativa legal",
    Icon: TrafficCone,
  },
};

// ---------------------------------------------------------------------------
// Badge de estado
// ---------------------------------------------------------------------------

const STATE_CONFIG = {
  idle: {
    label: "Aguardando",
    className: "bg-slate-700 text-slate-300",
    Icon: Clock,
  },
  reviewing: {
    label: "Revisando",
    className: "bg-blue-500/20 text-blue-300 animate-pulse",
    Icon: Loader2,
  },
  approved: {
    label: "Aprovado",
    className: "bg-teal-500/20 text-teal-300",
    Icon: CheckCircle2,
  },
  warnings: {
    label: "Avisos",
    className: "bg-amber-500/20 text-amber-300",
    Icon: AlertTriangle,
  },
  rejected: {
    label: "Rejeitado",
    className: "bg-red-500/20 text-red-400",
    Icon: XCircle,
  },
};

function StateBadge({ state }) {
  const cfg = STATE_CONFIG[state] ?? STATE_CONFIG.idle;
  const { Icon, label, className } = cfg;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      <Icon size={11} className={state === "reviewing" ? "animate-spin" : ""} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   revisorId: string,
 *   state: "idle" | "reviewing" | "approved" | "warnings" | "rejected",
 *   warnings: string[],
 *   retries: number,
 *   finishedAt?: string,
 * }} props
 */
export default function RevisorCard({
  revisorId,
  state = "idle",
  warnings = [],
  retries = 0,
  finishedAt,
}) {
  const [expanded, setExpanded] = useState(false);

  const meta = REVISOR_META[revisorId] ?? {
    label: revisorId,
    descricao: "",
    Icon: Search,
  };
  const { label, descricao, Icon } = meta;
  const hasWarnings = warnings.length > 0;

  return (
    <div
      className={[
        "rounded-xl border p-4 transition-colors",
        state === "approved"
          ? "border-teal-500/30 bg-teal-500/5"
          : state === "warnings"
            ? "border-amber-500/30 bg-amber-500/5"
            : state === "rejected"
              ? "border-red-500/30 bg-red-500/5"
              : state === "reviewing"
                ? "border-blue-500/30 bg-blue-500/5"
                : "border-slate-800 bg-slate-900/40",
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Avatar / ícone */}
          <div
            className={[
              "flex h-9 w-9 items-center justify-center rounded-lg",
              state === "approved"
                ? "bg-teal-500/20 text-teal-400"
                : state === "warnings"
                  ? "bg-amber-500/20 text-amber-400"
                  : state === "rejected"
                    ? "bg-red-500/20 text-red-400"
                    : "bg-slate-800 text-slate-400",
            ].join(" ")}
          >
            <Icon size={18} />
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-100">{label}</p>
            <p className="text-xs text-slate-500">{descricao}</p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <StateBadge state={state} />
          {retries > 0 && (
            <span className="text-xs text-slate-500">{retries} retry{retries > 1 ? "s" : ""}</span>
          )}
        </div>
      </div>

      {/* Contador de warnings + toggle */}
      {hasWarnings && (
        <div className="mt-3 border-t border-slate-800 pt-3">
          <button
            className="flex w-full items-center justify-between text-xs text-amber-400 hover:text-amber-300"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <span>
              {warnings.length} aviso{warnings.length > 1 ? "s" : ""}
            </span>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {expanded && (
            <ul className="mt-2 space-y-1">
              {warnings.map((w, i) => (
                <li
                  key={i}
                  className="rounded bg-slate-800/60 px-2 py-1 text-xs text-slate-300"
                >
                  {w}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Timestamp */}
      {finishedAt && (
        <p className="mt-2 text-right text-xs text-slate-600">
          {new Date(finishedAt).toLocaleTimeString("pt-BR")}
        </p>
      )}
    </div>
  );
}
