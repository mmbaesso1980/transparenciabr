"""
Ocean Ways — MercadoPago Payment Integration
==============================================
Integração com MercadoPago para pagamentos no Brasil:
  - Pix (instantâneo)
  - Boleto bancário (1-3 dias úteis)
  - Cartão de crédito/débito nacional

Vantagem vs Stripe: maior conversão para usuários BR que preferem Pix/boleto.

Configuração necessária:
  - Conta MercadoPago Business em mercadopago.com.br
  - Criar aplicação em https://www.mercadopago.com.br/developers/pt/docs
  - Verificar KYC/KYB para recebimento
  - Configurar webhook (IPN) no painel MP

Secrets (via Secret Manager):
  MP_ACCESS_TOKEN        ex: APP_USR-...  (produção)
  MP_PUBLIC_KEY          ex: APP_USR-...  (frontend — pode expor)
  MP_WEBHOOK_SECRET      para validação de assinatura IPN

TODO (Maestro):
  [ ] pip install mercadopago
  [ ] Criar conta e aplicação MP
  [ ] Gravar secrets no Secret Manager
  [ ] Implementar create_preference()
  [ ] Implementar handle_webhook()
  [ ] Testar no sandbox MP antes de produção
  [ ] Configurar notificação IPN em: POST /api/v1/payments/mp/webhook
"""

import structlog
from typing import Literal

log = structlog.get_logger()

ProductType = Literal["PLAN_PRO", "TOPUP_100"]

# Mapeamento de produtos para preço e descrição (exibição no checkout MP)
PRODUCT_DETAILS = {
    "PLAN_PRO": {
        "title": "Ocean Ways Pro — 600 créditos/mês",
        "quantity": 1,
        "unit_price": 49.0,
        "currency_id": "BRL",
    },
    "TOPUP_100": {
        "title": "Ocean Ways Top-up — 100 créditos",
        "quantity": 1,
        "unit_price": 10.0,
        "currency_id": "BRL",
    },
}


async def create_preference(
    uid: str,
    product: ProductType,
    success_url: str,
    failure_url: str,
    pending_url: str,
    notification_url: str,
    payer_email: str | None = None
) -> dict:
    """
    Cria preferência de pagamento no MercadoPago (Checkout Pro).

    Retorna init_point (produção) ou sandbox_init_point (sandbox) para redirect.

    Args:
        uid: Firebase UID (gravado em external_reference para reconciliação)
        product: PLAN_PRO | TOPUP_100
        success_url: redirect após pagamento aprovado
        failure_url: redirect após pagamento rejeitado
        pending_url: redirect para Pix/boleto pendente
        notification_url: URL do webhook IPN (POST /api/v1/payments/mp/webhook)
        payer_email: e-mail do pagador (opcional — melhora UX no checkout)

    Returns:
        dict com checkout_url e preference_id

    TODO (Maestro):
      [ ] import mercadopago; sdk = mercadopago.SDK(MP_ACCESS_TOKEN)
      [ ] preference_data = {
              "items": [PRODUCT_DETAILS[product]],
              "payer": {"email": payer_email} if payer_email else {},
              "back_urls": {"success": success_url, "failure": failure_url, "pending": pending_url},
              "auto_return": "approved",
              "notification_url": notification_url,
              "external_reference": f"{uid}:{product}",  # para reconciliação
              "statement_descriptor": "OCEAN WAYS",
          }
      [ ] preference_response = sdk.preference().create(preference_data)
      [ ] Verificar preference_response["status"] == 201
      [ ] Retornar init_point ou sandbox_init_point conforme ambiente

    Example response:
        {
            "checkout_url": "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=...",
            "preference_id": "abc123"
        }
    """
    if product not in PRODUCT_DETAILS:
        raise ValueError(f"Produto inválido: {product}")

    log.warning("mp_create_preference_not_implemented", uid=uid, product=product)
    raise NotImplementedError("TODO: implementar create_preference — ver docstring")


async def handle_webhook(body: dict, x_signature: str | None = None) -> dict:
    """
    Processa notificação IPN do MercadoPago.

    MercadoPago envia POST com topic=payment e id=<payment_id>.
    Deve-se buscar os detalhes do pagamento via SDK para confirmar status.

    Args:
        body: payload JSON do IPN ({"topic": "payment", "id": "123456"})
        x_signature: header x-signature para validação (MP Notifications v2)

    Returns:
        dict com status de processamento

    TODO (Maestro):
      [ ] Validar x-signature se MP Notifications v2 (HMAC-SHA256)
      [ ] Extrair payment_id de body["data"]["id"] ou body["id"]
      [ ] sdk.payment().get(payment_id) para buscar detalhes
      [ ] Verificar payment["status"] == "approved"
      [ ] Verificar idempotência (payment_id já processado?)
      [ ] Extrair uid de payment["external_reference"].split(":")[0]
      [ ] Extrair product de payment["external_reference"].split(":")[1]
      [ ] Chamar billing.credits.credit(uid, amount, reason)
      [ ] Para PLAN_PRO: atualizar Firestore users/{uid}.plan = "PRO"
          (MP não tem subscription nativa como Stripe — avaliar renovação manual via Scheduler)
      [ ] Gravar em BQ oceanways.transactions
      [ ] Retornar {"received": True, "status": "processed"} rapidamente
    """
    log.warning("mp_webhook_not_implemented")
    raise NotImplementedError("TODO: implementar handle_webhook — ver docstring")


# ---------------------------------------------------------------------------
# Nota sobre assinaturas recorrentes no MercadoPago
# ---------------------------------------------------------------------------
# MercadoPago tem Subscriptions mas com menos robustez que Stripe Subscriptions.
# Alternativa para PLAN_PRO:
#   Opção A: Usar MP Subscriptions (verificar suporte a BRL e documentação)
#   Opção B: Cobrar one-time a cada mês via link de pagamento + Cloud Scheduler que
#            suspende acesso Pro se não houver pagamento em até 5 dias do vencimento
# Decisão pendente: Maestro deve avaliar e documentar escolha em ARCHITECTURE.md
