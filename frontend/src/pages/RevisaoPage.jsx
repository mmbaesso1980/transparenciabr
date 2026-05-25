/**
 * RevisaoPage — AURORA Forensic v1.1
 * Rota: /revisao
 *
 * Lista dossiês com status "reviewing" ou "done" e exibe o painel de
 * revisão para cada um: 6 cards de revisores + timeline de warnings.
 *
 * Listener Firestore em tempo real: dossies_v1/{slug}/review/*
 * Botão "re-rodar revisão" aciona a callable function `rerunReview`.
 */

import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";

import RevisorCard from "../components/revisao/RevisorCard.jsx";

// ---------------------------------------------------------------------------
// Firebase (importação dinâmica para evitar quebra se lib não estiver pronta)
// ---------------------------------------------------------------------------

let firestoreRef = null;

async function getFirestore() {
  if (firestoreRef) return firestoreRef;
  try {
    const { getFirestore: gfs, getApp } = await import("firebase/firestore");
    const { initializeApp, getApps } = await import("firebase/app");
    // Reutiliza app já inicializado se existir
    if (!getApps().length) {
      // Tenta importar configuração do Firebase (arquivo pode variar por projeto)
      const fbModule = await import("../lib/firebase.js").catch(() => null);
      // Se firebase.js já inicializa o app, o getApps().length check acima previne dupla init
    }
    firestoreRef = gfs();
    return firestoreRef;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const DEFAULT_API_BASE =
  "https://southamerica-east1-transparenciabr.cloudfunctions.net";

const API_BASE = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_FUNCTIONS_URL ||
  DEFAULT_API_BASE
)
  .toString()
  .replace(/\/+$/, "");

const REVISOR_IDS = [
  "revisor_fonte_primaria",
  "revisor_tom",
  "revisor_contraditorio",
  "revisor_falso_positivo",
  "revisor_mascara_pii",
  "revisor_severidade",
];

// ---------------------------------------------------------------------------
// Hook: lista dossiês em revisão
// ---------------------------------------------------------------------------

function useDossiesReview() {
  const [dossies, setDossies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe = () => {};

    (async () => {
      const db = await getFirestore();
      if (!db) {
        setLoading(false);
        return;
      }

      try {
        const { collection, query, where, onSnapshot, orderBy, limit } =
          await import("firebase/firestore");

        const q = query(
          collection(db, "dossies_v1"),
          where("status", "in", ["reviewing", "done"]),
          orderBy("updated_at", "desc"),
          limit(20),
        );

        unsubscribe = onSnapshot(q, (snap) => {
          const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setDossies(docs);
          setLoading(false);
        });
      } catch {
        setLoading(false);
      }
    })();

    return () => unsubscribe();
  }, []);

  return { dossies, loading };
}

// ---------------------------------------------------------------------------
// Hook: estado de revisão de um dossiê específico
// ---------------------------------------------------------------------------

function useReviewState(slug) {
  const [reviewMap, setReviewMap] = useState({});

  useEffect(() => {
    if (!slug) return;
    let unsubscribe = () => {};

    (async () => {
      const db = await getFirestore();
      if (!db) return;

      try {
        const { collection, onSnapshot } = await import("firebase/firestore");
        const col = collection(db, "dossies_v1", slug, "review");

        unsubscribe = onSnapshot(col, (snap) => {
          const map = {};
          snap.docs.forEach((d) => {
            map[d.id] = d.data();
          });
          setReviewMap(map);
        });
      } catch {
        // silencia — exibe estado idle
      }
    })();

    return () => unsubscribe();
  }, [slug]);

  return reviewMap;
}

// ---------------------------------------------------------------------------
// Componente: painel de dossiê individual
// ---------------------------------------------------------------------------

function DossieReviewPanel({ dossie }) {
  const reviewMap = useReviewState(dossie.id);
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState(null);

  // Coleta timeline de warnings de todos os revisores
  const timeline = REVISOR_IDS.flatMap((rid) => {
    const rev = reviewMap[rid] ?? {};
    return (rev.warnings ?? []).map((w) => ({
      revisor: rid,
      text: w,
      finishedAt: rev.finished_at ?? null,
    }));
  }).slice(0, 30); // limita a 30 entradas na timeline

  const allApproved = REVISOR_IDS.every(
    (rid) => (reviewMap[rid]?.state ?? "idle") === "approved",
  );

  const handleRerun = useCallback(async () => {
    setRerunning(true);
    setRerunError(null);
    try {
      const { getFunctions, httpsCallable } = await import("firebase/functions");
      const functions = getFunctions(undefined, "southamerica-east1");
      const rerunReview = httpsCallable(functions, "rerunReview");
      await rerunReview({ slug: dossie.id });
    } catch (err) {
      setRerunError(err?.message ?? "Erro desconhecido");
    } finally {
      setRerunning(false);
    }
  }, [dossie.id]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      {/* Header do dossiê */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-100">
            {dossie.alvo?.nome ?? dossie.id}
          </p>
          <p className="text-xs text-slate-500">
            {dossie.alvo?.partido ?? ""}{" "}
            {dossie.alvo?.cargo ? `· ${dossie.alvo.cargo}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Status badge */}
          <span
            className={[
              "rounded-full px-2 py-0.5 text-xs font-medium",
              dossie.status === "reviewing"
                ? "bg-blue-500/20 text-blue-300"
                : "bg-teal-500/20 text-teal-300",
            ].join(" ")}
          >
            {dossie.status === "reviewing" ? "Revisando" : "Concluído"}
          </span>

          {/* Ver dossiê */}
          {dossie.pdf_url && (
            <a
              href={dossie.pdf_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
            >
              <FileText size={13} />
              Ver dossiê
              <ExternalLink size={11} />
            </a>
          )}

          {/* Re-rodar revisão */}
          <button
            onClick={handleRerun}
            disabled={rerunning}
            className="inline-flex items-center gap-1 rounded-lg bg-teal-700/40 px-3 py-1 text-xs text-teal-300 hover:bg-teal-700/60 disabled:opacity-50"
          >
            {rerunning ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Re-rodar revisão
          </button>
        </div>
      </div>

      {rerunError && (
        <p className="mb-3 rounded bg-red-500/10 px-3 py-1 text-xs text-red-400">
          Erro: {rerunError}
        </p>
      )}

      {/* 6 cards de revisores */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REVISOR_IDS.map((rid) => {
          const rev = reviewMap[rid] ?? {};
          return (
            <RevisorCard
              key={rid}
              revisorId={rid}
              state={rev.state ?? "idle"}
              warnings={rev.warnings ?? []}
              retries={rev.retries ?? 0}
              finishedAt={rev.finished_at}
            />
          );
        })}
      </div>

      {/* Timeline de warnings */}
      {timeline.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Timeline de avisos
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
            {timeline.map((entry, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300"
              >
                <AlertTriangle
                  size={12}
                  className="mt-0.5 shrink-0 text-amber-400"
                />
                <span className="break-words">
                  <span className="mr-1 font-medium text-amber-400">
                    [{entry.revisor.replace("revisor_", "")}]
                  </span>
                  {entry.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {allApproved && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-teal-500/10 px-3 py-2 text-sm text-teal-300">
          <CheckCircle2 size={15} />
          Todos os revisores aprovaram este dossiê.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function RevisaoPage() {
  const { dossies, loading } = useDossiesReview();

  return (
    <div className="aurora-page min-h-dvh px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-100">
            Pipeline de Revisão Automatizada
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            6 agentes revisores — AURORA Forensic v1.1 · regras de integridade
            e conformidade
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 size={22} className="animate-spin" />
            <span className="ml-3 text-sm">Carregando dossiês…</span>
          </div>
        )}

        {/* Lista vazia */}
        {!loading && dossies.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-6 py-12 text-center">
            <p className="text-slate-400">
              Nenhum dossiê em revisão no momento.
            </p>
            <Link
              to="/escritorio"
              className="mt-4 inline-block text-sm text-teal-400 hover:brightness-110"
            >
              Ir para o Escritório →
            </Link>
          </div>
        )}

        {/* Painéis por dossiê */}
        {!loading && dossies.length > 0 && (
          <div className="space-y-6">
            {dossies.map((d) => (
              <DossieReviewPanel key={d.id} dossie={d} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
