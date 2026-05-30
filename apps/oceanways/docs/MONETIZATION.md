# Ocean Ways — Monetização

**Versão:** R1  
**Data:** 2026-05-30  

---

## Modelo de créditos

Ocean Ways opera em um sistema de créditos que desacopla o uso do plano e permite monetização flexível.

### Custo por ação

| Ação                          | Créditos consumidos | Observação |
|-------------------------------|---------------------|------------|
| Busca simples (1 rota/data)   | 1                   | Cache hit não consome crédito |
| Disparo de alerta (por hit)   | 2                   | Configurar alerta é grátis; cobrado no disparo |
| Reexibir resultado em cache   | 0                   | Usuário pode ver resultado salvo sem custo |
| Exportar resultado (CSV/PDF)  | 1                   | (R2) |

**Cache hit**: se a combinação origem+destino+data+cabine já foi buscada nas últimas 4h, o resultado é retornado do cache Firestore **sem consumir crédito**. Isso reduz custos de API e melhora UX.

---

## Planos

### Free

| Item            | Valor |
|-----------------|-------|
| Preço           | R$ 0/mês |
| Créditos/mês    | 30 |
| Alertas ativos  | 2 |
| Rollover        | Não — créditos expiram no dia de renovação |
| Suporte         | FAQ + comunidade |

**Conversão esperada**: Free → Pro após usuário esgotar créditos em rotas recorrentes.

### Pro

| Item            | Valor |
|-----------------|-------|
| Preço           | R$ 49/mês |
| Créditos/mês    | 600 |
| Alertas ativos  | Ilimitados |
| Rollover        | Até 200 créditos levados para o mês seguinte |
| Prioridade      | Fila de busca prioritária (menor latência) |
| Suporte         | E-mail com SLA 24h |

**Processadores**: Stripe (cartão internacional/nacional) + MercadoPago (Pix, boleto, cartão BR).

### Top-up (avulso)

| Item            | Valor |
|-----------------|-------|
| Preço           | R$ 10/pacote |
| Créditos        | 100 |
| Validade        | Sem expiração |
| Acumulação      | Sim — acumula com créditos do plano |

Top-up disponível para usuários Free e Pro. Serve para picos de uso sem upgrade de plano.

---

## Fluxo de compra

```
Usuário clica "Upgrade Pro" ou "Comprar Top-up"
    │
    ├─► Stripe Checkout (cartão)
    │       │
    │       └─► Webhook stripe-webhook.py
    │               → Valida assinatura Stripe
    │               → Atualiza Firestore users/{uid}.plan = "pro"
    │               → Credita créditos mensais
    │               → Grava em BigQuery oceanways.transactions
    │
    └─► MercadoPago Checkout Pro (Pix/boleto/cartão BR)
            │
            └─► Webhook mp-webhook.py
                    → Valida IPN MercadoPago
                    → Mesma lógica de atualização
```

**Regra crítica**: créditos **somente são creditados após confirmação do webhook**. Nunca confiar em redirect de sucesso do frontend.

---

## Anti-abuso

- Rate limit por IP: 10 req/min em `/api/search` (mesmo sem consumo de crédito por cache)
- Rate limit por UID: 60 buscas/hora para usuários Pro; 10/hora para Free
- Alertas com saldo zero são suspensos automaticamente (`active=FALSE`) e notificam o usuário por e-mail
- Top-up máximo: R$ 200/mês por usuário (AML básico) — pode ser aumentado via KYC R2

---

## Projeções (hipotéticas, para validação)

| Métrica                    | Cenário conservador | Cenário otimista |
|----------------------------|---------------------|------------------|
| MAU mês 3                  | 500                 | 2.000 |
| Conversão Free→Pro         | 5%                  | 12% |
| MRR mês 3                  | R$ 1.225            | R$ 5.880 |
| Top-up médio/usuário/mês   | R$ 5                | R$ 12 |
| GMV mês 3                  | R$ 1.475            | R$ 7.280 |

**Custo variável estimado por busca**: R$ 0,02–0,05 (Cloud Run + BigQuery + APIs externas). Margem de contribuição positiva a partir de 3 buscas/crédito em média.

---

## Roadmap monetização R2

- [ ] Plano Pro Anual com desconto 20% (R$ 470/ano)
- [ ] Afiliados: link de referência com 10% do primeiro pagamento
- [ ] B2B: plano agências de viagem (1.000 créditos/mês, R$ 149)
- [ ] API pública paga (para apps de terceiros)
