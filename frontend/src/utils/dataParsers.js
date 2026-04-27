/** Sigla / nome curto do partido para cabeçalhos do dossiê. */
export function pickPartidoSigla(data) {
  if (!data || typeof data !== "object") return "";
  const v =
    data.sigla_partido ??
    data.partido_sigla ??
    data.siglaPartido ??
    data.partido ??
    data.sigla ??
    "";
  return typeof v === "string" ? v.trim().slice(0, 24) : "";
}

export function pickNome(data) {
  if (!data || typeof data !== "object") return "";
  const v =
    data.nome ?? data.nome_completo ?? data.apelido_publico ?? data.apelido;
  return typeof v === "string" ? v.trim() : "";
}

export function pickGraphPayload(data) {
  if (!data || typeof data !== "object") return null;
  const g =
    data.grafo_rede ??
    data.rede_entidades ??
    data.graph_network ??
    data.network_graph ??
    data.grafo;
  return g && typeof g === "object" ? g : null;
}

export function pickRiskScore(data) {
  if (!data || typeof data !== "object") return null;
  const keys = [
    "score_forense",
    "indice_forense",
    "indice_exposicao_forense",
    "indice_risco",
    "score_exposicao",
    "risk_score",
    "score",
    "indice_benford",
    "risco_estatistico",
    "indice_correlacao_idh",
    "score_correlacao_socioeconomica",
    "indice_correlacao_gastos_idh",
  ];
  for (const k of keys) {
    const n = Number(data[k]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Malha CNES × PNCP (Operação DRACULA) — objeto ou ausência. */
export function pickMalhaSaude(record) {
  if (!record || typeof record !== "object") return null;
  const m = record.malha_saude ?? record.malhaSaude;
  if (!m || typeof m !== "object") return null;
  return Object.keys(m).length ? m : null;
}

/** Radar comercial agregado (motor PCA / snapshot Firestore). */
export function pickOportunidadesMercado(record) {
  if (!record || typeof record !== "object") return null;
  const raw =
    record.oportunidades_mercado ??
    record.oportunidadesMercado ??
    record.commercial_opportunities;
  if (!raw || typeof raw !== "object") return null;
  const municipios = Array.isArray(raw.municipios) ? raw.municipios : [];
  return {
    ...raw,
    municipios,
    rotulo_ui:
      typeof raw.rotulo_ui === "string"
        ? raw.rotulo_ui
        : "Oportunidades de Mercado",
  };
}

/** Emendas em lista plana ou agregadas por ano (motores Python / LOA). */
export function pickEmendasParlamentares(record) {
  if (!record || typeof record !== "object") return [];
  const raw =
    record.emendas_parlamentares ??
    record.emendas ??
    record.emendas_orcamento ??
    [];

  if (Array.isArray(raw)) return raw;

  if (raw && typeof raw === "object") {
    const rows = [];
    for (const [k, v] of Object.entries(raw)) {
      if (/^\d{4}$/.test(k) && Array.isArray(v)) {
        rows.push(...v);
      } else if (Array.isArray(v)) {
        rows.push(...v);
      }
    }
    return rows;
  }

  return [];
}

/** Eixo político (Bússola) — sempre objeto para leitura segura. */
export function pickEspectroPolitico(record) {
  if (!record || typeof record !== "object") return {};
  const e = record.espectro_politico ?? record.espectroPolitico;
  return e && typeof e === "object" ? e : {};
}

/**
 * Vista unificada do parlamentar para o dossiê — campos reconhecidos pelos motores EL.
 */
export function enrichPoliticoRecord(record) {
  if (!record || typeof record !== "object") return null;
  const emendas = pickEmendasParlamentares(record);
  const om = pickOportunidadesMercado(record);
  const malha = pickMalhaSaude(record);
  const espFlat = pickEspectroPolitico(record);

  const out = { ...record };

  if (malha != null) out.malha_saude = malha;
  if (om != null) out.oportunidades_mercado = om;
  if (emendas.length > 0) out.emendas_parlamentares = emendas;

  const prevEsp =
    record.espectro_politico && typeof record.espectro_politico === "object"
      ? record.espectro_politico
      : {};
  if (Object.keys(espFlat).length > 0 || Object.keys(prevEsp).length > 0) {
    out.espectro_politico = { ...prevEsp, ...espFlat };
  }

  return out;
}

export function pickPhotoUrl(data) {
  if (!data || typeof data !== "object") return "";
  const u =
    data.foto_url ??
    data.url_foto ??
    data.foto ??
    data.imagem_url ??
    data.imagem;
  return typeof u === "string" ? u.trim() : "";
}

export function absolutizeMediaUrl(u) {
  if (!u || typeof u !== "string") return undefined;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (typeof window === "undefined") return u;
  if (u.startsWith("/")) return `${window.location.origin}${u}`;
  return `${window.location.origin}/${u}`;
}

export function pickInvestigations(data) {
  if (!data || typeof data !== "object") return [];
  const raw =
    data.investigacoes_top ?? data.top_investigacoes ?? data.investigacoes;
  return Array.isArray(raw) ? raw : [];
}

export function normalizeInvestigationRow(row, idx) {
  if (!row || typeof row !== "object") return null;
  const ref =
    row.ref ?? row.codigo ?? row.id ?? String(idx + 1).padStart(4, "0");
  const titulo =
    row.titulo ?? row.nome ?? row.descricao ?? row.objeto ?? "—";
  const foco = row.foco ?? row.tipo ?? row.tema ?? "";
  const valor = Number(row.valor ?? row.gasto_total ?? row.valor_aprovado);
  const teto = Number(row.teto ?? row.limite ?? row.teto_orcamento);
  let progressPct = null;
  if (Number.isFinite(valor) && Number.isFinite(teto) && teto > 0) {
    progressPct = Math.min(100, Math.max(0, (valor / teto) * 100));
  } else {
    const p = Number(row.percentual ?? row.exposicao ?? row.score);
    if (Number.isFinite(p)) progressPct = Math.min(100, Math.max(0, p));
  }
  return {
    ref: String(ref),
    titulo: String(titulo),
    foco: String(foco),
    rawValue: Number.isFinite(valor) ? valor : 0,
    urlDocumento: row.urlDocumento ?? row.url_documento ?? row.url ?? "",
    progressPct,
    valorLabel:
      Number.isFinite(valor) && valor > 0
        ? valor.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
            maximumFractionDigits: 0,
          })
        : null,
  };
}

export function pickUf(data) {
  if (!data || typeof data !== "object") return "";
  const u = data.uf ?? data.sigla_uf ?? data.UF ?? data.estado;
  if (typeof u !== "string") return "";
  const t = u.trim().toUpperCase();
  return t.length >= 2 ? t.slice(0, 2) : "";
}

/**
 * Linhas pré-agregadas para o painel socioeconómico (uma leitura do doc `politicos`).
 * Formato esperado do sync BQ→Firestore:
 * `contexto_socioeconomico: { municipios: [...], fonte?, atualizado_em? }`
 */
export function pickContextoSocioeconomicoRows(record) {
  if (!record || typeof record !== "object") return [];
  const wrap = record.contexto_socioeconomico;
  let raw =
    wrap?.municipios ??
    record.contexto_base_eleitoral?.municipios ??
    record.indicadores_municipios_alvo;

  if (!Array.isArray(raw)) return [];

  const rows = raw
    .map((r) => {
      if (!r || typeof r !== "object") return null;
      const codigo =
        r.codigo_ibge_municipio ??
        r.id_municipio ??
        r.codigo_ibge ??
        r.ibge;
      const nome =
        r.nome_municipio ??
        r.municipio_nome ??
        r.nome ??
        "";
      const uf = String(r.uf ?? r.sigla_uf ?? "").trim().toUpperCase().slice(0, 2);
      const total =
        Number(
          r.total_emendas_valor ??
            r.total_valor_emendas ??
            r.valor_total ??
            r.total_gasto_municipio,
        ) || 0;
      const pop =
        r.populacao != null ? Number(r.populacao) : Number(r.populacao_ibge);
      const idh =
        r.idh_municipal != null ? Number(r.idh_municipal) : Number(r.idhm);
      const ideb =
        r.ideb_anos_finais != null
          ? Number(r.ideb_anos_finais)
          : Number(r.ideb);
      const esgoto =
        r.indice_atendimento_esgoto != null
          ? Number(r.indice_atendimento_esgoto)
          : Number(r.indice_esgoto);
      const leitos =
        r.leitos_por_habitante != null
          ? Number(r.leitos_por_habitante)
          : Number(r.leitos_per_capita);

      if (!codigo || String(codigo).trim() === "") return null;

      return {
        codigo_ibge_municipio: String(codigo).trim(),
        nome_municipio: String(nome || `Município ${codigo}`),
        uf: uf || "—",
        total_emendas_valor: total,
        populacao: Number.isFinite(pop) ? pop : null,
        idh_municipal: Number.isFinite(idh) ? idh : null,
        ideb_anos_finais: Number.isFinite(ideb) ? ideb : null,
        indice_atendimento_esgoto: Number.isFinite(esgoto) ? esgoto : null,
        leitos_por_habitante: Number.isFinite(leitos) ? leitos : null,
      };
    })
    .filter(Boolean);

  rows.sort((a, b) => (b.total_emendas_valor || 0) - (a.total_emendas_valor || 0));
  return rows.slice(0, 40);
}

export function normalizeAlertRow(row) {
  if (!row || typeof row !== "object") return null;
  const tipo = row.tipo ?? row.tipo_risco ?? row.categoria ?? "Classificação";
  const trecho =
    row.mensagem ??
    row.texto ??
    row.justificativa ??
    row.resumo ??
    row.trecho ??
    "—";
  const severidade = row.severidade ?? row.nivel ?? row.gravidade ?? "";
  return {
    tipo: String(tipo),
    trecho: String(trecho),
    severidade: String(severidade),
  };
}
