/**
 * Cliente Google Cloud Storage — mesmas credenciais que firebase-admin (ADC / GOOGLE_APPLICATION_CREDENTIALS).
 *
 * @see https://cloud.google.com/docs/authentication/application-default-credentials
 */

import { readFile } from "node:fs/promises";
import { Storage } from "@google-cloud/storage";

/** Alvo canónico; override: `DATALAKE_BUCKET_RAW` (ex.: bucket de staging). */
export const BUCKET_RAW =
  process.env.DATALAKE_BUCKET_RAW || "transparenciabr-datalake-raw";

let storageSingleton = null;

function projectId() {
  return (
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT_ID ||
    process.env.GCLOUD_PROJECT_ID ||
    ""
  );
}

export function getStorage() {
  if (storageSingleton) return storageSingleton;
  const pid = projectId();
  storageSingleton = new Storage(pid ? { projectId: pid } : {});
  return storageSingleton;
}

/**
 * Faz upload de um objeto JSON (serializado com JSON.stringify, UTF-8).
 *
 * @param {string} pathDestino - Caminho do objeto no bucket (ex: `fontes/camara/.../x.json`)
 * @param {unknown} objetoJson
 * @param {{ bucket?: string }} [opts]
 * @returns {Promise<string>} URI gs://
 */
export async function uploadJSONToBucket(pathDestino, objetoJson, opts = {}) {
  const bucketName = opts.bucket ?? BUCKET_RAW;
  const storage = getStorage();
  const bucket = storage.bucket(bucketName);
  const dest = String(pathDestino).replace(/^\/+/, "");
  const buf = Buffer.from(JSON.stringify(objetoJson, null, 0), "utf8");
  const file = bucket.file(dest);
  await file.save(buf, {
    contentType: "application/json; charset=utf-8",
    resumable: false,
    metadata: {
      cacheControl: "no-cache",
    },
  });
  return `gs://${bucketName}/${dest}`;
}

/**
 * Faz upload de um ficheiro local (ex: CSV) para o bucket.
 *
 * @param {string} pathDestino
 * @param {string} filePathLocal - Caminho absoluto ou relativo ao cwd
 * @param {{ bucket?: string, contentType?: string }} [opts]
 * @returns {Promise<string>} URI gs://
 */
export async function uploadCSVToBucket(pathDestino, filePathLocal, opts = {}) {
  const bucketName = opts.bucket ?? BUCKET_RAW;
  const storage = getStorage();
  const bucket = storage.bucket(bucketName);
  const dest = String(pathDestino).replace(/^\/+/, "");
  const buf = await readFile(filePathLocal);
  const file = bucket.file(dest);
  const contentType = opts.contentType ?? "text/csv; charset=utf-8";
  await file.save(buf, {
    contentType,
    resumable: buf.length > 5 * 1024 * 1024,
    metadata: {
      cacheControl: "no-cache",
    },
  });
  return `gs://${bucketName}/${dest}`;
}
