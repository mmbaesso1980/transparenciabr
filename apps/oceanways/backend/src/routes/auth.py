"""
Ocean Ways — Route: /api/v1/auth
==================================
Autenticação e gerenciamento de perfil do usuário.

Autenticação: Firebase Auth → JWT no header Authorization: Bearer <token>
O middleware (middleware/auth.py) valida o JWT e popula request.state.uid.

TODO (Maestro):
  [ ] Implementar middleware de verificação de Firebase JWT (firebase_admin.auth.verify_id_token)
  [ ] Implementar endpoint /me com dados do Firestore
  [ ] Implementar DELETE /me (right to erasure LGPD)
  [ ] Implementar GET /me/data (portabilidade de dados LGPD)
  [ ] Implementar PATCH /me para atualização de perfil
  [ ] Criar documento Firestore users/{uid} no primeiro login (trigger ou endpoint /me/init)
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class UserProfile(BaseModel):
    """Perfil público do usuário (sem PII sensível).

    Example:
        {
            "uid": "firebase_uid_abc123",
            "plan": "PRO",
            "credits_balance": 547,
            "alerts_active": 3,
            "member_since": "2026-06-01T00:00:00Z"
        }
    """
    uid: str
    plan: str  # FREE | PRO
    credits_balance: int
    alerts_active: int
    member_since: Optional[str]


class ConsentUpdate(BaseModel):
    """Atualização de consentimento LGPD.

    Example:
        {
            "store_search_history": true,
            "receive_alert_emails": true
        }
    """
    store_search_history: bool
    receive_alert_emails: bool


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/me", response_model=UserProfile, summary="Perfil do usuário autenticado")
async def get_me(request: Request):
    """
    Retorna perfil do usuário autenticado via Firebase JWT.

    Dados lidos do Firestore users/{uid}.

    TODO (Maestro): extrair uid de request.state.uid (após middleware de auth)
    """
    # uid = request.state.uid
    uid = "TODO_EXTRACT_FROM_JWT"

    # TODO: ler Firestore doc users/{uid}
    # user_doc = await firestore_client.collection("users").document(uid).get()
    # if not user_doc.exists: raise HTTPException(404, "Usuário não encontrado")

    return UserProfile(
        uid=uid,
        plan="FREE",
        credits_balance=0,
        alerts_active=0,
        member_since=None,
    )


@router.patch("/me", summary="Atualizar perfil")
async def update_me(request: Request, display_name: Optional[str] = None):
    """
    Atualiza campos permitidos do perfil no Firestore.

    Campos editáveis: display_name, notification_email.
    Campos imutáveis: uid, plan (alterado via billing), credits_balance (via ledger).

    TODO (Maestro): validar campos; atualizar Firestore users/{uid}
    """
    # TODO: implementar
    return {"message": "TODO: não implementado"}


@router.patch("/me/consent", summary="Atualizar consentimento LGPD")
async def update_consent(request: Request, body: ConsentUpdate):
    """
    Grava/atualiza consentimento do usuário (LGPD Art. 8°).

    Cada atualização é registrada em Firestore users/{uid}.consent_log
    como array append (imutável por design — não deletar registros do log).

    TODO (Maestro):
      [ ] Gravar consent_log com timestamp ISO + valores
      [ ] Atualizar flags ativas em users/{uid}.consent
    """
    # TODO: implementar
    return {"message": "TODO: não implementado"}


@router.get("/me/data", summary="Exportar dados pessoais (portabilidade LGPD)")
async def export_my_data(request: Request):
    """
    Retorna todos os dados do usuário em JSON para download (LGPD Art. 18, III).

    Inclui: perfil, histórico de buscas, alertas, transações.
    NÃO inclui: logs de sistema, dados anonimizados no BQ.

    TODO (Maestro):
      [ ] Coletar dados do Firestore (perfil, alertas)
      [ ] Coletar dados do BQ (searches, transactions) WHERE uid = ?
      [ ] Retornar JSON compactado ou acionar geração de arquivo no GCS
    """
    # TODO: implementar
    return {"message": "TODO: não implementado", "data": {}}


@router.delete("/me", summary="Excluir conta (direito ao esquecimento LGPD)")
async def delete_me(request: Request):
    """
    Exclui conta do usuário (LGPD Art. 18, VI).

    Sequência:
      1. Cancelar plano Pro ativo no Stripe/MP (se houver)
      2. Desativar todos os alertas (oceanways.alerts SET active=FALSE)
      3. Pseudonimizar rows em BigQuery (uid → hash irreversível)
      4. Deletar documento Firestore users/{uid}
      5. Revogar tokens Firebase (firebase_admin.auth.revoke_refresh_tokens)
      6. Deletar usuário Firebase Auth

    TODO (Maestro): implementar com transação/saga pattern; logar audit trail antes de deletar.
    """
    # TODO: implementar
    return {"message": "TODO: não implementado"}
