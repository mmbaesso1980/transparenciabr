import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";

/**
 * Radar Jurídico — integração real com Agente Vertex (Dialogflow CX) via proxy.
 * Streaming NDJSON + efeito de digitação forense + painel de dados brutos (tools).
 * ZERO credenciais no browser.
 */

const EMERALD = "#34d399";
const GOLD = "#d4af37";
const GOLD_SOFT = "rgba(212, 175, 55, 0.35)";
const MIDNIGHT = "#0a1628";
const MIDNIGHT_DEEP = "#050d18";

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
  objeto: "Malha previdenciária · Pirassununga & Valinhos",
  status: "Canal ASMODEUS ativo",
};

export default function RadarJuridico() {
  const formId = useId();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "sys",
      text:
        "Integração real com o Agent Builder (Dialogflow CX). O proxy injeta o contexto Operação Trilho 1 (Pirassununga & Valinhos) em cada turno. Ferramentas do console (ex.: BigQuery) podem retornar blocos estruturados — exibidos no painel lateral como dados brutos.",
    },
  ]);
  const [streaming, setStreaming] = useState(false);
  const [typedReply, setTypedReply] = useState("");
  const [thinkLog, setThinkLog] = useState([]);
  const [toolPayload, setToolPayload] = useState(null);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming, typedReply, thinkLog]);

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q || streaming) return;
    setInput("");
    setError("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setStreaming(true);
    setTypedReply("");
    setThinkLog([]);
    setToolPayload(null);

    let accumulated = "";

    try {
      const res = await fetch(agentEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({
          sessionId: sessionKey(),
          query: q,
          stream: true,
        }),
      });

      if (!res.ok) {
        const t = await res.text();
        let msg = t;
        try {
          const j = JSON.parse(t);
          msg = j.detail || j.error || t;
        } catch {
          /* plain */
        }
        throw new Error(msg || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Stream não suportado neste navegador.");

      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let ev;
          try {
            ev = JSON.parse(trimmed);
          } catch {
            continue;
          }
          if (ev.type === "log" && ev.message) {
            setThinkLog((l) => [
              ...l.slice(-24),
              { t: ev.ts || new Date().toISOString(), m: String(ev.message) },
            ]);
          } else if (ev.type === "text") {
            if (typeof ev.delta === "string" && ev.delta) {
              accumulated += ev.delta;
              setTypedReply(accumulated);
            } else if (typeof ev.full === "string") {
              accumulated = ev.full;
              setTypedReply(accumulated);
            }
          } else if (ev.type === "tool" && ev.payload) {
            setToolPayload(ev.payload);
            setThinkLog((l) => [
              ...l.slice(-24),
              {
                t: new Date().toISOString(),
                m: "Bloco estruturado recebido (diagnosticInfo / generativeInfo)",
              },
            ]);
          } else if (ev.type === "intent" && ev.name) {
            setThinkLog((l) => [
              ...l.slice(-24),
              { t: new Date().toISOString(), m: `Intent: ${ev.name}` },
            ]);
          } else if (ev.type === "error") {
            throw new Error(ev.detail || "Erro no stream");
          }
        }
      }

      const raw = accumulated.trim();
      const final = raw || "(Resposta vazia do agente.)";

      if (raw) {
        setTypedReply("");
        const step = 4;
        for (let i = 0; i < final.length; i += step) {
          const slice = final.slice(0, i + step);
          setTypedReply(slice);
          await new Promise((r) => setTimeout(r, 22));
        }
      }

      setTypedReply("");
      setMessages((m) => [...m, { role: "agent", text: final }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setMessages((m) => [...m, { role: "err", text: `Falha na ponte segura: ${msg}` }]);
    } finally {
      setStreaming(false);
      setTypedReply("");
    }
  }, [input, streaming]);

  return (
    <div
      className="min-h-dvh text-slate-100"
      style={{
        background: `linear-gradient(165deg, ${MIDNIGHT_DEEP} 0%, ${MIDNIGHT} 42%, #0c1a32 100%)`,
      }}
    >
      <Helmet>
        <title>Radar Jurídico — ASMODEUS · TransparênciaBR</title>
        <meta
          name="description"
          content="Console forense com agente Vertex (Dialogflow CX) e streaming seguro."
        />
      </Helmet>

      <div
        className="border-b px-4 py-2 text-center font-mono text-[10px] uppercase tracking-[0.35em] sm:text-[11px]"
        style={{
          borderColor: "rgba(148, 163, 184, 0.12)",
          background: `linear-gradient(90deg, transparent, ${GOLD_SOFT}, transparent)`,
          color: GOLD,
        }}
      >
        Vertex AI · Agent ID 1777236402725 · proxy ADC · Operação Trilho 1 (Pirassununga & Valinhos)
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
        <header className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.28em]" style={{ color: EMERALD }}>
              Integração total · streaming NDJSON
            </p>
            <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Radar Jurídico
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
              Midnight blue e ouro. O proxy envia queryParams com contexto Trilho 1; o chat renderiza deltas,
              digitação forense no fecho e artefatos de ferramentas em JSON.
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
            <span className="text-[10px] uppercase tracking-widest text-slate-500">Caso</span>
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

        <section className="mb-10 grid gap-4 sm:grid-cols-3">
          {[
            { step: "01", title: "Proxy", body: "Único ponto de saída — ADC no Cloud Functions." },
            { step: "02", title: "Contexto", body: "Operação Trilho 1 em queryParams (payload + parameters)." },
            { step: "03", title: "Tools", body: "diagnosticInfo / generativeInfo exibidos ao vivo no painel." },
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

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px_minmax(0,420px)]">
          <section
            className="rounded-2xl border p-6 backdrop-blur-md sm:p-8"
            style={{
              borderColor: "rgba(212, 175, 55, 0.2)",
              background: "rgba(5, 13, 24, 0.65)",
            }}
          >
            <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em]" style={{ color: EMERALD }}>
              Malha operacional
            </h2>
            <ul className="mt-4 space-y-3 font-mono text-sm text-slate-300">
              <li className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-slate-500">Meta de leads (pergunta ao agente)</span>
                <span className="text-right font-semibold text-white">5,9M+</span>
              </li>
              <li className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-slate-500">Geografia injetada</span>
                <span className="text-right text-slate-200">Pirassununga · Valinhos</span>
              </li>
              <li className="flex justify-between">
                <span className="text-slate-500">Motor</span>
                <span className="font-semibold" style={{ color: GOLD }}>
                  ASMODEUS · Dialogflow CX
                </span>
              </li>
            </ul>
            <p className="mt-6 text-xs leading-relaxed text-slate-500">
              Garanta IAM na service account das Functions: Dialogflow API Client + escopos das tools
              configuradas no Agent Builder (BigQuery, GCS, etc.).
            </p>
          </section>

          <aside
            className="flex max-h-[min(70vh,520px)] flex-col overflow-hidden rounded-2xl border"
            style={{
              borderColor: "rgba(212, 175, 55, 0.25)",
              background: "rgba(8, 18, 35, 0.88)",
            }}
            aria-label="Log de pensamento da IA"
          >
            <div
              className="border-b px-3 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest"
              style={{ borderColor: "rgba(148, 163, 184, 0.12)", color: GOLD }}
            >
              Log de raciocínio
            </div>
            <div className="flex-1 overflow-y-auto p-3 font-mono text-[10px] leading-relaxed text-slate-400 sm:text-[11px]">
              {thinkLog.length === 0 && !streaming ? (
                <p className="text-slate-600">Aguardando consulta…</p>
              ) : null}
              {thinkLog.map((row, i) => (
                <p key={`${row.t}-${i}`} className="mb-2 border-l-2 border-amber-500/30 pl-2">
                  <span className="text-slate-600">{row.t.slice(11, 19)} › </span>
                  {row.m}
                </p>
              ))}
              {streaming ? (
                <p className="animate-pulse font-mono italic" style={{ color: EMERALD }}>
                  [ ASMODEUS processando Datalake… ]
                </p>
              ) : null}
            </div>
            {toolPayload ? (
              <div
                className="max-h-52 overflow-auto border-t p-2 font-mono text-[9px] text-emerald-200/90"
                style={{ borderColor: "rgba(148, 163, 184, 0.12)" }}
              >
                <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-amber-200/80">
                  Dados brutos (tool / diagnostic)
                </p>
                <pre className="whitespace-pre-wrap break-all text-[9px] leading-snug">
                  {JSON.stringify(toolPayload, null, 2)}
                </pre>
              </div>
            ) : null}
          </aside>

          <aside
            className="flex flex-col overflow-hidden rounded-2xl border shadow-2xl"
            style={{
              borderColor: "rgba(52, 211, 153, 0.2)",
              background: "rgba(8, 18, 35, 0.92)",
              minHeight: "22rem",
              maxHeight: "min(75vh, 620px)",
            }}
            aria-label="Chat ASMODEUS"
          >
            <div
              className="border-b px-4 py-3 sm:px-5"
              style={{ borderColor: "rgba(148, 163, 184, 0.12)" }}
            >
              <h2 className="font-mono text-xs font-bold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
                ASMODEUS · streaming
              </h2>
              <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500">
                POST {agentEndpoint()} · stream:true
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
              {streaming && typedReply ? (
                <div className="whitespace-pre-wrap border-l-2 border-amber-500/40 pl-3 text-slate-100">
                  <span className="text-[10px] uppercase tracking-widest text-amber-400/90">
                    ao vivo ›{" "}
                  </span>
                  {typedReply}
                  <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-emerald-400/80 align-middle" />
                </div>
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
                  disabled={streaming}
                  placeholder="Ex.: Quantos leads rurais em Pirassununga com dupla negativa?"
                  className="min-h-11 flex-1 rounded-xl border border-white/10 bg-slate-950/80 px-3 font-mono text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 disabled:opacity-50"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={streaming || !input.trim()}
                  className="min-h-11 shrink-0 rounded-xl px-4 font-mono text-xs font-bold uppercase tracking-wide text-slate-950 transition enabled:hover:brightness-110 disabled:opacity-40"
                  style={{ backgroundColor: EMERALD }}
                  aria-label="Enviar pergunta com streaming ao agente"
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
