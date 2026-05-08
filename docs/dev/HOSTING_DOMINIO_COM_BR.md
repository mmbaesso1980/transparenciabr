# Hosting · Domínio `.com.br` · Runbook de migração

## Contexto

Em 08/mai/2026, durante a Onda 7 (Despertar dos Bancos), descobrimos que
`https://transparenciabr.com.br` servia bundle de **27/abr** (11 dias atrás),
enquanto `https://transparenciabr.web.app` servia o build mais recente
(Ondas 5/6/7 vivas).

Causa: o projeto Firebase `transparenciabr` tem **dois sites Hosting**;
`.com.br` está atrelado a um site secundário que não recebe `firebase deploy`
do CI (`deploy_hosting.yml` deploya apenas no site default). O `.firebaserc`
nunca teve `targets` configurados.

Confirmação:
- mesmo IP (`199.36.158.100`) e mesmo CDN (Fastly) para os dois domínios
- bundles diferentes: `.web.app` serve `index-<hash>.js` (com hash); `.com.br` serve `/assets/index.js` (sem hash)
- CSP difere entre os dois (o do `.com.br` lista APIs antigas como `portaldatransparencia.gov.br` e `nominatim.openstreetmap.org` que não existem mais no firebase.json)

## Solução · Migração de domínio (uma vez · ~5 min + 1h SSL)

**Caminho A · Firebase Console (recomendado)**

1. Abrir https://console.firebase.google.com/project/transparenciabr/hosting/sites
2. Identificar o site secundário (qualquer site que NÃO seja `transparenciabr`)
3. Na linha de `transparenciabr.com.br` → ⋮ → **Remover domínio personalizado**
4. Voltar à listagem, abrir o site `transparenciabr` (default)
5. **Adicionar domínio personalizado** → `transparenciabr.com.br`
6. Firebase reconhece os registros DNS existentes (mesmo IP) e finaliza
7. Aguardar propagação SSL (até 60 min, geralmente <10)

**Não precisa mexer no DNS.** Os registros A continuam válidos para o IP do Firebase Hosting.

**Caminho B · CLI (se preferir automatizar)**

```bash
# pré-flight
firebase hosting:sites:list --project=transparenciabr
# anote o SITE_ID do site secundário; vamos chamar de SECONDARY

TOKEN=$(gcloud auth print-access-token)
SECONDARY="<id_descoberto>"

curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  "https://firebasehosting.googleapis.com/v1beta1/sites/$SECONDARY/domains/transparenciabr.com.br"

curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"domainName":"transparenciabr.com.br","provisioning":{"certStatus":"CERT_PREPARING"}}' \
  "https://firebasehosting.googleapis.com/v1beta1/sites/transparenciabr/domains?domainName=transparenciabr.com.br"
```

## Validação pós-migração

```bash
# bundle deve ser < 24h
curl -sI "https://transparenciabr.com.br/assets/index.js" | grep -i last-modified

# HTML deve ter src com hash
curl -s "https://transparenciabr.com.br/" | grep -oE 'src="[^"]+\.js"' | head -1
# esperado: src="/assets/index-<hash>.js"

# banner deve aparecer
curl -s "https://transparenciabr.com.br/" | grep -c "Estado da plataforma\|PlataformaStatus" || echo "ainda pendente"
```

O **smoke regression** adicionado em `.github/workflows/deploy_hosting.yml`
detecta automaticamente se o drift voltar (idade do bundle > 2 dias quebra o build).
