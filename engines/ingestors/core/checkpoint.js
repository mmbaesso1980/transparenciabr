import { Storage } from "@google-cloud/storage";

const BUCKET_STATE = process.env.DATALAKE_BUCKET_STATE || process.env.DATALAKE_BUCKET_RAW || "transparenciabr-datalake-raw";

/**
 * @param {string} apiId
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function loadCheckpoint(apiId) {
  const storage = new Storage(
    process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT
      ? { projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT }
      : {},
  );
  const bucket = storage.bucket(BUCKET_STATE);
  const key = `checkpoints/${apiId}.json`;
  const [exists] = await bucket.file(key).exists();
  if (!exists) return null;
  const [buf] = await bucket.file(key).download();
  return JSON.parse(buf.toString("utf8"));
}

/**
 * @param {string} apiId
 * @param {Record<string, unknown>} data
 */
export async function saveCheckpoint(apiId, data) {
  const storage = new Storage(
    process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT
      ? { projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT }
      : {},
  );
  const bucket = storage.bucket(BUCKET_STATE);
  const key = `checkpoints/${apiId}.json`;
  await bucket.file(key).save(JSON.stringify(data, null, 2), {
    contentType: "application/json",
    resumable: false,
  });
}
