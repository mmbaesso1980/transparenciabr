"""
Fonte única do Arsenal TransparênciaBR — lista plana de fontes para JSON + queries.
Namespace canónico do produto: transparenciabr (GCP/Firestore/BigQuery).

Execute: python gen_arsenal_apis.py (gera arsenal_apis.json).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def _e(
    eid: str,
    grupo_id: str,
    grupo_titulo: str,
    nome: str,
    url: Optional[str],
    *,
    metodo: str = "GET",
    auth: str = "none",
    formato: str = "json",
    tipo_acesso: str = "http_rest",
    prioridade: str = "referencia",
    descricao: str = "",
    observacoes: Optional[str] = None,
    bigquery_ref: Optional[Dict[str, str]] = None,
    crawler_eligible: bool = True,
    rate_limit_note: Optional[str] = None,
    doc_secao: str = "",
) -> Dict[str, Any]:
    return {
        "id": eid,
        "grupo_id": grupo_id,
        "grupo_titulo": grupo_titulo,
        "nome": nome,
        "url": url,
        "metodo": metodo,
        "auth": auth,
        "formato": formato,
        "tipo_acesso": tipo_acesso,
        "prioridade": prioridade,
        "descricao": descricao or nome,
        "observacoes": observacoes,
        "bigquery_ref": bigquery_ref,
        "crawler_eligible": crawler_eligible,
        "rate_limit_note": rate_limit_note,
        "doc_secao": doc_secao,
    }


def all_endpoints() -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []

    # --- 1 Senado (Câmara ignorada como API dedicada no catálogo; ingest legado mantém-se à parte) ---
    G = "senado_federal"
    GT = "Poder Legislativo — Senado Federal"
    base = "https://legis.senado.leg.br/dadosabertos"
    out += [
        _e("senado_portal_docs", G, GT, "Senado — Dados Abertos (docs)", f"{base}/", formato="html", tipo_acesso="documentacao_portal", prioridade="sprint2", doc_secao="1"),
        _e("senado_swagger", G, GT, "Swagger / documentação OpenAPI", f"{base}/docs/index.html", formato="html", tipo_acesso="documentacao_portal", prioridade="sprint2", doc_secao="1"),
        _e("senado_agenda_reuniao_data", G, GT, "Agenda reuniões (por data AAAAMMDD)", f"{base}/agendareuniao/{{AAAAMMDD}}.json", formato="json", prioridade="sprint2", observacoes="Substituir placeholder de data.", doc_secao="1"),
        _e("senado_agenda_reuniao_ical", G, GT, "Agenda próximos 30 dias (iCal)", f"{base}/agendareuniao/atual/iCal", formato="mixed", prioridade="sprint2", doc_secao="1"),
        _e("senado_lista_atual", G, GT, "Lista senadores em exercício", f"{base}/senador/lista/atual", formato="json", prioridade="imediata", observacoes="Usado por 01_ingest_politicos.py", doc_secao="1"),
        _e("senado_perfil", G, GT, "Perfil do senador", f"{base}/senador/{{codigo}}", formato="json", prioridade="sprint2", observacoes="Template {codigo}.", doc_secao="1"),
        _e("senado_votacoes", G, GT, "Votações do senador", f"{base}/senador/{{codigo}}/votacoes", formato="json", prioridade="sprint2", doc_secao="1"),
        _e("senado_autorias", G, GT, "Autorias do senador", f"{base}/senador/{{codigo}}/autorias", formato="json", prioridade="sprint2", doc_secao="1"),
        _e("senado_despesas", G, GT, "Despesas / CEAP Senado", f"{base}/senador/{{codigo}}/despesas", formato="json", prioridade="sprint2", doc_secao="1"),
        _e("senado_plenario_votacoes_ano", G, GT, "Todas votações do ano (plenário)", f"{base}/plenario/votacoes/{{ano}}", formato="json", prioridade="sprint2", doc_secao="1"),
        _e("senado_plenario_votacao_detalhe", G, GT, "Detalhe votação", f"{base}/plenario/votacao/{{codigo}}", formato="json", prioridade="sprint2", doc_secao="1"),
        _e("senado_agenda_plenario", G, GT, "Agenda plenário por data", f"{base}/agenda/{{data}}", formato="json", prioridade="sprint2", doc_secao="1"),
    ]

    # --- 2 TCU ---
    G, GT = "tcu", "Controle Externo — TCU"
    out += [
        _e("tcu_acordaos_abertos", G, GT, "Acórdãos (API dados abertos)", "https://dados-abertos.apps.tcu.gov.br/api/acordao/recupera-acordaos", prioridade="imediata", doc_secao="2"),
        _e("tcu_pj_publica", G, GT, "Pessoa jurídica — consulta consolidada", "https://contas.tcu.gov.br/ords/api/publica/pj/", formato="json", prioridade="imediata", observacoes="Path pode incluir segmentos adicionais conforme doc TCU.", doc_secao="2"),
        _e("tcu_sancoes_publica", G, GT, "Sanções e condenações", "https://contas.tcu.gov.br/ords/api/publica/sancoes/", formato="json", prioridade="imediata", doc_secao="2"),
        _e("tcu_cadirreg_publica", G, GT, "CADIRREG", "https://contas.tcu.gov.br/ords/api/publica/cadirreg/", formato="json", prioridade="imediata", observacoes="Registry crawler atual.", doc_secao="2"),
        _e("tcu_scn_pedidos_congresso", G, GT, "Pedidos Congresso ao TCU", "https://contas.tcu.gov.br/ords/api/publica/scn/pedidos_congresso/{{processo}}", prioridade="sprint2", doc_secao="2"),
        _e("tcu_sessoes_publica", G, GT, "Pautas sessões", "https://contas.tcu.gov.br/ords/api/publica/sessoes/", prioridade="sprint2", doc_secao="2"),
        _e("tcu_inabilitados_portal", G, GT, "Inabilitados (portal web)", "https://contas.tcu.gov.br/ords/f?p=1660:1", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="2"),
        _e("tcu_pesquisa_dados_abertos", G, GT, "Portal pesquisa dados abertos TCU", "https://pesquisa.apps.tcu.gov.br/dados-abertos", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="2"),
    ]

    # --- 3 Portal Transparência / CGU ---
    G, GT = "portal_transparencia_cgu", "CGU — Portal da Transparência"
    pt = "https://api.portaldatransparencia.gov.br/api-de-dados"
    out += [
        _e("pt_swagger", G, GT, "Swagger UI", "https://api.portaldatransparencia.gov.br/swagger-ui/index.html", formato="html", tipo_acesso="documentacao_portal", auth="api_key", crawler_eligible=False, doc_secao="3"),
        _e("pt_servidores", G, GT, "Servidores federais", f"{pt}/servidores", auth="api_key", prioridade="imediata", observacoes="Header chave-consumo.", doc_secao="3"),
        _e("pt_viagens", G, GT, "Viagens", f"{pt}/viagens", auth="api_key", prioridade="imediata", doc_secao="3"),
        _e("pt_emendas_parlamentar", G, GT, "Emendas parlamentares", f"{pt}/emendas/parlamentar", auth="api_key", prioridade="imediata", doc_secao="3"),
        _e("pt_emendas_localidade", G, GT, "Emendas por localidade", f"{pt}/emendas/localidade", auth="api_key", prioridade="imediata", doc_secao="3"),
        _e("pt_contratos", G, GT, "Contratos", f"{pt}/contratos", auth="api_key", prioridade="imediata", doc_secao="3"),
        _e("pt_convenios", G, GT, "Convênios", f"{pt}/convenios", auth="api_key", prioridade="imediata", doc_secao="3"),
        _e("pt_gastos_diretos", G, GT, "Gastos diretos", f"{pt}/gastos-diretos", auth="api_key", prioridade="imediata", doc_secao="3"),
        _e("pt_licitacoes", G, GT, "Licitações", f"{pt}/licitacoes", auth="api_key", prioridade="imediata", doc_secao="3"),
        _e("pt_ceis", G, GT, "CEIS", f"{pt}/ceis", auth="api_key", prioridade="imediata", doc_secao="3"),
        _e("pt_cnep", G, GT, "CNEP", f"{pt}/cnep", auth="api_key", prioridade="imediata", doc_secao="3"),
        _e("pt_cepim", G, GT, "CEPIM", f"{pt}/cepim", auth="api_key", prioridade="imediata", doc_secao="3"),
        _e("pt_base_stub", G, GT, "Base URL API de dados", pt, auth="api_key", observacoes="Base usada em 02_ingest_emendas.py", doc_secao="3"),
        _e("cgu_banco_sancoes", G, GT, "Banco de sanções CGU", "https://bancodesancoes.cgu.gov.br", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="3"),
    ]

    # --- 4 PNCP / OCDS ---
    G, GT = "pncp_ocds", "Compras públicas — PNCP / OCDS"
    pncp = "https://pncp.gov.br/api/pncp/v1"
    out += [
        _e("pncp_manual", G, GT, "Manual / doc API PNCP", "https://pncp.gov.br/app/api", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="4"),
        _e("pncp_contratos", G, GT, "Contratos", f"{pncp}/contratos", prioridade="imediata", observacoes="Query params dataInicial, dataFinal, pagina.", doc_secao="4"),
        _e("pncp_contratacoes_publicacao", G, GT, "Licitações / contratações publicação", f"{pncp}/contratacoes/publicacao", prioridade="imediata", doc_secao="4"),
        _e("pncp_planos_contratacao", G, GT, "PCA — planos contratação anual", f"{pncp}/planos-contratacao", prioridade="imediata", observacoes="Registry crawler.", doc_secao="4"),
        _e("pncp_planos_itens", G, GT, "PCA itens por plano", f"{pncp}/planos-contratacao/{{id}}/itens", prioridade="imediata", doc_secao="4"),
        _e("pncp_atas", G, GT, "Atas registro de preço", f"{pncp}/atas", prioridade="imediata", doc_secao="4"),
        _e("ocds_registry_search", G, GT, "OCP Data Registry / search", "https://data.open-contracting.org/en/search/", formato="html", tipo_acesso="documentacao_portal", prioridade="sprint3", doc_secao="4"),
        _e("comprasgov_ocds_contrato", G, GT, "Compras.gov — contrato OCDS (legado gen_registry)", "https://compras.dados.gov.br/comprasContratos/doc/contrato/ocds", prioridade="sprint3", doc_secao="4"),
    ]

    # --- 5 Transferegov ---
    G, GT = "transferegov", "Emendas PIX — Transferegov"
    tf = "https://docs.api.transferegov.gestao.gov.br/transferenciasespeciais"
    out += [
        _e("tf_docs_hub", G, GT, "Hub documentação Transferências Especiais", tf + "/", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="5"),
        _e("tf_emendas", G, GT, "Lista emendas", f"{tf}/emendas", prioridade="imediata", observacoes="Params ano, autor, municipio.", doc_secao="5"),
        _e("tf_emenda_detalhe", G, GT, "Detalhe emenda", f"{tf}/emendas/{{id}}", prioridade="imediata", doc_secao="5"),
        _e("tf_planos_acao", G, GT, "Planos de ação", f"{tf}/emendas/{{id}}/planos-acao", prioridade="imediata", doc_secao="5"),
        _e("tf_executor_especial", G, GT, "Executor especial", f"{tf}/executor_especial", prioridade="imediata", doc_secao="5"),
        _e("tf_relatorio_gestao", G, GT, "Relatório gestão novo especial", f"{tf}/relatorio_gestao_novo_especial", prioridade="sprint2", doc_secao="5"),
        _e("tf_municipios_uf", G, GT, "Municípios com emendas por UF", f"{tf}/municipios", prioridade="imediata", observacoes="Query uf=", doc_secao="5"),
    ]

    # --- 6 SIOP / SIAFI / STN ---
    G, GT = "orcamento_tesouro", "Orçamento federal — SIOP / SIAFI / STN"
    out += [
        _e("siop_manual_ws", G, GT, "SIOP — manual WebServices execução", "https://www1.siop.planejamento.gov.br/siopdoc/doku.php/webservices:manual-wsexecucaoorcamentaria", formato="html", auth="certificate", crawler_eligible=False, doc_secao="6"),
        _e("siop_sparql", G, GT, "SIOP — SPARQL dados abertos RDF", "https://www1.siop.planejamento.gov.br/sparql/", formato="rdf", tipo_acesso="sparql_rest", prioridade="sprint3", doc_secao="6"),
        _e("siafi_doc_anexo", G, GT, "SIAFI — publicação anexo Tesouro", "https://thot-arquivos.tesouro.gov.br/publicacao-anexo/15346", formato="binary", tipo_acesso="download_bulk", crawler_eligible=False, doc_secao="6"),
        _e("tesouro_apis_hub", G, GT, "Tesouro — central APIs", "https://www.gov.br/tesouronacional/pt-br/central-de-conteudo/apis", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="6"),
        _e("tesouro_transparente_custos", G, GT, "Tesouro Transparente — custos API", "https://www.tesourotransparente.gov.br/consultas/custos-api-de-dados-abertos", prioridade="sprint3", doc_secao="6"),
        _e("tesouro_ckan_siafi", G, GT, "CKAN datasets tag SIAFI", "https://www.tesourotransparente.gov.br/ckan/dataset?tags=SIAFI", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="6"),
        _e("siconfi_hub", G, GT, "SICONFI — APIs STN", "https://www.gov.br/tesouronacional/pt-br/central-de-conteudo/apis-siconfi", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="6"),
    ]

    # --- 7 TSE ---
    G, GT = "tse_eleicoes", "Eleições — TSE"
    out += [
        _e("tse_portal_abertos", G, GT, "Portal dados abertos TSE", "https://dadosabertos.tse.jus.br", formato="html", tipo_acesso="download_bulk", observacoes="ZIP/CSV por eleição.", doc_secao="7"),
        _e("tse_divulga_rest", G, GT, "Divulgação candidatos / REST", "https://divulgacandcontas.tse.jus.br/divulga/rest", prioridade="sprint2", observacoes="Referência gen_registry.", doc_secao="7"),
    ]

    # --- 8 Receita / CNPJ ---
    G, GT = "receita_cnpj", "Cadastro empresas — Receita e auxiliares"
    out += [
        _e("rf_dados_abertos_cnpj", G, GT, "RF — dados abertos CNPJ (bulk)", "https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/", formato="zip", tipo_acesso="download_bulk", prioridade="sprint3", doc_secao="8"),
        _e("opencnpj", G, GT, "OpenCNPJ", "https://api.opencnpj.org/{{cnpj}}", prioridade="sprint3", observacoes="Substituir CNPJ.", doc_secao="8"),
        _e("brasilapi_cnpj", G, GT, "BrasilAPI — CNPJ", "https://brasilapi.com.br/api/cnpj/v1/{{cnpj}}", prioridade="sprint3", doc_secao="8"),
        _e("minhareceita", G, GT, "Minha Receita", "https://minhareceita.org/{{cnpj}}", prioridade="sprint3", doc_secao="8"),
        _e("brasil_io_socios", G, GT, "Brasil.IO — sócios", "https://brasil.io/api/dataset/socios-brasil/empresas/data/", prioridade="sprint3", observacoes="Query cnpj=", doc_secao="8"),
        _e("monitor_cnpj", G, GT, "Monitor CNPJ (comercial)", "https://monitorcnpj.com.br/solucoes/integracao-api/", formato="html", auth="api_key", crawler_eligible=False, doc_secao="8"),
    ]

    # --- 9 Diários ---
    G, GT = "diarios_oficiais", "Diários oficiais"
    out += [
        _e("inlabs_portal", G, GT, "INLABS DOU", "https://inlabs.in.gov.br/", formato="xml", tipo_acesso="http_rest", prioridade="sprint2", doc_secao="9.1"),
        _e("in_busca_dou", G, GT, "Buscador DOU", "https://www.in.gov.br/consulta/", formato="html", tipo_acesso="documentacao_portal", prioridade="sprint2", doc_secao="9.1"),
        _e("bd_dataset_dou", G, GT, "Base dos Dados — dataset DOU", "https://basedosdados.org/dataset/0bd844d9-454a-4c47-83e2-fc15df4f5ed7", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="9.1"),
        _e("querido_diario_api", G, GT, "Querido Diário API", "https://queridodiario.ok.org.br/api/", prioridade="sprint2", rate_limit_note="60 req/min", doc_secao="9.2"),
        _e("qd_territories", G, GT, "Querido Diário — territories", "https://queridodiario.ok.org.br/api/v1/territories/", prioridade="sprint2", doc_secao="9.2"),
        _e("qd_gazettes", G, GT, "Querido Diário — gazettes", "https://queridodiario.ok.org.br/api/v1/gazettes", prioridade="sprint2", doc_secao="9.2"),
    ]

    # --- 10 IBGE ---
    G, GT = "ibge_geografia", "IBGE — localidades e malhas"
    out += [
        _e("ibge_localidades_municipios", G, GT, "Localidades — municípios", "https://servicodados.ibge.gov.br/api/v1/localidades/municipios", prioridade="imediata", doc_secao="10"),
        _e("ibge_malha_br_municipios", G, GT, "Malha Brasil municípios GeoJSON", "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?resolucao=municipio&formato=geojson", formato="geojson", prioridade="sprint2", doc_secao="10"),
        _e("ibge_malha_uf", G, GT, "Malha UF municipios", "https://servicodados.ibge.gov.br/api/v3/malhas/estados/{{UF}}?resolucao=municipio&formato=geojson", formato="geojson", prioridade="sprint2", doc_secao="10"),
        _e("ibge_malha_municipio", G, GT, "Malha município único", "https://servicodados.ibge.gov.br/api/v3/malhas/municipios/{{codIbge}}?formato=application/vnd.geo+json", formato="geojson", prioridade="sprint2", doc_secao="10"),
        _e("sidra_docs", G, GT, "SIDRA API docs", "https://servicodados.ibge.gov.br/api/docs/agregados?versao=3", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="10"),
        _e("sidra_exemplo_9514", G, GT, "SIDRA — exemplo tabela 9514 Censo 2022", "https://apisidra.ibge.gov.br/values/t/9514/n6/all/v/93/p/2022/c2/6794", prioridade="imediata", doc_secao="10"),
        _e("sidra_exemplo_6579", G, GT, "SIDRA — populacao último ano", "https://apisidra.ibge.gov.br/values/t/6579/n6/all/v/9324/p/last", prioridade="imediata", doc_secao="10"),
        _e("ibge_projecoes_pop", G, GT, "Projeções populacionais", "https://servicodados.ibge.gov.br/api/v1/projecoes/populacao/{{localidade}}", prioridade="sprint2", doc_secao="10"),
        _e("brasilapi_municipios_uf", G, GT, "BrasilAPI — municípios UF", "https://brasilapi.com.br/api/ibge/municipios/v1/{{uf}}", prioridade="referencia", doc_secao="10"),
    ]

    # --- 11 DATASUS ---
    G, GT = "datasus_saude", "Saúde — DATASUS / OpenDataSUS"
    out += [
        _e("opendatasus_ckan", G, GT, "OpenDataSUS CKAN", "https://opendatasus.saude.gov.br/dataset", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="11"),
        _e("datasus_portal", G, GT, "Portal DATASUS", "https://datasus.saude.gov.br", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="11"),
        _e("datasus_cnes_site", G, GT, "CNES Web", "https://cnes.datasus.gov.br", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, observacoes="FTP microdados em complemento.", doc_secao="11"),
    ]

    # --- 12 Estaduais ---
    G, GT = "dados_estaduais", "Dados estaduais (portais)"
    out += [
        _e("sp_dados_abertos", G, GT, "Governo SP — dados abertos", "https://dadosabertos.sp.gov.br", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="12"),
        _e("rj_dados_abertos", G, GT, "Governo RJ — dados abertos", "https://www.rj.gov.br/dados-abertos", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="12"),
        _e("pa_transparencia", G, GT, "Pará — transparência", "https://www.transparencia.pa.gov.br", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="12"),
        _e("tcdf_api", G, GT, "TCDF — dados abertos", "https://unidades.tc.df.gov.br/distribuicao-de-processos/dados-abertos/", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="12"),
    ]

    # --- 13 dados.gov.br ---
    G, GT = "dados_gov_br", "Portal brasileiro dados abertos"
    out += [
        _e("dados_gov_api", G, GT, "CKAN API — raiz", "https://dados.gov.br/api/3/", prioridade="referencia", doc_secao="13"),
        _e("dados_gov_package_search", G, GT, "package_search", "https://dados.gov.br/api/3/action/package_search", metodo="POST", prioridade="referencia", doc_secao="13"),
    ]

    # --- 14 OCDS internacional ---
    G, GT = "ocds_internacional", "OCDS — internacional"
    out += [
        _e("chile_mercadopublico", G, GT, "Chile — Mercado Público", "https://api.mercadopublico.cl", prioridade="futuro", doc_secao="14"),
        _e("uk_find_tender", G, GT, "UK Find a Tender OCDS", "https://www.find-tender.service.gov.uk/api/1.0/ocdsRecordPackages", prioridade="futuro", doc_secao="14"),
        _e("openopps", G, GT, "OpenOpps", "https://openopps.com/api/", prioridade="futuro", doc_secao="14"),
    ]

    # --- 15 Organismos internacionais ---
    G, GT = "organismos_internacionais", "Organismos internacionais"
    out += [
        _e("world_bank_data", G, GT, "World Bank Data API", "https://api.worldbank.org/v2/", prioridade="futuro", doc_secao="15"),
        _e("wb_documents", G, GT, "World Bank Documents API", "https://documents.worldbank.org/en/publication/documents-reports/api", prioridade="futuro", doc_secao="15"),
        _e("un_comtrade", G, GT, "UN Comtrade", "https://comtradeapi.un.org/", prioridade="futuro", doc_secao="15"),
        _e("imf_data", G, GT, "IMF Data API", "https://data.imf.org/api/", prioridade="futuro", doc_secao="15"),
        _e("oecd_sdmx", G, GT, "OECD SDMX-JSON", "https://stats.oecd.org/SDMX-JSON/data/", prioridade="futuro", doc_secao="15"),
        _e("ti_cpi", G, GT, "Transparência Internacional CPI (web)", "https://www.transparency.org/en/cpi", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="15"),
    ]

    # --- 16 Notícias ---
    G, GT = "apis_noticias", "APIs de notícias"
    out += [
        _e("newsapi_org", G, GT, "NewsAPI", "https://newsapi.org/v2/top-headlines?country=br", auth="api_key", prioridade="futuro", doc_secao="16"),
        _e("apitube", G, GT, "APITube", "https://apitube.io", auth="api_key", prioridade="futuro", doc_secao="16"),
        _e("mediastack", G, GT, "Mediastack", "https://api.mediastack.com/news?country=br", auth="api_key", prioridade="futuro", doc_secao="16"),
        _e("gnews", G, GT, "GNews", "https://gnews.io/api/v4/", auth="api_key", prioridade="futuro", doc_secao="16"),
        _e("guardian_open", G, GT, "The Guardian Open Platform", "https://open-platform.theguardian.com/", auth="api_key", prioridade="futuro", doc_secao="16"),
    ]

    # --- 17 Referências ---
    G, GT = "referencias_br", "Referências e agregadores BR"
    out += [
        _e("brasilapi_root", G, GT, "BrasilAPI raiz", "https://brasilapi.com.br/api/", prioridade="referencia", doc_secao="17"),
        _e("conecta_catalogo", G, GT, "Conecta.gov catálogo APIs", "https://www.gov.br/conecta/catalogo/apis", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="17"),
    ]

    # --- Complemento: Atlas / IDH web ---
    G, GT = "complemento_atlas_idh_web", "Complemento — IDH / Atlas (web)"
    out += [
        _e("atlas_brasil_portal", G, GT, "Atlas Brasil PNUD portal", "http://www.atlasbrasil.org.br", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, prioridade="imediata", doc_secao="C1"),
        _e("atlas_download_csv", G, GT, "Atlas — download CSV acervo", "http://atlasbrasil.org.br/acervo/atlas", tipo_acesso="download_bulk", prioridade="imediata", doc_secao="C1"),
        _e("pref_sp_idhm_api", G, GT, "Prefeitura SP — API IDHM", "https://apilib.prefeitura.sp.gov.br/store/apis/info?name=IDHM", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="C1"),
        _e("pnud_brazil_atlas", G, GT, "PNUD Brasil — atlas municípios", "https://www.undp.org/pt/brazil/atlas-dos-municipios", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="C1"),
    ]

    # --- Complemento: educação INEP ---
    G, GT = "complemento_educacao", "Complemento — educação INEP"
    out += [
        _e("inep_data_hub", G, GT, "INEP Data hub", "https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/inep-data", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="C3"),
        _e("inep_catalogo_escolas", G, GT, "Catálogo de escolas", "https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/inep-data/catalogo-de-escolas", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="C3"),
        _e("inep_censo_escolar", G, GT, "Censo escolar", "https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/censo-escolar", formato="html", tipo_acesso="download_bulk", crawler_eligible=False, doc_secao="C3"),
        _e("inep_ideb_page", G, GT, "IDEB INEP página", "https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="C3"),
        _e("educacao_inteligente_api", G, GT, "Educação Inteligente API", "http://educacao.dadosabertosbr.org/api", prioridade="sprint2", observacoes="Terceiros; validar HTTPS.", doc_secao="C3"),
        _e("inep_saeb", G, GT, "SAEB", "https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/saeb", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="C3"),
    ]

    # --- Complemento: saneamento / SNIS ---
    G, GT = "complemento_saneamento", "Complemento — saneamento"
    out += [
        _e("sinisa_gov", G, GT, "SINISA / SNIS gov.br", "https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/saneamento/snis", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="C5"),
        _e("snis_serie_historica", G, GT, "SNIS série histórica MDR", "https://app4.mdr.gov.br/serieHistorica/", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="C5"),
        _e("ana_hidroweb", G, GT, "ANA — séries hidrológicas", "https://www.snirh.gov.br/hidroweb/serieshistoricas", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="C5"),
        _e("instituto_agua_saneamento", G, GT, "Instituto Água e Saneamento", "https://www.aguaesaneamento.org.br/municipios-e-saneamento/", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="C5"),
    ]

    # --- Complemento: segurança / trabalho / ambiente (portais) ---
    G, GT = "complemento_outros_portais", "Complemento — segurança, trabalho, ambiente"
    out += [
        _e("mj_seguranca_estatistica", G, GT, "MJ — estatísticas segurança", "https://www.gov.br/mj/pt-br/assuntos/sua-seguranca/seguranca-publica/estatistica", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="C6"),
        _e("forum_seguranca", G, GT, "Fórum Brasileiro Segurança", "https://forumseguranca.org.br/estatisticas/", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="C6"),
        _e("rais_mtps", G, GT, "RAIS — portal MTPS", "https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/estatisticas-trabalho/rais", formato="html", tipo_acesso="download_bulk", crawler_eligible=False, doc_secao="C7"),
        _e("caged_mtps", G, GT, "CAGED", "https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/estatisticas-trabalho/caged", formato="html", tipo_acesso="download_bulk", crawler_eligible=False, doc_secao="C7"),
        _e("ibama_abertos", G, GT, "IBAMA dados abertos", "https://dadosabertos.ibama.gov.br", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="C8"),
        _e("inpe_prodes", G, GT, "INPE PRODES", "http://www.obt.inpe.br/OBT/assuntos/programas/amazonia/prodes", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="C8"),
        _e("terra_brasilis_api", G, GT, "TerraBrasilis API", "https://terrabrasilis.dpi.inpe.br/app/api/", prioridade="sprint3", doc_secao="C8"),
        _e("mapbiomas", G, GT, "MapBiomas plataforma", "https://plataforma.mapbiomas.org/", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="C8"),
        _e("sicar_car", G, GT, "SICAR público", "https://www.car.gov.br/publico/imoveis/index", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="C8"),
    ]

    # --- Complemento: vulnerabilidade ---
    G, GT = "complemento_vulnerabilidade", "Complemento — CadÚnico / IVS / IPEA"
    out += [
        _e("cadunico_mds", G, GT, "CadÚnico — dados abertos MDS", "https://www.gov.br/mds/pt-br/acoes-e-programas/transferencia-de-renda/cadastro-unico", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="C10"),
        _e("mds_suas_abertos", G, GT, "SUAS dados abertos", "https://www.gov.br/mds/pt-br/acesso-a-informacao/dados-abertos", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="C10"),
        _e("ivs_ipea", G, GT, "IVS IPEA", "https://ivs.ipea.gov.br/", formato="html", tipo_acesso="documentacao_portal", crawler_eligible=False, doc_secao="C10"),
        _e("ipeadata_api", G, GT, "IPEAData API", "https://www.ipeadata.gov.br/api/", prioridade="sprint3", doc_secao="C10"),
    ]

    # --- BigQuery Base dos Dados (atalho principal) ---
    G, GT = "bigquery_basedosdados", "Base dos Dados — BigQuery (basedosdados)"
    bq_tables = [
        ("bq_bd_censo_demografico", "basedosdados.br_ibge_censo_demografico", "Censo demográfico IBGE"),
        ("bq_bd_populacao_municipio", "basedosdados.br_ibge_populacao.municipio", "População municipal"),
        ("bq_bd_pib_municipio", "basedosdados.br_ibge_pib.municipio", "PIB municipal"),
        ("bq_bd_ideb_municipio", "basedosdados.br_inep_ideb.municipio", "IDEB municipal"),
        ("bq_bd_censo_escolar", "basedosdados.br_inep_censo_escolar", "Censo escolar INEP"),
        ("bq_bd_snis", "basedosdados.br_mdr_snis", "SNIS saneamento"),
        ("bq_bd_rais", "basedosdados.br_me_rais", "RAIS vínculos"),
        ("bq_bd_caged", "basedosdados.br_me_caged", "CAGED"),
        ("bq_bd_diretorios_municipio", "basedosdados.br_bd_diretorios_brasil.municipio", "Diretório municípios DE-PARA"),
        ("bq_bd_cnes", "basedosdados.br_ms_cnes", "CNES / estabelecimentos saúde"),
        ("bq_bd_tse", "basedosdados.br_tse_eleicoes", "Eleições TSE"),
        ("bq_bd_dou", "basedosdados.br_dou", "DOU estruturado"),
    ]
    for eid, full_id, nome in bq_tables:
        out.append(
            _e(
                eid,
                G,
                GT,
                nome,
                None,
                formato="bq_table",
                tipo_acesso="bigquery_public",
                prioridade="imediata",
                bigquery_ref={"full_table_id": full_id},
                crawler_eligible=False,
                observacoes="Consultar via projeto GCP com billing; projeto público basedosdados.",
                doc_secao="C9",
            )
        )

    # Dedup by id (paranoia)
    seen = set()
    deduped = []
    for row in out:
        if row["id"] in seen:
            continue
        seen.add(row["id"])
        deduped.append(row)
    return deduped
