import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";

import { vertexAskUrl } from "../lib/datalakeApi.js";
import {
  getQualifiedLeads,
  getLeadsKpis,
  FILTROS_DISPONIVEIS,
  TIPOS_ACAO,
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
function brlMM(n) {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}k`;
  return brl(n);
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

/**
 * Motor local que responde como o Carpes pensa: PCD em foco,
 * Valinhos prioritário, Syslint como fonte de enriquecimento,
 * TRF3 pra checagem de litispendência.
 */
function localAgentReply(query, leads, kpis) {
  const q = query.toLowerCase().trim();

  // PCD — assunto principal do dia
  if (/pcd|defici|lc\s*142|monocular|cego|surdo|cadeira/.test(q)) {
    const pcd = leads.filter((l) => ["pcd_idade", "pcd_tempo", "bpc_def"].includes(l.tipo_acao_id));
    const valinhosPcd = pcd.filter((l) => l.municipio === "Valinhos").length;
    const livresPcd = pcd.filter((l) => l.litispendencia_status === "LIVRE").length;
    const ticketMedio = Math.round(pcd.reduce((s, l) => s + l.ticket_estimado_brl, 0) / pcd.length);
    return `🎯 PCD é ouro hoje — ${intBR(pcd.length)} leads aqui. Em Valinhos: ${valinhosPcd}. Livres no TRF3 (sem litispendência): ${livresPcd}. Ticket médio: ${brl(ticketMedio)}. Visão monocular é a sub-vertente mais lucrativa: comprovação simples + público que não sabe que tem direito. Use o filtro "Ticket de ação → PCD por idade" pra ver os 380 mais quentes.`;
  }

  // Valinhos
  if (/valinhos/.test(q)) {
    const v = leads.filter((l) => l.municipio === "Valinhos");
    const pcdV = v.filter((l) => l.foco_atual).length;
    const livreV = v.filter((l) => l.litispendencia_status === "LIVRE").length;
    return `Valinhos: ${intBR(v.length)} leads qualificados. Foco PCD/BPC: ${pcdV}. Sem litispendência TRF3: ${livreV}. Top tickets: PCD por idade (LC 142), BPC/Def, Híbrida (rural+urbana). Estratégia: parceria com Prefeitura (Censo PCD ativo) + APAE Valinhos + 5-10 clínicas de fisio/oftalmo.`;
  }

  // BPC / LOAS
  if (/bpc|loas/.test(q)) {
    const bpc = leads.filter((l) => l.tipo_acao_id === "bpc_def" || l.tipo_acao_id === "bpc_idoso");
    return `BPC/LOAS: ${intBR(bpc.length)} leads. Critério 2025: renda per capita ≤ R$ 379,50 + CadÚnico atualizado. BPC/Def é foco — qualquer idade (inclusive crianças com TEA, deficiência intelectual). Ticket R$ 3-10k. Conversão alta porque é vulnerabilidade real + processo direto.`;
  }

  // Especial / insalubridade
  if (/especial|insalubr|periculo/.test(q)) {
    const e = leads.filter((l) => l.tipo_acao_id === "especial");
    return `Aposentadoria especial: ${intBR(e.length)} leads com 20+ anos em CNAEs insalubres. Ticket R$ 8-30k. Mais alto da carteira. Filtra por: empresa atual = hospital/metalúrgica/química. Tese: PPP + LTCAT + perícia técnica → conversão integral pré-2019.`;
  }

  // Rural / Híbrida
  if (/rural|h[ií]brida/.test(q)) {
    const r = leads.filter((l) => l.tipo_acao_id === "rural" || l.tipo_acao_id === "hibrida");
    return `Rural + Híbrida: ${intBR(r.length)} leads. Rural: 60H/55M + 15 anos lavoura familiar. Híbrida: atingiu idade mas tem <15 anos CTPS, completa com tempo rural infância. Tese pacificada (TST/STJ). Ticket R$ 4-15k.`;
  }

  // Litispendência / TRF3 / PJe
  if (/trf|pje|litispend|conflito/.test(q)) {
    return `Funil TRF3 (regra do Carpes): CPF → PJe TRF3 → se já tem ação ativa, DESCARTA. Hoje: ${intBR(kpis.livres)} livres · ${intBR(kpis.verificar)} verificar · ${intBR(kpis.descartar)} descartar (${Math.round(kpis.descartar / kpis.qualificados * 100)}%). Sem o token PJe ativo, marcamos "Verificar" — pra integrar, basta plugar o token de adv via /api/pje/check.`;
  }

  // Score / ranking / top
  if (/score|ranking|top|melhores|alta/.test(q)) {
    const top10 = leads.slice(0, 10);
    return `Top 10 leads por match com ICP:\n${top10.map((l, i) => `${i+1}. ${l.nome.split(" ")[0]} ${l.nome.split(" ").slice(-1)} (${l.idade}a, ${l.municipio}) — ${l.tipo_acao_label} · score ${l.score_match_icp} · ${brl(l.ticket_estimado_brl)}`).join("\n")}`;
  }

  // Syslint / contato / enriquecimento
  if (/syslint|contato|telefone|enriquec|serasa/.test(q)) {
    return `Enriquecimento via Syslint (CPF → telefone, e-mail, empresa, Serasa, endereço). Cada lead aqui já vem com esses campos visíveis no Detalhar. CPF mascarado por LGPD na tabela; telefone/email/Serasa aparecem no modal completo. Após contrato assinado, dados completos vão pro CRM.`;
  }

  // Resumo / overview
  if (/resumo|geral|panor[âa]ma|opera[cç]/.test(q)) {
    return `Operação Trilho 1 — ${intBR(kpis.qualificados)} leads qualificados sobre pool ${intBR(kpis.total_pool)} indeferimentos INSS 2025. Distribuição: PCD/BPC ${intBR(kpis.foco_pcd)} (FOCO ⭐) · Rural+Híbrida ${intBR(leads.filter((l)=>["rural","hibrida"].includes(l.tipo_acao_id)).length)} · Especial ${intBR(leads.filter((l)=>l.tipo_acao_id==="especial").length)}. Receita potencial (excluindo descarte TRF3): ${brlMM(kpis.receita_potencial)}.`;
  }

  // Default
  return `Posso ajudar com: PCD (foco do dia ⭐), Valinhos, BPC/LOAS, especial insalubre, rural/híbrida, litispendência TRF3, score/ranking, Syslint, ou resumo da operação. Use os filtros (Ticket de ação, Município, Litispendência) pra refinar — eu respondo sobre os ${intBR(leads.length)} leads filtrados.`;
}

export default function RadarJuridico() {
  const formId = useId();
  const allLeads = useMemo(() => getQualifiedLeads(), []);
  const kpis = useMemo(() => getLeadsKpis(), []);

  // Filtros — destaque no Ticket de Ação (preferência do Carpes)
  const [fTipo, setFTipo] = useState("");
  const [fMunicipio, setFMunicipio] = useState("");
  const [fLitisp, setFLitisp] = useState("");
  const [fFaixaScore, setFFaixaScore] = useState("");
  const [fFaixaSerasa, setFFaixaSerasa] = useState("");
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [selectedLead, setSelectedLead] = useState(null);

  // Chat
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "sys",
      text:
        "Pergunte como o Carpes pensa: 'PCD em Valinhos', 'BPC LOAS', 'aposentadoria especial', 'litispendência TRF3', 'top 10 leads', 'Syslint contato'.",
    },
  ]);
  const [streaming, setStreaming] = useState(false);
  const [typedReply, setTypedReply] = useState("");
  const bottomRef = useRef(null);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return allLeads.filter((l) => {
      if (fTipo && l.tipo_acao_id !== fTipo) return false;
      if (fMunicipio && l.municipio !== fMunicipio) return false;
      if (fLitisp && l.litispendencia_status !== fLitisp) return false;
      if (fFaixaScore) {
        const fx = FILTROS_DISPONIVEIS.faixas_score.find((f) => f.label === fFaixaScore);
        if (fx && (l.score_match_icp < fx.min || l.score_match_icp > fx.max)) return false;
      }
      if (fFaixaSerasa) {
        const fx = FILTROS_DISPONIVEIS.faixas_serasa.find((f) => f.label === fFaixaSerasa);
        if (fx && (l.serasa_score < fx.min || l.serasa_score > fx.max)) return false;
      }
      if (q) {
        const haystack = `${l.nome} ${l.municipio} ${l.empresa_atual} ${l.tipo_acao_label}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [allLeads, fTipo, fMunicipio, fLitisp, fFaixaScore, fFaixaSerasa, busca]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [fTipo, fMunicipio, fLitisp, fFaixaScore, fFaixaSerasa, busca]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming, typedReply]);

  const limparFiltros = () => {
    setFTipo(""); setFMunicipio(""); setFLitisp(""); setFFaixaScore(""); setFFaixaSerasa(""); setBusca("");
  };

  const send = useCallback(async (questionOverride) => {
    const q = (questionOverride ?? input).trim();
    if (!q || streaming) return;
    setInput("");
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
      if (!final) throw new Error("vazio");
    } catch {
      final = localAgentReply(q, filtered.length ? filtered : allLeads, kpis);
    }

    const step = 5;
    for (let i = 0; i < final.length; i += step) {
      setTypedReply(final.slice(0, i + step));
      await new Promise((r) => setTimeout(r, 12));
    }
    setTypedReply("");
    setMessages((m) => [...m, { role: "agent", text: final }]);
    setStreaming(false);
  }, [input, streaming, filtered, allLeads, kpis]);

  const sugestoes = [
    "PCD em Valinhos",
    "BPC LOAS",
    "Aposentadoria especial insalubre",
    "Top 10 leads",
    "Litispendência TRF3",
  ];

  // Pool por ticket de ação (mostrar contagens nos filtros)
  const tipoComContagem = useMemo(() =>
    TIPOS_ACAO.map((t) => ({
      ...t,
      count: allLeads.filter((l) => l.tipo_acao_id === t.id).length,
    })).sort((a, b) => b.count - a.count),
    [allLeads]
  );

  return (
    <div
      className="min-h-dvh text-slate-100"
      style={{
        background: `linear-gradient(165deg, ${MIDNIGHT_DEEP} 0%, ${MIDNIGHT} 42%, #0c1a32 100%)`,
      }}
    >
      <Helmet>
        <title>Radar Legal — Operação Trilho 1</title>
        <meta name="description" content="Console de leads previdenciários qualificados pelo ICP." />
      </Helmet>

      {/* Faixa superior */}
      <div
        className="border-b px-4 py-2 text-center font-mono text-[10px] uppercase tracking-[0.35em] sm:text-[11px]"
        style={{
          borderColor: "rgba(148, 163, 184, 0.12)",
          background: `linear-gradient(90deg, transparent, ${GOLD_SOFT}, transparent)`,
          color: GOLD,
        }}
      >
        Operação Trilho 1 · Pool INSS {intBR(kpis.total_pool)} · Qualificados {intBR(kpis.qualificados)} · Foco PCD ⭐ · {kpis.ultima_atualizacao}
      </div>

      <div className="mx-auto max-w-[1700px] px-4 py-6 sm:px-6 lg:py-8">
        {/* Header isolado — sem links pro resto do site */}
        <header className="mb-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.28em]" style={{ color: EMERALD }}>
            /radar-legal · isolado · operacional
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Radar Legal — Leads previdenciários qualificados
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-400">
            {intBR(kpis.qualificados)} leads triados sobre pool de {intBR(kpis.total_pool)} indeferimentos INSS 2025, ranqueados pelo match com ICP de cada ticket de ação. Foco operacional: <span className="text-amber-300">PCD por idade ⭐</span> · <span className="text-amber-300">PCD por tempo ⭐</span> · <span className="text-amber-300">BPC/Def ⭐</span> em Valinhos + raio 25km.
          </p>
        </header>

        {/* Banner de transparência — estado atual do pipeline */}
        <div
          className="mb-6 rounded-xl border px-4 py-3 text-xs leading-relaxed sm:text-sm"
          style={{
            borderColor: "rgba(217, 119, 6, 0.45)",
            background: "rgba(120, 53, 15, 0.18)",
            color: "#fde68a",
          }}
        >
          <span className="mr-2 inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">
            Prova de conceito
          </span>
          <strong className="text-amber-100">Dados sintéticos para validação do ICP.</strong>{" "}
          Pool de 9,64M alimentado pela carga BQ INSS (em finalização). Litispendência TRF3 e enriquecimento Syslint (telefone/Serasa) ainda dependem de:{" "}
          <span className="text-amber-100">(1)</span> token de advogado para PJe TRF3,{" "}
          <span className="text-amber-100">(2)</span> contrato com Syslint API. Os scores, teses e ranking são lógica de produção — vão operar idênticos quando o pipeline real estiver conectado.
        </div>

        {/* KPIs */}
        <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Pool bruto INSS" value={`${(kpis.total_pool / 1_000_000).toFixed(2)}M`} hint="Indeferimentos 2025" tone="neutral" />
          <KpiCard label="Qualificados" value={intBR(kpis.qualificados)} hint="Match com ICP" tone="primary" />
          <KpiCard label="Foco PCD ⭐" value={intBR(kpis.foco_pcd)} hint="LC 142 + BPC/Def" tone="success" />
          <KpiCard label="Livres TRF3" value={intBR(kpis.livres)} hint="Sem litispendência" tone="primary" />
          <KpiCard label="Ticket médio" value={brl(kpis.ticket_medio)} hint="Honorários" tone="neutral" />
          <KpiCard label="Receita potencial" value={brlMM(kpis.receita_potencial)} hint="Excl. descarte TRF3" tone="success" />
        </section>

        {/* Filtros */}
        <section
          className="mb-4 rounded-2xl border p-4 backdrop-blur-md"
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
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
            <Select
              label="Ticket de ação ⭐"
              value={fTipo}
              onChange={setFTipo}
              options={[
                { value: "", label: "Todos os tickets" },
                ...tipoComContagem.map((t) => ({
                  value: t.id,
                  label: `${t.foco_atual ? "⭐ " : ""}${t.label} (${t.count})`,
                })),
              ]}
            />
            <Select
              label="Município"
              value={fMunicipio}
              onChange={setFMunicipio}
              options={[{ value: "", label: "Todos" }, ...FILTROS_DISPONIVEIS.municipios.map((m) => ({ value: m, label: m }))]}
            />
            <Select
              label="Litispendência TRF3"
              value={fLitisp}
              onChange={setFLitisp}
              options={[{ value: "", label: "Todas" }, ...FILTROS_DISPONIVEIS.litispendencia.map((l) => ({ value: l.codigo, label: l.label }))]}
            />
            <Select
              label="Match ICP"
              value={fFaixaScore}
              onChange={setFFaixaScore}
              options={[{ value: "", label: "Todas" }, ...FILTROS_DISPONIVEIS.faixas_score.map((f) => ({ value: f.label, label: f.label }))]}
            />
            <Select
              label="Serasa"
              value={fFaixaSerasa}
              onChange={setFFaixaSerasa}
              options={[{ value: "", label: "Todas" }, ...FILTROS_DISPONIVEIS.faixas_serasa.map((f) => ({ value: f.label, label: f.label }))]}
            />
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Busca</label>
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome, empresa, cidade…"
                className="min-h-9 rounded-lg border border-white/10 bg-slate-950/80 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-500/50"
              />
            </div>
          </div>
        </section>

        {/* Layout principal: tabela MAIOR (3fr) + chat (1fr) */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(360px,1fr)]">
          {/* Tabela */}
          <section
            className="overflow-hidden rounded-2xl border"
            style={{ borderColor: "rgba(212, 175, 55, 0.2)", background: "rgba(5, 13, 24, 0.7)" }}
          >
            <div className="custom-scrollbar overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-white/10 bg-slate-950/60 text-left">
                  <tr className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-3">#</th>
                    <th className="px-3 py-3 min-w-[180px]">Nome</th>
                    <th className="px-3 py-3">Idade</th>
                    <th className="px-3 py-3 min-w-[110px]">Município</th>
                    <th className="px-3 py-3 min-w-[200px]">Ticket de ação</th>
                    <th className="px-3 py-3">TRF3</th>
                    <th className="px-3 py-3">Match</th>
                    <th className="px-3 py-3">Serasa</th>
                    <th className="px-3 py-3 text-right">Ticket R$</th>
                    <th className="px-3 py-3 text-right pr-5 min-w-[120px]">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-3 py-12 text-center text-slate-500">
                        Nenhum lead corresponde aos filtros.
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
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-slate-100">{l.nome}</div>
                          <div className="font-mono text-[10px] text-slate-500">{l.cpf_mascarado}</div>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-300">{l.idade}</td>
                        <td className="px-3 py-2.5 text-slate-200">
                          {l.municipio}<span className="ml-1 text-[10px] text-slate-500">/{l.uf}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          {l.foco_atual && <span className="mr-1">⭐</span>}
                          <span className="text-slate-200">{l.tipo_acao_label}</span>
                        </td>
                        <td className="px-3 py-2.5"><LitispBadge status={l.litispendencia_status} /></td>
                        <td className="px-3 py-2.5"><ScoreBadge score={l.score_match_icp} /></td>
                        <td className="px-3 py-2.5"><SerasaBadge score={l.serasa_score} faixa={l.serasa_faixa} /></td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">{brl(l.ticket_estimado_brl)}</td>
                        <td className="px-3 py-2.5 text-right pr-5">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelectedLead(l); }}
                            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-300 transition hover:bg-emerald-500/20"
                          >
                            Detalhar →
                          </button>
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
                <PageBtn disabled={pageSafe <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Ant.</PageBtn>
                <PageBtn disabled={pageSafe >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Próx. ›</PageBtn>
                <PageBtn disabled={pageSafe >= totalPages} onClick={() => setPage(totalPages)}>Fim »</PageBtn>
              </div>
            </div>
          </section>

          {/* Chat lateral — mais estreito, modular */}
          <aside
            className="flex min-h-[600px] flex-col overflow-hidden rounded-2xl border shadow-2xl xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)]"
            style={{ borderColor: "rgba(52, 211, 153, 0.2)", background: "rgba(8, 18, 35, 0.92)" }}
          >
            <div className="border-b px-4 py-3" style={{ borderColor: "rgba(148, 163, 184, 0.12)" }}>
              <h2 className="font-mono text-xs font-bold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
                Agente · perguntas subjetivas
              </h2>
              <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                Pergunte como o Carpes pensa
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

            <div className="border-t px-3 py-2" style={{ borderColor: "rgba(148, 163, 184, 0.12)" }}>
              <div className="flex flex-wrap gap-1.5">
                {sugestoes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    disabled={streaming}
                    className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] text-slate-300 transition hover:border-emerald-500/40 hover:text-emerald-200 disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

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
                  placeholder="Ex.: PCD visão monocular em Valinhos"
                  className="min-h-11 flex-1 rounded-xl border border-white/10 bg-slate-950/80 px-3 font-mono text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-500/50 disabled:opacity-50"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => send()}
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

      {/* Modal completo de detalhamento */}
      {selectedLead && <LeadModal lead={selectedLead} onClose={() => setSelectedLead(null)} />}
    </div>
  );
}

/* ===================== Subcomponentes ===================== */

function KpiCard({ label, value, hint, tone = "neutral" }) {
  const palette = {
    primary: { border: "rgba(52, 211, 153, 0.3)", color: EMERALD, bg: "rgba(52, 211, 153, 0.06)" },
    success: { border: "rgba(212, 175, 55, 0.3)", color: GOLD, bg: "rgba(212, 175, 55, 0.06)" },
    neutral: { border: "rgba(148, 163, 184, 0.18)", color: "#cbd5e1", bg: "rgba(15, 23, 42, 0.4)" },
  }[tone];
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: palette.border, background: palette.bg }}>
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
          <option key={o.value} value={o.value} className="bg-slate-900">{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function ScoreBadge({ score }) {
  let bg, fg, label;
  if (score >= 85) { bg = "rgba(212, 175, 55, 0.18)"; fg = GOLD; label = "Alta"; }
  else if (score >= 70) { bg = "rgba(52, 211, 153, 0.15)"; fg = EMERALD; label = "Média"; }
  else { bg = "rgba(148, 163, 184, 0.15)"; fg = "#94a3b8"; label = "Baixa"; }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums" style={{ background: bg, color: fg }}>
      <span className="font-bold">{score}</span>
      <span className="text-[9px] uppercase opacity-80">{label}</span>
    </span>
  );
}

function LitispBadge({ status }) {
  const config = {
    LIVRE:      { bg: "rgba(52, 211, 153, 0.18)", fg: EMERALD, label: "✓ Livre" },
    VERIFICAR:  { bg: "rgba(212, 175, 55, 0.18)", fg: GOLD,    label: "? Verif." },
    DESCARTAR:  { bg: "rgba(239, 68, 68, 0.18)",  fg: "#fca5a5", label: "✕ Descartar" },
  }[status] || { bg: "rgba(148,163,184,0.15)", fg: "#94a3b8", label: status };
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider" style={{ background: config.bg, color: config.fg }}>
      {config.label}
    </span>
  );
}

function SerasaBadge({ score, faixa }) {
  const colors = {
    Bom:     { bg: "rgba(52, 211, 153, 0.15)", fg: EMERALD },
    Regular: { bg: "rgba(212, 175, 55, 0.15)", fg: GOLD },
    Ruim:    { bg: "rgba(239, 68, 68, 0.15)",  fg: "#fca5a5" },
  }[faixa] || { bg: "rgba(148,163,184,0.15)", fg: "#94a3b8" };
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] tabular-nums" style={{ background: colors.bg, color: colors.fg }}>
      <span className="font-bold">{score}</span>
      <span className="text-[9px] opacity-80">{faixa}</span>
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

function brlInline(n) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}

function LeadModal({ lead, onClose }) {
  const [revealContact, setRevealContact] = useState(false);

  useEffect(() => {
    const onEsc = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onEsc);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Cleanups de telefone para tel: e wa.me
  const telDigits = (lead.telefone || "").replace(/\D/g, "");
  const telLink = telDigits ? `tel:+55${telDigits}` : null;
  const waLink = telDigits ? `https://wa.me/55${telDigits}?text=${encodeURIComponent(`Olá ${lead.nome.split(" ")[0]}, sou do escritório do Dr. Carpes — atendemos casos de ${lead.tipo_acao_label.toLowerCase()} em ${lead.municipio}. Posso te explicar em 3 minutos se você tem direito?`)}` : null;
  const mailLink = lead.email ? `mailto:${lead.email}` : null;

  const litispCfg = {
    LIVRE:     { bg: "rgba(52, 211, 153, 0.10)", border: "rgba(52, 211, 153, 0.3)", color: EMERALD, label: "Livre — sem ação ativa no TRF3" },
    VERIFICAR: { bg: "rgba(212, 175, 55, 0.10)", border: "rgba(212, 175, 55, 0.3)", color: GOLD,    label: "Verificar PJe TRF3 antes do contato" },
    DESCARTAR: { bg: "rgba(239, 68, 68, 0.10)",  border: "rgba(239, 68, 68, 0.3)",  color: "#fca5a5", label: "DESCARTAR — litispendência ativa no TRF3" },
  }[lead.litispendencia_status] || { bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.2)", color: "#94a3b8", label: lead.litispendencia_label };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="custom-scrollbar relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border shadow-2xl"
        style={{ borderColor: "rgba(212, 175, 55, 0.3)", background: "rgba(8, 18, 35, 0.98)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-5 py-3"
          style={{ borderColor: "rgba(148, 163, 184, 0.15)", background: "rgba(8, 18, 35, 0.98)" }}
        >
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: GOLD }}>
              {lead.foco_atual ? "⭐ Lead PCD/BPC — foco operacional" : "Lead qualificado"}
            </p>
            <p className="truncate font-mono text-[10px] text-slate-500">
              {lead.tipo_acao_grupo} · {lead.tipo_acao_label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-[11px] text-slate-300 hover:bg-white/10"
          >
            Fechar ✕
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* Identificação */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="font-serif text-2xl font-semibold text-white">{lead.nome}</h3>
              <p className="mt-1 font-mono text-xs text-slate-400">
                CPF {revealContact ? lead.cpf : lead.cpf_mascarado} · {lead.idade} anos · {lead.municipio}/{lead.uf}
              </p>
              <p className="mt-1 font-mono text-[11px] text-slate-500">
                Tempo contribuição: {lead.tempo_contribuicao_anos} anos · Empresa: {lead.empresa_atual}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <ScoreBadge score={lead.score_match_icp} />
              <LitispBadge status={lead.litispendencia_status} />
              <SerasaBadge score={lead.serasa_score} faixa={lead.serasa_faixa} />
            </div>
          </div>

          {/* Status TRF3 — destaque */}
          <div
            className="rounded-xl border p-4"
            style={{ borderColor: litispCfg.border, background: litispCfg.bg }}
          >
            <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: litispCfg.color }}>
              ⚖️ Litispendência TRF3
            </p>
            <p className="mt-1 text-sm font-semibold" style={{ color: litispCfg.color }}>{litispCfg.label}</p>
            <p className="mt-1 font-mono text-[10px] text-slate-500">
              Próxima ação: <span className="text-slate-300">{lead.proxima_acao}</span>
            </p>
          </div>

          {/* Contato — bloqueado por padrão (LGPD) */}
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: EMERALD }}>
                📞 Contato (Syslint enriquecido)
              </p>
              {!revealContact && (
                <button
                  type="button"
                  onClick={() => setRevealContact(true)}
                  className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-200 hover:bg-emerald-500/25"
                >
                  Revelar contato
                </button>
              )}
            </div>

            {revealContact ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <ContactField label="Telefone" value={lead.telefone} />
                <ContactField label="E-mail" value={lead.email} />
                <ContactField label="Endereço" value={lead.endereco} fullWidth />
                <ContactField label="CPF completo" value={lead.cpf} mono />
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <ContactField label="Telefone" value={lead.telefone_mascarado} />
                <ContactField label="E-mail" value={lead.email.replace(/^(.{2}).*(@.*)$/, "$1***$2")} />
                <ContactField label="Endereço" value="Liberar acima para visualizar" muted fullWidth />
                <ContactField label="CPF completo" value={lead.cpf_mascarado} mono />
              </div>
            )}

            {revealContact && (
              <div className="mt-4 flex flex-wrap gap-2">
                {telLink && (
                  <a href={telLink} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-emerald-200 hover:bg-emerald-500/30">
                    📞 Ligar agora
                  </a>
                )}
                {waLink && (
                  <a href={waLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-emerald-200 hover:bg-emerald-500/30">
                    💬 WhatsApp
                  </a>
                )}
                {mailLink && (
                  <a href={mailLink} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-amber-200 hover:bg-amber-500/30">
                    📧 E-mail
                  </a>
                )}
              </div>
            )}
          </div>

          {/* ICP do ticket */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: GOLD }}>
              🎯 Perfil de Cliente IDEAL (Carpes)
            </p>
            <p className="mt-1 text-sm text-slate-100">{lead.tipo_acao_icp}</p>
            {lead.condicao_pcd && (
              <p className="mt-2 font-mono text-[11px] text-amber-200">
                Condição PCD: <span className="text-slate-100">{lead.condicao_pcd}</span>
              </p>
            )}
          </div>

          {/* Tese */}
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: EMERALD }}>
              ⚖️ Tese recomendada
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-100">{lead.tese_recomendada}</p>
          </div>

          {/* Métricas */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Match ICP" value={`${lead.score_match_icp}/100`} />
            <Field label="Probabilidade" value={lead.prob_conversao} />
            <Field label="Ticket estimado" value={brlInline(lead.ticket_estimado_brl)} />
            <Field label="Serasa" value={`${lead.serasa_score} · ${lead.serasa_faixa}`} />
          </div>

          {/* Ações finais */}
          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            <button
              type="button"
              disabled={lead.litispendencia_status === "DESCARTAR"}
              className="flex-1 rounded-xl px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wide text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: EMERALD }}
            >
              {lead.litispendencia_status === "DESCARTAR"
                ? "Descartar (litispendência)"
                : "Encaminhar para abordagem"}
            </button>
            <button
              type="button"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 font-mono text-xs font-semibold text-slate-200 hover:bg-white/10"
            >
              Copiar dossiê
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContactField({ label, value, mono, muted, fullWidth }) {
  return (
    <div className={`rounded-lg border border-white/8 bg-slate-950/40 p-2.5 ${fullWidth ? "sm:col-span-2" : ""}`}>
      <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-0.5 truncate text-sm ${mono ? "font-mono" : ""} ${muted ? "text-slate-500 italic" : "text-slate-100"}`}>
        {value}
      </p>
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
