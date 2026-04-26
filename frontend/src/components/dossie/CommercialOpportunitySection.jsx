import { Briefcase, FileDown, Loader2, TrendingUp } from "lucide-react";
import html2pdf from "html2pdf.js";
import { useMemo, useRef, useState } from "react";

function fmtBrl(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function fmtQty(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function normalizeSnapshot(politico) {
  const snap =
    politico?.oportunidades_mercado ??
    politico?.oportunidadesMercado ??
    politico?.commercial_opportunities;
  if (!snap || typeof snap !== "object") return null;
  const munis = Array.isArray(snap.municipios) ? snap.municipios : [];
  return {
    rotulo_ui: snap.rotulo_ui || "Oportunidades de Mercado",
    atualizado_em: snap.atualizado_em,
    municipios: munis,
  };
}

export default function CommercialOpportunitySection({ politico }) {
  const pdfRef = useRef(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const snap = useMemo(() => normalizeSnapshot(politico), [politico]);

  const nomeParlamentar =
    typeof politico?.nome_completo === "string"
      ? politico.nome_completo
      : typeof politico?.apelido_publico === "string"
        ? politico.apelido_publico
        : "Parlamentar";

  async function handleLeadPdf() {
    if (isGenerating) return;
    const el = pdfRef.current;
    if (!el) return;

    setIsGenerating(true);
    try {
      const filename = `Lead_OportunidadesMercado_${String(nomeParlamentar)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .slice(0, 72)}.pdf`;

      await html2pdf()
        .set({
          margin: 10,
          filename,
          image: { type: "jpeg", quality: 0.96 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(el)
        .save();
    } finally {
      setIsGenerating(false);
    }
  }

  if (!snap || snap.municipios.length === 0) {
    return (
      <div className="glass dashboard-panel rounded-2xl border border-[#30363D] p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Briefcase className="size-4 text-[#58A6FF]" strokeWidth={1.75} />
          <h3 className="text-sm font-semibold tracking-tight text-[#F0F4FC]">
            Oportunidades de Mercado
          </h3>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-[#8B949E]">
          Sem snapshot comercial sincronizado para este perfil. Execute o motor PCA e a
          sincronização agregada (BigQuery → Firestore) para preencher próximas aquisições e
          caixa municipal por IBGE.
        </p>
      </div>
    );
  }

  return (
    <div className="relative glass dashboard-panel overflow-hidden rounded-2xl border border-[#30363D]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#30363D] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <TrendingUp className="size-4 text-[#58A6FF]" strokeWidth={1.75} />
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-[#F0F4FC]">
              Oportunidades de Mercado
            </h3>
            <p className="text-[11px] text-[#8B949E]">
              Próximas aquisições estimadas (PCA) e caixa de contexto por município — camada B2B.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={isGenerating}
          onClick={() => void handleLeadPdf()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#58A6FF]/40 bg-[#58A6FF]/10 px-4 py-2 text-xs font-semibold tracking-tight text-[#F0F4FC] shadow-[0_0_24px_rgba(88,166,255,0.08)] transition enabled:hover:border-[#58A6FF]/70 enabled:hover:bg-[#58A6FF]/18 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58A6FF] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              A gerar…
            </>
          ) : (
            <>
              <FileDown className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              Gerar Lead de Venda (PDF)
            </>
          )}
        </button>
      </div>

      <div className="max-h-[520px] space-y-4 overflow-y-auto p-4">
        {snap.municipios.map((m, idx) => {
          const codigo =
            m.codigo_ibge_municipio ?? m.ibge ?? m.codigo_ibge ?? `mun-${idx}`;
          const nome = m.nome_municipio ?? m.nome ?? codigo;
          const caixa = m.caixa_ceap_parlamentar_aprox ?? m.caixa_ceap_parlamentar;
          const itens = Array.isArray(m.proximas_aquisicoes_estimadas)
            ? m.proximas_aquisicoes_estimadas
            : [];

          return (
            <div
              key={codigo}
              className="rounded-xl border border-[#30363D] bg-[#0D1117]/70 p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#8B949E]">
                    Município-alvo
                  </p>
                  <p className="text-sm font-semibold text-[#F0F4FC]">{nome}</p>
                  <p className="font-mono text-[11px] text-[#8B949E]">IBGE {codigo}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-[#8B949E]">Caixa (contexto parlamentar)</p>
                  <p className="text-sm font-semibold text-[#7EE787]">{fmtBrl(caixa)}</p>
                </div>
              </div>

              <div className="mt-4 border-t border-[#30363D] pt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8B949E]">
                  Próximas aquisições estimadas (PCA)
                </p>
                {itens.length === 0 ? (
                  <p className="text-xs text-[#8B949E]">Sem itens PCA para este IBGE.</p>
                ) : (
                  <ul className="space-y-3">
                    {itens.slice(0, 24).map((it, j) => (
                      <li
                        key={`${codigo}-${j}`}
                        className="rounded-lg border border-[#21262D] bg-[#010409]/60 px-3 py-2"
                      >
                        <p className="text-sm text-[#F0F4FC]">
                          {it.item_descricao ?? it.descricao ?? "—"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#8B949E]">
                          <span>
                            Qtd est.:{" "}
                            <span className="font-mono text-[#C9D1D9]">
                              {fmtQty(it.quantidade_estimada)}
                            </span>
                          </span>
                          <span>
                            Valor unit. est.:{" "}
                            <span className="font-mono text-[#C9D1D9]">
                              {fmtBrl(it.valor_unitario_estimado)}
                            </span>
                          </span>
                          <span>
                            Total est.:{" "}
                            <span className="font-mono text-[#F0F4FC]">
                              {fmtBrl(it.valor_total_estimado)}
                            </span>
                          </span>
                          <span>
                            Caixa ref.:{" "}
                            <span className="font-mono text-[#7EE787]">
                              {fmtBrl(it.valor_caixa_contexto_parlamentar ?? caixa)}
                            </span>
                          </span>
                        </div>
                        {it.orgao_comprador &&
                        typeof it.orgao_comprador === "object" ? (
                          <div className="mt-2 text-[11px] leading-snug text-[#8B949E]">
                            <span className="font-semibold text-[#C9D1D9]">Órgão comprador:</span>{" "}
                            {it.orgao_comprador.nome ?? "—"}
                            {it.orgao_comprador.email ? (
                              <>
                                {" "}
                                · <span className="font-mono">{it.orgao_comprador.email}</span>
                              </>
                            ) : null}
                            {it.orgao_comprador.telefone ? (
                              <>
                                {" "}
                                · <span className="font-mono">{it.orgao_comprador.telefone}</span>
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="pointer-events-none absolute -left-[9999px] top-0 opacity-0" aria-hidden="true">
        <div
          ref={pdfRef}
          className="w-[190mm] rounded-lg bg-white p-6 text-sm text-neutral-900"
        >
          <h1 className="text-xl font-bold">Oportunidades de Mercado — Lead de venda</h1>
          <p className="mt-1 text-xs text-neutral-600">
            Parlamentar de referência: {nomeParlamentar}
          </p>
          <hr className="my-4" />
          {snap.municipios.map((m, idx) => {
            const codigo =
              m.codigo_ibge_municipio ?? m.ibge ?? m.codigo_ibge ?? `mun-${idx}`;
            const nome = m.nome_municipio ?? m.nome ?? codigo;
            const caixa = m.caixa_ceap_parlamentar_aprox ?? m.caixa_ceap_parlamentar;
            const itens = Array.isArray(m.proximas_aquisicoes_estimadas)
              ? m.proximas_aquisicoes_estimadas
              : [];
            return (
              <section key={codigo} className="mb-6 break-inside-avoid">
                <h2 className="text-base font-semibold">
                  {nome} <span className="text-neutral-500">· IBGE {codigo}</span>
                </h2>
                <p className="text-sm text-neutral-700">
                  Caixa (contexto parlamentar): <strong>{fmtBrl(caixa)}</strong>
                </p>
                <ul className="mt-2 list-disc space-y-2 pl-5">
                  {itens.slice(0, 40).map((it, j) => (
                    <li key={j}>
                      <div>{it.item_descricao ?? it.descricao ?? "—"}</div>
                      <div className="text-xs text-neutral-600">
                        Qtd {fmtQty(it.quantidade_estimada)} · Unit {fmtBrl(it.valor_unitario_estimado)}{" "}
                        · Total {fmtBrl(it.valor_total_estimado)}
                      </div>
                      {it.orgao_comprador ? (
                        <div className="text-xs text-neutral-600">
                          Contato: {it.orgao_comprador.nome ?? "—"}
                          {it.orgao_comprador.email ? ` · ${it.orgao_comprador.email}` : ""}
                          {it.orgao_comprador.telefone ? ` · ${it.orgao_comprador.telefone}` : ""}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          <p className="mt-8 text-[10px] text-neutral-500">
            Fonte agregada TransparênciaBR — PCA PNCP × CEAP contextualizado. Uso estratégico B2B;
            validar valores junto aos órgãos compradores.
          </p>
        </div>
      </div>
    </div>
  );
}
