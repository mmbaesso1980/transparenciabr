/**
 * Admin-only role management via Firebase Auth Custom Claims.
 *
 * Two callables:
 *   grantRole({ targetUid, tier })     — sets `tier` claim on the target user.
 *   listMyClaims()                     — debug helper that returns the caller's claims.
 *
 * The bootstrap admin (first-ever admin) is identified by the
 * ADMIN_BOOTSTRAP_UID env var; only that UID can promote others without
 * already having `admin === true` in their token. After bootstrap, only
 * users whose token already carries `admin === true` may grant new roles.
 *
 * No e-mails are hardcoded. No paywall bypass logic lives here — that is
 * just a downstream consequence of the `tier === 'god_mode'` claim being
 * read in the frontend / security rules.
 */

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

const ALLOWED_TIERS = new Set(["free", "premium", "god_mode"]);

function isCallerAdmin(context) {
  if (!context.auth) return false;
  const token = context.auth.token || {};
  if (token.admin === true) return true;
  const bootstrap = (process.env.ADMIN_BOOTSTRAP_UID || "").trim();
  if (bootstrap && context.auth.uid === bootstrap) return true;
  return false;
}

/**
 * Sanitise the requested role. Currently we only support a `tier` scalar
 * and the boolean `admin` derived from it.
 */
function buildClaims(currentClaims, tier, makeAdmin) {
  const next = { ...(currentClaims || {}) };
  next.tier = tier;
  if (typeof makeAdmin === "boolean") {
    next.admin = makeAdmin;
  } else if (tier === "god_mode") {
    next.admin = true;
  } else if (next.admin !== true) {
    delete next.admin;
  }
  return next;
}

exports.grantRole = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {
    if (!isCallerAdmin(context)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Apenas administradores podem alterar papéis.",
      );
    }

    const targetUid = String((data && data.targetUid) || "").trim();
    const tier = String((data && data.tier) || "").trim();
    const explicitAdmin = typeof (data && data.admin) === "boolean" ? data.admin : null;

    if (!targetUid) {
      throw new functions.https.HttpsError("invalid-argument", "targetUid obrigatório.");
    }
    if (!ALLOWED_TIERS.has(tier)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `tier inválido. Use um de: ${[...ALLOWED_TIERS].join(", ")}.`,
      );
    }

    let user;
    try {
      user = await admin.auth().getUser(targetUid);
    } catch (e) {
      throw new functions.https.HttpsError("not-found", `UID ${targetUid} não encontrado.`);
    }

    const next = buildClaims(user.customClaims, tier, explicitAdmin);
    await admin.auth().setCustomUserClaims(targetUid, next);

    await admin
      .firestore()
      .collection("audit_role_changes")
      .add({
        actor_uid: context.auth.uid,
        target_uid: targetUid,
        tier,
        admin_flag: next.admin === true,
        previous_claims: user.customClaims || {},
        next_claims: next,
        at: admin.firestore.FieldValue.serverTimestamp(),
      });

    console.log(
      `grantRole actor=${context.auth.uid} target=${targetUid} tier=${tier} admin=${next.admin === true}`,
    );

    return {
      uid: targetUid,
      claims: next,
    };
  });

exports.listMyClaims = functions
  .region("southamerica-east1")
  .https.onCall(async (_data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sessão obrigatória.",
      );
    }
    return {
      uid: context.auth.uid,
      claims: context.auth.token || {},
    };
  });

exports.__test__ = { isCallerAdmin, buildClaims, ALLOWED_TIERS };
