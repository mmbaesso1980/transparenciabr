import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";

/**
 * Radar Jurídico — demo LegalTech + chat real via proxy Cloud Function (Dialogflow CX).
 * Nenhuma credencial no cliente; ADC no backend.
 */

const MIDNIGHT = "#0a1628";
const MIDNIGHT_DEEP = "#050d18";
const EMERALD = "#34d399";
const GOLD = "#d4af37";
const GOLD_SOFT = "rgba(212, 175, 55, 0.35)";

function agentEndpoint() {
  const fromEnv = import.meta.env.VITE_VERTEX_AGENT_URL;
  if (fromEnv) return String(fromEnv).replace(/\/$/, "");
  const base = import.meta.env.BASE_URL || "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}api/vertex/ask`.replace(/([^:]\/)\/+/g, "$1");
}

function sessionKey() {
  let id = sessionStorage.getItem("vertex_cx_session");
  if (!id) {
    id = `web-${crypto.randomUUID?.() || String(Date.now())}`;
    sessionStorage.setItem("vertex_cx_session", id);
  }
  return id;
}

const DEMO_CASE = {
  ref: "BR-2026-TRILHO-01",
  tribunal: "TRF-3",
  objeto: "Revisão de benefício previdenciário · matéria de prova documental",
  status: "Análise documental",
};

export default function RadarJuridico() {
  const formId = useId();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "sys",
      text:
        "Canal seguro ao motor forense. Consultas são processadas via infraestrutura Google Cloud (Agent Builder / Dialogflow CX). Não armazenamos credenciais no navegador.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setError("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);

    try {
      const res = await fetch(agentEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          sessionId: sessionKey(),
          query: q,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || data.error || `HTTP ${res.status}`);
      }
      const reply = typeof data.reply === "string" ? data.reply : JSON.stringify(data);
      setMessages((m) => [...m, { role: "agent", text: reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setMessages((m) => [
        ...m,
        {
          role: "err",
          text: `Falha na ponte segura: ${msg}. Verifique deploy da função askVertexAgent e permissões Dialogflow CX na service account.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

  return (
    <div
      className="min-h-dvh text-slate-100"
      style={{
        background: `linear-gradient(165deg, ${MIDNIGHT_DEEP} 0%, ${MIDNIGHT} 42%, #0c1a32 100%)`,
      }}
    >
      <Helmet>
        <title>Radar Jurídico — TransparênciaBR</title>
        <meta
          name="description"
          content="Console LegalTech com integração ao agente Vertex (Dialogflow CX) via proxy seguro."
        />
      </Helmet>

      {/* Top ribbon — tendência: "status strip" + hierarquia tipográfica editorial */}
      <div
        className="border-b px-4 py-2 text-center font-mono text-[10px] uppercase tracking-[0.35em] sm:text-[11px]"
        style={{
          borderColor: "rgba(148, 163, 184, 0.12)",
          background: `linear-gradient(90deg, transparent, ${GOLD_SOFT}, transparent)`,
          color: GOLD,
        }}
      >
        Vertex AI Agent Builder · sessão cifrada no edge · sem chaves no cliente
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <header className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.28em]" style={{ color: EMERALD }}>
              Operação forense · demo reunião
            </p>
            <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Radar Jurídico
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
              Painel midnight com acentos esmeralda e ouro: contraste AA em texto principal,
              hierarquia serif + mono para lembrar briefings de tribunal e terminais de
              inteligência.
            </p>
          </div>
          <div
            className="flex shrink-0 flex-col gap-2 rounded-2xl border px-5 py-4 font-mono text-xs shadow-lg backdrop-blur-md"
            style={{
              borderColor: "rgba(52, 211, 153, 0.25)",
              background: "rgba(15, 23, 42, 0.55)",
              boxShadow: `0 0 0 1px ${GOLD_SOFT}`,
            }}
          >
            <span className="text-[10px] uppercase tracking-widest text-slate-500">
              Caso em destaque
            </span>
            <span className="text-sm font-semibold text-white">{DEMO_CASE.ref}</span>
            <span style={{ color: EMERALD }}>{DEMO_CASE.tribunal}</span>
            <span className="text-slate-400">{DEMO_CASE.objeto}</span>
            <span
              className="mt-1 inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ borderColor: GOLD, color: GOLD }}
            >
              {DEMO_CASE.status}
            </span>
          </div>
        </header>

        {/* Timeline demo — tendência: narrativa processual em etapas */}
        <section className="mb-10 grid gap-4 sm:grid-cols-3">
          {[
            { step: "01", title: "Captura", body: "DOU + fontes primárias indexadas no datalake." },
            { step: "02", title: "Triagem", body: "Motor classifica risco sem imputar conduta." },
            { step: "03", title: "Laudo", body: "Agente Vertex consolida linguagem jurídica controlada." },
          ].map((b) => (
            <div
              key={b.step}
              className="rounded-2xl border p-5 transition hover:-translate-y-0.5"
              style={{
                borderColor: "rgba(148, 163, 184, 0.15)",
                background: "rgba(15, 23, 42, 0.45)",
              }}
            >
              <span className="font-mono text-xs font-bold" style={{ color: GOLD }}>
                {b.step}
              </span>
              <h2 className="mt-2 font-semibold text-white">{b.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{b.body}</p>
            </div>
          ))}
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_min(100%,420px)] lg:items-start">
          {/* Dossier preview — tendência: "glass docket" */}
          <section
            className="rounded-2xl border p-6 backdrop-blur-md sm:p-8"
            style={{
              borderColor: "rgba(212, 175, 55, 0.2)",
              background: "rgba(5, 13, 24, 0.65)",
            }}
          >
            <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em]" style={{ color: EMERALD }}>
              Pré-visualização do dossiê (mock)
            </h2>
            <ul className="mt-4 space-y-3 font-mono text-sm text-slate-300">
              <li className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-slate-500">Partes</span>
                <span className="text-right text-slate-200">Autarquia · Interessado (mascarado)</span>
              </li>
              <li className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-slate-500">Pedido</span>
                <span className="text-right text-slate-200">Revisão / prova pericial</span>
              </li>
              <li className="flex justify-between">
                <span className="text-slate-500">Risco IA</span>
                <span className="font-semibold" style={{ color: GOLD }}>
                  Moderado · documentação incompleta
                </span>
              </li>
            </ul>
            <p className="mt-6 text-xs leading-relaxed text-slate-500">
              Tendências de design 2025–2026 para legal intelligence: fundo profundo com um único
              acento metálico (ouro), micro-interações em cards, e chat como painel lateral fixo
              (desktop) para leitura contínua do processo.
            </p>
          </section>

          {/* Chat — Vertex via proxy */}
          <aside
            className="flex flex-col overflow-hidden rounded-2xl border shadow-2xl"
            style={{
              borderColor: "rgba(52, 211, 153, 0.2)",
              background: "rgba(8, 18, 35, 0.92)",
              minHeight: "22rem",
              maxHeight: "min(70vh, 560px)",
            }}
            aria-label="Consulta ao agente Vertex"
          >
            <div
              className="border-b px-4 py-3 sm:px-5"
              style={{ borderColor: "rgba(148, 163, 184, 0.12)" }}
            >
              <h2 className="font-mono text-xs font-bold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
                Canal ASMODEUS
              </h2>
              <p className="mt-0.5 text-[10px] text-slate-500">
                POST {agentEndpoint()}
              </p>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4 font-mono text-[12px] leading-relaxed sm:text-sm">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "ml-3 border-l-2 pl-3 text-slate-300"
                      : m.role === "err"
                        ? "text-amber-200/90"
                        : "whitespace-pre-wrap text-slate-200"
                  }
                  style={{
                    borderColor: m.role === "user" ? EMERALD : "transparent",
                  }}
                >
                  {m.role === "user" ? (
                    <>
                      <span className="text-slate-600">operador › </span>
                      {m.text}
                    </>
                  ) : (
                    m.text
                  )}
                </div>
              ))}
              {loading ? (
                <p className="animate-pulse font-mono text-xs italic" style={{ color: EMERALD }}>
                  [ ASMODEUS processando Datalake... ]
                </p>
              ) : null}
              <div ref={bottomRef} />
            </div>

            {error ? (
              <p className="border-t border-red-500/20 bg-red-950/30 px-4 py-2 text-[11px] text-red-200/90">
                {error}
              </p>
            ) : null}

            <div
              className="border-t p-3 sm:p-4"
              style={{ borderColor: "rgba(148, 163, 184, 0.12)" }}
            >
              <label htmlFor={`${formId}-q`} className="sr-only">
                Pergunta ao agente
              </label>
              <div className="flex gap-2">
                <input
                  id={`${formId}-q`}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") send();
                  }}
                  disabled={loading}
                  placeholder="Ex.: Resuma o risco documental deste caso."
                  className="min-h-11 flex-1 rounded-xl border border-white/10 bg-slate-950/80 px-3 font-mono text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 disabled:opacity-50"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={loading || !input.trim()}
                  className="min-h-11 shrink-0 rounded-xl px-4 font-mono text-xs font-bold uppercase tracking-wide text-slate-950 transition enabled:hover:brightness-110 disabled:opacity-40"
                  style={{ backgroundColor: EMERALD }}
                  aria-label="Enviar pergunta ao agente Vertex"
                >
                  Enviar
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
