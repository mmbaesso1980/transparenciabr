## 2026-04-22 - [Sentinel Fix: Prevent Stripe Checkout Open Redirect]
**Vulnerability:** Stripe Checkout endpoints accepted arbitrary user-provided successUrl and cancelUrl parameters, enabling Open Redirect vulnerabilities.
**Learning:** Cloud functions generating external session links (like Stripe Checkout) that accept user-provided redirects are vectors for Open Redirects. This allows attackers to redirect users to malicious domains using legitimate system URLs.
**Prevention:** Hardcode target paths for external redirects (e.g., '/creditos') and validate the base origin against a predefined allowlist rather than trusting user inputs directly.

## 2026-04-22 - [Sentinel Fix: Prevent Stripe Checkout Parameter Tampering]
**Vulnerability:** The Stripe Checkout session endpoint `createCheckoutSession` accepted both a `priceId` and `credits` value. A malicious user could supply a cheap `priceId` alongside a massive `credits` value. The webhook reads the resulting `session.metadata.credits` instead of relying strictly on the paid amount, thus granting the user stolen credits.
**Learning:** When using external checkout sessions with mixed usage patterns (predefined products vs. dynamically calculated amounts), never blindly trust unvalidated user inputs sent to metadata, as webhooks often rely on this metadata as the source of truth for fulfillment.
**Prevention:** Explicitly overwrite or zero-out the `credits` metadata parameter when fulfilling via a predefined `priceId`. Use defensive safe assignment (`params.metadata = { ...params.metadata, credits: '0' };`) to avoid modifying uninitialized objects.
