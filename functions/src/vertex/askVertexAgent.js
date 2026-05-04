/**
 * Proxy HTTP → Dialogflow CX (Vertex AI Agent Builder).
 * Credenciais apenas via ADC no ambiente GCP (nunca no frontend).
 *
 * @param {typeof import("firebase-functions/v1")} functions
 * @param {Record<string, unknown>} parentExports — objeto exports do index.js
 */
function mountAskVertexAgent(functions, parentExports) {
  const { SessionsClient } = require("@google-cloud/dialogflow-cx");

  const DEFAULT_PROJECT = "transparenciabr";
  const DEFAULT_LOCATION = process.env.DIALOGFLOW_LOCATION || "global";
  const DEFAULT_AGENT_ID = process.env.DIALOGFLOW_AGENT_ID || "1777236402725";
  const DEFAULT_LANG = process.env.DIALOGFLOW_LANGUAGE_CODE || "pt-br";

  function corsOrigin(req) {
    const allowList = String(process.env.VERTEX_PROXY_CORS_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const origin = req.get("Origin") || "";
    if (allowList.length === 0) return "*";
    if (allowList.includes(origin)) return origin;
    if (allowList.includes("*")) return "*";
    return allowList[0] || "*";
  }

  function applyCors(req, res) {
    const o = corsOrigin(req);
    res.set("Access-Control-Allow-Origin", o);
    if (o !== "*") res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With",
    );
    res.set("Access-Control-Max-Age", "3600");
  }

  function extractAgentReply(response) {
    const qr = response?.queryResult;
    if (!qr) return "";
    const parts = [];
    const msgs = qr.responseMessages || [];
    for (const m of msgs) {
      if (m.text?.text?.length) {
        parts.push(m.text.text.join("\n"));
      }
    }
    if (parts.length) return parts.join("\n\n").trim();
    if (qr.match?.intent?.displayName) {
      return `[Intent: ${qr.match.intent.displayName}]`;
    }
    return "";
  }

  parentExports.askVertexAgent = functions
    .region("southamerica-east1")
    .runWith({ memory: "512MB", timeoutSeconds: 60 })
    .https.onRequest(async (req, res) => {
      applyCors(req, res);

      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }

      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      res.set("Content-Type", "application/json; charset=utf-8");
      res.set("Cache-Control", "no-store");

      const body =
        typeof req.body === "object" && req.body !== null ? req.body : {};
      const sessionId = String(body.sessionId || "").trim();
      const query = String(body.query || "").trim();

      if (!sessionId || !query) {
        res.status(400).json({
          error: "invalid_body",
          hint: "Enviar JSON { sessionId, query }",
        });
        return;
      }

      const projectId = process.env.GCLOUD_PROJECT || DEFAULT_PROJECT;
      const location = String(
        process.env.DIALOGFLOW_LOCATION || DEFAULT_LOCATION,
      ).trim();
      const agentId = String(
        process.env.DIALOGFLOW_AGENT_ID || DEFAULT_AGENT_ID,
      ).trim();

      try {
        const client = new SessionsClient({
          apiEndpoint:
            location === "global"
              ? "dialogflow.googleapis.com"
              : `${location}-dialogflow.googleapis.com`,
        });

        const sessionPath = client.projectLocationAgentSessionPath(
          projectId,
          location,
          agentId,
          sessionId,
        );

        const [response] = await client.detectIntent({
          session: sessionPath,
          queryInput: {
            text: { text: query },
            languageCode: DEFAULT_LANG,
          },
        });

        const reply = extractAgentReply(response);
        res.status(200).json({
          ok: true,
          reply: reply || "(Resposta vazia do agente.)",
          intent: response?.queryResult?.match?.intent?.displayName || null,
        });
      } catch (err) {
        console.error("askVertexAgent error:", err);
        res.status(502).json({
          ok: false,
          error: "vertex_dialogflow_failed",
          detail: String(err.message || err),
        });
      }
    });
}

module.exports = { mountAskVertexAgent };
