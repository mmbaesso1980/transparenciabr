## 2026-04-22 - [Sentinel Fix: Prevent Stripe Checkout Open Redirect]
**Vulnerability:** Stripe Checkout endpoints accepted arbitrary user-provided successUrl and cancelUrl parameters, enabling Open Redirect vulnerabilities.
**Learning:** Cloud functions generating external session links (like Stripe Checkout) that accept user-provided redirects are vectors for Open Redirects. This allows attackers to redirect users to malicious domains using legitimate system URLs.
**Prevention:** Hardcode target paths for external redirects (e.g., '/creditos') and validate the base origin against a predefined allowlist rather than trusting user inputs directly.

## 2026-04-22 - [Sentinel Fix: Prevent Stripe Checkout Parameter Tampering]
**Vulnerability:** The Stripe checkout session creation endpoint (`createCheckoutSession`) accepted both a predefined `priceId` and an arbitrary `credits` value without validation. An attacker could pass a cheap predefined `priceId` along with a massive `credits` value, which would be embedded in the session metadata and read by the webhook to grant unauthorized credits.
**Learning:** External session metadata acts as an implicit parameter channel. When dealing with predefined items, explicitly zero out or ignore user-provided supplementary values (like metadata parameters) to prevent parameter tampering.
**Prevention:** Override or zero out user-provided supplementary metadata fields (e.g., `params.metadata.credits = "0"`) when a predefined item or fixed price is selected in the checkout session.
