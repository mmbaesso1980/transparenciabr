import { useCallback, useState } from "react";
import { Loader2, Radar } from "lucide-react";
import { getFunctions, httpsCallable } from "firebase/functions";

import { useAuth } from "../../context/AuthContext.jsx";
import { getFirebaseApp } from "../../lib/firebase.js";

/**
 * Botão vermelho + modal — dispara a callable `gerarDossieOnDemand` (Vertex no projeto-codex-br).
 */
export default function AuditoriaOnDemandButton({ politicoId, className = "" }) {
  const { user, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);

  const close = useCallback(() => {
    if (loading) return;
    setOpen(false);
    setErr(null);
    setOk(false);
  }, [loading]);

  const run = useCallback(async () => {
    setErr(null);
    setOk(false);
    const text = ctx.trim();
    if (text.length < 8) {
      setErr("Descreva o contexto com pelo menos 8 caracteres (ex.: linha de investigação ou notícias do dia).");
      return;
    }
    if (!String(politicoId || "").trim()) {
      setErr("Identificador do parlamentar indisponível.");
      return;
    }
    if (!isAuthenticated || !user) {
      setErr("Inicie sessão para solicitar auditoria forense on-demand.");
      return;
    }
    const app = getFirebaseApp();
    if (!app) {
      setErr("Firebase não está configurado neste ambiente.");
      return;
    }
    setLoading(true);
    try {
      const functions = getFunctions(app, "southamerica-east1");
      const callable = httpsCallable(functions, "gerarDossieOnDemand");
      await callable({
        parlamentarId: String(politicoId).trim(),
        contextoInvestigativo: text,
      });
      setOk(true);
      setCtx("");
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
      const msg = e instanceof Error ? e.message : String(e);
      setErr(code ? `${code}: ${msg}` : msg);
    } finally {
      setLoading(false);
    }
  }, [ctx, isAuthenticated, politicoId, user]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setErr(null);
          setOk(false);
        }}
        className={
          "inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-red-500/45 bg-red-950/50 px-4 py-2 text-xs font-bold uppercase tracking-widest text-red-100 shadow-[0_0_20px_-6px_rgba(248,113,113,0.55)] transition hover:border-red-400/70 hover:bg-red-900/55 " +
          className
        }
      >
        <Radar className="size-3.5 text-red-300" strokeWidth={2.25} aria-hidden />
        Auditoria On-Demand
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-ondemand-title"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-red-500/35 bg-[#0d1117] p-5 shadow-[0_0_40px_-10px_rgba(248,113,113,0.45)]">
            <button
              type="button"
              onClick={close}
              className="absolute right-3 top-3 rounded-lg px-2 py-1 text-xs text-[#8B949E] hover:bg-white/5 hover:text-[#F0F4FC]"
            >
              Fechar
            </button>
            <p
              id="audit-ondemand-title"
              className="pr-10 text-sm font-bold uppercase tracking-[0.2em] text-red-200/95"
            >
              Auditoria forense on-demand
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[#8B949E]">
              A análise é produzida no backend e consolidada no relatório do parlamentar. Utilize linguagem
              estritamente factual e referências verificáveis. Não solicite acusações sem prova documental.
            </p>
            <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-[#8B949E]">
              Contexto (hipótese de trabalho, notícias, linha de cruzamento)
            </label>
            <textarea
              value={ctx}
              onChange={(e) => setCtx(e.target.value)}
              rows={5}
              disabled={loading}
              placeholder='Ex.: "Cruzar execução orçamentária com notícias de imprensa regional de março/2026."'
              className="mt-2 w-full resize-y rounded-xl border border-[#30363D] bg-[#161B22] px-3 py-2 text-sm text-[#F0F4FC] outline-none ring-red-500/25 placeholder:text-[#484F58] focus:border-red-500/50 focus:ring-2 disabled:opacity-60"
            />
            {err ? (
              <p className="mt-2 text-xs text-red-300/95" role="alert">
                {err}
              </p>
            ) : null}
            {ok ? (
              <p className="mt-2 text-xs text-emerald-300/95">
                Solicitação aceite. Os achados serão anexados ao dossiê assim que o processamento concluir.
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={loading}
                className="rounded-xl border border-[#30363D] px-4 py-2 text-xs font-semibold text-[#C9D1D9] hover:bg-white/5 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={run}
                disabled={loading}
                className={`inline-flex items-center gap-2 rounded-xl border border-red-500/50 bg-red-600/85 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-lg transition hover:bg-red-500 disabled:opacity-60 ${loading ? "animate-pulse" : ""}`}
              >
                {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {loading ? "Processando…" : "Solicitar análise"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
