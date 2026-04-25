/**
 * Firebase Functions — Stripe Checkout (callable) + webhook de créditos.
 *
 * Definir em ambiente Firebase:
 *   stripeWebhook: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 *   createCheckoutSession: STRIPE_SECRET_KEY
 */

/** API v1 (region + https.onCall etc.) — o pacote principal exporta v2 desde firebase-functions v6 */
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const Stripe = require("stripe");

const {
  classifyArea,
  urgencyFromAnalysis,
  analyzeWithGemini,
  dossierDocId,
} = require("./src/radar/diarioScanner");

admin.initializeApp();

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

function requireStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY ausente");
  }
  return new Stripe(key, { apiVersion: "2024-06-20" });
}

function creditsFromSession(session) {
  const meta = session.metadata || {};
  const direct = parseInt(meta.credits || meta.creditos || "0", 10);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const total = session.amount_total;
  if (total && total > 0) return Math.max(1, Math.round(total / 100));
  return 0;
}

/** HTTP — Stripe webhook (checkout.session.completed) */
exports.stripeWebhook = functions
  .region("southamerica-east1")
  .https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET ausente");
      res.status(500).send("webhook_not_configured");
      return;
    }

    let stripe;
    try {
      stripe = requireStripe();
    } catch (e) {
      console.error(e.message);
      res.status(500).send("stripe_init_error");
      return;
    }

    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err) {
      console.warn("Webhook signature:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const uid =
        session.client_reference_id ||
        (session.metadata && session.metadata.uid) ||
        "";

      const credits = creditsFromSession(session);

      if (uid && credits > 0) {
        await db.collection("usuarios").doc(uid).set(
          {
            creditos: FieldValue.increment(credits),
            updated_at: FieldValue.serverTimestamp(),
            ultima_compra_stripe: FieldValue.serverTimestamp(),
            ultima_compra_creditos: credits,
          },
          { merge: true },
        );
        console.log(`Créditos +${credits} → usuarios/${uid}`);
      } else {
        console.warn("Sessão sem uid ou créditos:", session.id, uid, credits);
      }
    }

    res.json({ received: true });
  });

/** Callable — devolve { url } para Checkout Stripe */
exports.createCheckoutSession = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "É necessário iniciar sessão.",
      );
    }

    let stripe;
    try {
      stripe = requireStripe();
    } catch (e) {
      throw new functions.https.HttpsError("failed-precondition", e.message);
    }

    const uid = context.auth.uid;
    const credits = parseInt(data.credits || data.creditos || "0", 10);
    const priceId = (data.priceId || data.price_id || "").trim();

    // 🛡️ Sentinel: Validate origin to prevent Open Redirect
    let origin = (data.origin || "").replace(/\/$/, "");
    const allowedOrigins = [
      "https://transparenciabr.com.br",
      "https://transparenciabr.web.app",
      "https://transparenciabr.firebaseapp.com"
    ];
    // Allow localhost for local development
    if (!origin.startsWith("http://localhost:") && !allowedOrigins.includes(origin)) {
      origin = "https://transparenciabr.web.app";
    }

    // 🛡️ Sentinel: Hardcode path to prevent redirection to arbitrary URLs
    const successUrl = `${origin}/creditos?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/creditos?canceled=1`;

    /** @type {import('stripe').Stripe.Checkout.SessionCreateParams} */
    const params = {
      mode: "payment",
      client_reference_id: uid,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        uid,
        credits: String(credits),
      },
    };

    if (priceId) {
      params.line_items = [{ price: priceId, quantity: 1 }];
    } else if (credits > 0) {
      params.line_items = [
        {
          price_data: {
            currency: "brl",
            product_data: {
              name: `Créditos investigativos (${credits})`,
              description: "A.S.M.O.D.E.U.S. — Transparência BR",
            },
            unit_amount: Math.max(100, credits * 10),
          },
          quantity: 1,
        },
      ];
    } else {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Informe priceId ou credits.",
      );
    }

    const session = await stripe.checkout.sessions.create(params);
    return { url: session.url, id: session.id };
  });

/**
 * Novo ato em diarios_atos → classificação + Gemini (Flash) → radar_dossiers (privado).
 * Env: GEMINI_API_KEY, RADAR_OWNER_UID (Firebase Auth UID do operador jurídico).
 */
exports.onDiarioAtoCreated = functions
  .region("southamerica-east1")
  .firestore.document("diarios_atos/{atoId}")
  .onCreate(async (snap, context) => {
    const ownerUid = (process.env.RADAR_OWNER_UID || "").trim();
    if (!ownerUid) {
      console.warn("RADAR_OWNER_UID ausente — scanner jurídico ignorado.");
      return null;
    }

    const data = snap.data() || {};
    const trecho = String(data.trecho_ato || data.texto || "").trim();
    if (!trecho) return null;

    const area = classifyArea(trecho);
    if (!area) return null;

    let analysis;
    try {
      analysis = await analyzeWithGemini(trecho);
    } catch (e) {
      console.error("Gemini (diário):", e.message || e);
      return null;
    }

    if (analysis.oportunidade_identificada === false) return null;

    const urgencia = urgencyFromAnalysis(analysis);
    const atoId = context.params.atoId;
    const docId = dossierDocId(atoId, ownerUid);

    await db
      .collection("radar_dossiers")
      .doc(docId)
      .set(
        {
          painel_area: "juridico",
          area,
          municipio: String(data.municipio || "").slice(0, 512),
          urgencia,
          uid_proprietario: ownerUid,
          is_private: true,
          fontes: [
            {
              tipo: "diario_oficial",
              url_fonte: String(data.url_fonte || ""),
              territory_id: String(data.territory_id || ""),
              data_ato: String(data.data || ""),
              trecho_ref: trecho.slice(0, 1200),
              source_ato_id: atoId,
            },
          ],
          analise_gemini: analysis,
          criado_em: FieldValue.serverTimestamp(),
          atualizado_em: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    console.log(`radar_dossiers/${docId} gerado a partir de diarios_atos/${atoId}`);
    return null;
  });
