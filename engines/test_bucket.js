#!/usr/bin/env node
/**
 * Bala traçadora: grava JSON de teste no bucket RAW (Hive partition).
 *
 * Requer: ADC ou GOOGLE_APPLICATION_CREDENTIALS, permissão storage.objects.create no bucket.
 *
 * Uso: node test_bucket.js
 */

import { hivePartitionPath, hivePartitionFromDate } from "./ingestors/base_ingestor.js";
import { uploadJSONToBucket } from "./gcp_storage.js";

const COMANDANTE = process.env.COMANDANTE_DATA_LAKE || "Baesso";

async function main() {
  const part = hivePartitionFromDate();
  const partitionSegment = hivePartitionPath(part);
  const pathDestino = `testes/sistema/${partitionSegment}/ignicao.json`;

  const payload = {
    status: "Data Lake Operacional",
    comandante: COMANDANTE,
    timestamp_utc: new Date().toISOString(),
    esquema_particao: "hive (ano/mes/dia)",
    regiao: "us-central1",
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
      "[test_bucket] Crie o bucket na região us-central1 (ex.: gcloud storage buckets create gs://transparenciabr-datalake-raw --location=us-central1 --uniform-bucket-level-access)",
    );
  }
  process.exit(1);
});
