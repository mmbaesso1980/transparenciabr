# M11 — auditoria e notas de implementação

## `safe_detail()` (PII em logs / Firestore)

O helper em `engines/incident/audit.py` redige detalhes de hits **antes** de
persistência:

- **`OPERATOR_PII`**: substitui por `[PII_REDACTED_<h>]` onde `<h>` são os
  **primeiros 8 caracteres hexadecimais de SHA-256** do detalhe original
  (`hashlib.sha256(...).hexdigest()[:8]`).
- **Demais categorias**: texto numa linha, truncado a **80** caracteres.

> A mensagem do commit `674062f9` menciona SHA-1; o código usa **SHA-256**
> truncado a 8 hex — esta nota documenta o comportamento real.

## CI — scan do delta do PR (`scripts/incident_ci_pr_scan.sh`)

O varrimento do detector sobre ficheiros **alterados no PR** **exclui**
`tests/**/fixtures/**` (golden fixtures com bugs intencionais). O passo
`python3 scripts/check_incident_repo_pii.py` continua a impedir PII do
operador em YAML/JSON versionados sob `engines/incident/` e em fixtures.
