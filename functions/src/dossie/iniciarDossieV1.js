/**
 * iniciarDossieV1 — Callable HTTP (AURORA Forensic v1.0)
 *
 * Recebe { nome }, valida Firebase Auth, cria documento Firestore em
 * `dossies_v1/{slug}` e publica no Pub/Sub topic `dossie-v1-pipeline`
 * para acionar o Cloud Run Job `dossie-v1-pipeline` via Eventarc.
 *
 * Retorna: { slug, status_url }
 *
 * Variáveis de ambiente (Cloud Functions):
 *   - DOSSIE_V1_TOPIC (default: "dossie-v1-pipeline")
 *   - GCP_PROJECT_ID  (default: process.env.GCLOUD_PROJECT || "transparenciabr")
 */

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

const REGION = "southamerica-east1";
const TOPIC_NAME = process.env.DOSSIE_V1_TOPIC || "dossie-v1-pipeline";
const COLLECTION = "dossies_v1";

function getProjectId() {
  return (
    process.env.GCP_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    "transparenciabr"
  );
}

function getPubSubClient() {
  if (!global.__tbr_pubsub) {
    const { PubSub } = require("@google-cloud/pubsub");
    global.__tbr_pubsub = new PubSub({ projectId: getProjectId() });
  }
  return global.__tbr_pubsub;
}

function slugify(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const iniciarDossieV1 = functions
  .region(REGION)
  .runWith({ memory: "256MB", timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.uid) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "É necessário estar autenticado para iniciar um dossiê v1.0.",
      );
    }

    const nome = String((data && data.nome) || "").trim();
    if (nome.length < 3 || nome.length > 120) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Campo `nome` é obrigatório (3-120 caracteres).",
      );
    }

    const slug = slugify(nome);
    if (!slug) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Não foi possível derivar um slug válido do nome informado.",
      );
    }

    const db = admin.firestore();
    const FieldValue = admin.firestore.FieldValue;
    const docRef = db.collection(COLLECTION).doc(slug);

    const requesterUid = context.auth.uid;
    const payload = {
      nome,
      slug,
      status: "queued",
      started_at: FieldValue.serverTimestamp(),
      requester_uid: requesterUid,
      agents: {},
      pdf_url: null,
    };

    await docRef.set(payload, { merge: true });

    const message = { slug, nome, requester_uid: requesterUid };
    let messageId = null;
    try {
      messageId = await getPubSubClient()
        .topic(TOPIC_NAME)
        .publishMessage({ json: message });
    } catch (err) {
      await docRef.set(
        {
          status: "error",
          error: `Falha ao publicar no Pub/Sub: ${err && err.message ? err.message : String(err)}`,
        },
        { merge: true },
      );
      throw new functions.https.HttpsError(
        "internal",
        "Falha ao enfileirar o dossiê na pipeline AURORA v1.0.",
      );
    }

    return {
      slug,
      status_url: `firestore:${COLLECTION}/${slug}`,
      message_id: messageId,
    };
  });

module.exports = iniciarDossieV1;
module.exports.iniciarDossieV1 = iniciarDossieV1;
module.exports.slugify = slugify;
