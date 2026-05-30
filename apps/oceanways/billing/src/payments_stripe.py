"""
Ocean Ways — Stripe Payment Integration
=========================================
Integração com Stripe para cartão de crédito/débito (nacional e internacional).

Produtos Stripe:
  PLAN_PRO:  Subscription · R$ 49/mês · 600 créditos
  TOPUP_100: One-time payment · R$ 10 · 100 créditos

Configuração necessária:
  - Conta Stripe em stripe.com/br
  - Verificar KYB (Know Your Business) para receber pagamentos
  - Criar produtos/preços no Stripe Dashboard (ou via API)
  - Ativar Stripe Tax para emissão de nota fiscal (R2)
  - Configurar webhook endpoint no Stripe Dashboard

Secrets (via Secret Manager — NUNCA em env vars em texto claro):
  STRIPE_SECRET_KEY          ex: sk_live_...
  STRIPE_PUBLISHABLE_KEY     ex: pk_live_... (pode ir no frontend)
  STRIPE_WEBHOOK_SECRET      ex: whsec_...
  STRIPE_PRICE_ID_PRO        ex: price_... (ID do plano Pro mensal)
  STRIPE_PRICE_ID_TOPUP      ex: price_... (ID do top-up avulso)

TODO (Maestro):
  [ ] pip install stripe
  [ ] Criar conta Stripe + KYB
  [ ] Criar produtos e preços no Stripe
  [ ] Gravar secrets no Secret Manager
  [ ] Implementar create_checkout_session()
  [ ] Implementar handle_webhook_event()
  [ ] Implementar cancel_subscription() para quando usuário deletar conta
  [ ] Testar com Stripe CLI: stripe listen --forward-to localhost:8080/api/v1/payments/stripe/webhook
"""

import structlog
from typing import Literal

log = structlog.get_logger()

ProductType = Literal["PLAN_PRO", "TOPUP_100"]


async def create_checkout_session(
    uid: str,
    product: ProductType,
    success_url: str,
    cancel_url: str
) -> dict:
    """
    Cria uma sessão de Stripe Checkout.

    Para PLAN_PRO: mode="subscription" com trial_period_days=0
    Para TOPUP_100: mode="payment" (one-time)

    Args:
        uid: Firebase UID do usuário (gravado em metadata para reconciliação)
        product: produto a ser comprado
        success_url: URL de redirect após sucesso
        cancel_url: URL de redirect se o usuário cancelar

    Returns:
        dict com checkout_url e session_id

    TODO (Maestro):
      [ ] import stripe; stripe.api_key = await get_secret("STRIPE_SECRET_KEY")
      [ ] Determinar mode e price_id pelo product
      [ ] stripe.checkout.Session.create(
              mode=mode,
              line_items=[{"price": price_id, "quantity": 1}],
              metadata={"uid": uid, "product": product},
              success_url=success_url,
              cancel_url=cancel_url,
              customer_email=None,  # TODO: buscar e-mail do Firebase Auth
          )
      [ ] Retornar {"checkout_url": session.url, "session_id": session.id}

    Example response:
        {
            "checkout_url": "https://checkout.stripe.com/pay/cs_test_abc123",
            "session_id": "cs_test_abc123"
        }
    """
    log.warning("stripe_checkout_not_implemented", uid=uid, product=product)
    raise NotImplementedError("TODO: implementar Stripe Checkout — ver docstring")


async def handle_webhook_event(payload: bytes, stripe_signature: str) -> dict:
    """
    Processa evento recebido do webhook Stripe.

    Valida assinatura com STRIPE_WEBHOOK_SECRET.
    Processa: checkout.session.completed, invoice.payment_succeeded,
              customer.subscription.deleted (cancelamento).

    Args:
        payload: body bruto da request (bytes — necessário para validar assinatura)
        stripe_signature: valor do header Stripe-Signature

    Returns:
        dict com event_type e status de processamento

    TODO (Maestro):
      [ ] stripe.Webhook.construct_event(payload, stripe_signature, webhook_secret)
      [ ] Verificar idempotência: BQ SELECT WHERE gateway_payment_id = event.data.object.id
      [ ] Para checkout.session.completed:
            - Extrair uid de session.metadata["uid"]
            - Extrair product de session.metadata["product"]
            - Chamar billing.credits.credit(uid, amount, reason)
            - Se PLAN_PRO: atualizar Firestore users/{uid}.plan = "PRO"
            - Gravar em BQ oceanways.transactions
      [ ] Para customer.subscription.deleted:
            - Fazer downgrade para FREE
            - Não remover créditos já creditados
      [ ] Retornar 200 rapidamente (Stripe retentar em caso de timeout)
    """
    log.warning("stripe_webhook_not_implemented")
    raise NotImplementedError("TODO: implementar handle_webhook_event — ver docstring")


async def cancel_subscription(stripe_subscription_id: str) -> bool:
    """
    Cancela assinatura Stripe (chamado quando usuário deleta conta).

    Args:
        stripe_subscription_id: ID da assinatura Stripe

    Returns:
        True se cancelado com sucesso

    TODO (Maestro): stripe.Subscription.cancel(stripe_subscription_id)
    """
    log.warning("stripe_cancel_not_implemented")
    raise NotImplementedError("TODO: implementar cancel_subscription")
