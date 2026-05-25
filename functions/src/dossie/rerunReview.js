/**
 * rerunReview — Callable Function (AURORA Forensic v1.1)
 *
 * Republica mensagem no Pub/Sub com flag `review_only: true` para
 * re-rodar apenas a fase de revisão de um dossiê já existente,
 * sem re-executar os 10 agentes do pipeline completo.
 *
 * Callable: chamada pelo frontend via `httpsCallable(functions, "rerunReview")`.
 *
 * Parâmetros:
 *   - slug {string} — identificador do dossiê (Firestore doc ID)
 *
 * Retorna: { slug, status: "queued" }
 *
 * Variáveis de ambiente:
 *   - DOSSIE_V1_TOPIC  (default: "dossie-v1-pipeline")
 *   - GCP_PROJECT_ID   (default: transparenciabr)
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

const rerunReview = functions
  .region(REGION)
  .runWith({ memory: "256MB", timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    // Requer autenticação
    if (!context.auth || !context.auth.uid) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "É necessário estar autenticado para re-rodar a revisão.",
      );
    }

    const slug = String(data?.slug || "").trim();
    if (!slug) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Parâmetro 'slug' é obrigatório.",
      );
    }

    const db = admin.firestore();

    // Verifica se o dossiê existe
    const dossieRef = db.collection(COLLECTION).doc(slug);
    const dossieSnap = await dossieRef.get();
    if (!dossieSnap.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        `Dossiê '${slug}' não encontrado.`,
      );
    }

    const dossieData = dossieSnap.data();
    const alvo = dossieData?.alvo?.nome ?? slug;

    // Atualiza status para "reviewing" e fase para "review"
    await dossieRef.set(
      {
        status: "reviewing",
        phase: "review",
        updated_at: new Date().toISOString(),
        rerun_requested_by: context.auth.uid,
        rerun_requested_at: new Date().toISOString(),
      },
      { merge: true },
    );

    // Publica mensagem no Pub/Sub com flag review_only
    const pubsub = getPubSubClient();
    const topic = pubsub.topic(TOPIC_NAME);

    const message = {
      alvo,
      slug,
      review_only: true,
      requested_by: context.auth.uid,
    };

    const messageBuffer = Buffer.from(JSON.stringify(message), "utf8");

    try {
      await topic.publishMessage({ data: messageBuffer });
    } catch (err) {
      console.error("[rerunReview] Pub/Sub publish error:", err);
      throw new functions.https.HttpsError(
        "internal",
        "Falha ao publicar mensagem de re-revisão. Tente novamente.",
      );
    }

    console.log(`[rerunReview] slug=${slug} alvo="${alvo}" queued (review_only=true)`);

    return { slug, status: "queued", review_only: true };
  });

module.exports = { rerunReview };
