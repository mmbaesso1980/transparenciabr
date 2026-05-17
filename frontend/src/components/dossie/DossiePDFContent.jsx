import { forwardRef, memo, useMemo } from "react";

import {
  pickContextoSocioeconomicoRows,
  pickNome,
  pickRiskScore,
  pickUf,
} from "../../utils/dataParsers.js";
import { normalizeEmendasList } from "../../utils/emendasNormalize.js";

/** Cores só em hex — html2canvas. */
const C = {
  void: "#0B0F1A",
  panel: "#111827",
  ink: "#F0F4FC",
  muted: "#8B949E",
  border: "#30363D",
  cyan: "#7DD3FC",
  gold: "#FDE047",
  rose: "#f85149",
  illegal: "#7f1d1d",
  irregular: "#92400e",
  immoral: "#6b21a8",
  suspeito: "#1e3a5f",
};

/** Paleta para html2pdf/html2canvas (fundo claro, texto escuro). */
const LIGHT_PDF = {
  void: "#ffffff",
  panel: "#f1f5f9",
  ink: "#0f172a",
  muted: "#475569",
  border: "#94a3b8",
  cyan: "#0369a1",
  gold: "#92400e",
  rose: "#be123c",
  illegal: "#991b1b",
  irregular: "#9a3412",
  immoral: "#6b21a8",
  suspeito: "#1e3a8a",
};

const ASMODEUS_VERTEX_MATRIX = [
  { id: "1", agente: "BENFORD / quantidade", goetia: "Bael" },
  { id: "2", agente: "Fornecedor / HHI", goetia: "Agares" },
  { id: "3", agente: "Categorias CEAP", goetia: "Vassago" },
  { id: "4", agente: "Temporalidade", goetia: "Gamigin" },
  { id: "5", agente: "OCR / documento", goetia: "Marbas" },
  { id: "6", agente: "PNCP cruzamento", goetia: "Valefor" },
  { id: "7", agente: "Emendas RP6/7/99", goetia: "Amon" },
  { id: "8", agente: "Patrimônio TSE", goetia: "Barbatos" },
  { id: "9", agente: "Gabinete / vínculos", goetia: "Paim" },
  { id: "10", agente: "Viagens / pedágios", goetia: "Buer" },
  { id: "11", agente: "OSINT compliance", goetia: "Gusion" },
  { id: "12", agente: "Consolidador ASMODEUS", goetia: "Asmodeus" },
];

function fmtBrl(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function pickPartidoSiglaPdf(politico) {
  if (!politico || typeof politico !== "object") return "—";
  const v =
    politico.siglaPartido ??
    politico.partido_sigla ??
    politico.partido ??
    politico.sigla_partido ??
    "";
  return typeof v === "string" && v.trim() ? v.trim() : "—";
}

function pickParlamentarId(politico) {
  if (!politico || typeof politico !== "object") return "—";
  const id = politico.id ?? politico.deputado_id ?? politico.parlamentar_id ?? politico.slug;
  return id != null && String(id).trim() ? String(id) : "—";
}

function severityBadgeStyle(severidade, pal = C) {
  const s = String(severidade ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (s.includes("ILEGAL"))
    return { backgroundColor: pal.illegal, color: "#fecaca", border: `1px solid ${pal.rose}` };
  if (s.includes("IRREGULAR"))
    return { backgroundColor: pal.irregular, color: "#fde68a", border: "1px solid #b45309" };
  if (s.includes("IMORAL"))
    return { backgroundColor: pal.immoral, color: "#e9d5ff", border: "1px solid #7e22ce" };
  if (s.includes("SUSPEITO") || s.includes("SUSPEITA"))
    return { backgroundColor: pal.suspeito, color: pal.cyan, border: `1px solid ${pal.cyan}` };
  return { backgroundColor: pal.panel, color: pal.muted, border: `1px solid ${pal.border}` };
}

function pickAsmodeusScore(politico, ceapKpi) {
  const fromDoc = Number(
    politico?.score_asmodeus ??
      politico?.score_asmodeus_consolidado ??
      politico?.score_forense ??
      politico?.indice_risco_aurora,
  );
  if (Number.isFinite(fromDoc)) return Math.round(fromDoc);
  const fromKpi = Number(ceapKpi?.indice_risco_aurora);
  if (Number.isFinite(fromKpi)) return Math.round(fromKpi);
  const risk = pickRiskScore(politico);
  return risk != null && Number.isFinite(Number(risk)) ? Math.round(Number(risk)) : null;
}

function pickProjetosCount(politico) {
  const raw =
    politico?.proposicoes_filtradas ??
    politico?.projetos_lei_filtrados ??
    politico?.proposicoes ??
    politico?.projetos_lei;
  if (Array.isArray(raw)) return raw.length;
  const n = Number(politico?.qtd_proposicoes ?? politico?.total_projetos);
  return Number.isFinite(n) ? n : null;
}

/** Contagem explícita de proposições de autoria principal (campo dedicado ou array filtrado). */
function pickProposicoesAutoriaPrincipal(politico) {
  const n = Number(
    politico?.qtd_proposicoes_autoria ??
      politico?.qtd_proposicoes_autoria_principal ??
      politico?.proposicoes_autoria_principal_count,
  );
  if (Number.isFinite(n)) return n;
  const arr = politico?.proposicoes_autoria_principal ?? politico?.proposicoes_autoria;
  if (Array.isArray(arr)) return arr.length;
  return null;
}

function pickPresencaPct(politico) {
  const n = Number(
    politico?.presenca_plenaria_pct ??
      politico?.presenca_pct ??
      politico?.presenca ??
      politico?.kpi_presenca,
  );
  return Number.isFinite(n) ? n : null;
}

function fmtPresencaExata(pct) {
  if (pct == null || !Number.isFinite(Number(pct))) return "—";
  const x = Number(pct);
  const rounded = Math.round(x * 100) / 100;
  return `${rounded.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function pickEmendasPdfFull(politico) {
  const raw =
    politico?.emendas_parlamentares ?? politico?.emendas ?? politico?.emendas_orcamento;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return normalizeEmendasList(raw);
}

function pickValorEmpenhadoEmenda(row) {
  const n = Number(
    row?.valor_empenhado ??
      row?.valorEmpenhado ??
      row?.valor_emenda ??
      row?.valorEmpenho ??
      row?.valor_normalizado,
  );
  return Number.isFinite(n) ? n : null;
}

function pickFavorecidoDestino(row) {
  const nome = String(
    row?.beneficiario_nome ??
      row?.favorecido ??
      row?.razao_social_favorecido ??
      row?.nome_favorecido ??
      row?.credor_nome ??
      "",
  ).trim();
  if (nome) return nome.slice(0, 120);
  const loc = [row?.municipio_favorecido, row?.uf_favorecido].filter(Boolean).join(" / ");
  return loc ? String(loc).slice(0, 120) : "—";
}

const DossiePDFContentInner = forwardRef(function DossiePDFContentInner(
  { politico, alertas, ceapKpi = null, lightPaper = false },
  ref,
) {
  const col = lightPaper ? LIGHT_PDF : C;
  const nome = pickNome(politico) || "—";
  const partidoUf = [pickPartidoSiglaPdf(politico), pickUf(politico) || "—"].join(" / ");
  const parlamentarId = pickParlamentarId(politico);
  const scoreAsm = pickAsmodeusScore(politico, ceapKpi);
  const geradoEm = useMemo(
    () =>
      new Date().toLocaleString("pt-BR", {
        dateStyle: "long",
        timeStyle: "short",
      }),
    [],
  );

  const findings = useMemo(() => {
    const list = Array.isArray(alertas) ? alertas : [];
    const out = [];
    for (let i = 0; i < 15; i++) {
      const row = list[i];
      if (!row) break;
      out.push(row);
    }
    return out;
  }, [alertas]);

  const emendasRows = useMemo(() => pickEmendasPdfFull(politico), [politico]);
  const top3 = useMemo(() => {
    const rows = pickContextoSocioeconomicoRows(politico);
    return rows.slice(0, 3);
  }, [politico]);

  const presenca = pickPresencaPct(politico);
  const projetosN = pickProjetosCount(politico);
  const proposicoesAutoria = pickProposicoesAutoriaPrincipal(politico);

  const chapterLabel = {
    margin: "0 0 6px",
    fontSize: "10px",
    fontWeight: 800,
    letterSpacing: "0.28em",
    textTransform: "uppercase",
    color: col.gold,
  };

  const wrap = {
    boxSizing: "border-box",
    width: "210mm",
    minHeight: "297mm",
    padding: "12mm",
    backgroundColor: col.void,
    color: col.ink,
    fontFamily: '"Inter", system-ui, sans-serif',
    fontSize: "13px",
    lineHeight: 1.5,
    WebkitFontSmoothing: "antialiased",
  };

  const h1 = {
    margin: "0 0 4px",
    fontSize: "22px",
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: col.gold,
  };

  const subH = {
    margin: "0 0 12px",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    color: col.cyan,
  };

  return (
    <div
      ref={ref}
      style={{
        ...wrap,
        position: lightPaper ? "relative" : "fixed",
        left: lightPaper ? 0 : "-9999px",
        top: 0,
        zIndex: lightPaper ? 0 : -10,
      }}
      aria-hidden="true"
    >
      <header style={{ borderBottom: `1px solid ${col.border}`, paddingBottom: "14px" }}>
        <p style={chapterLabel}>Capítulo 1 — Cabeçalho forense</p>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <p style={h1}>TRANSPARÊNCIABR</p>
            <p style={subH}>ASMODEUS ENGINE — INFERNO EDITION v3 (MODELO ERIKA HILTON)</p>
            <p style={{ margin: "6px 0 0", fontSize: "12px", color: col.muted }}>
              DOSSIÊ FORENSE CEAP / VERBA GABINETE · PDF OPERACIONAL
            </p>
            <p style={{ margin: "10px 0 0", fontSize: "20px", fontWeight: 700, color: col.ink }}>
              {nome}
            </p>
            <p style={{ margin: "6px 0 0", fontFamily: "ui-monospace, monospace", fontSize: "12px", color: col.muted }}>
              ID {parlamentarId} · {partidoUf}
            </p>
          </div>
          <div style={{ textAlign: "right", fontSize: "11px", color: col.muted }}>
            Emissão forense
            <br />
            <span style={{ fontFamily: "ui-monospace, monospace", color: col.ink }}>{geradoEm}</span>
          </div>
        </div>
      </header>

      <section style={{ marginTop: "14px" }}>
        <p style={chapterLabel}>Capítulo 2 — Score consolidado e matriz Vertex (Ars Goetia)</p>
        <div style={{ padding: "12px", borderRadius: "8px", backgroundColor: col.panel, border: `1px solid ${col.border}` }}>
          <h2 style={{ margin: 0, fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: col.muted }}>
            Score ASMODEUS consolidado
          </h2>
          <p style={{ margin: "8px 0 0", fontFamily: "ui-monospace, monospace", fontSize: "28px", fontWeight: 700, color: col.cyan }}>
            {scoreAsm != null ? `${scoreAsm} / 100` : "—"}
          </p>
          <p style={{ margin: "6px 0 0", fontSize: "11px", color: col.muted }}>
            Índice agregado Aurora / datalake quando materializado no documento ou KPIs CEAP.
          </p>
        </div>

        <h2
          style={{
            margin: "14px 0 8px",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: col.muted,
          }}
        >
          Matriz — 12 agentes Vertex (Ars Goetia)
        </h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", backgroundColor: col.panel, border: `1px solid ${col.border}` }}>
          <thead>
            <tr style={{ backgroundColor: col.panel }}>
              <th style={{ textAlign: "left", padding: "6px", borderBottom: `1px solid ${col.border}`, color: col.muted }}>#</th>
              <th style={{ textAlign: "left", padding: "6px", borderBottom: `1px solid ${col.border}`, color: col.muted }}>Agente</th>
              <th style={{ textAlign: "left", padding: "6px", borderBottom: `1px solid ${col.border}`, color: col.muted }}>Goetia</th>
            </tr>
          </thead>
          <tbody>
            {ASMODEUS_VERTEX_MATRIX.map((row) => (
              <tr key={row.id}>
                <td style={{ padding: "5px 6px", borderBottom: `1px solid ${col.border}`, fontFamily: "ui-monospace, monospace", color: col.cyan }}>
                  {row.id}
                </td>
                <td style={{ padding: "5px 6px", borderBottom: `1px solid ${col.border}`, color: col.ink }}>{row.agente}</td>
                <td style={{ padding: "5px 6px", borderBottom: `1px solid ${col.border}`, color: col.gold }}>{row.goetia}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: "16px", borderTop: `1px solid ${col.border}`, paddingTop: "12px" }}>
        <p style={chapterLabel}>Capítulo 3 — Findings (F-01 … F-15) · severidade ILEGAL / IRREGULAR / IMORAL / SUSPEITO</p>
        <h2 style={{ margin: "0 0 10px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: col.muted }}>
          Justificativas do Oráculo
        </h2>
        {findings.length === 0 ? (
          <p style={{ color: col.muted, fontSize: "12px" }}>Nenhum finding indexado neste PDF.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {findings.map((a, idx) => {
              const sevStyle = severityBadgeStyle(a.severidade, col);
              const code = a.codigo || `F-${String(idx + 1).padStart(2, "0")}`;
              return (
                <li
                  key={`${code}-${idx}`}
                  style={{
                    marginBottom: "10px",
                    padding: "10px",
                    borderRadius: "6px",
                    border: `1px solid ${col.border}`,
                    backgroundColor: col.panel,
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                    <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px", fontWeight: 700, color: col.cyan }}>
                      {code}
                    </span>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        ...sevStyle,
                      }}
                    >
                      {a.severidade || "—"}
                    </span>
                    <span style={{ fontSize: "10px", color: col.muted }}>{a.tipo}</span>
                  </div>
                  {a.fonte_primaria ? (
                    <p style={{ margin: "6px 0 0", fontSize: "11px", color: col.cyan }}>Fonte primária: {a.fonte_primaria}</p>
                  ) : null}
                  {a.resumo_forense ? (
                    <p style={{ margin: "6px 0 0", fontSize: "12px", color: col.muted, fontStyle: "italic" }}>
                      Resumo Oráculo: {a.resumo_forense}
                    </p>
                  ) : null}
                  <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", fontSize: "12px", color: col.ink }}>{a.trecho}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "16px", borderTop: `1px solid ${col.border}`, paddingTop: "12px" }}>
        <p style={chapterLabel}>Capítulo 4 — Emendas parlamentares (dados reais do relatório)</p>
        <h2 style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: col.muted }}>
          Tabela completa (ano, tipo, empenhado, pago, favorecido / destino)
        </h2>
        {emendasRows.length === 0 ? (
          <p style={{ color: col.muted, fontSize: "12px" }}>Sem emendas materializadas neste relatório.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9px", backgroundColor: col.panel, border: `1px solid ${col.border}` }}>
            <thead>
              <tr style={{ backgroundColor: col.panel }}>
                {["Ano", "Tipo", "Valor empenhado", "Valor pago", "Favorecido / destino"].map((h) => (
                  <th
                    key={h}
                    style={{ textAlign: "left", padding: "5px", borderBottom: `1px solid ${col.border}`, color: col.muted }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {emendasRows.map((row, i) => {
                const tipo =
                  row.codigo_rp ?? row.tipo_emenda ?? row.tipoEmenda ?? row.tipo_rp ?? "—";
                const valorPago =
                  row.valor_pago_normalizado != null && row.valor_pago_normalizado > 0
                    ? row.valor_pago_normalizado
                    : row.valor_pago ?? row.valorPago;
                const valorEmp = pickValorEmpenhadoEmenda(row);
                const fav = pickFavorecidoDestino(row);
                return (
                  <tr key={row.id ?? row.codigo_emenda ?? i}>
                    <td style={{ padding: "4px 5px", borderBottom: `1px solid ${col.border}`, color: col.ink }}>{row.ano ?? "—"}</td>
                    <td style={{ padding: "4px 5px", borderBottom: `1px solid ${col.border}`, color: col.gold }}>{String(tipo)}</td>
                    <td style={{ padding: "4px 5px", borderBottom: `1px solid ${col.border}`, fontFamily: "ui-monospace, monospace", color: col.cyan }}>
                      {fmtBrl(valorEmp)}
                    </td>
                    <td style={{ padding: "4px 5px", borderBottom: `1px solid ${col.border}`, fontFamily: "ui-monospace, monospace", color: col.cyan }}>
                      {fmtBrl(valorPago)}
                    </td>
                    <td style={{ padding: "4px 5px", borderBottom: `1px solid ${col.border}`, color: col.muted }}>{fav}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ marginTop: "16px", borderTop: `1px solid ${col.border}`, paddingTop: "12px" }}>
        <p style={chapterLabel}>Capítulo 5 — Atividade parlamentar (dados reais)</p>
        <h2 style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: col.muted }}>
          Presença em plenário e produção legislativa
        </h2>
        <ul style={{ margin: 0, paddingLeft: "18px", color: col.ink, fontSize: "12px" }}>
          <li style={{ marginBottom: "6px" }}>
            Presença em plenário (% exato no documento):{" "}
            <strong>{fmtPresencaExata(presenca)}</strong>
          </li>
          <li style={{ marginBottom: "6px" }}>
            Proposições de autoria principal:{" "}
            <strong>{proposicoesAutoria != null ? String(proposicoesAutoria) : "—"}</strong>
          </li>
          <li>
            Total de proposições disponíveis no conjunto filtrado / agregado:{" "}
            <strong>{projetosN != null ? String(projetosN) : "—"}</strong>
          </li>
        </ul>
        {top3.length > 0 ? (
          <p style={{ marginTop: "10px", fontSize: "11px", color: col.muted }}>
            Base eleitoral crítica (top 3 municípios no documento socioeconômico) mantida para contexto territorial.
          </p>
        ) : null}
      </section>

      <footer
        style={{
          marginTop: "22mm",
          paddingTop: "12px",
          borderTop: `1px solid ${col.border}`,
          minHeight: "40mm",
        }}
      >
        <p style={chapterLabel}>Capítulo 6 — Encerramento e contraditório</p>
        <p style={{ margin: "0 0 10px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: col.gold }}>
          Direito de resposta (24h)
        </p>
        <p style={{ fontSize: "11px", lineHeight: 1.55, color: col.muted, margin: 0 }}>
          O titular dos dados públicos aqui sintetizados dispõe de até 24 (vinte e quatro) horas, contadas da
          emissão deste PDF, para manifestação prévia por canal oficial da plataforma, anexando documentos
          idôneos que infirmem achados factuais. A ausência de manifestação tempestiva não implica confissão
          nem preclusão de direitos; trata-se de protocolo editorial-operacional da Operação TransparênciaBR.
        </p>
        <p style={{ marginTop: "12px", fontSize: "10px", lineHeight: 1.45, color: col.muted }}>
          Documento gerado automaticamente a partir de dados públicos. Não substitui procedimentos jurídicos;
          síntese informativa para análise técnica.
        </p>
      </footer>
    </div>
  );
});

const DossiePDFContent = memo(DossiePDFContentInner);
DossiePDFContent.displayName = "DossiePDFContent";

export default DossiePDFContent;
