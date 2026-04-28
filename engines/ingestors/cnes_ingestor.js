#!/usr/bin/env node
/**
 * Robô mineiro CNES — API Dados Abertos do SUS (estabelecimentos).
 *
 * Pagina por UF + offset/limit; grava JSON incremental no GCS (Hive: ano/mes/dia/uf).
 *
 * Variáveis de ambiente:
 *   CNES_BASE_URL     — default: https://apidadosabertos.saude.gov.br/cnes/estabelecimentos
 *   CNES_UF           — sigla(s) separadas por vírgula, ex.: SP,RJ  ou ALL para todas as UFs
 *   CNES_PAGE_SIZE    — pedido de registros por página (default 500; a API pública
 *                        pode impor teto menor — o script continua a paginar até esgotar)
 *   CNES_MAX_PAGES    — limite de páginas por UF (opcional, para testes)
 *   CNES_TIMEOUT_MS   — timeout HTTP (default 120000)
 *   CNES_RETRIES      — tentativas por pedido (default 4)
 *   DATALAKE_BUCKET_RAW — override do bucket
 *   CNES_DRY_RUN      — se "1", não faz upload (só log)
 *
 * Ex.:
 *   CNES_UF=SP node ingestors/cnes_ingestor.js
 *   CNES_UF=ALL CNES_PAGE_SIZE=300 node ingestors/cnes_ingestor.js
 */

import axios from "axios";

import { buildHiveDestinationWithUf, hivePartitionFromDate } from "./base_ingestor.js";
import { uploadJSONToBucket } from "../gcp_storage.js";

const DEFAULT_BASE =
  process.env.CNES_BASE_URL ||
  "https://apidadosabertos.saude.gov.br/cnes/estabelecimentos";

/** IBGE: código UF → sigla (27 UFs). */
const CODIGO_UF_PARA_SIGLA = {
  11: "RO",
  12: "AC",
  13: "AM",
  14: "RR",
  15: "PA",
  16: "AP",
  17: "TO",
  21: "MA",
  22: "PI",
  23: "CE",
  24: "RN",
  25: "PB",
  26: "PE",
  27: "AL",
  28: "SE",
  29: "BA",
  31: "MG",
  32: "ES",
  33: "RJ",
  35: "SP",
  41: "PR",
  42: "SC",
  43: "RS",
  50: "MS",
  51: "MT",
  52: "GO",
  53: "DF",
};

const SIGLA_PARA_CODIGO = Object.fromEntries(
  Object.entries(CODIGO_UF_PARA_SIGLA).map(([c, s]) => [s, Number(c)]),
);

function parseUfList() {
  const raw = (process.env.CNES_UF || "SP").trim();
  if (/^all$/i.test(raw)) {
    return Object.keys(SIGLA_PARA_CODIGO).sort();
  }
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .map((sigla) => {
      const c = SIGLA_PARA_CODIGO[sigla];
      if (c == null) {
        throw new Error(`CNES_UF inválida: ${sigla}`);
      }
      return sigla;
    });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchEstabelecimentos(params, opts) {
  const { timeoutMs, retries } = opts;
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await axios.get(DEFAULT_BASE, {
        params,
        timeout: timeoutMs,
        validateStatus: (s) => s >= 200 && s < 500,
        headers: { Accept: "application/json" },
      });
      if (res.status >= 400) {
        throw new Error(`HTTP ${res.status}: ${String(res.data).slice(0, 200)}`);
      }
      return res.data;
    } catch (e) {
      lastErr = e;
      const wait = Math.min(32000, 1000 * 2 ** attempt);
      console.warn(
        `[cnes] tentativa ${attempt + 1}/${retries} falhou:`,
        e.message || e,
        `→ retry em ${wait}ms`,
      );
      if (attempt < retries - 1) await sleep(wait);
    }
  }
  throw lastErr;
}

async function ingestUf(sigla, opts) {
  const codigoUf = SIGLA_PARA_CODIGO[sigla];
  const {
    pageSize,
    maxPages,
    dataRef,
    timeoutMs,
    retries,
    dryRun,
    prefix,
  } = opts;

  let offset = 0;
  let pageIndex = 0;
  const uris = [];

  while (true) {
    if (maxPages != null && pageIndex >= maxPages) {
      console.info(`[cnes] ${sigla}: limite CNES_MAX_PAGES=${maxPages} atingido.`);
      break;
    }

    const data = await fetchEstabelecimentos(
      {
        codigo_uf: codigoUf,
        limit: pageSize,
        offset,
      },
      { timeoutMs, retries },
    );

    const lista = Array.isArray(data?.estabelecimentos)
      ? data.estabelecimentos
      : [];

    pageIndex += 1;
    const nomeFicheiro = `payload_pag${pageIndex}.json`;
    const pathDestino = buildHiveDestinationWithUf(
      prefix,
      sigla,
      nomeFicheiro,
      dataRef,
    );

    const payload = {
      fonte: "CNES_DATASUS",
      endpoint: DEFAULT_BASE,
      uf: sigla,
      codigo_uf: codigoUf,
      particao_temporal: hivePartitionFromDate(dataRef),
      pagina_indice: pageIndex,
      offset,
      limite_pedido: pageSize,
      registros_n: lista.length,
      coletado_em: new Date().toISOString(),
      estabelecimentos: lista,
    };

    if (dryRun) {
      console.info(
        `[cnes] DRY_RUN ${sigla} página ${pageIndex} → ${pathDestino} (${lista.length} regs)`,
      );
    } else {
      const uri = await uploadJSONToBucket(pathDestino, payload);
      uris.push(uri);
      console.info(`[cnes] ${sigla} página ${pageIndex} → ${uri}`);
    }

    if (lista.length === 0) break;
    if (lista.length < pageSize) break;

    offset += lista.length;
  }

  return uris;
}

async function main() {
  const pageSize = Math.max(
    1,
    Number(process.env.CNES_PAGE_SIZE || 500) || 500,
  );
  const maxPages =
    process.env.CNES_MAX_PAGES != null && String(process.env.CNES_MAX_PAGES).trim() !== ""
      ? Math.max(0, Number(process.env.CNES_MAX_PAGES))
      : null;
  const timeoutMs = Math.max(5000, Number(process.env.CNES_TIMEOUT_MS || 120000) || 120000);
  const retries = Math.max(1, Number(process.env.CNES_RETRIES || 4) || 4);
  const dryRun = process.env.CNES_DRY_RUN === "1" || /^true$/i.test(process.env.CNES_DRY_RUN || "");
  const prefix = (process.env.CNES_GCS_PREFIX || "saude/cnes").replace(/^\/+|\/+$/g, "");
  const dataRef = new Date();

  const ufs = parseUfList();
  console.info(
    `[cnes] Início — UFs=${ufs.join(",")} pageSize=${pageSize} prefix=gs://…/${prefix}/… dryRun=${dryRun}`,
  );

  const allUris = [];
  for (const sigla of ufs) {
    const uris = await ingestUf(sigla, {
      pageSize,
      maxPages,
      dataRef,
      timeoutMs,
      retries,
      dryRun,
      prefix,
    });
    allUris.push(...uris);
  }

  console.info(
    `[cnes] Concluído — ${dryRun ? "0 uploads (dry run)" : `${allUris.length} objeto(s) gravados`}`,
  );
}

main().catch((err) => {
  console.error("[cnes] FALHA:", err.message || err);
  process.exit(1);
});
