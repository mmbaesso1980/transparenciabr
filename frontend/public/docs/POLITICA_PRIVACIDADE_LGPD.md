# Política de Privacidade e LGPD — TransparênciaBR

Versão 1.0 · Vigente a partir de 01/05/2026

## 1. Controlador
TransparênciaBR · DPO: dpo@transparenciabr.com.br

## 2. Dados Coletados
Cadastro (nome, email, senha hash bcrypt), hash SHA-256 de IP e user-agent no aceite, dados Stripe (não armazenados em nossa infraestrutura), histórico de uso, dados públicos de parlamentares.

## 3. Bases Legais (LGPD Art. 7º)
- Cadastro: V (execução de contrato)
- Uso: V + IX (legítimo interesse)
- Dados públicos parlamentares: III + IV + VII (obrigação legal, estudo, proteção do crédito)
- Analytics: I (consentimento)

## 4. Compartilhamento
Google Cloud Platform (us-central1), Stripe (processador de pagamento), Firebase Authentication. **Não vendemos dados.**

## 5. Retenção
- Cadastro: ativo + 5 anos
- Logs de aceite (consents): 5 anos imutáveis em GCS
- Logs de aplicação: 180 dias
- Dados públicos de parlamentares: indefinido (interesse público)

## 6. Direitos do Titular (Art. 18 LGPD)
Confirmar, acessar, corrigir, anonimizar, portar, revogar consentimento, opor-se. Prazo de resposta: 15 dias via dpo@transparenciabr.com.br.

## 7. Segurança
TLS 1.3, AES-256 em repouso (Google-managed encryption keys), Firebase Auth com rate limiting padrão + reCAPTCHA, Firestore Rules restritivas, retention policy GCS para aceites, backup diário criptografado.

## 8. Cookies
Essenciais (autenticação) e Analytics (com consentimento explícito).

## 9. Menores
Não coletamos dados de menores de 18 anos. Cadastro requer declaração de maioridade.

## 10. Alterações
Disparam novo aceite.

## 11. ANPD
Reclamações: www.gov.br/anpd

---
Última atualização: 01/05/2026
