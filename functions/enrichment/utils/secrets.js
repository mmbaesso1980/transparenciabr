'use strict';

const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const client = new SecretManagerServiceClient();
const cache = new Map();
const PROJECT = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'transparenciabr';

async function getSecret(name) {
  if (cache.has(name)) return cache.get(name);
  try {
    const [v] = await client.accessSecretVersion({
      name: `projects/${PROJECT}/secrets/${name}/versions/latest`,
    });
    const val = v.payload?.data?.toString('utf8') ?? null;
    cache.set(name, val);
    return val;
  } catch {
    return process.env[name] || null;
  }
}

module.exports = { getSecret };
