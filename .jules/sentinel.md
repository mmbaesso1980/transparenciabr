## 2026-04-22 - [Sentinel Fix: Prevent Stripe Checkout Open Redirect]
**Vulnerability:** Stripe Checkout endpoints accepted arbitrary user-provided successUrl and cancelUrl parameters, enabling Open Redirect vulnerabilities.
**Learning:** Cloud functions generating external session links (like Stripe Checkout) that accept user-provided redirects are vectors for Open Redirects. This allows attackers to redirect users to malicious domains using legitimate system URLs.
**Prevention:** Hardcode target paths for external redirects (e.g., '/creditos') and validate the base origin against a predefined allowlist rather than trusting user inputs directly.

## 2026-04-23 - [Sentinel Fix: Prevent Metadata Parameter Tampering in Stripe Checkout]
**Vulnerability:** The Stripe checkout Cloud Function permitted arbitrary `credits` in `session.metadata` without sanitization when a pre-configured `priceId` was supplied. Attackers could buy a very cheap item and manipulate the metadata payload to grant themselves massive credit values.
**Learning:** Never trust metadata inputs provided directly from client contexts in payment sessions. Always overwrite or ignore user-provided metadata for properties tied to secure webhook fulfillment if a fixed path/price is selected.
**Prevention:** Zero-out or sanitize critical metadata keys (using safe assignment, e.g., `params.metadata = { ...params.metadata, credits: '0' }`) immediately upon matching a pre-defined payment item flow to prevent metadata injection attacks.
