## 2026-04-22 - [Sentinel Fix: Prevent Stripe Checkout Open Redirect]
**Vulnerability:** Stripe Checkout endpoints accepted arbitrary user-provided successUrl and cancelUrl parameters, enabling Open Redirect vulnerabilities.
**Learning:** Cloud functions generating external session links (like Stripe Checkout) that accept user-provided redirects are vectors for Open Redirects. This allows attackers to redirect users to malicious domains using legitimate system URLs.
**Prevention:** Hardcode target paths for external redirects (e.g., '/creditos') and validate the base origin against a predefined allowlist rather than trusting user inputs directly.
## 2024-04-29 - [Sentinel Fix: Prevent Stripe Checkout Parameter Tampering]
**Vulnerability:** Stripe Checkout sessions accepted user-provided `credits` metadata even when a fixed predefined product (`priceId`) was selected. This could allow an attacker to purchase a low-cost item but artificially inject a massive amount of `credits` into the session metadata, which the webhook would blindly honor.
**Learning:** In e-commerce endpoints, never trust user metadata payloads when fulfilling predefined items. Attackers can leverage these metadata injection vectors to bypass intended pricing limits.
**Prevention:** Explicitly override or zero-out the target metadata fields (e.g., `params.metadata = { ...params.metadata, credits: "0" };`) when processing a predefined `priceId` to forcefully ignore any user-tampered values.
