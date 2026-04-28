import { requestHttp } from "../../core/http_client.js";
import { resolveSecret } from "../secrets.js";

/**
 * @param {object} api
 * @returns {Promise<{ headers: Record<string,string>, query: Record<string,string>, httpsAgent?: import('https').Agent }>}
 */
export async function resolveAuth(api) {
  const getSecret = (envVar, secretName) => resolveSecret(envVar, secretName);
  const headers = {};
  const query = {};
  const auth = api.auth || { type: "none" };

  switch (auth.type) {
    case "none":
      break;
    case "api_key_query": {
      const param = auth.query_param || "apiKey";
      const val = await getSecret(auth.env_var || "API_KEY", auth.secret_name);
      query[param] = val;
      break;
    }
    case "api_key_header": {
      const h = auth.header || "Authorization";
      const val = await getSecret(auth.env_var || "API_KEY", auth.secret_name);
      headers[h] = val;
      break;
    }
    case "bearer": {
      const val = await getSecret(auth.env_var || "BEARER_TOKEN", auth.secret_name);
      headers.Authorization = `Bearer ${val}`;
      break;
    }
    case "certificate": {
      const https = await import("node:https");
      const fs = await import("node:fs/promises");
      const pfxPath = process.env[auth.env_var || "CERT_PFX_PATH"];
      if (!pfxPath) throw new Error("certificate auth requires CERT_PFX_PATH / env_var");
      const pfx = await fs.readFile(pfxPath);
      const passphrase = process.env.CERT_PFX_PASSPHRASE || "";
      const httpsAgent = new https.Agent({ pfx, passphrase });
      return { headers, query, httpsAgent };
    }
    case "inlabs_login": {
      const user = await getSecret(auth.env_var || "INLABS_USER", auth.secret_name);
      const pass = await resolveSecret("INLABS_PASSWORD");
      const loginUrl = auth.login_url || `${api.base_url.replace(/\/$/, "")}/login`;
      const res = await requestHttp(loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        data: new URLSearchParams({ username: user, password: pass }).toString(),
        responseType: "json",
      });
      const cookies = res.headers?.["set-cookie"];
      if (cookies?.length) {
        headers.Cookie = cookies.map((c) => c.split(";")[0]).join("; ");
      }
      break;
    }
    default:
      throw new Error(`Unknown auth type ${auth.type}`);
  }

  return { headers, query };
}
