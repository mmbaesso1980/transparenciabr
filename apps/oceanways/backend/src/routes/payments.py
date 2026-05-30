"""
Ocean Ways — Route: /api/v1/payments
=======================================
Endpoints de pagamento: Stripe e MercadoPago.

Fluxo Stripe:
  1. Frontend chama POST /payments/stripe/checkout com product=PLAN_PRO|TOPUP_100
  2. Backend cria Stripe Checkout Session e retorna URL
  3. Frontend redireciona para URL do Stripe
  4. Stripe chama webhook POST /payments/stripe/webhook após pagamento
  5. Webhook valida assinatura, credita créditos, atualiza Firestore

Fluxo MercadoPago:
  Similar ao Stripe, usando Checkout Pro do MP para Pix/boleto/cartão BR.

CRÍTICO:
  - Créditos SÓ são creditados após confirmação do webhook (nunca no redirect de sucesso)
  - Assinar webhook com Stripe-Signature header (Stripe) / X-Signature (MP)
  - Secrets via Secret Manager — nunca em env vars em texto claro

TODO (Maestro):
  [ ] Implementar POST /stripe/checkout
  [ ] Implementar POST /stripe/webhook (validar Stripe-Signature)
  [ ] Implementar POST /mp/checkout
  [ ] Implementar POST /mp/webhook (validar assinatura MP IPN)
  [ ] Idempotência: verificar se payment_id já foi processado antes de creditar
"""

import os
from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

# Produtos disponíveis
PRODUCTS = {
    "PLAN_PRO": {"credits": 600, "price_brl": 49.0, "recurring": True},
    "TOPUP_100": {"credits": 100, "price_brl": 10.0, "recurring": False},
}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class CheckoutRequest(BaseModel):
    """Request para criar sessão de checkout.

    Example:
        {
            "product": "PLAN_PRO",
            "gateway": "STRIPE",
            "success_url": "https://oceanways.com/dashboard?payment=success",
            "cancel_url": "https://oceanways.com/pricing?payment=cancelled"
        }
    """
    product: str  # PLAN_PRO | TOPUP_100
    gateway: str  # STRIPE | MERCADOPAGO
    success_url: str
    cancel_url: str


class CheckoutResponse(BaseModel):
    """Resposta com URL do checkout.

    Example:
        {
            "checkout_url": "https://checkout.stripe.com/pay/cs_test_...",
            "session_id": "cs_test_..."
        }
    """
    checkout_url: str
    session_id: str


# ---------------------------------------------------------------------------
# Endpoints — Stripe
# ---------------------------------------------------------------------------

@router.post("/stripe/checkout", response_model=CheckoutResponse,
             summary="Criar sessão Stripe Checkout")
async def stripe_create_checkout(request: Request, body: CheckoutRequest):
    """
    Cria uma sessão de checkout no Stripe para o produto solicitado.

    Retorna URL para redirecionar o usuário.

    TODO (Maestro):
      [ ] Validar product em PRODUCTS
      [ ] Criar stripe.checkout.Session com price_data ou price_id
      [ ] Para PLAN_PRO: usar mode="subscription"
      [ ] Para TOPUP_100: usar mode="payment"
      [ ] Incluir metadata: uid, product, credits
      [ ] Retornar session.url
    """
    if body.product not in PRODUCTS:
        raise HTTPException(400, f"Produto inválido: {body.product}. Use: {list(PRODUCTS.keys())}")

    # TODO: import stripe; stripe.api_key = get_secret("STRIPE_SECRET_KEY")
    # session = stripe.checkout.Session.create(...)
    return CheckoutResponse(
        checkout_url="TODO://stripe-checkout-url-here",
        session_id="TODO_session_id"
    )


@router.post("/stripe/webhook", summary="Webhook Stripe (não expor no docs público)")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None, alias="stripe-signature")
):
    """
    Recebe eventos do Stripe após pagamento.

    Valida assinatura com STRIPE_WEBHOOK_SECRET.
    Processa: checkout.session.completed → credita créditos + atualiza plano.

    TODO (Maestro):
      [ ] Ler body como bytes (não JSON) para validação de assinatura
      [ ] stripe.Webhook.construct_event(payload, sig, webhook_secret)
      [ ] Verificar idempotência (gateway_payment_id já processado?)
      [ ] Creditar créditos via billing/credits.py credit_user()
      [ ] Gravar em BQ oceanways.transactions
      [ ] Retornar 200 rapidamente (< 30s) — processar async se necessário
    """
    # TODO: implementar
    return {"received": True, "status": "TODO"}


# ---------------------------------------------------------------------------
# Endpoints — MercadoPago
# ---------------------------------------------------------------------------

@router.post("/mp/checkout", response_model=CheckoutResponse,
             summary="Criar sessão MercadoPago Checkout Pro")
async def mp_create_checkout(request: Request, body: CheckoutRequest):
    """
    Cria uma preferência de pagamento no MercadoPago (Pix, boleto, cartão BR).

    TODO (Maestro):
      [ ] import mercadopago; sdk = mercadopago.SDK(MP_ACCESS_TOKEN)
      [ ] preference_data com items, payer, back_urls, notification_url
      [ ] Retornar preference.response["sandbox_init_point"] (staging) ou init_point (prod)
    """
    if body.product not in PRODUCTS:
        raise HTTPException(400, f"Produto inválido: {body.product}")

    # TODO: implementar
    return CheckoutResponse(
        checkout_url="TODO://mp-checkout-url-here",
        session_id="TODO_preference_id"
    )


@router.post("/mp/webhook", summary="Webhook MercadoPago IPN (não expor no docs público)")
async def mp_webhook(request: Request):
    """
    Recebe notificações IPN do MercadoPago.

    TODO (Maestro):
      [ ] Validar x-signature header (HMAC-SHA256 com MP_WEBHOOK_SECRET)
      [ ] Verificar tipo: payment, subscription_authorized
      [ ] Buscar payment via SDK para confirmar status
      [ ] Idempotência (payment.id já processado?)
      [ ] Creditar créditos + gravar BQ
    """
    # TODO: implementar
    return {"received": True, "status": "TODO"}
