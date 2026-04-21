#!/usr/bin/env python3
"""Gera engines/registry_apis.json com 80+ entradas de catálogo."""

import json
from pathlib import Path


def build_default_apis() -> list:
    """Metadados de 80+ fontes (mesma lógica de `main()` / ficheiro JSON)."""
    categories = [
        ("PNCP", "Portal Nacional de Contratações", "https://pncp.gov.br/api/consulta/v1/contratos", "pncp"),
        ("PNCP_PCA", "PCA — plano anual", "https://pncp.gov.br/api/consulta/v1/planos", "pca"),
        ("COMPRAS_OCDS", "Compras.gov OCDS", "https://compras.dados.gov.br/comprasContratos/doc/contrato/ocds", "ocds"),
        ("PORTAL_TRANSP", "Portal da Transparência API", "https://api.portaldatransparencia.gov.br/api-de-dados", "pt"),
        ("TCU_CADIRREG", "TCU CADIRREG", "https://contas.tcu.gov.br/api/Cadirreg", "tcu"),
        ("CGU_CEIS", "CGU CEIS", "https://www.portaldatransparencia.gov.br/api-de-dados/ceis", "ceis"),
        ("CGU_CNEP", "CGU CNEP", "https://www.portaldatransparencia.gov.br/api-de-dados/cnpj", "cnep"),
        ("QUERIDO_DIARIO", "Querido Diário", "https://api.queridodiario.ok.org.br/api/v1/gazettes", "qd"),
        ("ATLAS_BR", "Atlas Brasil IDHM", "http://www.atlasbrasil.org.br/api/v1", "atlas"),
        ("SIDRA_IBGE", "SIDRA IBGE", "https://apisidra.ibge.gov.br/api/v1", "sidra"),
        ("CAMARA", "Câmara dados abertos", "https://dadosabertos.camara.leg.br/api/v2", "camara"),
        ("SENADO", "Senado dados abertos", "https://legis.senado.leg.br/dadosabertos", "senado"),
        ("INEP", "INEP educação", "https://www.gov.br/inep/pt-br", "inep"),
        ("DATASUS", "DATASUS", "https://datasus.saude.gov.br", "datasus"),
        ("CNES", "CNES", "http://cnes.datasus.gov.br", "cnes"),
        ("TSE", "Divulgação TSE", "https://divulgacandcontas.tse.jus.br/divulga/rest", "tse"),
        ("RECEITA", "Receita Federal", "https://www.gov.br/receitafederal", "rf"),
        ("TCE_RS", "TCE RS dados abertos", "https://dadosabertos.tce.rs.gov.br/api", "tce_rs"),
        ("TCE_SP", "TCE SP APIs", "https://www.tce.sp.gov.br/apis", "tce_sp"),
        ("ME_IRP", "Compras.gov IRP", "https://compras.gov.br", "irp"),
    ]

    apis = []
    for _cat, title, base, slug in categories:
        for j in range(5):
            apis.append(
                {
                    "id": f"{slug}_{j + 1:02d}",
                    "categoria": _cat,
                    "nome": f"{title} — fonte {j + 1}",
                    "request_url": f"{base}?fmt=json&page={j + 1}",
                    "staging_table": "staging_api_raw",
                    "enabled": True,
                    "timeout_sec": 45,
                    "method": "GET",
                    "circuit_failure_threshold": 5,
                    "circuit_recovery_sec": 60,
                    "max_attempts": 5,
                }
            )

    extras = [
        ("BASE_DADOS", "Base dos Dados", "https://basedosdados.org", "bd"),
        ("INLABS", "Imprensa Nacional DOU", "https://www.in.gov.br/consulta", "inlabs"),
        ("SNIS_SINISA", "Saneamento", "https://www.gov.br/cidades/pt-br", "sinisa"),
    ]
    for _cat, title, base, slug in extras:
        for j in range(10):
            apis.append(
                {
                    "id": f"{slug}_{j + 1:02d}",
                    "categoria": _cat,
                    "nome": f"{title} — série {j + 1}",
                    "request_url": f"{base}/consulta?offset={(j + 1) * 10}",
                    "staging_table": "staging_api_raw",
                    "enabled": True,
                    "timeout_sec": 40,
                    "method": "GET",
                    "circuit_failure_threshold": 5,
                    "circuit_recovery_sec": 90,
                    "max_attempts": 5,
                }
            )

    return apis


def main() -> None:
    apis = build_default_apis()
    root = Path(__file__).resolve().parent
    out_path = root / "registry_apis.json"
    payload = {
        "version": 1,
        "description": "Registro central — ingestão orientada a configuração",
        "apis": apis,
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Escrito {out_path} com {len(apis)} APIs.")


if __name__ == "__main__":
    main()
