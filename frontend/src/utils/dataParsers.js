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

/** Achados Agente 12 — despesa CEAP × rastro público / mídia oficial. */
export function pickOsintCeapCrossItems(record) {
  if (!record || typeof record !== "object") return [];
  const wrap =
    record.osint_ceap_cross ??
    record.radar_osint_ceap ??
    record.osint_radar_ceap ??
    record.osint?.cruzamento_ceap;

  if (Array.isArray(wrap)) return wrap;

  const nested =
    wrap?.itens ??
    wrap?.items ??
    wrap?.achados ??
    record.ceap_osint_achados;
  return Array.isArray(nested) ? nested : [];
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

/** Evita mixed content: fotos da Câmara em HTTP → HTTPS no mesmo host. */
export function upgradeCamaraPhotoToHttps(url) {
  if (!url || typeof url !== "string") return "";
  const t = url.trim();
  if (!t) return "";
  if (t.startsWith("https://")) return t;
  if (t.startsWith("http://www.camara.leg.br")) {
    return `https://www.camara.leg.br${t.slice("http://www.camara.leg.br".length)}`;
  }
  if (t.startsWith("http://")) {
    try {
      const parsed = new URL(t);
      if (parsed.hostname.endsWith("camara.leg.br")) {
        return `https://${parsed.host}${parsed.pathname}${parsed.search}`;
      }
    } catch {
      /* ignore */
    }
  }
  return t;
}

export function pickPhotoUrl(data) {
  if (!data || typeof data !== "object") return "";
  const u =
    data.foto_url ??
    data.url_foto ??
    data.urlFoto ??
    data.UrlFoto ??
    data.foto ??
    data.imagem_url ??
    data.imagem;
  const raw = typeof u === "string" ? u.trim() : "";
  return upgradeCamaraPhotoToHttps(raw);
}

export function absolutizeMediaUrl(u) {
  if (!u || typeof u !== "string") return undefined;
  const upgraded = upgradeCamaraPhotoToHttps(u);
  if (upgraded.startsWith("http://") || upgraded.startsWith("https://")) {
    return upgraded;
  }
  if (typeof window === "undefined") return upgraded;
  if (upgraded.startsWith("/")) return `${window.location.origin}${upgraded}`;
  return `${window.location.origin}/${upgraded}`;
}

export function pickInvestigations(data) {
  if (!data || typeof data !== "object") return [];
  const raw =
    data.investigacoes_top ?? data.top_investigacoes ?? data.investigacoes;
  return Array.isArray(raw) ? raw : [];
}

/** Evita `[object Object]` quando motores gravam objeto em titulo/foco. */
export function scalarToDisplay(value, fallback = "—") {
  if (value == null || value === "") return fallback;
  if (typeof value === "string") {
    const t = value.trim();
    return t || fallback;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") return value ? "sim" : "não";
  if (typeof value === "object") {
    const o = /** @type {Record<string, unknown>} */ (value);
    const nested =
      o.label ??
      o.titulo ??
      o.nome ??
      o.texto ??
      o.descricao ??
      o.valor ??
      o.ref;
    if (nested != null && nested !== value) {
      const s = scalarToDisplay(nested, "");
      if (s && s !== "—") return s;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
  return String(value);
}

/**
 * Pontuação heurística para ordenar “despesas mais suspeitas” (CEAP / contratos).
 */
function suspicionScoreFromRow(row, valor) {
  const z = Number(row.zscore ?? row.z_score ?? row.score_z ?? row.desvio_padrao);
  if (Number.isFinite(z)) return Math.abs(z) * 10 + valor / 1e6;
  const idx = Number(row.indice_risco ?? row.indice_suspeita ?? row.score);
  if (Number.isFinite(idx)) return idx * 5 + valor / 1e6;
  const flag = row.flagged === true || row.alertado === true || row.suspeito === true;
  if (flag) return 100 + valor / 1e6;
  return valor;
}

export function normalizeInvestigationRow(row, idx) {
  if (!row || typeof row !== "object") return null;
  const ref =
    row.ref ?? row.codigo ?? row.id ?? String(idx + 1).padStart(4, "0");
  const tituloRaw =
    row.titulo ?? row.nome ?? row.descricao ?? row.objeto ?? "—";
  const focoRaw = row.foco ?? row.tipo ?? row.tema ?? "";
  const titulo = scalarToDisplay(tituloRaw, "—");
  const foco = scalarToDisplay(focoRaw, "");
  const valor = Number(row.valor ?? row.gasto_total ?? row.valor_aprovado ?? row.valor_documento);
  const teto = Number(row.teto ?? row.limite ?? row.teto_orcamento);
  let progressPct = null;
  if (Number.isFinite(valor) && Number.isFinite(teto) && teto > 0) {
    progressPct = Math.min(100, Math.max(0, (valor / teto) * 100));
  } else {
    const p = Number(row.percentual ?? row.exposicao ?? row.score);
    if (Number.isFinite(p)) progressPct = Math.min(100, Math.max(0, p));
  }
  const rawValue = Number.isFinite(valor) ? valor : 0;
  const suspicionScore = suspicionScoreFromRow(row, rawValue);
  const urlRaw = row.urlDocumento ?? row.url_documento ?? row.url ?? "";
  const urlDocumento =
    typeof urlRaw === "string"
      ? urlRaw.trim()
      : typeof urlRaw === "object" && urlRaw && "href" in urlRaw
        ? String(/** @type {{ href?: string }} */ (urlRaw).href || "")
        : "";

  return {
    ref: String(ref),
    titulo,
    foco,
    rawValue,
    suspicionScore,
    urlDocumento,
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

/**
 * Linhas do motor Node (`despesas_ceap_catalogo` em `investigacao_prisma_ceap`).
 * Alinha-se aos campos da API da Câmara e aos aliases gravados pelo ceap_motor.js.
 */
export function normalizeDespesaCatalogoRow(row, idx) {
  if (!row || typeof row !== "object") return null;
  const num = String(
    row.numero_documento ??
      row.numeroDocumento ??
      row.numDocumento ??
      "",
  ).trim();
  const ordem = row.ordem_api;
  const ref =
    num ||
    (ordem != null && String(ordem) !== ""
      ? `CEAP-${ordem}`
      : `CEAP-CAT-${idx + 1}`);
  const nome = String(
    row.nome_fornecedor ?? row.nomeFornecedor ?? row.txtFornecedor ?? "",
  ).trim();
  const titulo = nome || "Fornecedor não informado";
  const data = String(
    row.data_documento ??
      row.dataDocumento ??
      row.dataEmissao ??
      row.data_emissao ??
      "",
  ).slice(0, 10);
  const tipo = String(row.tipo_despesa ?? row.tipoDespesa ?? "").trim();
  const foco = [data, tipo].filter(Boolean).join(" · ");
  const valor = Number(
    row.valor_liquido ??
      row.vlrLiquido ??
      row.valorLiquido ??
      row.valorDocumento ??
      row.valor ??
      0,
  );
  const rawValue = Number.isFinite(valor) ? valor : 0;
  const urlRaw =
    row.url_documento_oficial ??
    row.urlDocumento ??
    row.url_documento ??
    row.url ??
    "";
  const urlDocumento = typeof urlRaw === "string" ? urlRaw.trim() : "";

  return {
    ref: String(ref),
    titulo,
    foco,
    rawValue,
    suspicionScore: suspicionScoreFromRow(row, rawValue),
    urlDocumento,
    progressPct: null,
    valorLabel:
      rawValue > 0
        ? rawValue.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : null,
    /** Ordenação: mais recente primeiro, depois maior valor (uso interno; removido no merge). */
    catalogSortDate: data || "0000-00-00",
  };
}

/** Linhas agregadas em `historico_ceap` (BigQuery → Firestore). */
export function normalizeCeapHistoricoRow(row, idx) {
  if (!row || typeof row !== "object") return null;
  const ref = row.ref ?? row.numero_documento ?? row.codigo ?? `CEAP-${idx + 1}`;
  const titulo =
    scalarToDisplay(row.tipo_despesa ?? row.titulo ?? row.descricao, "Despesa CEAP") ||
    "Despesa CEAP";
  const focoParts = [
    scalarToDisplay(row.cnpj_fornecedor, ""),
    row.data_emissao ? String(row.data_emissao) : "",
  ].filter(Boolean);
  const foco = focoParts.join(" · ");
  const valor = Number(row.valor_documento ?? row.valor ?? 0);
  const rawValue = Number.isFinite(valor) ? valor : 0;
  const urlRaw = row.url_documento ?? row.urlDocumento ?? row.url ?? "";
  const urlDocumento = typeof urlRaw === "string" ? urlRaw.trim() : "";

  return {
    ref: String(ref),
    titulo,
    foco,
    rawValue,
    suspicionScore: suspicionScoreFromRow(row, rawValue),
    urlDocumento,
    progressPct: null,
    valorLabel:
      rawValue > 0
        ? rawValue.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
            maximumFractionDigits: 0,
          })
        : null,
  };
}

function byRefDedupeMerge(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!r) continue;
    const prev = map.get(r.ref);
    if (!prev) {
      map.set(r.ref, r);
      continue;
    }
    const keep =
      r.rawValue > prev.rawValue ||
      (r.urlDocumento && !prev.urlDocumento) ||
      r.suspicionScore > prev.suspicionScore
        ? r
        : prev;
    const drop = keep === r ? prev : r;
    const hasDateKeep = keep.catalogSortDate != null && keep.catalogSortDate !== "";
    const hasDateDrop = drop.catalogSortDate != null && drop.catalogSortDate !== "";
    let cs = undefined;
    if (hasDateKeep && hasDateDrop) {
      cs =
        String(keep.catalogSortDate) >= String(drop.catalogSortDate)
          ? keep.catalogSortDate
          : drop.catalogSortDate;
    } else if (hasDateKeep) cs = keep.catalogSortDate;
    else if (hasDateDrop) cs = drop.catalogSortDate;
    map.set(r.ref, {
      ...drop,
      ...keep,
      rawValue: Math.max(prev.rawValue, r.rawValue),
      suspicionScore: Math.max(prev.suspicionScore, r.suspicionScore),
      urlDocumento: keep.urlDocumento || drop.urlDocumento || "",
      valorLabel:
        keep.rawValue >= drop.rawValue ? keep.valorLabel : drop.valorLabel,
      foco: String(keep.foco).length >= String(drop.foco).length ? keep.foco : drop.foco,
      ...(cs !== undefined ? { catalogSortDate: cs } : {}),
    });
  }
  return [...map.values()];
}

/**
 * Une `investigacoes_top` e `historico_ceap`, deduplica por ref, ordena por relevância/suspeita.
 */
export function mergeCeapInvestigationRows(record) {
  if (!record || typeof record !== "object") return [];

  const fromTop = pickInvestigations(record)
    .map((r, i) => normalizeInvestigationRow(r, i))
    .filter(Boolean);

  const hist = Array.isArray(record.historico_ceap) ? record.historico_ceap : [];
  const fromHist = hist
    .map((r, i) => normalizeCeapHistoricoRow(r, i))
    .filter(Boolean);

  const rawCat = record.investigacao_prisma_ceap?.despesas_ceap_catalogo;
  const fromCatalog = Array.isArray(rawCat)
    ? rawCat.map((r, i) => normalizeDespesaCatalogoRow(r, i)).filter(Boolean)
    : [];

  /** Com catálogo real do motor CEAP, substitui linhas legadas / mocks do painel Monitor. */
  if (fromCatalog.length > 0) {
    const merged = byRefDedupeMerge(fromCatalog);
    merged.sort((a, b) => {
      const db = String(b.catalogSortDate ?? "");
      const da = String(a.catalogSortDate ?? "");
      if (db !== da) return db.localeCompare(da);
      return b.rawValue - a.rawValue;
    });
    return merged.map(({ catalogSortDate: _d, ...rest }) => rest);
  }

  const merged = byRefDedupeMerge([...fromHist, ...fromTop]);
  merged.sort((a, b) => {
    const sa = b.suspicionScore - a.suspicionScore;
    if (Math.abs(sa) > 1e-6) return sa;
    return b.rawValue - a.rawValue;
  });
  return merged;
}

export function pickUf(data) {
  if (!data || typeof data !== "object") return "";
  const u = data.uf ?? data.sigla_uf ?? data.siglaUf ?? data.UF ?? data.estado;
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
  const trechoRaw =
    row.mensagem ??
    row.texto ??
    row.justificativa ??
    row.resumo ??
    row.trecho ??
    "—";
  const severidade = row.severidade ?? row.nivel ?? row.gravidade ?? "";
  return {
    tipo: scalarToDisplay(tipo, "Classificação"),
    trecho: scalarToDisplay(trechoRaw, "—"),
    severidade: scalarToDisplay(severidade, ""),
  };
}
