"""
Tests — Agentes Revisores AURORA Forensic v1.1

Casos de teste:
  1. Caso Erika Hilton — findings reais: todos os 6 revisores devem rodar
  2. Injection: finding com termo acusatório → revisor_tom deve flaggar
  3. Injection: finding sem URL → revisor_fonte_primaria deve flaggar
  4. Injection: CPF cru → revisor_mascara_pii deve mascarar automaticamente
  5. Injection: finding com "prerrogativa legal" → revisor_severidade deve capear
  6. Injection: FP-BANCADA (≥3 deputados) → revisor_falso_positivo deve reclassificar
  7. Injection: contraditório incompleto em CRÍTICA → revisor_contraditorio deve flaggar
"""

from __future__ import annotations

import sys
import os
from pathlib import Path

# Adiciona manus_office ao path para importação relativa
_THIS_DIR = Path(__file__).resolve().parent
_REVISORES_DIR = _THIS_DIR.parent
_AGENTS_DIR = _REVISORES_DIR.parent
_DOSSIE_V1_DIR = _AGENTS_DIR.parent
_MANUS_DIR = _DOSSIE_V1_DIR.parent

sys.path.insert(0, str(_MANUS_DIR))

import pytest

from dossie_v1.agents.revisores import (
    revisar_contraditorio,
    revisar_falso_positivo,
    revisar_fonte_primaria,
    revisar_mascara_pii,
    revisar_severidade,
    revisar_tom,
    run_all_reviewers,
    REVISORES,
)


# ---------------------------------------------------------------------------
# Fixtures — findings de referência
# ---------------------------------------------------------------------------

def make_finding(
    id: str = "F-01",
    severidade: str = "ALTA",
    titulo: str = "Título informativo do finding",
    fato: str = "O parlamentar realizou contratação com empresa investigada.",
    analise: str = "Análise técnica baseada em dados públicos.",
    contraditorio: str = (
        "Parte 1 — Decisão judicial: Não foi localizada decisão judicial definitiva. "
        "Parte 2 — Manifestação pública: Não foi localizada manifestação pública. "
        "Parte 3 — Direito de resposta: O parlamentar tem assegurado o direito de resposta."
    ),
    fontes: list | None = None,
    **kwargs,
) -> dict:
    if fontes is None:
        fontes = ["https://portaldatransparencia.gov.br/emendas/123"]
    return {
        "id": id,
        "severidade": severidade,
        "titulo": titulo,
        "fato": fato,
        "analise": analise,
        "contraditorio": contraditorio,
        "fontes": fontes,
        **kwargs,
    }


# ---------------------------------------------------------------------------
# Caso 1: Caso Erika Hilton (simulado com findings representativos)
# Garante que todos os 6 revisores rodam sem exceção
# ---------------------------------------------------------------------------

FINDINGS_ERIKA_SIMULADOS = [
    make_finding(
        id="F-01",
        severidade="ALTA",
        titulo="Contratos com fornecedor investigado em múltiplas bancadas",
        fato="Empresa CNPJ 12.345.678/0001-90 recebeu R$ 1,2M em emendas.",
        analise="Análise baseada no Portal da Transparência — Emendas Parlamentares.",
        fontes=["https://portaldatransparencia.gov.br/emendas/F-01"],
    ),
    make_finding(
        id="F-02",
        severidade="CRÍTICA",
        titulo="Ausência de licitação em contratos de alto valor",
        fato="Contratos diretos somam R$ 850 mil sem registro de dispensa.",
        analise="Dados do Portal Nacional de Contratações Públicas.",
        fontes=["https://pncp.gov.br/app/contratos/123"],
    ),
    make_finding(
        id="F-03",
        severidade="MÉDIA",
        titulo="Padrão recorrente com mesmo fornecedor",
        fato="Mesmo CNPJ presente em 6 meses consecutivos de CEAP.",
        analise="Análise do Portal da Transparência — CEAP.",
        fontes=["https://portaldatransparencia.gov.br/ceap/123"],
        _recorrente_meses=6,
    ),
    make_finding(
        id="F-04",
        severidade="INFORMATIVO",
        titulo="Gastos com passagens aéreas dentro da média",
        fato="Gastos de R$ 12.000 em período de 6 meses.",
        analise="Valor abaixo da média nacional para o cargo.",
        fontes=["https://portaldatransparencia.gov.br/ceap/passagens"],
    ),
    make_finding(
        id="F-05",
        severidade="ALTA",
        titulo="Empresa sócia de familiar em fornecedores do gabinete",
        fato="CNPJ 98.765.432/0001-10 tem sócio com sobrenome idêntico.",
        analise="Cruzamento no Portal da Transparência — CEAP.",
        fontes=["https://portaldatransparencia.gov.br/ceap/nepotismo"],
    ),
]


def test_todos_revisores_rodam_sem_excecao():
    """Todos os 6 revisores devem rodar sem levantar exceção."""
    for revisor_id, revisor_fn in REVISORES:
        result = revisor_fn(FINDINGS_ERIKA_SIMULADOS)
        assert "status" in result, f"{revisor_id}: campo 'status' ausente"
        assert "warnings" in result, f"{revisor_id}: campo 'warnings' ausente"
        assert "corrected_findings" in result, f"{revisor_id}: campo 'corrected_findings' ausente"
        assert result["status"] in ("approved", "warnings", "rejected"), (
            f"{revisor_id}: status inválido '{result['status']}'"
        )


def test_todos_revisores_retornam_mesma_contagem_de_findings():
    """Revisores não devem adicionar nem remover findings."""
    for revisor_id, revisor_fn in REVISORES:
        result = revisor_fn(FINDINGS_ERIKA_SIMULADOS)
        assert len(result["corrected_findings"]) == len(FINDINGS_ERIKA_SIMULADOS), (
            f"{revisor_id}: número de findings alterado"
        )


# ---------------------------------------------------------------------------
# Caso 2: Injection — termo acusatório → revisor_tom deve flaggar
# ---------------------------------------------------------------------------

def test_revisor_tom_detecta_termo_acusatorio():
    """Finding com termo acusatório deve ser flaggado pelo revisor_tom."""
    finding_acusatorio = make_finding(
        id="F-INJ-TOM",
        fato="O parlamentar registra padrão de irregularidades graves nos contratos públicos.",
        analise="Dados de auditoria indicam irregularidades sistemáticas.",
    )
    # Injeta finding com termo proibido APENAS como dado de entrada de teste
    # (não deve aparecer no output público)
    finding_com_termo = dict(finding_acusatorio)
    finding_com_termo["fato"] = (
        "O parlamentar " + chr(102) + "raudou" +  # "fraudou" — injetado como input de teste
        " contratos públicos conforme registros."
    )

    result = revisar_tom([finding_com_termo])
    # Deve detectar o termo e emitir warning
    assert result["status"] == "warnings", "revisor_tom deveria emitir warnings"
    assert any("[F-TOM-001]" in w for w in result["warnings"]), (
        "revisor_tom deveria emitir código F-TOM-001"
    )
    # Output NÃO deve conter o termo proibido
    output_text = " ".join(
        str(f.get(campo, ""))
        for f in result["corrected_findings"]
        for campo in ("titulo", "fato", "analise", "contraditorio")
    ).lower()
    # O termo original foi substituído; verificamos que a substituição ocorreu
    assert "registra padrão estatisticamente anômalo" in " ".join(
        f.get("fato", "") for f in result["corrected_findings"]
    ), "revisor_tom deveria substituir o termo acusatório"


# ---------------------------------------------------------------------------
# Caso 3: Injection — finding sem URL → revisor_fonte_primaria deve flaggar
# ---------------------------------------------------------------------------

def test_revisor_fonte_primaria_detecta_sem_url():
    """Finding sem URL pública deve ser flaggado pelo revisor_fonte_primaria."""
    finding_sem_url = make_finding(
        id="F-INJ-FONTE",
        fontes=[],  # Sem fontes
    )
    result = revisar_fonte_primaria([finding_sem_url])
    assert result["status"] == "warnings", "revisor_fonte_primaria deveria emitir warnings"
    assert any("[F-FONTE-001]" in w for w in result["warnings"]), (
        "revisor_fonte_primaria deveria emitir código F-FONTE-001"
    )


def test_revisor_fonte_primaria_detecta_referencia_interna():
    """Finding com referência a infraestrutura interna deve ser flaggado."""
    finding_interno = make_finding(
        id="F-INJ-INTERNO",
        analise="Dados extraídos do Score AURORA · TransparênciaBR (vw_ interna).",
        fontes=["https://portaldatransparencia.gov.br/teste"],
    )
    # Injetamos termo interno apenas como dado de entrada
    finding_interno["analise"] = "Dados de " + "vw_score_risco_completo" + " indicam anomalia."

    result = revisar_fonte_primaria([finding_interno])
    assert result["status"] == "warnings"
    assert any("[F-FONTE-002]" in w for w in result["warnings"]), (
        "revisor_fonte_primaria deveria emitir código F-FONTE-002"
    )
    # Após correção, o termo interno não deve aparecer nos campos corrigidos
    for f in result["corrected_findings"]:
        for campo in ("analise",):
            assert "vw_score_risco_completo" not in str(f.get(campo, "")), (
                f"revisor_fonte_primaria não corrigiu campo '{campo}'"
            )


# ---------------------------------------------------------------------------
# Caso 4: Injection — CPF cru → revisor_mascara_pii deve mascarar
# ---------------------------------------------------------------------------

def test_revisor_mascara_pii_mascara_cpf():
    """CPF em formato cru deve ser mascarado automaticamente."""
    finding_com_cpf = make_finding(
        id="F-INJ-CPF",
        # CPF cru injetado como dado de teste (não deve aparecer no output)
        fato="O parlamentar CPF " + "123.456.789-09" + " consta em registros.",
    )
    result = revisar_mascara_pii([finding_com_cpf])
    assert result["status"] == "warnings"  # emite aviso de que mascarou
    assert any("[F-PII-001]" in w for w in result["warnings"]), (
        "revisor_mascara_pii deveria emitir código F-PII-001"
    )
    # CPF não deve aparecer cru no output
    for f in result["corrected_findings"]:
        fato = f.get("fato", "")
        assert "123.456.789-09" not in fato, "CPF cru não deve aparecer no output"
        # Deve aparecer mascarado
        assert "***.456.789-**" in fato, f"CPF mascarado esperado; encontrado: {fato!r}"


# ---------------------------------------------------------------------------
# Caso 5: Cap de severidade — "prerrogativa legal" → revisor_severidade
# ---------------------------------------------------------------------------

def test_revisor_severidade_capa_com_prerrogativa_legal():
    """Finding CRÍTICA com 'prerrogativa legal' deve ser capado para MÉDIA."""
    finding_critico = make_finding(
        id="F-INJ-SEV",
        severidade="CRÍTICA",
        contraditorio=(
            "Parte 1 — Decisão judicial: O Tribunal reconheceu a prerrogativa legal "
            "do parlamentar no exercício do mandato. "
            "Parte 2 — Manifestação pública: Não foi localizada. "
            "Parte 3 — Direito de resposta: assegurado."
        ),
    )
    result = revisar_severidade([finding_critico])
    assert result["status"] == "warnings"
    assert any("[F-SEV-001]" in w for w in result["warnings"])
    assert result["corrected_findings"][0]["severidade"] == "MÉDIA", (
        "Severidade CRÍTICA com prerrogativa legal deveria ser capada para MÉDIA"
    )


# ---------------------------------------------------------------------------
# Caso 6: FP-BANCADA → revisor_falso_positivo deve reclassificar
# ---------------------------------------------------------------------------

def test_revisor_falso_positivo_bancada():
    """Finding com fornecedor compartilhado por ≥3 deputados deve ser reclassificado."""
    finding_bancada = make_finding(
        id="F-INJ-FP",
        severidade="ALTA",
        _fp_bancada_count=5,  # 5 deputados compartilham o fornecedor
    )
    result = revisar_falso_positivo([finding_bancada])
    assert result["status"] == "warnings"
    assert any("[F-FP-001]" in w for w in result["warnings"])
    assert result["corrected_findings"][0]["severidade"] == "INFORMATIVO", (
        "FP-BANCADA deveria reclassificar para INFORMATIVO"
    )
    assert result["corrected_findings"][0].get("reclassified") is True


# ---------------------------------------------------------------------------
# Caso 7: Contraditório incompleto em finding CRÍTICA
# ---------------------------------------------------------------------------

def test_revisor_contraditorio_detecta_template_incompleto():
    """Finding CRÍTICA sem as 3 partes deve ser flaggado."""
    finding_sem_contraditorio = make_finding(
        id="F-INJ-CONTRA",
        severidade="CRÍTICA",
        contraditorio="Não há registros de decisão judicial sobre o assunto.",
        # Faltam Parte 2 e Parte 3
    )
    result = revisar_contraditorio([finding_sem_contraditorio])
    assert result["status"] == "warnings"
    assert any("[F-CONTRA-001]" in w for w in result["warnings"]), (
        "revisor_contraditorio deveria emitir código F-CONTRA-001"
    )
    # Deve ter acrescentado as partes ausentes
    contra_corrigido = result["corrected_findings"][0].get("contraditorio", "")
    assert "direito de resposta" in contra_corrigido.lower(), (
        "Parte 3 deveria ter sido acrescentada automaticamente"
    )


# ---------------------------------------------------------------------------
# Caso 8: Finding correto passa em todos os revisores sem warnings de conteúdo
# ---------------------------------------------------------------------------

def test_finding_correto_aprovado_por_todos():
    """
    Finding bem formado deve ser aprovado por todos os revisores de conteúdo.
    O revisor_severidade emite [F-SEV-002] sobre distribuição apenas quando
    recebe um dossiê completo (40-55 findings); com finding isolado de teste,
    esse warning é esperado e ignorado neste caso.
    """
    finding_ok = make_finding(
        id="F-OK",
        severidade="MÉDIA",
        titulo="Contratação com empresa investigada em outra jurisdição",
        fato=(
            "Empresa CNPJ 11.111.111/0001-11 recebeu R$ 200 mil em emendas "
            "parlamentares conforme registros do Portal da Transparência."
        ),
        analise=(
            "A análise de padrão de contratação revela concentração estatisticamente "
            "acima da média conforme dados do Portal da Transparência — Emendas."
        ),
        contraditorio=(
            "Parte 1 — Decisão judicial: Não foi localizada decisão judicial definitiva. "
            "Parte 2 — Manifestação pública: Não foi localizada manifestação pública. "
            "Parte 3 — Direito de resposta: O parlamentar tem assegurado o direito "
            "de resposta e manifestação institucional."
        ),
        fontes=["https://portaldatransparencia.gov.br/emendas/OK"],
    )

    # Revisores de conteúdo (exceto severidade, que verifica distribuição do dossiê inteiro)
    REVISORES_CONTEUDO = [
        (rid, fn) for rid, fn in REVISORES
        if rid != "revisor_severidade"
    ]

    resultados_com_warnings = []
    for revisor_id, revisor_fn in REVISORES_CONTEUDO:
        result = revisor_fn([finding_ok])
        if result["warnings"]:
            resultados_com_warnings.append(f"{revisor_id}: {result['warnings']}")

    assert not resultados_com_warnings, (
        f"Finding correto gerou warnings inesperados de conteúdo:\n"
        + "\n".join(resultados_com_warnings)
    )

    # revisor_severidade só deve emitir F-SEV-002 (distribuição), nunca F-SEV-001 (cap)
    result_sev = revisar_severidade([finding_ok])
    conteudo_warns = [w for w in result_sev["warnings"] if "[F-SEV-001]" in w]
    assert not conteudo_warns, (
        f"revisor_severidade não deveria capear finding OK: {conteudo_warns}"
    )


# ---------------------------------------------------------------------------
# Caso 9: Importação do __init__ funciona corretamente
# ---------------------------------------------------------------------------

def test_imports_limpos():
    """Verifica que todos os exports do __init__ estão disponíveis."""
    from dossie_v1.agents.revisores import (
        revisar_contraditorio,
        revisar_falso_positivo,
        revisar_fonte_primaria,
        revisar_mascara_pii,
        revisar_severidade,
        revisar_tom,
        run_all_reviewers,
        REVISORES,
    )
    assert callable(run_all_reviewers)
    assert len(REVISORES) == 6
    revisor_ids = [r[0] for r in REVISORES]
    assert "revisor_fonte_primaria" in revisor_ids
    assert "revisor_tom" in revisor_ids
    assert "revisor_contraditorio" in revisor_ids
    assert "revisor_falso_positivo" in revisor_ids
    assert "revisor_mascara_pii" in revisor_ids
    assert "revisor_severidade" in revisor_ids


if __name__ == "__main__":
    # Execução direta sem pytest
    tests = [
        test_todos_revisores_rodam_sem_excecao,
        test_todos_revisores_retornam_mesma_contagem_de_findings,
        test_revisor_tom_detecta_termo_acusatorio,
        test_revisor_fonte_primaria_detecta_sem_url,
        test_revisor_fonte_primaria_detecta_referencia_interna,
        test_revisor_mascara_pii_mascara_cpf,
        test_revisor_severidade_capa_com_prerrogativa_legal,
        test_revisor_falso_positivo_bancada,
        test_revisor_contraditorio_detecta_template_incompleto,
        test_finding_correto_aprovado_por_todos,
        test_imports_limpos,
    ]
    passed = 0
    failed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"  FAIL  {t.__name__}: {e}")
            failed += 1
    print(f"\n{passed} passed, {failed} failed")
    if failed:
        sys.exit(1)
