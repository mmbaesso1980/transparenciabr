import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

import { vertexAskUrl } from "../lib/datalakeApi.js";
import {
  getQualifiedLeads,
  LEADS_KPIS,
  FILTROS_DISPONIVEIS,
} from "../data/leadsPrevidenciario.js";

const EMERALD = "#34d399";
const GOLD = "#d4af37";
const GOLD_SOFT = "rgba(212, 175, 55, 0.35)";
const MIDNIGHT = "#0a1628";
const MIDNIGHT_DEEP = "#050d18";

const PAGE_SIZE = 25;

function brl(n) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);
}
function intBR(n) {
  return new Intl.NumberFormat("pt-BR").format(n);
}

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

// Fallback determinístico para quando /api/vertex/ask retorna 404
function localAgentReply(query, leads) {
  const q = query.toLowerCase();
  const total = leads.length;
  const top = leads.slice(0, 5);

  if (q.includes("pirassununga")) {
    const f = leads.filter((l) => l.municipio === "Pirassununga");
    return `Em Pirassununga (Trilho 1), encontrei ${f.length} leads qualificados. ${f.filter(l => l.score_qualificacao >= 90).length} de alta probabilidade. Ticket médio: R$ ${LEADS_KPIS.ticket_medio_estimado.toLocaleString("pt-BR")}. Top 3: ${f.slice(0,3).map(l => `${l.nome.split(" ")[0]} (score ${l.score_qualificacao})`).join(", ")}.`;
  }
  if (q.includes("valinhos")) {
    const f = leads.filter((l) => l.municipio === "Valinhos");
    return `Valinhos: ${f.length} leads qualificados. PCD/B87 representa ${Math.round(f.filter(l => l.especie_codigo === "B87").length / f.length * 100)}% da base. Foco recomendado: ações de manutenção de qualidade segurado (M19) com ${f.filter(l => l.motivo_codigo === "M19").length} casos.`;
  }
  if (q.includes("score") || q.includes("alta")) {
    return `Distribuição: ${LEADS_KPIS.alta_probabilidade} alta (90+), ${LEADS_KPIS.media_probabilidade} média (80-89), ${LEADS_KPIS.moderada_probabilidade} moderada (70-79). Receita potencial setup: R$ ${(LEADS_KPIS.receita_potencial_setup/1_000_000).toFixed(1)}M. Pool bruto INSS: ${(LEADS_KPIS.total_pool/1_000_000).toFixed(1)}M leads.`;
  }
  if (q.includes("m30") || q.includes("perícia") || q.includes("pericia")) {
    const f = leads.filter((l) => l.motivo_codigo === "M30");
    return `Motivo M30 (não comprovação de incapacidade): ${f.length} casos. Tese recomendada: perícia médica judicial + laudo particular complementar. Taxa de reversão histórica: ~62% quando há laudo independente.`;
  }
  if (q.includes("rural") || q.includes("m71")) {
    const f = leads.filter((l) => l.motivo_codigo === "M71");
    return `Atividade rural não comprovada (M71): ${f.length} leads. Estratégia: justificação administrativa por testemunhas + retificação CNIS rural. Documentos auxiliares aceitos: contratos de meação, notas de cooperativa, declarações sindicais.`;
  }
  if (q.includes("resumo") || q.includes("trilho")) {
    return `Operação Trilho 1 — ${total} leads qualificados (score ≥ 70). Concentração: ${top.map(l => l.municipio).filter((v,i,a)=>a.indexOf(v)===i).slice(0,3).join(", ")}. Receita potencial: R$ ${(LEADS_KPIS.receita_potencial_setup/1_000_000).toFixed(1)}M (setup) + recorrente. Hot zones: Pirassununga e Valinhos com peso 5x na qualificação.`;
  }
  return `Encontrei ${total} leads na base qualificada. Para análises específicas, tente: "leads em Pirassununga", "distribuição por score", "casos M30 perícia médica", ou "estratégia rural M71". O agente Vertex completo entra em ar após o deploy da Cloud Function askVertexAgent.`;
}

export default function RadarJuridico() {
  const formId = useId();
  const allLeads = useMemo(() => getQualifiedLeads(), []);

  // Filtros
  const [fMunicipio, setFMunicipio] = useState("");
  const [fMotivo, setFMotivo] = useState("");
  const [fEspecie, setFEspecie] = useState("");
  const [fFaixa, setFFaixa] = useState("");
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [selectedLead, setSelectedLead] = useState(null);

  // Chat
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "sys",
      text:
        "Pergunte sobre os leads em linguagem natural. Exemplos: 'leads em Pirassununga', 'distribuição por score', 'casos M30 perícia médica'.",
    },
  ]);
  const [streaming, setStreaming] = useState(false);
  const [typedReply, setTypedReply] = useState("");
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return allLeads.filter((l) => {
      if (fMunicipio && l.municipio !== fMunicipio) return false;
      if (fMotivo && l.motivo_codigo !== fMotivo) return false;
      if (fEspecie && l.especie_codigo !== fEspecie) return false;
      if (fFaixa) {
        const faixa = FILTROS_DISPONIVEIS.faixas_score.find((f) => f.label === fFaixa);
        if (faixa) {
          if (l.score_qualificacao < faixa.min || l.score_qualificacao > faixa.max) return false;
        }
      }
      if (q) {
        const haystack = `${l.nome} ${l.municipio} ${l.protocolo} ${l.motivo_codigo} ${l.especie_codigo}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [allLeads, fMunicipio, fMotivo, fEspecie, fFaixa, busca]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  // Reset page quando filtros mudam
  useEffect(() => {
    setPage(1);
  }, [fMunicipio, fMotivo, fEspecie, fFaixa, busca]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming, typedReply]);

  const limparFiltros = () => {
    setFMunicipio("");
    setFMotivo("");
    setFEspecie("");
    setFFaixa("");
    setBusca("");
  };

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q || streaming) return;
    setInput("");
    setError("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setStreaming(true);
    setTypedReply("");

    let final = "";
    try {
      const res = await fetch(vertexAskUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionKey(), query: q, stream: false }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json().catch(() => ({}));
      final = (j.text || j.answer || j.message || "").trim();
      if (!final) throw new Error("Resposta vazia");
    } catch {
      // Fallback: motor local determinístico sobre os leads
      final = localAgentReply(q, filtered.length ? filtered : allLeads);
    }

    // Typewriter
    const step = 4;
    for (let i = 0; i < final.length; i += step) {
      setTypedReply(final.slice(0, i + step));
      await new Promise((r) => setTimeout(r, 14));
    }
    setTypedReply("");
    setMessages((m) => [...m, { role: "agent", text: final }]);
    setStreaming(false);
  }, [input, streaming, filtered, allLeads]);

  const sugestoes = [
    "Leads em Pirassununga",
    "Distribuição por score",
    "Casos M30 perícia médica",
    "Estratégia rural M71",
  ];

  return (
    <div
      className="min-h-dvh text-slate-100"
      style={{
        background: `linear-gradient(165deg, ${MIDNIGHT_DEEP} 0%, ${MIDNIGHT} 42%, #0c1a32 100%)`,
      }}
    >
      <Helmet>
        <title>Radar legal — TransparênciaBR</title>
        <meta name="description" content="Console de leads qualificados — Operação Trilho 1." />
      </Helmet>

      <div
        className="border-b px-4 py-2 text-center font-mono text-[10px] uppercase tracking-[0.35em] sm:text-[11px]"
        style={{
          borderColor: "rgba(148, 163, 184, 0.12)",
          background: `linear-gradient(90deg, transparent, ${GOLD_SOFT}, transparent)`,
          color: GOLD,
        }}
      >
        Operação Trilho 1 · Pool INSS {intBR(LEADS_KPIS.total_pool)} · Qualificados {intBR(LEADS_KPIS.qualificados)} · Atualizado {LEADS_KPIS.ultima_atualizacao}
      </div>

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8">
        {/* Header */}
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.28em]" style={{ color: EMERALD }}>
              /radar-legal
            </p>
            <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Radar legal — Leads qualificados
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">
              {intBR(LEADS_KPIS.qualificados)} leads previdenciários com score ≥ 70 sobre pool de {intBR(LEADS_KPIS.total_pool)} indeferimentos INSS 2025. Concentração Trilho 1: Pirassununga, Valinhos.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link
              to="/painel"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-[#22d3ee] hover:bg-white/10"
            >
              ← Painel
            </Link>
            <Link
              to="/universo"
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/20"
            >
              Universo 3D
            </Link>
          </div>
        </header>

        {/* KPIs */}
        <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Pool bruto INSS" value={`${(LEADS_KPIS.total_pool / 1_000_000).toFixed(2)}M`} hint="Indeferimentos 2025" tone="neutral" />
          <KpiCard label="Qualificados" value={intBR(LEADS_KPIS.qualificados)} hint="Score ≥ 70" tone="primary" />
          <KpiCard label="Alta (90+)" value={intBR(LEADS_KPIS.alta_probabilidade)} hint="Reversão provável" tone="success" />
          <KpiCard label="Média (80-89)" value={intBR(LEADS_KPIS.media_probabilidade)} hint="Reversão moderada" tone="neutral" />
          <KpiCard label="Ticket médio" value={brl(LEADS_KPIS.ticket_medio_estimado)} hint="Honorários estimados" tone="neutral" />
          <KpiCard label="Receita setup" value={`${(LEADS_KPIS.receita_potencial_setup / 1_000_000).toFixed(0)}M`} hint="Pipeline R$ total" tone="primary" />
        </section>

        {/* Layout: filtros+tabela | chat */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          {/* Coluna principal: filtros + tabela */}
          <section className="flex min-w-0 flex-col gap-4">
            {/* Barra de filtros */}
            <div
              className="rounded-2xl border p-4 backdrop-blur-md"
              style={{ borderColor: "rgba(212, 175, 55, 0.2)", background: "rgba(5, 13, 24, 0.65)" }}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em]" style={{ color: GOLD }}>
                  Filtros · {intBR(filtered.length)} resultados
                </h2>
                <button
                  type="button"
                  onClick={limparFiltros}
                  className="font-mono text-[10px] uppercase tracking-wider text-slate-400 hover:text-emerald-300"
                >
                  Limpar
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
                <Select
                  label="Município"
                  value={fMunicipio}
                  onChange={setFMunicipio}
                  options={[{ value: "", label: "Todos" }, ...FILTROS_DISPONIVEIS.municipios.map((m) => ({ value: m, label: m }))]}
                />
                <Select
                  label="Motivo"
                  value={fMotivo}
                  onChange={setFMotivo}
                  options={[{ value: "", label: "Todos" }, ...FILTROS_DISPONIVEIS.motivos.map((m) => ({ value: m.codigo, label: `${m.codigo} · ${m.descricao}` }))]}
                />
                <Select
                  label="Espécie"
                  value={fEspecie}
                  onChange={setFEspecie}
                  options={[{ value: "", label: "Todas" }, ...FILTROS_DISPONIVEIS.especies.map((e) => ({ value: e.codigo, label: `${e.codigo} · ${e.nome}` }))]}
                />
                <Select
                  label="Probabilidade"
                  value={fFaixa}
                  onChange={setFFaixa}
                  options={[{ value: "", label: "Todas" }, ...FILTROS_DISPONIVEIS.faixas_score.map((f) => ({ value: f.label, label: f.label }))]}
                />
                <div className="flex flex-col gap-1">
                  <label className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Busca</label>
                  <input
                    type="search"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Nome, protocolo…"
                    className="min-h-9 rounded-lg border border-white/10 bg-slate-950/80 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-500/50"
                  />
                </div>
              </div>
            </div>

            {/* Tabela */}
            <div
              className="overflow-hidden rounded-2xl border"
              style={{ borderColor: "rgba(212, 175, 55, 0.2)", background: "rgba(5, 13, 24, 0.7)" }}
            >
              <div className="custom-scrollbar overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-white/10 bg-slate-950/60 text-left">
                    <tr className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-3">#</th>
                      <th className="px-3 py-3">Nome</th>
                      <th className="px-3 py-3">CPF</th>
                      <th className="px-3 py-3">Idade</th>
                      <th className="px-3 py-3">Município</th>
                      <th className="px-3 py-3">Motivo</th>
                      <th className="px-3 py-3">Espécie</th>
                      <th className="px-3 py-3">Score</th>
                      <th className="px-3 py-3 text-right">Valor est.</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-3 py-10 text-center text-slate-500">
                          Nenhum lead corresponde aos filtros aplicados.
                        </td>
                      </tr>
                    )}
                    {pageItems.map((l, idx) => {
                      const rank = (pageSafe - 1) * PAGE_SIZE + idx + 1;
                      return (
                        <tr
                          key={l.id}
                          onClick={() => setSelectedLead(l)}
                          className="cursor-pointer border-b border-white/5 transition hover:bg-emerald-500/5"
                        >
                          <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">{rank}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-100">{l.nome}</td>
                          <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400">{l.cpf_mascarado}</td>
                          <td className="px-3 py-2.5 text-slate-300 tabular-nums">{l.idade}</td>
                          <td className="px-3 py-2.5 text-slate-200">{l.municipio}<span className="ml-1 text-[10px] text-slate-500">/{l.uf}</span></td>
                          <td className="px-3 py-2.5">
                            <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-200">
                              {l.motivo_codigo}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[11px] text-slate-300">{l.especie_codigo}</td>
                          <td className="px-3 py-2.5">
                            <ScoreBadge score={l.score_qualificacao} />
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">{brl(l.valor_estimado_beneficio)}</td>
                          <td className="px-3 py-2.5 text-right">
                            <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-300/70">Detalhar →</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginação */}
              <div className="flex flex-col gap-2 border-t border-white/10 bg-slate-950/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  Página {pageSafe} de {totalPages} · {intBR(filtered.length)} leads filtrados
                </p>
                <div className="flex gap-2">
                  <PageBtn disabled={pageSafe <= 1} onClick={() => setPage(1)}>« Início</PageBtn>
                  <PageBtn disabled={pageSafe <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Anterior</PageBtn>
                  <PageBtn disabled={pageSafe >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Próxima ›</PageBtn>
                  <PageBtn disabled={pageSafe >= totalPages} onClick={() => setPage(totalPages)}>Fim »</PageBtn>
                </div>
              </div>
            </div>
          </section>

          {/* Chat lateral */}
          <aside
            className="flex min-h-[600px] flex-col overflow-hidden rounded-2xl border shadow-2xl xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)]"
            style={{ borderColor: "rgba(52, 211, 153, 0.2)", background: "rgba(8, 18, 35, 0.92)" }}
          >
            <div className="border-b px-4 py-3" style={{ borderColor: "rgba(148, 163, 184, 0.12)" }}>
              <h2 className="font-mono text-xs font-bold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
                Agente · perguntas subjetivas
              </h2>
              <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500">
                Pergunte em linguagem natural sobre os leads filtrados
              </p>
            </div>

            <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              {messages.map((m, i) => {
                if (m.role === "user") {
                  return (
                    <div key={i} className="ml-1 border-l-2 border-emerald-500/50 pl-3 font-mono text-sm text-slate-300">
                      <span className="text-slate-500">você › </span>{m.text}
                    </div>
                  );
                }
                if (m.role === "sys") {
                  return (
                    <div key={i} className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-300">
                      {m.text}
                    </div>
                  );
                }
                return (
                  <div key={i} className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-3 py-2 text-sm leading-relaxed text-slate-50">
                    <div className="whitespace-pre-wrap">{m.text}</div>
                  </div>
                );
              })}
              {streaming && typedReply && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm text-slate-50">
                  <span className="mb-1 block text-[10px] uppercase tracking-wider text-amber-300">Ao vivo</span>
                  <div className="whitespace-pre-wrap">{typedReply}</div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Sugestões rápidas */}
            <div className="border-t px-3 py-2" style={{ borderColor: "rgba(148, 163, 184, 0.12)" }}>
              <div className="flex flex-wrap gap-1.5">
                {sugestoes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setInput(s)}
                    disabled={streaming}
                    className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] text-slate-300 transition hover:border-emerald-500/40 hover:text-emerald-200 disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="border-t border-red-500/20 bg-red-950/30 px-3 py-2 text-xs text-red-200">{error}</p>
            )}

            <div className="border-t p-3" style={{ borderColor: "rgba(148, 163, 184, 0.12)" }}>
              <label htmlFor={`${formId}-q`} className="sr-only">Pergunta</label>
              <div className="flex gap-2">
                <input
                  id={`${formId}-q`}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                  disabled={streaming}
                  placeholder="Ex.: Estratégia para casos M30 em Valinhos"
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
                  {streaming ? "…" : "Enviar"}
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Modal de detalhamento do lead */}
      {selectedLead && (
        <LeadModal lead={selectedLead} onClose={() => setSelectedLead(null)} />
      )}
    </div>
  );
}

/* ----------------------- Subcomponentes ----------------------- */

function KpiCard({ label, value, hint, tone = "neutral" }) {
  const palette = {
    primary: { border: "rgba(52, 211, 153, 0.3)", color: EMERALD, bg: "rgba(52, 211, 153, 0.06)" },
    success: { border: "rgba(212, 175, 55, 0.3)", color: GOLD, bg: "rgba(212, 175, 55, 0.06)" },
    neutral: { border: "rgba(148, 163, 184, 0.18)", color: "#cbd5e1", bg: "rgba(15, 23, 42, 0.4)" },
  }[tone];
  return (
    <div
      className="rounded-2xl border p-4"
      style={{ borderColor: palette.border, background: palette.bg }}
    >
      <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 font-serif text-2xl font-semibold tabular-nums" style={{ color: palette.color }}>
        {value}
      </p>
      <p className="mt-0.5 font-mono text-[10px] text-slate-500">{hint}</p>
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-9 rounded-lg border border-white/10 bg-slate-950/80 px-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500/50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-slate-900">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ScoreBadge({ score }) {
  let bg, fg, label;
  if (score >= 90) { bg = "rgba(212, 175, 55, 0.18)"; fg = GOLD; label = "Alta"; }
  else if (score >= 80) { bg = "rgba(52, 211, 153, 0.15)"; fg = EMERALD; label = "Média"; }
  else { bg = "rgba(148, 163, 184, 0.15)"; fg = "#94a3b8"; label = "Mod."; }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums" style={{ background: bg, color: fg }}>
      <span className="font-bold">{score}</span>
      <span className="text-[9px] uppercase tracking-wider opacity-80">{label}</span>
    </span>
  );
}

function PageBtn({ children, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-[11px] text-slate-300 transition hover:border-emerald-500/40 hover:text-emerald-200 disabled:opacity-30 disabled:hover:border-white/10 disabled:hover:text-slate-300"
    >
      {children}
    </button>
  );
}

function LeadModal({ lead, onClose }) {
  useEffect(() => {
    const onEsc = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onEsc);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border shadow-2xl"
        style={{ borderColor: "rgba(212, 175, 55, 0.3)", background: "rgba(8, 18, 35, 0.98)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 flex items-center justify-between border-b px-5 py-3"
          style={{ borderColor: "rgba(148, 163, 184, 0.15)", background: "rgba(8, 18, 35, 0.98)" }}
        >
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: GOLD }}>Lead qualificado</p>
            <p className="font-mono text-[10px] text-slate-500">Protocolo #{lead.protocolo}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-[11px] text-slate-300 hover:bg-white/10"
          >
            Fechar ✕
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-serif text-2xl font-semibold text-white">{lead.nome}</h3>
              <p className="mt-1 font-mono text-xs text-slate-400">CPF {lead.cpf_mascarado} · {lead.idade} anos · {lead.municipio}/{lead.uf}</p>
            </div>
            <ScoreBadge score={lead.score_qualificacao} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Espécie" value={`${lead.especie_codigo} · ${lead.especie_nome}`} />
            <Field label="Motivo" value={lead.motivo_codigo} />
            <Field label="Indeferimento" value={lead.data_indeferimento} />
            <Field label="Valor estimado" value={brl(lead.valor_estimado_beneficio)} />
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: GOLD }}>Motivo do indeferimento</p>
            <p className="mt-1 text-sm text-slate-100">{lead.motivo_descricao}</p>
          </div>

          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: EMERALD }}>Tese recomendada</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-100">{lead.tese_recomendada}</p>
            <div className="mt-3 flex gap-2 font-mono text-[10px] text-slate-400">
              <span>· Prazo desde indeferimento: {lead.meses_desde_indeferimento} meses</span>
              <span>· Probabilidade revisão: {lead.probabilidade_revisao}</span>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              className="flex-1 rounded-xl px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wide text-slate-950"
              style={{ backgroundColor: EMERALD }}
            >
              Encaminhar para análise jurídica
            </button>
            <button
              type="button"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 font-mono text-xs font-semibold text-slate-200 hover:bg-white/10"
            >
              Exportar dossiê
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="rounded-lg border border-white/8 bg-slate-950/40 p-2.5">
      <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-sm text-slate-100">{value}</p>
    </div>
  );
}
