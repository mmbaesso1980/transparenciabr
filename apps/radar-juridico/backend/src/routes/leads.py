"""
Rotas /leads — Radar Jurídico INSS (Paywall 1)

Expõe leads de indeferimentos INSS com score ICP.
CPF NUNCA é retornado em claro — sempre mascarado ou ausente.

Todas as queries vão para BigQuery (southamerica-east1).
O frontend NUNCA acessa BigQuery diretamente.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

router = APIRouter()

# ---------------------------------------------------------------------------
# GET /leads — listagem paginada com filtros
# ---------------------------------------------------------------------------
@router.get("/")
async def list_leads(
    request: Request,
    page: int = Query(default=1, ge=1, description="Página (1-indexed)"),
    page_size: int = Query(default=25, ge=1, le=100, description="Itens por página"),
    uf: str = Query(default="", description="Filtro por UF (ex: SP, PR, ES)"),
    especie: int = Query(default=0, description="Filtro por código de espécie INSS"),
    tipo_acao: str = Query(default="", description="Filtro por tipo de ação ICP"),
    score_min: float = Query(default=0.0, ge=0.0, le=100.0, description="Score mínimo ICP"),
    foco_atual: bool = Query(default=False, description="Apenas leads de foco atual"),
):
    """
    Retorna leads INSS qualificados com score ICP.

    Requer: Paywall 1 (1 crédito por chamada).
    Sem PII — CPF mascarado como '***.***.***-**'.

    Exemplo de resposta esperada:
    {
      "leads": [
        {
          "lead_id": "uuid-xxx",
          "uf": "PR",
          "especie_nome": "Aposentadoria por Invalidez",
          "motivo_indeferimento": "Ausência de incapacidade laborativa",
          "score_match_icp": 87.5,
          "tipo_acao_id": "pcd_idade",
          "tipo_acao_label": "PCD por Idade (LC 142)",
          "tese_recomendada": "...",
          "foco_atual": true,
          "ticket_estimado_brl": 12000.0,
          "prob_conversao": "Alta",
          "cpf_mascarado": "***.***.***-**",
          "aps_nome": "APS Curitiba Centro"
        }
      ],
      "total": 2850,
      "page": 1,
      "page_size": 25,
      "credito_debitado": true
    }
    """
    # TODO(maestro): implementar fluxo completo:
    #
    # 1. Verificar autenticação (request.state.uid deve estar definido pelo middleware)
    #    uid = request.state.uid
    #    claims = request.state.claims
    #
    # 2. Verificar saldo de créditos via Firestore (Admin SDK):
    #    saldo = await bq_service.get_creditos(uid)
    #    if saldo < 1 and not claims.get("creditos_ilimitados"):
    #        return JSONResponse({"error": "Créditos insuficientes", "saldo": saldo}, status_code=402)
    #
    # 3. Debitar 1 crédito ANTES de executar a query BQ:
    #    await firestore_service.debitar_credito(uid, custo=1, acao="leads_consulta")
    #
    # 4. Executar query no BigQuery (dataset radar_juridico, southamerica-east1):
    #    leads = await bq_service.query_leads(
    #        page=page, page_size=page_size, uf=uf, especie=especie,
    #        tipo_acao=tipo_acao, score_min=score_min, foco_atual=foco_atual
    #    )
    #    # A query usa a view vw_leads_scored_safe que NUNCA retorna CPF em claro
    #
    # 5. Log LGPD:
    #    await lgpd_audit(uid=uid, acao="leads_listagem", connector="internal")
    #
    # 6. Retornar JSON sanitizado

    return JSONResponse(
        {
            "error": "TODO(maestro): implementar query BigQuery + débito de créditos",
            "endpoint": "GET /leads",
            "paywall": "paywall1",
            "custo_creditos": 1,
        },
        status_code=501,
    )


# ---------------------------------------------------------------------------
# GET /leads/{lead_id} — detalhe de um lead específico
# ---------------------------------------------------------------------------
@router.get("/{lead_id}")
async def get_lead(lead_id: str, request: Request):
    """
    Retorna detalhes completos de um lead específico.

    Requer: Paywall 1 (sem crédito adicional se já consultou a listagem
    na mesma sessão — TODO(maestro): definir política de cache de sessão).

    Exemplo de resposta esperada:
    {
      "lead_id": "uuid-xxx",
      "uf": "PR",
      "especie_nome": "Aposentadoria por Invalidez",
      "motivo_indeferimento": "Ausência de incapacidade laborativa",
      "score_match_icp": 87.5,
      "tipo_acao_id": "pcd_idade",
      "tipo_acao_label": "PCD por Idade (LC 142)",
      "tese_recomendada": "Conforme LC 142/2013, o segurado com deficiência...",
      "foco_atual": true,
      "ticket_estimado_brl": 12000.0,
      "prob_conversao": "Alta",
      "cpf_mascarado": "***.***.***-**",
      "aps_nome": "APS Curitiba Centro",
      "clientela": "Urbano",
      "forma_filiacao": "Empregado",
      "ramo_atividade": "Indústria de transformação",
      "dt_indeferimento": "2025-03-15",
      "proxima_acao": "Consultar PJe TRF3 para verificar litispendência",
      "alerta_configurado": false,
      "pje_status": "DESCONHECIDO"
    }
    """
    # TODO(maestro): implementar:
    # 1. Verificar auth + Paywall 1 (crédito já debitado na listagem ou debitar aqui)
    # 2. SELECT * FROM vw_leads_scored_safe WHERE lead_id = @lead_id
    # 3. Verificar cache PJe (radar_juridico_pje_cache) — retornar status se < 48h
    # 4. Se cache expirado, marcar pje_status = 'DESCONHECIDO' (não bloquear)

    return JSONResponse(
        {
            "error": "TODO(maestro): implementar busca por lead_id no BQ",
            "lead_id": lead_id,
        },
        status_code=501,
    )


# ---------------------------------------------------------------------------
# GET /leads/export/csv — export CSV com header LGPD
# ---------------------------------------------------------------------------
@router.get("/export/csv")
async def export_leads_csv(
    request: Request,
    uf: str = Query(default=""),
    especie: int = Query(default=0),
    score_min: float = Query(default=70.0),
    limit: int = Query(default=100, le=100),
):
    """
    Export CSV de leads qualificados.
    Custo: 5 créditos.

    O CSV inclui OBRIGATORIAMENTE o header LGPD:
        # TransparenciaBR - Radar Juridico INSS
        # Base legal: LGPD art. 7 IX (legitimo interesse) | art. 11 II g (saude)
        # Fonte: dados.gov.br - Beneficios Indeferidos (dados publicos)
        # Diagnostico final cabe exclusivamente ao advogado responsavel.
        # Descadastro: contato@transparenciabr.com.br

    Sem CPF, sem nome — apenas dados demográficos agregados.

    TODO(maestro): implementar:
    1. Verificar auth + Paywall 1 (5 créditos)
    2. Query BQ com LIMIT 100
    3. Serializar CSV com header LGPD obrigatório
    4. Retornar StreamingResponse com Content-Disposition: attachment
    """
    return JSONResponse(
        {
            "error": "TODO(maestro): implementar export CSV com header LGPD",
            "custo_creditos": 5,
        },
        status_code=501,
    )
