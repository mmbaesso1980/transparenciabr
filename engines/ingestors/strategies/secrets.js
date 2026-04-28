import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

let smClient = null;

function getClient() {
  if (!smClient) smClient = new SecretManagerServiceClient();
  return smClient;
}

const cache = new Map();

export async function resolveSecret(envVar, secretResourceName) {
  const cacheKey = `${envVar}::${secretResourceName || ""}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  if (secretResourceName) {
    try {
      const name = secretResourceName.includes("/versions/")
        ? secretResourceName
        : `${secretResourceName}/versions/latest`;
      const [v] = await getClient().accessSecretVersion({ name });
      const s = v.payload?.data?.toString("utf8") ?? "";
      if (s) {
        cache.set(cacheKey, s.trim());
        return cache.get(cacheKey);
      }
    } catch {
      /* env fallback */
    }
  }

  const fromEnv = process.env[envVar];
  if (!fromEnv) {
    throw new Error(`Missing secret: env ${envVar}`);
  }
  cache.set(cacheKey, fromEnv);
  return fromEnv;
}
