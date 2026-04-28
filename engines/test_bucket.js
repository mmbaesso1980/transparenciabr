#!/usr/bin/env node
/**
 * Bala traçadora: grava JSON de teste no bucket RAW (partição Hive por ano).
 *
 * Path canónico (Round 2): `testes/ignicao/ano=2026/teste.json`
 *
 * Requer: ADC ou GOOGLE_APPLICATION_CREDENTIALS, permissão storage.objects.create.
 *
 * Uso:
 *   node test_bucket.js
 *   IGNICAO_ANO=2026 node test_bucket.js
 */

import { buildHiveDestinationYearOnly } from "./ingestors/base_ingestor.js";
import { uploadJSONToBucket } from "./gcp_storage.js";

const IGNICAO_ANO =
  process.env.IGNICAO_ANO != null && String(process.env.IGNICAO_ANO).trim() !== ""
    ? process.env.IGNICAO_ANO
    : new Date().getUTCFullYear();

async function main() {
  const pathDestino = buildHiveDestinationYearOnly(
    "testes/ignicao",
    "teste.json",
    IGNICAO_ANO,
  );

  const payload = {
    status: "Data Lake Operacional",
    motor: "A.S.M.O.D.E.U.S.",
    timestamp_utc: new Date().toISOString(),
    regiao: "us-central1",
    particao: `ano=${IGNICAO_ANO}`,
  };

  const uri = await uploadJSONToBucket(pathDestino, payload);
  console.info(`[test_bucket] OK enviado: ${uri}`);
}

main().catch((err) => {
  console.error("[test_bucket] FALHA:", err.message || err);
  if (
    String(err.message || "").includes("does not exist") ||
    String(err.code) === "404"
  ) {
    console.error(
      "[test_bucket] Crie o bucket em us-central1, ex.: gcloud storage buckets create gs://transparenciabr-datalake-raw --location=us-central1 --uniform-bucket-level-access",
    );
  }
  process.exit(1);
});
