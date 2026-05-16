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

function fmtPct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return `${Math.round(x)}%`;
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

function severityBadgeStyle(severidade) {
  const s = String(severidade ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (s.includes("ILEGAL"))
    return { backgroundColor: C.illegal, color: "#fecaca", border: `1px solid ${C.rose}` };
  if (s.includes("IRREGULAR"))
    return { backgroundColor: C.irregular, color: "#fde68a", border: "1px solid #b45309" };
  if (s.includes("IMORAL"))
    return { backgroundColor: C.immoral, color: "#e9d5ff", border: "1px solid #7e22ce" };
  if (s.includes("SUSPEITO") || s.includes("SUSPEITA"))
    return { backgroundColor: C.suspeito, color: C.cyan, border: `1px solid ${C.cyan}` };
  return { backgroundColor: "#21262D", color: C.muted, border: `1px solid ${C.border}` };
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

function pickEmendasPdf(politico) {
  const raw =
    politico?.emendas_parlamentares ?? politico?.emendas ?? politico?.emendas_orcamento;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return normalizeEmendasList(raw).slice(0, 40);
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

function pickPresencaPct(politico) {
  const n = Number(
    politico?.presenca_plenaria_pct ??
      politico?.presenca_pct ??
      politico?.presenca ??
      politico?.kpi_presenca,
  );
  return Number.isFinite(n) ? n : null;
}

const DossiePDFContentInner = forwardRef(function DossiePDFContentInner(
  { politico, alertas, ceapKpi = null },
  ref,
) {
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

  const emendasRows = useMemo(() => pickEmendasPdf(politico), [politico]);
  const top3 = useMemo(() => {
    const rows = pickContextoSocioeconomicoRows(politico);
    return rows.slice(0, 3);
  }, [politico]);

  const presenca = pickPresencaPct(politico);
  const projetosN = pickProjetosCount(politico);

  const wrap = {
    boxSizing: "border-box",
    width: "210mm",
    minHeight: "297mm",
    padding: "12mm",
    backgroundColor: C.void,
    color: C.ink,
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
    color: C.gold,
  };

  const subH = {
    margin: "0 0 12px",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    color: C.cyan,
  };

  return (
    <div
      ref={ref}
      style={{
        ...wrap,
        position: "fixed",
        left: "-9999px",
        top: 0,
        zIndex: -10,
      }}
      aria-hidden="true"
    >
      <header style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <p style={h1}>TRANSPARÊNCIABR</p>
            <p style={subH}>ASMODEUS ENGINE v2.0 — INFERNO EDITION</p>
            <p style={{ margin: "6px 0 0", fontSize: "12px", color: C.muted }}>
              DOSSIÊ FORENSE CEAP / VERBA GABINETE
            </p>
            <p style={{ margin: "10px 0 0", fontSize: "20px", fontWeight: 700, color: C.ink }}>
              {nome}
            </p>
            <p style={{ margin: "6px 0 0", fontFamily: "ui-monospace, monospace", fontSize: "12px", color: C.muted }}>
              ID {parlamentarId} · {partidoUf}
            </p>
          </div>
          <div style={{ textAlign: "right", fontSize: "11px", color: C.muted }}>
            Emissão forense
            <br />
            <span style={{ fontFamily: "ui-monospace, monospace", color: C.ink }}>{geradoEm}</span>
          </div>
        </div>
      </header>

      <section style={{ marginTop: "16px", padding: "12px", borderRadius: "8px", backgroundColor: C.panel, border: `1px solid ${C.border}` }}>
        <h2 style={{ margin: 0, fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted }}>
          Score ASMODEUS consolidado
        </h2>
        <p style={{ margin: "8px 0 0", fontFamily: "ui-monospace, monospace", fontSize: "28px", fontWeight: 700, color: C.cyan }}>
          {scoreAsm != null ? `${scoreAsm} / 100` : "—"}
        </p>
        <p style={{ margin: "6px 0 0", fontSize: "11px", color: C.muted }}>
          Índice agregado (Aurora / painel) quando disponível no documento.
        </p>
      </section>

      <section style={{ marginTop: "14px" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted }}>
          Matriz — 12 agentes Vertex (Ars Goetia)
        </h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", backgroundColor: C.panel, border: `1px solid ${C.border}` }}>
          <thead>
            <tr style={{ backgroundColor: "#161b22" }}>
              <th style={{ textAlign: "left", padding: "6px", borderBottom: `1px solid ${C.border}`, color: C.muted }}>#</th>
              <th style={{ textAlign: "left", padding: "6px", borderBottom: `1px solid ${C.border}`, color: C.muted }}>Agente</th>
              <th style={{ textAlign: "left", padding: "6px", borderBottom: `1px solid ${C.border}`, color: C.muted }}>Goetia</th>
            </tr>
          </thead>
          <tbody>
            {ASMODEUS_VERTEX_MATRIX.map((row) => (
              <tr key={row.id}>
                <td style={{ padding: "5px 6px", borderBottom: `1px solid ${C.border}`, fontFamily: "ui-monospace, monospace", color: C.cyan }}>
                  {row.id}
                </td>
                <td style={{ padding: "5px 6px", borderBottom: `1px solid ${C.border}`, color: C.ink }}>{row.agente}</td>
                <td style={{ padding: "5px 6px", borderBottom: `1px solid ${C.border}`, color: C.gold }}>{row.goetia}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: "16px", borderTop: `1px solid ${C.border}`, paddingTop: "12px" }}>
        <h2 style={{ margin: "0 0 10px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted }}>
          Findings forenses (F-01 … F-15)
        </h2>
        {findings.length === 0 ? (
          <p style={{ color: C.muted, fontSize: "12px" }}>Nenhum finding indexado neste PDF.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {findings.map((a, idx) => {
              const sevStyle = severityBadgeStyle(a.severidade);
              const code = a.codigo || `F-${String(idx + 1).padStart(2, "0")}`;
              return (
                <li
                  key={`${code}-${idx}`}
                  style={{
                    marginBottom: "10px",
                    padding: "10px",
                    borderRadius: "6px",
                    border: `1px solid ${C.border}`,
                    backgroundColor: "#0d1117",
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                    <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px", fontWeight: 700, color: C.cyan }}>
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
                    <span style={{ fontSize: "10px", color: C.muted }}>{a.tipo}</span>
                  </div>
                  {a.fonte_primaria ? (
                    <p style={{ margin: "6px 0 0", fontSize: "11px", color: C.cyan }}>Fonte primária: {a.fonte_primaria}</p>
                  ) : null}
                  {a.resumo_forense ? (
                    <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#c9d1d9", fontStyle: "italic" }}>
                      Resumo Oráculo: {a.resumo_forense}
                    </p>
                  ) : null}
                  <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", fontSize: "12px", color: C.ink }}>{a.trecho}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "16px", borderTop: `1px solid ${C.border}`, paddingTop: "12px" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted }}>
          Emendas parlamentares (ingestão recente)
        </h2>
        {emendasRows.length === 0 ? (
          <p style={{ color: C.muted, fontSize: "12px" }}>Sem emendas materializadas neste relatório.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", backgroundColor: C.panel, border: `1px solid ${C.border}` }}>
            <thead>
              <tr style={{ backgroundColor: "#161b22" }}>
                {["Ano", "Tipo", "Valor pago", "Destino (município/UF)"].map((h) => (
                  <th
                    key={h}
                    style={{ textAlign: "left", padding: "6px", borderBottom: `1px solid ${C.border}`, color: C.muted }}
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
                const valorExib =
                  row.valor_pago_normalizado != null && row.valor_pago_normalizado > 0
                    ? row.valor_pago_normalizado
                    : row.valor_normalizado;
                const destino = [row.municipio_favorecido, row.uf_favorecido].filter(Boolean).join(" / ") || "—";
                return (
                  <tr key={row.id ?? i}>
                    <td style={{ padding: "5px 6px", borderBottom: `1px solid ${C.border}`, color: C.ink }}>{row.ano ?? "—"}</td>
                    <td style={{ padding: "5px 6px", borderBottom: `1px solid ${C.border}`, color: C.gold }}>{String(tipo)}</td>
                    <td style={{ padding: "5px 6px", borderBottom: `1px solid ${C.border}`, fontFamily: "ui-monospace, monospace", color: C.cyan }}>
                      {fmtBrl(valorExib)}
                    </td>
                    <td style={{ padding: "5px 6px", borderBottom: `1px solid ${C.border}`, color: C.muted }}>{destino}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ marginTop: "16px", borderTop: `1px solid ${C.border}`, paddingTop: "12px" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted }}>
          Atividade legislativa
        </h2>
        <ul style={{ margin: 0, paddingLeft: "18px", color: C.ink, fontSize: "12px" }}>
          <li style={{ marginBottom: "6px" }}>
            Presenças em plenário (proxy KPI): <strong>{presenca != null ? fmtPct(presenca) : "—"}</strong>
          </li>
          <li>
            Projetos de lei (conjunto filtrado / disponível):{" "}
            <strong>{projetosN != null ? String(projetosN) : "—"}</strong>
          </li>
        </ul>
        {top3.length > 0 ? (
          <p style={{ marginTop: "10px", fontSize: "11px", color: C.muted }}>
            Base eleitoral crítica (top 3 municípios no documento socioeconômico) mantida para contexto territorial.
          </p>
        ) : null}
      </section>

      <footer
        style={{
          marginTop: "22mm",
          paddingTop: "12px",
          borderTop: `1px solid ${C.border}`,
          minHeight: "40mm",
        }}
      >
        <p style={{ margin: "0 0 10px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.gold }}>
          Direito de resposta (contraditório)
        </p>
        <p style={{ fontSize: "11px", lineHeight: 1.55, color: C.muted, margin: 0 }}>
          O titular dos dados públicos aqui sintetizados dispõe de até 24 (vinte e quatro) horas, contadas da
          emissão deste PDF, para manifestação prévia por canal oficial da plataforma, anexando documentos
          idôneos que infirmem achados factuais. A ausência de manifestação tempestiva não implica confissão
          nem preclusão de direitos; trata-se de protocolo editorial-operacional da Operação TransparênciaBR.
        </p>
        <p style={{ marginTop: "12px", fontSize: "10px", lineHeight: 1.45, color: "#6e7681" }}>
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
