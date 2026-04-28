import { forwardRef, useMemo } from "react";

import {
  pickContextoSocioeconomicoRows,
  pickNome,
  pickRiskScore,
  pickUf,
} from "../../utils/dataParsers.js";

/** Estilos só inline (hex/rgb) — html2canvas não interpreta oklch do Tailwind v4. */
const C = {
  ink: "#0d1117",
  muted: "#57606a",
  border: "#d0d7de",
  softBg: "#f6f8fa",
  white: "#ffffff",
};

function fmtBrl(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function fmtInt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function fmtIdh(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function firstFiniteNumber(source, keys) {
  if (!source || typeof source !== "object") return null;
  for (const k of keys) {
    const n = Number(source[k]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function sumMunicipioEmendas(politico) {
  const raw = politico?.contexto_socioeconomico?.municipios;
  if (!Array.isArray(raw)) return null;
  let s = 0;
  let any = false;
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const v = Number(
      m.total_emendas_valor ??
        m.total_valor_emendas ??
        m.valor_total ??
        m.total_emendas ??
        m.total_gasto_municipio,
    );
    if (Number.isFinite(v)) {
      s += v;
      any = true;
    }
  }
  return any ? s : null;
}

function pickPartido(politico) {
  if (!politico || typeof politico !== "object") return "—";
  const v =
    politico.siglaPartido ??
    politico.partido ??
    politico.sigla_partido ??
    politico.siglaPartidoParlamentar;
  return typeof v === "string" && v.trim() ? v.trim() : "—";
}

function pickCargo(politico) {
  if (!politico || typeof politico !== "object") return "—";
  const v = politico.cargo ?? politico.cargo_parlamentar;
  return typeof v === "string" && v.trim() ? v.trim() : "—";
}

function pickFinancialBlock(politico) {
  const totalEmendas =
    firstFiniteNumber(politico, [
      "total_emendas_valor",
      "total_valor_emendas",
      "valor_total_emendas",
      "soma_emendas",
      "total_emendas",
    ]) ?? sumMunicipioEmendas(politico);

  const totalCeap =
    firstFiniteNumber(politico, [
      "total_ceap",
      "ceap_total",
      "gasto_ceap_total",
      "valor_total_ceap",
      "ceap_valor_total",
    ]) ??
    firstFiniteNumber(politico?.resumo_ceap, [
      "total",
      "valor_total",
      "soma",
    ]) ??
    firstFiniteNumber(politico?.resumo_financeiro, [
      "total_ceap",
      "ceap",
    ]);

  const custoMedioMensal =
    firstFiniteNumber(politico, [
      "ceap_custo_medio_mensal",
      "custo_medio_mensal_ceap",
      "custo_medio_mensal",
      "media_mensal_ceap",
    ]) ?? firstFiniteNumber(politico?.resumo_ceap, ["media_mensal", "custo_medio"]);

  return {
    totalEmendas,
    totalCeap,
    custoMedioMensal,
  };
}

function severityHigh(severidade) {
  const s = String(severidade ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return s === "alta" || s === "critica";
}

/**
 * Captura html2pdf — sem classes Tailwind (evita oklch no canvas).
 */
const DossiePDFContent = forwardRef(function DossiePDFContent(
  { politico, alertas },
  ref,
) {
  const nome = pickNome(politico) || "—";
  const cargo = pickCargo(politico);
  const partido = pickPartido(politico);
  const uf = pickUf(politico) || "—";
  const risk = pickRiskScore(politico);
  const geradoEm = useMemo(
    () =>
      new Date().toLocaleString("pt-BR", {
        dateStyle: "long",
        timeStyle: "short",
      }),
    [],
  );

  const top3 = useMemo(() => {
    const rows = pickContextoSocioeconomicoRows(politico);
    return rows.slice(0, 3);
  }, [politico]);

  const finance = useMemo(() => pickFinancialBlock(politico), [politico]);
  const listAlertas = Array.isArray(alertas) ? alertas : [];

  const wrap = {
    boxSizing: "border-box",
    width: "210mm",
    minHeight: "297mm",
    padding: "14mm",
    backgroundColor: C.white,
    color: C.ink,
    fontFamily: '"Inter", system-ui, sans-serif',
    fontSize: "15px",
    lineHeight: 1.55,
    WebkitFontSmoothing: "antialiased",
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
      <header style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: "16px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px",
          }}
        >
          <div>
            <p
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: C.ink,
                margin: 0,
              }}
            >
              Motor Forense TransparênciaBR
            </p>
            <p style={{ fontSize: "13px", color: C.muted, margin: "4px 0 0" }}>
              TransparênciaBR · Dossiê forense
            </p>
          </div>
          <div style={{ textAlign: "right", fontSize: "13px", color: C.muted }}>
            Emissão
            <br />
            <span style={{ fontFamily: "ui-monospace, monospace", color: C.ink }}>
              {geradoEm}
            </span>
          </div>
        </div>
        <h1
          style={{
            marginTop: "20px",
            fontSize: "28px",
            fontWeight: 700,
            lineHeight: 1.2,
            color: C.ink,
            letterSpacing: "-0.02em",
          }}
        >
          {nome}
        </h1>
        <p style={{ marginTop: "8px", fontSize: "17px", color: "#24292f" }}>
          <span style={{ fontWeight: 600 }}>{cargo}</span>
          <span style={{ color: "#8c959f" }}> · </span>
          <span>{partido}</span>
          <span style={{ color: "#8c959f" }}> · </span>
          <span style={{ fontFamily: "ui-monospace, monospace" }}>{uf}</span>
        </p>
      </header>

      <section style={{ marginTop: "22px", borderBottom: `1px solid ${C.border}`, paddingBottom: "18px" }}>
        <h2
          style={{
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: C.muted,
            margin: 0,
          }}
        >
          Índice de exposição
        </h2>
        <p
          style={{
            marginTop: "12px",
            fontFamily: "ui-monospace, monospace",
            fontSize: "36px",
            fontWeight: 600,
            color: C.ink,
          }}
        >
          {risk != null && Number.isFinite(Number(risk))
            ? `${Math.round(Number(risk))} / 100`
            : "—"}
        </p>
        <p style={{ marginTop: "6px", fontSize: "14px", color: C.muted }}>
          Risk score agregado (painel).
        </p>
      </section>

      <section style={{ marginTop: "22px", borderBottom: `1px solid ${C.border}`, paddingBottom: "18px" }}>
        <h2
          style={{
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: C.muted,
            margin: 0,
          }}
        >
          Seção 1 · Resumo financeiro
        </h2>
        <ul style={{ marginTop: "14px", padding: 0, listStyle: "none" }}>
          <li
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
              borderBottom: `1px solid #eaeef2`,
              paddingBottom: "10px",
              marginBottom: "10px",
              fontFamily: "ui-monospace, monospace",
              fontSize: "15px",
            }}
          >
            <span style={{ color: C.muted }}>Total de emendas (agreg.)</span>
            <span style={{ fontWeight: 600, color: C.ink }}>
              {finance.totalEmendas != null ? fmtBrl(finance.totalEmendas) : "—"}
            </span>
          </li>
          <li
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
              borderBottom: `1px solid #eaeef2`,
              paddingBottom: "10px",
              marginBottom: "10px",
              fontFamily: "ui-monospace, monospace",
              fontSize: "15px",
            }}
          >
            <span style={{ color: C.muted }}>Total CEAP</span>
            <span style={{ fontWeight: 600, color: C.ink }}>
              {finance.totalCeap != null ? fmtBrl(finance.totalCeap) : "—"}
            </span>
          </li>
          <li
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
              fontFamily: "ui-monospace, monospace",
              fontSize: "15px",
            }}
          >
            <span style={{ color: C.muted }}>Custo médio mensal (CEAP)</span>
            <span style={{ fontWeight: 600, color: C.ink }}>
              {finance.custoMedioMensal != null
                ? fmtBrl(finance.custoMedioMensal)
                : "—"}
            </span>
          </li>
        </ul>
      </section>

      <section style={{ marginTop: "22px", borderBottom: `1px solid ${C.border}`, paddingBottom: "18px" }}>
        <h2
          style={{
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: C.muted,
            margin: 0,
          }}
        >
          Seção 2 · Base eleitoral crítica (top 3)
        </h2>
        {top3.length === 0 ? (
          <p style={{ marginTop: "12px", fontSize: "14px", color: C.muted }}>
            Sem municípios rankeados neste documento.
          </p>
        ) : (
          <ol style={{ marginTop: "14px", paddingLeft: "22px" }}>
            {top3.map((m) => (
              <li key={m.codigo_ibge_municipio} style={{ marginBottom: "14px" }}>
                <p style={{ fontWeight: 600, fontSize: "16px", color: C.ink, margin: 0 }}>
                  {m.nome_municipio}{" "}
                  <span
                    style={{
                      fontFamily: "ui-monospace, monospace",
                      fontSize: "14px",
                      fontWeight: 400,
                      color: C.muted,
                    }}
                  >
                    ({m.uf})
                  </span>
                </p>
                <div
                  style={{
                    marginTop: "6px",
                    fontFamily: "ui-monospace, monospace",
                    fontSize: "14px",
                    color: "#24292f",
                  }}
                >
                  <p style={{ margin: "2px 0" }}>
                    Emendas:{" "}
                    <span style={{ fontWeight: 600 }}>{fmtBrl(m.total_emendas_valor)}</span>
                  </p>
                  <p style={{ margin: "2px 0" }}>
                    IDH: <span style={{ fontWeight: 600 }}>{fmtIdh(m.idh_municipal)}</span> · Pop.:{" "}
                    {fmtInt(m.populacao)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section style={{ marginTop: "22px", borderBottom: `1px solid ${C.border}`, paddingBottom: "18px" }}>
        <h2
          style={{
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: C.muted,
            margin: 0,
          }}
        >
          Seção 3 · Alertas forenses (motor preditivo)
        </h2>
        {listAlertas.length === 0 ? (
          <p style={{ marginTop: "12px", fontSize: "14px", color: C.muted }}>
            Nenhum alerta incorporado neste relatório.
          </p>
        ) : (
          <ul style={{ marginTop: "14px", padding: 0, listStyle: "none" }}>
            {listAlertas.map((a, idx) => {
              const warn = severityHigh(a.severidade);
              return (
                <li
                  key={`${a.tipo}-${idx}`}
                  style={{
                    borderRadius: "8px",
                    border: `1px solid ${C.border}`,
                    backgroundColor: C.softBg,
                    padding: "14px",
                    marginBottom: "12px",
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "baseline" }}>
                    {warn ? <span aria-hidden="true">⚠️</span> : null}
                    <span
                      style={{
                        fontFamily: "ui-monospace, monospace",
                        fontSize: "12px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: C.ink,
                      }}
                    >
                      {a.tipo}
                    </span>
                    {a.severidade ? (
                      <span
                        style={{
                          fontFamily: "ui-monospace, monospace",
                          fontSize: "11px",
                          textTransform: "uppercase",
                          backgroundColor: C.white,
                          padding: "2px 8px",
                          borderRadius: "4px",
                          color: "#424a53",
                        }}
                      >
                        {a.severidade}
                      </span>
                    ) : null}
                  </div>
                  <p
                    style={{
                      marginTop: "10px",
                      whiteSpace: "pre-wrap",
                      fontSize: "15px",
                      lineHeight: 1.55,
                      color: "#1f2328",
                    }}
                  >
                    {a.trecho}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer style={{ marginTop: "28px", borderTop: `1px solid ${C.border}`, paddingTop: "14px" }}>
        <p style={{ fontSize: "12px", lineHeight: 1.5, color: "#6e7781", margin: 0 }}>
          Documento gerado automaticamente a partir de dados públicos (Câmara dos Deputados, Senado
          Federal, Portal da Transparência, TCU e outras fontes oficiais agregadas pela plataforma).
          Não substitui procedimentos jurídicos nem possui valor legal punitivo; trata-se de síntese
          informativa para análise.
        </p>
      </footer>
    </div>
  );
});

export default DossiePDFContent;
