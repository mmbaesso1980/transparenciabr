## 2026-04-22 - [Sentinel Fix: Prevent Stripe Checkout Open Redirect]
**Vulnerability:** Stripe Checkout endpoints accepted arbitrary user-provided successUrl and cancelUrl parameters, enabling Open Redirect vulnerabilities.
**Learning:** Cloud functions generating external session links (like Stripe Checkout) that accept user-provided redirects are vectors for Open Redirects. This allows attackers to redirect users to malicious domains using legitimate system URLs.
**Prevention:** Hardcode target paths for external redirects (e.g., '/creditos') and validate the base origin against a predefined allowlist rather than trusting user inputs directly.
