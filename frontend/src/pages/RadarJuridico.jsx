import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

import { vertexAskUrl } from "../lib/datalakeApi.js";

const EMERALD = "#34d399";
const GOLD = "#d4af37";
const GOLD_SOFT = "rgba(212, 175, 55, 0.35)";
const MIDNIGHT = "#0a1628";
const MIDNIGHT_DEEP = "#050d18";

function sessionKey() {
  try {
    let id = sessionStorage.getItem("vertex_cx_session");
    if (!id) {
      id = `web-${crypto.randomUUID?.() || String(Date.now())}`;
      sessionStorage.setItem("vertex_cx_session", id);
    }
    return id;
  } catch {
    return `web-${Date.now()}`;
  }
}

export default function RadarJuridico() {
  const formId = useId();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "sys",
      text:
        "Canal seguro para o Agente (Dialogflow CX) via proxy. O contexto Operação Trilho 1 é injetado no backend. Credenciais nunca no browser.",
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
      const res = await fetch(vertexAskUrl(), {
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
                m: "Bloco estruturado (diagnosticInfo / generativeInfo)",
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
          setTypedReply(final.slice(0, i + step));
          await new Promise((r) => setTimeout(r, 22));
        }
      }

      setTypedReply("");
      setMessages((m) => [...m, { role: "agent", text: final }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setMessages((m) => [...m, { role: "err", text: `Falha na ponte: ${msg}` }]);
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
        <title>Radar jurídico — TransparênciaBR</title>
        <meta name="description" content="Console forense com agente Vertex (Dialogflow CX) e streaming seguro." />
      </Helmet>

      <div
        className="border-b px-4 py-2 text-center font-mono text-[10px] uppercase tracking-[0.35em] sm:text-[11px]"
        style={{
          borderColor: "rgba(148, 163, 184, 0.12)",
          background: `linear-gradient(90deg, transparent, ${GOLD_SOFT}, transparent)`,
          color: GOLD,
        }}
      >
        Rota escura · Vertex Agent Builder · proxy ADC · Operação Trilho 1
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
        <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.28em]" style={{ color: EMERALD }}>
              /radar-legal
            </p>
            <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Radar jurídico
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
              Perguntas ao motor via POST seguro. Em produção no Firebase Hosting:{" "}
              <span className="font-mono text-slate-300">/api/vertex/ask</span>.
            </p>
          </div>
          <Link
            to="/painel"
            className="shrink-0 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-[#22d3ee] hover:bg-white/10"
          >
            ← Painel mestre
          </Link>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px_minmax(0,420px)]">
          <section
            className="rounded-2xl border p-5 backdrop-blur-md sm:p-6"
            style={{
              borderColor: "rgba(212, 175, 55, 0.2)",
              background: "rgba(5, 13, 24, 0.65)",
            }}
          >
            <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em]" style={{ color: EMERALD }}>
              Checklist
            </h2>
            <ul className="mt-3 space-y-2 font-mono text-xs text-slate-400">
              <li>· IAM: Dialogflow API Client na SA das Functions</li>
              <li>· Opcional: VERTEX_PROXY_CORS_ORIGINS</li>
              <li>· DIALOGFLOW_AGENT_ID, DIALOGFLOW_LOCATION se não forem os defaults</li>
            </ul>
          </section>

          <aside
            className="flex max-h-[min(70vh,520px)] flex-col overflow-hidden rounded-2xl border"
            style={{
              borderColor: "rgba(212, 175, 55, 0.25)",
              background: "rgba(8, 18, 35, 0.88)",
            }}
            aria-label="Log de raciocínio"
          >
            <div
              className="border-b px-3 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest"
              style={{ borderColor: "rgba(148, 163, 184, 0.12)", color: GOLD }}
            >
              Log
            </div>
            <div className="custom-scrollbar flex-1 overflow-y-auto p-3 font-mono text-[10px] leading-relaxed text-slate-400 sm:text-[11px]">
              {thinkLog.length === 0 && !streaming ? <p className="text-slate-600">Aguardando…</p> : null}
              {thinkLog.map((row, i) => (
                <p key={`${row.t}-${i}`} className="mb-2 border-l-2 border-amber-500/30 pl-2">
                  <span className="text-slate-600">{String(row.t).slice(11, 19)} › </span>
                  {row.m}
                </p>
              ))}
              {streaming ? (
                <p className="animate-pulse font-mono italic" style={{ color: EMERALD }}>
                  [ processando… ]
                </p>
              ) : null}
            </div>
            {toolPayload ? (
              <div
                className="max-h-40 overflow-auto border-t p-2 font-mono text-[9px] text-emerald-200/90"
                style={{ borderColor: "rgba(148, 163, 184, 0.12)" }}
              >
                <pre className="whitespace-pre-wrap break-all">{JSON.stringify(toolPayload, null, 2)}</pre>
              </div>
            ) : null}
          </aside>

          <aside
            className="flex min-h-0 flex-col overflow-hidden rounded-2xl border shadow-2xl"
            style={{
              borderColor: "rgba(52, 211, 153, 0.2)",
              background: "rgba(8, 18, 35, 0.92)",
              minHeight: "20rem",
              maxHeight: "min(75vh, 560px)",
            }}
            aria-label="Chat"
          >
            <div className="border-b px-4 py-3" style={{ borderColor: "rgba(148, 163, 184, 0.12)" }}>
              <h2 className="font-mono text-xs font-bold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
                Agente · streaming NDJSON
              </h2>
              <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500">{vertexAskUrl()}</p>
            </div>

            <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              {messages.map((m, i) => {
                if (m.role === "user") {
                  return (
                    <div key={i} className="ml-1 border-l-2 border-emerald-500/50 pl-3 font-mono text-sm text-slate-300">
                      <span className="text-slate-500">você › </span>
                      {m.text}
                    </div>
                  );
                }
                if (m.role === "err") {
                  return (
                    <div
                      key={i}
                      className="rounded-xl border border-amber-500/25 bg-amber-950/35 px-3 py-2 text-sm text-amber-100"
                    >
                      {m.text}
                    </div>
                  );
                }
                if (m.role === "sys") {
                  return (
                    <div
                      key={i}
                      className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-300"
                    >
                      {m.text}
                    </div>
                  );
                }
                return (
                  <div
                    key={i}
                    className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-3 py-2 text-sm leading-relaxed text-slate-50"
                  >
                    <div className="whitespace-pre-wrap">{m.text}</div>
                  </div>
                );
              })}
              {streaming && typedReply ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm text-slate-50">
                  <span className="mb-1 block text-[10px] uppercase tracking-wider text-amber-300">Ao vivo</span>
                  <div className="whitespace-pre-wrap">{typedReply}</div>
                  <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-emerald-400 align-middle" />
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>

            {error ? (
              <p className="border-t border-red-500/20 bg-red-950/30 px-3 py-2 text-xs text-red-200">{error}</p>
            ) : null}

            <div className="border-t p-3" style={{ borderColor: "rgba(148, 163, 184, 0.12)" }}>
              <label htmlFor={`${formId}-q`} className="sr-only">
                Pergunta
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
                  placeholder="Ex.: Resumo de risco na malha Trilho 1"
                  className="min-h-11 flex-1 rounded-xl border border-white/10 bg-slate-950/80 px-3 font-mono text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 disabled:opacity-50"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={streaming || !input.trim()}
                  className="min-h-11 shrink-0 rounded-xl px-4 font-mono text-xs font-bold uppercase tracking-wide text-slate-950 transition enabled:hover:brightness-110 disabled:opacity-40"
                  style={{ backgroundColor: EMERALD }}
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
