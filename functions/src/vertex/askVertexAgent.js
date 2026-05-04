/**
 * Proxy HTTP → Dialogflow CX (Vertex AI Agent Builder). ADC no Cloud Function.
 * POST { sessionId, query, stream?: boolean }
 */

function mountAskVertexAgent(functions, parentExports) {
  const { SessionsClient } = require("@google-cloud/dialogflow-cx");

  const DEFAULT_PROJECT = "transparenciabr";
  const DEFAULT_LOCATION = process.env.DIALOGFLOW_LOCATION || "global";
  const DEFAULT_AGENT_ID = process.env.DIALOGFLOW_AGENT_ID || "1777236402725";
  const DEFAULT_LANG = process.env.DIALOGFLOW_LANGUAGE_CODE || "pt-br";

  function trilhoQueryParams() {
    return {
      payload: {
        operacao: "TRILHO_1",
        operacao_nome: "Operação Trilho 1",
        municipios_foco: ["Pirassununga", "Valinhos"],
        uf: "SP",
        dominio: "previdenciario_inss",
      },
      parameters: {
        operacao_trilho_1: true,
        municipio_pirassununga: true,
        municipio_valinhos: true,
      },
    };
  }

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
      "Content-Type, Authorization, X-Requested-With, Accept",
    );
    res.set("Access-Control-Max-Age", "3600");
  }

  function textFromQueryResult(qr) {
    if (!qr) return "";
    const parts = [];
    const msgs = qr.responseMessages || [];
    for (const m of msgs) {
      if (m.text?.text?.length) {
        parts.push(m.text.text.join("\n"));
      }
    }
    return parts.join("\n\n").trim();
  }

  function extractAgentReply(response) {
    const qr = response?.queryResult;
    const t = textFromQueryResult(qr);
    if (t) return t;
    if (qr?.match?.intent?.displayName) {
      return `[Intent: ${qr.match.intent.displayName}]`;
    }
    return "";
  }

  function extractToolArtifacts(qr) {
    if (!qr) return null;
    const out = {};
    const diag = qr.diagnosticInfo;
    if (diag && typeof diag === "object" && Object.keys(diag).length) {
      out.diagnosticInfo = diag;
    }
    const gen = qr.generativeInfo;
    if (gen && typeof gen === "object" && Object.keys(gen).length) {
      out.generativeInfo = gen;
    }
    return Object.keys(out).length ? out : null;
  }

  function writeNdjson(res, obj) {
    res.write(`${JSON.stringify(obj)}\n`);
  }

  parentExports.askVertexAgent = functions
    .region("southamerica-east1")
    .runWith({ memory: "512MB", timeoutSeconds: 120 })
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

      res.set("Cache-Control", "no-store");

      const body = typeof req.body === "object" && req.body !== null ? req.body : {};
      const sessionId = String(body.sessionId || "").trim();
      const query = String(body.query || "").trim();
      const wantStream = Boolean(body.stream);

      if (!sessionId || !query) {
        res.status(400).json({
          error: "invalid_body",
          hint: "Enviar JSON { sessionId, query, stream?: boolean }",
        });
        return;
      }

      const projectId = process.env.GCLOUD_PROJECT || DEFAULT_PROJECT;
      const location = String(process.env.DIALOGFLOW_LOCATION || DEFAULT_LOCATION).trim();
      const agentId = String(process.env.DIALOGFLOW_AGENT_ID || DEFAULT_AGENT_ID).trim();

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

      const queryParams = trilhoQueryParams();

      const baseRequest = {
        session: sessionPath,
        queryParams,
        queryInput: {
          text: { text: query },
          languageCode: DEFAULT_LANG,
        },
      };

      try {
        if (wantStream) {
          res.set("Content-Type", "application/x-ndjson; charset=utf-8");
          res.set("X-Accel-Buffering", "no");

          writeNdjson(res, {
            type: "log",
            message: "Sessão via ADC · Dialogflow CX",
            ts: new Date().toISOString(),
          });
          writeNdjson(res, {
            type: "log",
            message: "Contexto: Operação Trilho 1 (queryParams)",
            ts: new Date().toISOString(),
          });

          const stream = client.serverStreamingDetectIntent(baseRequest);
          let lastFullText = "";

          await new Promise((resolve, reject) => {
            stream.on("data", (chunk) => {
              try {
                const qr = chunk?.queryResult;
                if (!qr) return;

                const fullText = textFromQueryResult(qr);
                if (fullText && fullText !== lastFullText) {
                  if (fullText.startsWith(lastFullText)) {
                    const delta = fullText.slice(lastFullText.length);
                    if (delta) {
                      writeNdjson(res, { type: "text", delta });
                    }
                  } else {
                    writeNdjson(res, { type: "text", full: fullText });
                  }
                  lastFullText = fullText;
                }

                const tools = extractToolArtifacts(qr);
                if (tools) {
                  writeNdjson(res, {
                    type: "tool",
                    payload: tools,
                    ts: new Date().toISOString(),
                  });
                }

                if (chunk?.queryResult?.match?.intent?.displayName) {
                  writeNdjson(res, {
                    type: "intent",
                    name: chunk.queryResult.match.intent.displayName,
                  });
                }
              } catch (e) {
                reject(e);
              }
            });
            stream.on("error", reject);
            stream.on("end", resolve);
          });

          writeNdjson(res, { type: "done", ts: new Date().toISOString() });
          res.end();
          return;
        }

        res.set("Content-Type", "application/json; charset=utf-8");

        const [response] = await client.detectIntent(baseRequest);

        const reply = extractAgentReply(response);
        const tools = extractToolArtifacts(response?.queryResult);

        res.status(200).json({
          ok: true,
          reply: reply || "(Resposta vazia do agente.)",
          intent: response?.queryResult?.match?.intent?.displayName || null,
          toolArtifacts: tools,
          streamed: false,
        });
      } catch (err) {
        console.error("askVertexAgent error:", err);
        if (wantStream && !res.headersSent) {
          res.status(502);
        }
        if (wantStream && res.writableEnded === false) {
          writeNdjson(res, {
            type: "error",
            detail: String(err.message || err),
          });
          res.end();
          return;
        }
        res.status(502).json({
          ok: false,
          error: "vertex_dialogflow_failed",
          detail: String(err.message || err),
        });
      }
    });
}

module.exports = { mountAskVertexAgent };
