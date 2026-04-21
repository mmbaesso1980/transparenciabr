#!/usr/bin/env python3
"""
Operação DRACULA — varredura semântica de contratos (Gemini Pro).

SDK: google-genai — ``genai.Client(api_key=...)`` /
``client.models.generate_content(...)``.

Mock embutido para homologação imediata com GEMINI_API_KEY.
"""

import json
import logging
import os
import re
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from google import genai
from google.genai import types

from lib.genai_client import require_gemini_api_key
from lib.gemini_resilience import CircuitBreaker, CircuitBreakerConfig, call_with_retries

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

GEMINI_MODEL = os.environ.get("GEMINI_DRACULA_MODEL", "gemini-2.5-pro")
MAX_RETRIES = int(os.environ.get("DRACULA_GEMINI_RETRIES", "5"))

# ── Contrato fictício (educacional) — padrões de alto risco institucional ───

MOCK_CONTRATO_LICITACAO_SAUDE = """
INSTRUMENTO CONTRATUAL Nº 7788/2025 — SECRETARIA MUNICIPAL DE SAÚDE DO MUNICÍPIO DE SÃO JOSÉ DO VALE VERDE / BRASIL

CONTRATADA: CONSÓRCIO INTERMÁDICO SAÚDE TOTAL LTDA., inscrita no CNPJ sob o nº 12.345.678/0001-99.

OBJETO: Prestação integrada de serviços assistenciais ambulatoriais e hospitalares na rede própria e conveniada,
abrangindo medicamentos de alto custo e insumos estratégicos, pelo período de 60 (sessenta) meses.

CLÁUSULA 3ª — DA DISPENSA DE LICITAÇÃO E SELEÇÃO
Nos termos do art. 24, inciso II, da Lei nº 8.666/93 (redação aplicável por analogia),
fica dispensada qualquer forma competitiva de seleção para contratações emergenciais de insumos críticos,
sendo suficiente o termo de justificativa interna assinado pelo Secretário ou seu substituto eventual,
sem necessidade de publicação prévia em diário oficial ou parecer jurídico vinculante.

CLÁUSULA 7ª — REPASSES FINANCEIROS EM REGIME DE URGÊNCIA
O Poder Público Contratante poderá efetuar repasses extraordinários até o limite de R$ 50.000.000,00 (cinquenta milhões)
por exercício financeiro, mediante simples solicitação da CONTRATADA, independentemente de cronograma físico-financeiro
detalhado ou comprovação prévia de desembolso, desde que fundada em "circunstâncias excepcionais de saúde pública".

CLÁUSULA 11ª — SUBCONTRATAÇÃO LIVRE
A CONTRATADA poderá subcontratar, sem limite percentual sobre o valor do contrato, qualquer terceiro, consórcio ou off-shore,
mediante mera comunicação posterior ao órgão contratante em até 180 (cento e oitenta) dias da execução do subcontrato,
isenta de solidariedade objetiva quanto a obrigações trabalhistas, tributárias ou ambientais desses terceiros.

CLÁUSULA 14ª — LIMITAÇÃO À FISCALIZAÇÃO E AUDITORIA DE TERCEIROS
Os órgãos de controle externo e interno ficam impedidos de realizar auditorias surpresa em instalações da CONTRATADA
fora do horário comercial das 10h às 16h, bem como de requisitar documentação eletrônica integral,
podendo apenas solicitar amostras representativas pré-selecionadas pela própria CONTRATADA.

CLÁUSULA 18ª — PENALIDADES E MULTAS
Em caso de inexecução parcial atribuível ao interesse público, não haverá multa à CONTRATADA.
Em caso de descumprimento pela Administração, esta pagará à CONTRATADA multa moratória de 25% (vinte e cinco por cento)
ao mês sobre o valor residual do contrato, capitalizável diariamente, acrescida de honorários advocatícios arbitrados em favor da CONTRATADA.

Por estarem justos e contratados, assinam o presente instrumento na presença de duas testemunhas habilitadas.
"""

SYSTEM_DRACULA = """\
Você é analista forense de contratos públicos do TransparênciaBR (Operação DRACULA).

Missão: examinar o texto contratual fornecido e identificar **cláusulas predatórias**
ou de alto risco para o erário ou para a competitividade, por exemplo (lista não exaustiva):
- dispensa ou flexibilização indevida de licitação ou competição;
- repasses emergenciais sem critérios claros ou sem contrapartidas;
- subcontratação livre sem limites, sem responsabilidade solidária ou sem aprovação;
- confisco de direitos de auditores ou limitação de fiscalização;
- indexadores ou multas excessivas que desequilibrem o contrato.

Regras:
1) Baseie-se apenas no texto recebido; não invente fatos externos.
2) Produza um **Índice de Corrupção** de 0 (baixíssimo risco aparente) a 100 (risco institucional extremo),
   refletindo **potencial** de desenho contratual lesivo — não é sentença judicial.
3) Liste cada achado em ``clausulas_suspeitas`` com referência textual curta e tipo de risco.
4) Responda **somente JSON válido** no schema pedido — sem markdown.
"""

OUTPUT_SCHEMA_HINT = """\
Schema JSON obrigatório:
{
  "indice_corrupcao": <inteiro 0 a 100>,
  "confianca_analise": <float 0 a 1>,
  "clausulas_suspeitas": [
    {
      "trecho": "citação curta do contrato",
      "tipo_risco": "licitacao|repasse|subcontratacao|fiscalizacao|outro",
      "justificativa": "por que é problemático"
    }
  ],
  "sumario_executivo": "até 4 frases para gestores/cidadãos"
}
"""


def analyze_contract_text(
    texto_contrato: str,
    *,
    client: Optional[Any] = None,
    metadata: Optional[Dict[str, Any]] = None,
    breaker_factory: Optional[Callable[[], CircuitBreaker]] = None,
) -> Dict[str, Any]:
    gc = client or genai.Client(api_key=require_gemini_api_key())
    breaker = (
        breaker_factory()
        if breaker_factory
        else CircuitBreaker(CircuitBreakerConfig())
    )

    payload = {
        "contrato_texto": texto_contrato,
        "metadata": metadata or {},
    }

    prompt = json.dumps(payload, ensure_ascii=False, indent=2) + "\n\n" + OUTPUT_SCHEMA_HINT

    def _invoke() -> Dict[str, Any]:
        def _call() -> Dict[str, Any]:
            config = types.GenerateContentConfig(
                system_instruction=SYSTEM_DRACULA,
                response_mime_type="application/json",
                max_output_tokens=8192,
                temperature=0.1,
            )
            resp = gc.models.generate_content(
                model=os.environ.get("GEMINI_DRACULA_MODEL", "gemini-2.5-pro"),
                contents=prompt,
                config=config,
            )

            raw_text = (resp.text or "").strip()

            # Limpeza agressiva de Markdown que o LLM insiste em adicionar
            raw_text = re.sub(r"^```json\s*", "", raw_text, flags=re.MULTILINE)
            raw_text = re.sub(r"^```\s*$", "", raw_text, flags=re.MULTILINE)
            raw_text = raw_text.strip()

            try:
                return json.loads(raw_text)
            except json.JSONDecodeError as e:
                print(f"CRÍTICO | Falha no parser JSON. Raw output:\n{raw_text}\n")
                raise e

        return call_with_retries(
            _call,
            max_attempts=MAX_RETRIES,
            operation="gemini-dracula",
        )

    return breaker.call(_invoke, operation="dracula-contract")


def chunk_text(text: str, max_chars: int = 24000) -> List[str]:
    text = text.strip()
    if len(text) <= max_chars:
        return [text]
    return [text[i : i + max_chars] for i in range(0, len(text), max_chars)]


def main() -> int:
    logger.info(
        "Operação DRACULA — modelo=%s (SDK google-genai)",
        GEMINI_MODEL,
    )

    resultado = analyze_contract_text(
        MOCK_CONTRATO_LICITACAO_SAUDE,
        metadata={
            "origem": "mock_interno_homologacao",
            "tipo": "contrato_saude_licitacao_ficticio",
        },
    )

    indice = resultado.get("indice_corrupcao")

    print()
    print("=" * 60)
    print("  Operação DRACULA — ÍNDICE DE CORRUPÇÃO (mock contrato saúde)")
    print("=" * 60)
    print(f"\n  ÍNDICE DE CORRUPÇÃO: {indice}\n")
    print("─" * 60)
    print(json.dumps(resultado, ensure_ascii=False, indent=2))
    print("─" * 60)
    print()

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        logger.exception(
            "Falha na Operação DRACULA — verifique GEMINI_API_KEY e conectividade."
        )
        sys.exit(1)
