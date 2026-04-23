## 2026-04-23 - [Open Redirect Vulnerability in Stripe Checkout Session]
**Vulnerability:** Client-provided origin and redirect URLs (`data.origin`, `data.successUrl`, `data.cancelUrl`) were blindly trusted in `functions/index.js` to build URLs for Stripe Checkout.
**Learning:** To prevent Open Redirect vulnerabilities in Cloud Functions (e.g., when creating Stripe Checkout sessions), explicitly validate client-provided origins against an allowlist rather than blindly trusting inputs for redirect URLs.
**Prevention:** Hardcode or configure an allowlist of trusted origins, and safely reconstruct redirect URLs instead of accepting arbitrary client-provided redirect URLs.
