"""
Ocean Ways — Sistema de Créditos
==================================
Gerencia o saldo e as movimentações de créditos dos usuários.

FONTE DE VERDADE: Firestore users/{uid}
  - credits_monthly: créditos do plano (expiram na renovação)
  - credits_topup: créditos top-up avulsos (sem expiração)
  - total = credits_monthly + credits_topup

LEDGER IMUTÁVEL: BigQuery oceanways.credits
  Cada operação (DEBIT, CREDIT, REFUND, EXPIRY) é registrada aqui.
  Nunca deletar rows — para correção, inserir REFUND.

Ordem de consumo: credits_monthly primeiro, depois credits_topup.

Planos e créditos mensais:
  FREE: 30 créditos/mês (expiram)
  PRO:  600 créditos/mês + rollover de até 200 para o mês seguinte

Custo por ação:
  SEARCH:     1 crédito
  ALERT_HIT:  2 créditos
  CACHE_HIT:  0 créditos (não debita)

TODO (Maestro):
  [ ] Implementar check_credits() — lê Firestore
  [ ] Implementar debit() — Firestore transaction + BQ insert
  [ ] Implementar credit() — chamado por webhook de pagamento
  [ ] Implementar expire_monthly() — chamado no renewal date (Cloud Scheduler)
  [ ] Implementar rollover() — aplica limite de 200 credits_monthly levados para o próximo mês
  [ ] Garantir atomicidade: usar Firestore transactions para evitar race conditions
  [ ] Testar cenário: duas buscas simultâneas do mesmo usuário não podem debitar mais do que o saldo
"""

import uuid
from datetime import datetime, timezone
from typing import Literal
import structlog

log = structlog.get_logger()

# Tipo das operações do ledger
OperationType = Literal["DEBIT", "CREDIT", "REFUND", "EXPIRY"]

# Tipo das razões do ledger
ReasonType = Literal["SEARCH", "ALERT_HIT", "PLAN_RENEWAL", "TOPUP", "REFUND", "EXPIRY"]

# Custo de cada ação em créditos
CREDIT_COST = {
    "SEARCH": 1,
    "ALERT_HIT": 2,
}


async def check_credits(uid: str, required: int) -> bool:
    """
    Verifica se o usuário tem créditos suficientes.

    Lê o saldo total (credits_monthly + credits_topup) do Firestore.

    Args:
        uid: Firebase UID do usuário
        required: quantidade de créditos necessários

    Returns:
        True se saldo >= required, False caso contrário

    TODO (Maestro):
      [ ] Ler Firestore users/{uid}.credits_monthly + credits_topup
      [ ] Retornar total >= required
    """
    # TODO: implementar
    log.warning("check_credits_not_implemented", uid=uid, required=required)
    return False


async def debit(
    uid: str,
    amount: int,
    reason: ReasonType,
    reference_id: str | None = None
) -> dict:
    """
    Debita créditos do usuário de forma atômica.

    Sequência (dentro de Firestore transaction):
      1. Ler saldo atual (credits_monthly, credits_topup)
      2. Verificar saldo >= amount (raise InsufficientCreditsError se não)
      3. Debitar credits_monthly primeiro, depois credits_topup
      4. Atualizar Firestore users/{uid}
      5. Inserir em BigQuery oceanways.credits (DEBIT)

    Args:
        uid: Firebase UID
        amount: créditos a debitar (positivo)
        reason: motivo do débito (SEARCH | ALERT_HIT)
        reference_id: search_id ou alert_id relacionado

    Returns:
        dict com credit_id, balance_after

    Raises:
        InsufficientCreditsError: saldo insuficiente
        FirestoreTransactionError: falha na transação (retry safe)

    TODO (Maestro): implementar com Firestore transaction para atomicidade
    """
    credit_id = str(uuid.uuid4())
    log.warning("debit_not_implemented", uid=uid, amount=amount, reason=reason)
    # TODO: implementar
    return {"credit_id": credit_id, "balance_after": -1, "status": "TODO"}


async def credit(
    uid: str,
    amount: int,
    reason: ReasonType,
    reference_id: str | None = None
) -> dict:
    """
    Credita créditos ao usuário.

    Chamado pelo webhook de pagamento após confirmação.
    Para PLAN_RENEWAL: repõe credits_monthly conforme plano.
    Para TOPUP: adiciona em credits_topup.

    Args:
        uid: Firebase UID
        amount: créditos a adicionar (positivo)
        reason: PLAN_RENEWAL | TOPUP | REFUND
        reference_id: transaction_id do gateway

    Returns:
        dict com credit_id, balance_after

    TODO (Maestro):
      [ ] Identificar se é credits_monthly ou credits_topup pelo reason
      [ ] Firestore transaction: incrementar campo correto
      [ ] Inserir em BigQuery oceanways.credits (CREDIT)
      [ ] Idempotência: se reference_id já existe no BQ, não creditar novamente
    """
    credit_id = str(uuid.uuid4())
    log.warning("credit_not_implemented", uid=uid, amount=amount, reason=reason)
    # TODO: implementar
    return {"credit_id": credit_id, "balance_after": -1, "status": "TODO"}


async def expire_monthly(uid: str) -> dict:
    """
    Expira créditos mensais não utilizados no renewal.

    Chamado pelo Cloud Scheduler no dia de renovação do plano.

    Sequência:
      1. Ler credits_monthly atual
      2. Aplicar rollover: min(credits_monthly, 200) → mover para próximo mês
      3. Zerar credits_monthly antigos
      4. Creditar novos créditos do plano (600 para Pro, 30 para Free)
      5. Inserir EXPIRY e CREDIT no BQ ledger

    TODO (Maestro): implementar como Cloud Run Job disparado por Cloud Scheduler
    """
    log.warning("expire_monthly_not_implemented", uid=uid)
    return {"status": "TODO"}


class InsufficientCreditsError(Exception):
    """Lançado quando o usuário não tem créditos suficientes."""
    def __init__(self, uid: str, required: int, balance: int):
        self.uid = uid
        self.required = required
        self.balance = balance
        super().__init__(
            f"Saldo insuficiente para {uid}: requer {required}, tem {balance}"
        )
