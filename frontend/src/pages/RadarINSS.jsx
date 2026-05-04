import { useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";

const BG = "#050505";
const BORDER = "#1a1a1a";
const COBALT = "#2563eb";
const EMERALD = "#10b981";

const MOCK_ROWS = [
  {
    nome: "MARIA S. ***",
    cidade: "Pirassununga",
    beneficio: "BPC-LOAS",
    status: "INDEFERIDO",
    score: "94%",
    detalhe: "Falta de laudo",
  },
  {
    nome: "JOSE R. ***",
    cidade: "Valinhos",
    beneficio: "Aposentadoria rural",
    status: "NEGADO",
    score: "88%",
    detalhe: "Carência documental",
  },
  {
    nome: "ANA P. ***",
    cidade: "Pirassununga",
    beneficio: "Auxílio-doença",
    status: "CASSADO",
    score: "91%",
    detalhe: "Perícia divergente",
  },
  {
    nome: "CARLOS M. ***",
    cidade: "Valinhos",
    beneficio: "BPC-LOAS",
    status: "INDEFERIDO",
    score: "79%",
    detalhe: "Renda familiar limite",
  },
];

const WELCOME =
  "Terminal Aurora pronto. Base de dados 2025/2026 mapeada. Qual o alvo da sua consulta?";

function useCountUp(target, durationMs = 1400) {
  const [v, setV] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      setV(target);
      return;
    }
    started.current = true;
    const t0 = performance.now();

    function easeOutCubic(t) {
      return 1 - (1 - t) ** 3;
    }

    let frame;
    function tick(now) {
      const u = Math.min(1, (now - t0) / durationMs);
      setV(Math.round(easeOutCubic(u) * target));
      if (u < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return v;
}

function simulateTerminalReply(text) {
  const q = String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    q.includes("pirassununga") &&
    (q.includes("rural") || q.includes("rurais")) &&
    (q.includes("negativ") || q.includes("negada"))
  ) {
    return [
      "> Analisando Datalake…",
      "> Encontrados 142 registros rurais.",
      "> 45 possuem histórico de dupla negativa.",
      "Deseja exportar o dossiê? [S/N]",
    ].join("\n");
  }

  if (q.includes("valinhos") || q.includes("pirassununga")) {
    return [
      "> Escopo regional reconhecido (Valinhos / Pirassununga).",
      "> Camada INSS 2025/2026 indexada.",
      "Especifique benefício ou tipo de indeferimento para filtro estreito.",
    ].join("\n");
  }

  return [
    "> Consulta enfileirada no nó L4 (simulação).",
    "> Nenhum padrão de alto risco associado à pergunta literal.",
    "Reformule com cidade, tipo rural/urbano ou benefício (BPC, rural, auxílio).",
  ].join("\n");
}

export default function RadarINSS() {
  const universe = useCountUp(9_642_108, 1600);
  const hotLeads = useCountUp(2_147, 900);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([{ role: "sys", text: WELCOME }]);
  const bottomRef = useRef(null);

  const panelStyle = useMemo(
    () => ({
      backgroundColor: BG,
      borderColor: BORDER,
    }),
    [],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send() {
    const trimmed = input.trim();
    if (!trimmed) return;
    setMessages((m) => [...m, { role: "user", text: trimmed }]);
    setInput("");
    const reply = simulateTerminalReply(trimmed);
    window.setTimeout(() => {
      setMessages((m) => [...m, { role: "aurora", text: reply }]);
    }, 450);
  }

  return (
    <div
      className="min-h-dvh text-[#d4d4d4]"
      style={{ backgroundColor: BG }}
    >
      <Helmet>
        <title>RADAR PREVIDENCIÁRIO — Operação Trilho 1</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-5 sm:py-6">
        {/* Header de comando */}
        <header
          className="mb-6 flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between"
          style={{ borderColor: BORDER }}
        >
          <div>
            <p
              className="font-mono text-[10px] uppercase tracking-[0.35em] sm:text-[11px]"
              style={{ color: COBALT }}
            >
              TransparênciaBR · Inteligência previdenciária
            </p>
            <h1 className="mt-2 font-mono text-lg font-bold tracking-tight text-[#e5e5e5] sm:text-2xl">
              RADAR PREVIDENCIÁRIO // OPERAÇÃO TRILHO 1
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-2 rounded border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider sm:text-[11px]"
              style={{
                borderColor: BORDER,
                backgroundColor: "#0a0a0a",
                color: EMERALD,
              }}
            >
              <span
                className="size-2 shrink-0 rounded-full animate-pulse"
                style={{ backgroundColor: EMERALD }}
                aria-hidden
              />
              Sistema ativo
            </span>
            <span
              className="inline-flex items-center rounded border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider sm:text-[11px]"
              style={{
                borderColor: BORDER,
                color: COBALT,
                backgroundColor: "#0a0a0a",
              }}
            >
              Conexão BigQuery OK
            </span>
          </div>
        </header>

        {/* KPIs */}
        <section className="mb-6 grid gap-3 sm:grid-cols-3">
          <KpiCard
            label="Universo de dados"
            value={universe.toLocaleString("pt-BR")}
            sub="Leads indexados (simulação operacional)"
            style={panelStyle}
          />
          <KpiCard
            label="Filtro regional ativo"
            value="Valinhos & Pirassununga"
            sub="Geofence INSS · malha 2025/2026"
            style={panelStyle}
            monoValue={false}
          />
          <KpiCard
            label="Hot leads (24h)"
            value={`${hotLeads.toLocaleString("pt-BR")} identificados`}
            sub="Pipeline Aurora · triagem contínua"
            style={panelStyle}
            monoValue={false}
          />
        </section>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* Tabela interrogatório */}
          <section
            className="min-w-0 flex-1 overflow-hidden rounded border lg:min-h-[28rem]"
            style={{ ...panelStyle, borderColor: BORDER }}
          >
            <div
              className="border-b px-3 py-2.5 sm:px-4"
              style={{ borderColor: BORDER, backgroundColor: "#080808" }}
            >
              <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#a3a3a3]">
                Tabela de interrogatório
              </h2>
              <p className="mt-1 font-mono text-[10px] text-[#737373] sm:text-[11px]">
                Dados mascarados · uso interno · sem vínculo de culpa
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left font-mono text-xs sm:text-sm">
                <thead>
                  <tr style={{ backgroundColor: "#0c0c0c", borderBottom: `1px solid ${BORDER}` }}>
                    {[
                      "Nome",
                      "Cidade",
                      "Tipo de benefício",
                      "Status INSS",
                      "Score de reversão",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#737373] sm:px-4 sm:text-[11px]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MOCK_ROWS.map((row) => (
                    <tr
                      key={row.nome + row.cidade}
                      className="border-b transition-colors hover:bg-white/[0.02]"
                      style={{ borderColor: BORDER }}
                    >
                      <td className="px-3 py-3 text-[#e5e5e5] sm:px-4">{row.nome}</td>
                      <td className="px-3 py-3 text-[#a3a3a3] sm:px-4">{row.cidade}</td>
                      <td className="px-3 py-3 text-[#a3a3a3] sm:px-4">{row.beneficio}</td>
                      <td className="px-3 py-3 font-semibold text-amber-500/90 sm:px-4">
                        {row.status}
                      </td>
                      <td className="px-3 py-3 sm:px-4">
                        <span className="font-semibold" style={{ color: EMERALD }}>
                          {row.score}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-[#737373]">
                          ({row.detalhe})
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Terminal L4 */}
          <aside
            className="flex w-full shrink-0 flex-col rounded border lg:w-[min(100%,380px)] lg:max-w-md"
            style={{ ...panelStyle, borderColor: BORDER, minHeight: "22rem" }}
            aria-label="Terminal Aurora L4"
          >
            <div
              className="border-b px-3 py-2.5 sm:px-4"
              style={{ borderColor: BORDER, backgroundColor: "#080808" }}
            >
              <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em]" style={{ color: COBALT }}>
                L4 Terminal // Aurora
              </h2>
              <p className="mt-0.5 font-mono text-[10px] text-[#525252]">NVIDIA L4 · simulação de sessão</p>
            </div>
            <div
              className="flex-1 space-y-3 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed sm:p-4 sm:text-xs"
              style={{ maxHeight: "min(50vh, 420px)" }}
            >
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "ml-4 border-l-2 pl-3 text-[#a3a3a3]"
                      : "whitespace-pre-wrap text-[#d4d4d4]"
                  }
                  style={{
                    borderColor: m.role === "user" ? COBALT : "transparent",
                  }}
                >
                  {m.role === "user" ? (
                    <>
                      <span className="text-[#525252]">$ operador &gt; </span>
                      {m.text}
                    </>
                  ) : (
                    m.text
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div
              className="border-t p-3 sm:p-4"
              style={{ borderColor: BORDER, backgroundColor: "#080808" }}
            >
              <label htmlFor="radar-inss-terminal-input" className="sr-only">
                Consulta ao terminal Aurora
              </label>
              <div className="flex gap-2">
                <input
                  id="radar-inss-terminal-input"
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") send();
                  }}
                  placeholder="Digite a consulta…"
                  className="min-h-10 flex-1 rounded border bg-[#0a0a0a] px-3 font-mono text-xs text-[#e5e5e5] outline-none ring-0 placeholder:text-[#525252] focus:border-[#2563eb]/60 focus:ring-1 focus:ring-[#2563eb]/40"
                  style={{ borderColor: BORDER }}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={send}
                  className="min-h-10 shrink-0 rounded border px-3 font-mono text-xs font-bold uppercase tracking-wide transition hover:brightness-110"
                  style={{
                    borderColor: COBALT,
                    backgroundColor: `${COBALT}22`,
                    color: COBALT,
                  }}
                  aria-label="Enviar consulta ao terminal Aurora"
                >
                  Exec
                </button>
              </div>
            </div>
          </aside>
        </div>

        <footer className="mt-8 border-t pt-4 font-mono text-[10px] text-[#525252]" style={{ borderColor: BORDER }}>
          OPERAÇÃO TRILHO 1 · URL direta · sem indexação pública · dados ilustrativos para exercício de interface
        </footer>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, style, monoValue = true }) {
  return (
    <article
      className="rounded border p-4 sm:p-5"
      style={{ ...style, borderColor: BORDER, backgroundColor: "#080808" }}
    >
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#737373]">
        {label}
      </p>
      <p
        className={`mt-2 text-xl font-bold tracking-tight text-[#f5f5f5] sm:text-2xl ${monoValue ? "font-mono tabular-nums" : "font-mono"}`}
      >
        {value}
      </p>
      {sub ? (
        <p className="mt-2 font-mono text-[10px] leading-snug text-[#525252] sm:text-[11px]">{sub}</p>
      ) : null}
    </article>
  );
}
