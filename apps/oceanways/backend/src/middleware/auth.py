"""
Ocean Ways — Firebase Auth Middleware
=======================================
Valida o Firebase JWT em cada request protegido.
Popula request.state.uid com o UID do usuário autenticado.

Uso:
    # Em main.py, adicionar como middleware global ou usar como dependência FastAPI:
    from middleware.auth import verify_firebase_token
    @router.get("/protected")
    async def endpoint(uid: str = Depends(verify_firebase_token)):
        ...

TODO (Maestro):
  [ ] Implementar verify_firebase_token como FastAPI Dependency
  [ ] Inicializar firebase_admin.app com Service Account do Secret Manager
  [ ] Tratar: token expirado (401), token inválido (401), token ausente (401)
  [ ] Não logar o token JWT em nenhum log
"""

import firebase_admin
from firebase_admin import auth as firebase_auth
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()


async def verify_firebase_token(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> str:
    """
    FastAPI dependency que valida o Firebase JWT.

    Retorna o uid do usuário autenticado.

    Raises:
        HTTPException 401: token ausente, inválido ou expirado

    TODO (Maestro): implementar o corpo abaixo
    """
    token = credentials.credentials

    # TODO: descomentar e implementar após inicializar firebase_admin.app
    # try:
    #     decoded_token = firebase_auth.verify_id_token(token)
    #     return decoded_token["uid"]
    # except firebase_auth.ExpiredIdTokenError:
    #     raise HTTPException(401, "Token Firebase expirado")
    # except firebase_auth.InvalidIdTokenError:
    #     raise HTTPException(401, "Token Firebase inválido")
    # except Exception as e:
    #     raise HTTPException(401, f"Erro de autenticação: {str(e)}")

    # PLACEHOLDER — remover quando implementado
    raise HTTPException(501, "Auth middleware não implementado — TODO")
