/**
 * PoliticoPage — Landing pública por parlamentar (Onda 3).
 *
 * Rota: /politico/:id  (PÚBLICA, sem ProtectedRoute)
 *
 * Esta é a página de vendas prioritária do TransparênciaBR. Visitante vê
 * prévia institucional (KPIs, camadas, CEAP) e contrata aqui a Auditoria
 * Completa Forense / Dossiê Completo (créditos on-demand).
 *
 * Fluxo:
 *   Anônimo  → login com redirect para esta mesma URL
 *   Logado   → débito via Cloud Functions na própria página + exportação PDF
 *
 * Filosofia: "Toda nota é suspeita até prova contrária." Mostramos só o que é
 * público — KPIs agregados. Detalhes sensíveis ficam atrás do paywall.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import html2pdf from "html2pdf.js";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ChevronRight,
  Coins,
  FileText,
  Lock,
  Radar,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";

import DossiePDFContent from "../components/dossie/DossiePDFContent.jsx";
import AuditoriaOnDemandButton from "../components/politico/AuditoriaOnDemandButton.jsx";
import EmendasPoliticoSection from "../components/politico/EmendasPoliticoSection.jsx";
import PoliticoAnalytics from "../components/politico/PoliticoAnalytics.jsx";

import { resolvePoliticoUniversal } from "../lib/resolvePolitico.js";
import {
  useKPIsParlamentar,
  extractHeroKPIs,
  extractCeapBreakdown,
} from "../hooks/useKPIsParlamentar.js";
import {
  useCEAPDetalhado,
  useComissoesParlamentar,
  useEventosParlamentar,
} from "../hooks/useCamadasParlamentar.js";
import { useAuth } from "../context/AuthContext.jsx";
import DespesasSection from "../components/politico/DespesasSection.jsx";
import CamadaDrawer from "../components/CamadaDrawer.jsx";
import {
  CREDIT_ADDON_COMPARACOES_AVANCADAS,
  CREDIT_ADDON_PDF_LAUDO,
  CREDIT_PRICE_CEAP_COMPLETO,
  CREDIT_PRICE_DOSSIE_MATADOR,
  CREDIT_PRICE_EMENDAS_COMPLETAS,
} from "../data/creditPricing.js";
import { useDailyFreemiumCountdown } from "../hooks/useDailyFreemiumCountdown.js";
import { useGenerateDossieOnDemand } from "../hooks/useGenerateDossieOnDemand.js";
import { useUserCredits } from "../hooks/useUserCredits.js";
import { enrichPoliticoRecord, pickNome } from "../utils/dataParsers.js";
import { dossiePdfFilename } from "../utils/dossieWatchlist.js";
import { normalizeEmendasList } from "../utils/emendasNormalize.js";

const fmtBRL = (v) =>
  Number.isFinite(Number(v))
    ? Number(v).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      })
    : "—";

const fmtNum = (v) =>
  Number.isFinite(Number(v)) ? Number(v).toLocaleString("pt-BR") : "—";

/**
 * 6 categorias canônicas — Plano Mestre. Cada uma tem ícone, status e teaser.
 * "available" = dado já consolidado em produção; "coming" = em construção.
 */
const CATEGORIES = [
  {
    key: "ceap",
    n: 1,
    label: "CEAP — Cota parlamentar",
    teaser: "Ranking de gastos, fornecedores recorrentes, picos suspeitos.",
    status: "available",
  },
  {
    key: "tse",
    n: 2,
    label: "TSE — Patrimônio declarado",
    teaser: "Variação patrimonial 2018→2022→2024 e indícios de subdeclaração.",
    status: "coming",
  },
  {
    key: "folha",
    n: 3,
    label: "Folha do gabinete (proxy)",
    teaser: "Comissões e cargos do parlamentar · dado vivo da Câmara.",
    status: "available",
  },
  {
    key: "viagens",
    n: 4,
    label: "Agenda oficial & viagens",
    teaser: "Eventos publicados · base do cruzamento com passagens CEAP.",
    status: "available",
  },
  {
    key: "emendas",
    n: 5,
    label: "Emendas & PIX RP6/RP7/RP99",
    teaser: "Emendas individuais e de bancada com valores empenhados, pagos e beneficiários.",
    status: "available",
  },
  {
    key: "pncp",
    n: 6,
    label: "Contratos PNCP",
    teaser: "k-means de empresas-fachada, ARIMA temporal, grafo de fornecedores.",
    status: "available",
  },
];

// =============================================================================
// Builders de payload do drawer (Onda 6 — Camadas Vivas)
// =============================================================================

/** Drawer dos 4 KPIs do hero — todos consomem o payload da CF de KPIs. */
function buildKpiDrawerPayload(kind, { kpisRaw, heroKpis, breakdown, hasKpis, nome }) {
  if (!hasKpis || !kpisRaw) {
    return {
      title: "Sem dado classificado ainda",
      kicker: "Motor Aurora · pendente",
      subtitle: `${nome} ainda não foi processado pelo pipeline de classificação.`,
      honestNote: (
        <>
          Quando você abrir o dossiê completo, disparamos a coleta sob demanda.{" "}
          Em ~30 segundos cruzamos CEAP, viagens e folha. Score Aurora,
          rastreabilidade e notas de alto risco são recalculados sobre dado
          fresco do Data Lake.
        </>
      ),
      fontes: [
        "API Câmara dos Deputados · CEAP",
        "Data Lake gs://datalake-tbr-clean/ceap_classified/",
      ],
    };
  }

  if (kind === "score") {
    return {
      title: "Score Aurora",
      kicker: "Índice composto · 0–100",
      bigLabel: "Pontuação atual",
      bigValue: `${heroKpis.score_aurora ?? 0} / 100`,
      bigHint:
        "Quanto maior o número, mais sinais de risco encontrados no CEAP do parlamentar.",
      metricas: [
        {
          label: "Score médio ponderado",
          value:
            typeof kpisRaw.score_medio_ponderado === "number"
              ? kpisRaw.score_medio_ponderado.toFixed(3)
              : "—",
        },
        {
          label: "Score máximo",
          value:
            typeof kpisRaw.score_max === "number"
              ? kpisRaw.score_max.toFixed(3)
              : "—",
        },
        {
          label: "Notas alto risco",
          value: heroKpis.qtd_notas_alto_risco ?? "—",
        },
        {
          label: "Valor alto risco",
          value:
            typeof kpisRaw.valor_alto_risco_brl === "number" &&
            kpisRaw.valor_alto_risco_brl > 0
              ? Number(kpisRaw.valor_alto_risco_brl).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                  maximumFractionDigits: 0,
                })
              : "—",
        },
      ],
      metodologia:
        "O score Aurora combina diversidade de categorias (Shannon), concentração de fornecedores (HHI), atipicidades temporais e classificação semântica de cada nota fiscal. Quando o motor ainda não pontuou notas para este parlamentar, exibimos 0 e marcamos como 'em validação'.",
      fontes: [
        "API Câmara · CEAP (notas fiscais reembolsadas)",
        "Vertex AI Aurora classifier (gs://datalake-tbr-clean/ceap_classified/)",
      ],
    };
  }

  if (kind === "ceap") {
    return {
      title: "CEAP classificado",
      kicker: "Cota parlamentar · valor reembolsado",
      bigLabel: "Total acumulado",
      bigValue: fmtBRL(heroKpis.ceap_acumulado),
      bigHint: `Soma de ${breakdown.serieAnual.length} ano(s) de notas processadas pelo motor Aurora.`,
      serieAnual: breakdown.serieAnual,
      topCategorias: breakdown.topCategorias,
      metricas: [
        {
          label: "Notas classificadas",
          value: fmtNum(
            breakdown.topCategorias.reduce((a, c) => a + (c.qtd || 0), 0),
          ),
        },
        {
          label: "Média notas/ano",
          value: fmtNum(kpisRaw.media_notas_por_ano),
        },
        {
          label: "HHI fornecedores",
          value:
            typeof kpisRaw.hhi_fornecedores === "number"
              ? kpisRaw.hhi_fornecedores.toFixed(3)
              : "—",
        },
        {
          label: "Diversidade (Shannon)",
          value:
            typeof kpisRaw.diversidade_categorias_shannon_bits === "number"
              ? `${kpisRaw.diversidade_categorias_shannon_bits.toFixed(2)} bits`
              : "—",
        },
      ],
      metodologia:
        "Valores baseados na CEAP oficial divulgada pela Câmara dos Deputados, com classificação semântica feita por LLM (Aurora). Quando o agregador do backend devolve total zerado, derivamos da série anual e das categorias para não esconder dado válido.",
      fontes: [
        "API Câmara dos Deputados · /deputados/{id}/despesas",
        "Data Lake · gs://datalake-tbr-clean/ceap_classified/",
      ],
    };
  }

  if (kind === "rastreabilidade") {
    return {
      title: "Rastreabilidade do dossiê",
      kicker: "Qualidade de dados · cobertura",
      bigLabel: "Cobertura atual",
      bigValue: `${heroKpis.rastreabilidade_pct ?? 0}%`,
      bigHint:
        "Percentual das notas/ítens com fonte primária, valor e fornecedor válidos.",
      metricas: [
        {
          label: "Erros de parsing",
          value: fmtNum(kpisRaw.parse_errors),
        },
        {
          label: "Latência média (h)",
          value:
            typeof kpisRaw.latencia_media_horas_ingestao_classif === "number"
              ? kpisRaw.latencia_media_horas_ingestao_classif.toFixed(1)
              : "—",
        },
        {
          label: "Última classificação",
          value: kpisRaw.ultima_classificacao_nota_utc
            ? new Date(kpisRaw.ultima_classificacao_nota_utc).toLocaleString(
                "pt-BR",
              )
            : "—",
        },
        {
          label: "Gerado em",
          value: kpisRaw.generated_at
            ? new Date(kpisRaw.generated_at).toLocaleString("pt-BR")
            : "—",
        },
      ],
      metodologia:
        "Rastreabilidade combina taxa de notas com fornecedor válido, taxa de classificação semântica bem-sucedida e cobertura temporal. Não é 'presença em plenário' (que exigiria votações nominais).",
      fontes: [
        "Pipeline Aurora · métricas internas",
        "Data Lake · gs://datalake-tbr-clean/ceap_classified/",
      ],
    };
  }

  if (kind === "alto_risco") {
    return {
      title: "Notas de alto risco",
      kicker: "Sinalizações do motor Aurora",
      bigLabel: "Quantidade detectada",
      bigValue: fmtNum(heroKpis.qtd_notas_alto_risco),
      bigHint:
        "Notas com score acima do threshold (top decil dentro da legislatura).",
      topCategorias: breakdown.topCategorias,
      metricas: [
        {
          label: "Valor sinalizado",
          value:
            typeof kpisRaw.valor_alto_risco_brl === "number" &&
            kpisRaw.valor_alto_risco_brl > 0
              ? fmtBRL(kpisRaw.valor_alto_risco_brl)
              : "—",
        },
        {
          label: "% do total",
          value:
            typeof kpisRaw.valor_alto_risco_brl === "number" &&
            heroKpis.ceap_acumulado > 0
              ? `${((kpisRaw.valor_alto_risco_brl / heroKpis.ceap_acumulado) * 100).toFixed(1)}%`
              : "—",
        },
      ],
      honestNote:
        "Toda nota é suspeita até prova contrária. Esta contagem não é acusação — é um filtro estatístico para priorizar revisão humana com fonte primária.",
      fontes: [
        "Vertex AI Aurora classifier",
        "Data Lake · gs://datalake-tbr-clean/ceap_classified/",
      ],
    };
  }

  return null;
}

/** Drawer dos 6 cards de camada — Onda 7: usa dado vivo da API Câmara. */
function buildCamadaDrawerPayload(
  key,
  { breakdown, hasKpis, nome, heroKpis, ceapDet, comissoes, eventos, emendasList },
) {
  const blocoCEAP = {
    title: "CEAP — Cota parlamentar",
    kicker: "Camada 1 · DISPONÍVEL",
    subtitle: `${nome} — reembolsos da cota oficial.`,
    bigLabel: "Total classificado",
    bigValue: hasKpis ? fmtBRL(heroKpis.ceap_acumulado) : "—",
    bigHint: hasKpis
      ? `${breakdown.serieAnual.length} ano(s) de dados consolidados.`
      : "Sem coleta classificada ainda.",
    serieAnual: hasKpis ? breakdown.serieAnual : [],
    topCategorias: hasKpis ? breakdown.topCategorias : [],
    metodologia:
      "Notas reembolsadas pela cota CEAP (Cota para Exercício da Atividade Parlamentar) classificadas semanticamente para detectar atipicidades.",
    fontes: [
      "API Câmara dos Deputados · /deputados/{id}/despesas",
      "Data Lake · gs://datalake-tbr-clean/ceap_classified/",
    ],
  };

  const blocoEmBreve = (titulo, kicker, descricaoPreview, fonteRoadmap) => ({
    title: titulo,
    kicker,
    subtitle: "Coleta sob demanda · em fila de priorização",
    bigLabel: "Status",
    bigValue: "Em coleta",
    bigHint: "Quando você abrir o dossiê completo, esta camada é priorizada.",
    honestNote: descricaoPreview,
    metodologia:
      "Esta camada ainda não tem ingestão automática em produção para todos os parlamentares. Durante a abertura do dossiê, o worker Aurora dispara coleta sob demanda e materializa o dado no Data Lake antes de devolver o resultado.",
    fontes: fonteRoadmap,
  });

  // ===== CEAP detalhado vivo (Onda 7) =====
  if (key === "ceap") {
    if (ceapDet?.loading) {
      return {
        ...blocoCEAP,
        honestNote: "Carregando despesas detalhadas da API Câmara…",
      };
    }
    if (ceapDet?.error) {
      return {
        ...blocoCEAP,
        honestNote: `API Câmara indisponível no momento: ${ceapDet.error}`,
      };
    }
    if (ceapDet?.qtdNotas > 0) {
      const fornecedoresLinhas = ceapDet.topFornecedores.map((f) => ({
        categoria: f.nome,
        cnpj: f.cnpj && f.cnpj !== "—" ? f.cnpj : null,
        qtd: f.qtd,
        valor_brl: f.valor,
      }));
      return {
        title: "CEAP — Cota parlamentar (ao vivo)",
        kicker: `Camada 1 · DISPONÍVEL · ${ceapDet.ano}`,
        subtitle: `${nome} — ${ceapDet.qtdNotas} notas em ${ceapDet.ano} via API Câmara.`,
        bigLabel: `Total reembolsado em ${ceapDet.ano}`,
        bigValue: fmtBRL(ceapDet.totalAno),
        bigHint: `${ceapDet.qtdNotas} notas reembolsadas pela cota oficial.`,
        serieAnual: hasKpis ? breakdown.serieAnual : [],
        topCategorias: fornecedoresLinhas,
        topCategoriasLabel: "Top fornecedores",
        metricas: [
          {
            label: "Categoria principal",
            value: ceapDet.topCategorias[0]?.categoria
              ? ceapDet.topCategorias[0].categoria.split(" ").slice(0, 3).join(" ")
              : "—",
          },
          {
            label: "Top fornecedor",
            value: ceapDet.topFornecedores[0]?.nome ?? "—",
          },
          {
            label: "Valor top fornecedor",
            value: fmtBRL(ceapDet.topFornecedores[0]?.valor ?? 0),
          },
          {
            label: "Anos no Data Lake",
            value: hasKpis
              ? `${breakdown.serieAnual.length} ano(s)`
              : "—",
          },
        ],
        metodologia:
          "Notas reembolsadas pela cota CEAP, agregadas em tempo real direto da API oficial da Câmara dos Deputados (dadosabertos.camara.leg.br). Não passa pelo classificador Aurora — é o dado bruto, com link direto para o recibo PDF.",
        fontes: [
          "API Câmara · /deputados/{id}/despesas (CORS aberto)",
          "Data Lake · gs://datalake-tbr-clean/ceap_classified/ (dado classificado)",
        ],
      };
    }
    return blocoCEAP;
  }

  // ===== Folha (com. + cargos) vivo (Onda 7) =====
  if (key === "folha") {
    if (comissoes?.loading) {
      return {
        title: "Folha do gabinete (em coleta)",
        kicker: "Camada 3 · carregando",
        bigLabel: "Status",
        bigValue: "—",
        honestNote: "Carregando comissões e cargos da API Câmara…",
      };
    }
    if (comissoes?.membroDe > 0) {
      const linhas = comissoes.orgaos.slice(0, 12).map((o) => ({
        categoria: `${o.sigla} · ${o.titulo}`,
        qtd: o.ativo ? 1 : 0,
        valor_brl: 0,
      }));
      return {
        title: "Comissões & cargos (proxy folha)",
        kicker: `Camada 3 · DISPONÍVEL`,
        subtitle: `${nome} — ${comissoes.membroDe} vínculos institucionais.`,
        bigLabel: "Comissões ativas",
        bigValue: `${comissoes.ativos ?? 0}`,
        bigHint: `Total no período: ${comissoes.membroDe} · com cargos de relevo: ${comissoes.titularidades}.`,
        topCategorias: linhas,
        topCategoriasLabel: "Comissões e cargos (mais recentes)",
        metricas: [
          {
            label: "Titularidades / cargos",
            value: comissoes.titularidades,
          },
          { label: "Comissões ativas hoje", value: comissoes.ativos ?? 0 },
          { label: "Histórico total", value: comissoes.membroDe },
        ],
        honestNote:
          "Esta camada usa comissões e cargos como PROXY até termos a folha de servidores nomeados (Portal da Transparência). O cruzamento parentesco/salário entra na próxima onda.",
        metodologia:
          "Coleção ao vivo dos órgãos colegiados em que o parlamentar atua, com título (titular, suplente, presidente, relator). Servidores nomeados ainda não entram — apenas cargos institucionais públicos.",
        fontes: [
          "API Câmara · /deputados/{id}/orgaos",
          "Próxima onda: Portal da Transparência · servidores ativos",
        ],
      };
    }
  }

  // ===== Viagens / agenda viva (Onda 7) =====
  if (key === "viagens") {
    if (eventos?.loading) {
      return {
        title: "Agenda oficial (em coleta)",
        kicker: "Camada 4 · carregando",
        bigLabel: "Status",
        bigValue: "—",
        honestNote: "Carregando eventos da API Câmara…",
      };
    }
    if (eventos?.eventos?.length > 0) {
      const linhasProx = eventos.proximos.map((e) => ({
        categoria: `${e.tipo} — ${e.local || "—"}`,
        qtd: 0,
        valor_brl: 0,
      }));
      const linhasTipo = eventos.porTipo.slice(0, 6).map((t) => ({
        categoria: t.tipo,
        qtd: t.qtd,
        valor_brl: 0,
      }));
      return {
        title: "Agenda oficial & viagens",
        kicker: "Camada 4 · DISPONÍVEL",
        subtitle: `${nome} — ${eventos.eventos.length} eventos consultados.`,
        bigLabel: "Eventos no período",
        bigValue: `${eventos.eventos.length}`,
        bigHint: `${eventos.proximos.length} futuros · ${eventos.realizados.length} já ocorridos.`,
        topCategorias: linhasProx.length > 0 ? linhasProx : linhasTipo,
        topCategoriasLabel:
          linhasProx.length > 0 ? "Próximos eventos" : "Distribuição por tipo",
        metricas: [
          { label: "Próximos", value: eventos.proximos.length },
          { label: "Realizados", value: eventos.realizados.length },
          { label: "Tipos distintos", value: eventos.porTipo.length },
        ],
        metodologia:
          "Eventos oficiais publicados pela Câmara em tempo real. É a fonte usada para detectar viagens-fantasma cruzando com passagens reembolsadas pela CEAP. O cruzamento automático entra junto com o classificador da Onda 8.",
        fontes: [
          "API Câmara · /deputados/{id}/eventos",
          "Próxima onda: cruzamento com CEAP categoria PASSAGEM AÉREA",
        ],
      };
    }
  }

  switch (key) {
    case "ceap":
      return blocoCEAP;
    case "tse":
      return blocoEmBreve(
        "TSE — Patrimônio declarado",
        "Camada 2 · Em breve",
        "Vamos cruzar a variação patrimonial entre 2018, 2022 e 2024 para detectar saltos sem origem documentada (indícios de subdeclaração ou aquisição não justificada).",
        [
          "TSE · DivulgaCandContas",
          "Cruzamento com Receita Federal (CNPJ sócios)",
        ],
      );
    case "folha":
      return blocoEmBreve(
        "Folha do gabinete",
        "Camada 3 · Em breve",
        "Servidores nomeados, parentesco, salários e rotatividade. A consulta inicial já é feita pelo worker Aurora via /deputados/{id}/orgaos da API Câmara como proxy até o cruzamento completo com o Portal da Transparência.",
        [
          "API Câmara · /deputados/{id}/orgaos",
          "Portal da Transparência · servidores ativos",
        ],
      );
    case "viagens":
      return blocoEmBreve(
        "Viagens, passagens & pedágios",
        "Camada 4 · Em breve",
        "Cruzamento entre passagens reembolsadas e a agenda oficial publicada para sinalizar viagens-fantasma ou períodos sem agenda. O coletor de viagens já está deployado (Onda 4 — processDossieJob); falta o classificador de cruzamento.",
        [
          "API Câmara · CEAP categoria PASSAGEM AÉREA",
          "API Câmara · /deputados/{id}/eventos",
        ],
      );
    case "emendas": {
      const list = normalizeEmendasList(Array.isArray(emendasList) ? emendasList : []);
      if (!list.length) {
        return blocoEmBreve(
          "Emendas & PIX RP6/RP7/RP99",
          "Camada 5 · Sem dados",
          "Este cadastro ainda não inclui microdados de emendas individuais. Após coleta complementar ou importação SIOP/Transferegov, a camada será preenchida automaticamente.",
          ["BigQuery · transparenciabr.emendas", "SIOP · Sistema Integrado de Planejamento e Orçamento"],
        );
      }
      const totalEmp = list.reduce(
        (s, e) => s + Number(e.valor_empenhado ?? e.valor_normalizado ?? 0),
        0,
      );
      const totalPago = list.reduce((s, e) => s + Number(e.valor_pago ?? 0), 0);
      const suspeitas = list.filter((e) => e.suspeita).length;
      const topEmendas = list.slice(0, 10).map((e) => ({
        categoria: `${e.funcao ?? e.descricao_normalizada ?? "—"} · ${e.municipio ?? "Nacional"} (${e.ano ?? "—"})`,
        qtd: e.suspeita ? 1 : 0,
        valor_brl: Number(e.valor_empenhado ?? e.valor_normalizado ?? 0),
      }));
      return {
        title: "Emendas parlamentares",
        kicker: `Camada 5 · DISPONÍVEL · ${list.length} registro(s)`,
        subtitle: `${nome} — empenhos e pagamentos declarados na base integrada.`,
        bigLabel: "Total empenhado",
        bigValue: fmtBRL(totalEmp),
        bigHint: `${list.length} emendas · ${suspeitas} sinalizações · taxa de execução ${totalEmp > 0 ? ((totalPago / totalEmp) * 100).toFixed(0) : 0}%.`,
        topCategorias: topEmendas,
        topCategoriasLabel: "Recortes por função / localidade",
        metricas: [
          { label: "Total empenhado", value: fmtBRL(totalEmp) },
          { label: "Total pago", value: fmtBRL(totalPago) },
          { label: "Emendas sinalizadas", value: `${suspeitas} de ${list.length}` },
          {
            label: "Taxa de execução",
            value: totalEmp > 0 ? `${((totalPago / totalEmp) * 100).toFixed(1)}%` : "—",
          },
        ],
        metodologia:
          "Emendas individuais e de bancada (RP6/RP7/RP99) normalizadas a partir de bases públicas. Sinalização automática não configura ilícito — apenas prioriza revisão humana com trilha documental.",
        fontes: [
          "BigQuery · transparenciabr.emendas",
          "Portal de Emendas Parlamentares",
          "SIOP · Sistema Integrado de Planejamento e Orçamento",
        ],
      };
    }
    case "pncp":
      return blocoEmBreve(
        "Contratos PNCP",
        "Camada 6 · Disponível (em validação)",
        "Detecção de empresas-fachada por k-means, ARIMA temporal e grafo de fornecedores. Coleta já acontece no Data Lake; visualização por parlamentar entra junto com o dossiê completo.",
        [
          "PNCP — Portal Nacional de Contratações Públicas",
          "Data Lake · gs://datalake-tbr-clean/pncp/",
        ],
      );
    default:
      return null;
  }
}

export default function PoliticoPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const qNome = searchParams.get("nome") || "";
  const { isAuthenticated } = useAuth();
  const [politico, setPolitico] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Onda 5 — KPIs reais do Data Lake (GCS ceap_classified/) via CF pública.
  const navigate = useNavigate();
  const { generate, loading: purchaseBusy, error: purchaseError } =
    useGenerateDossieOnDemand();
  const { unlimited: creditsUnlimited } = useUserCredits();
  const countdown = useDailyFreemiumCountdown(
    isAuthenticated && !creditsUnlimited,
  );

  const purchaseThenGo = async (tipo, addons = []) => {
    if (!id || purchaseBusy) return;
    try {
      await generate(id, { tipo, addons });
      navigate({ pathname: `/politico/${encodeURIComponent(id)}`, hash: "pacote-forense" }, { replace: true });
    } catch {
      /* estado em purchaseError */
    }
  };

  // Onda 6 — drawer inline para drill-down clicável.
  const [drawer, setDrawer] = useState({ open: false, payload: null });
  const closeDrawer = () => setDrawer((s) => ({ ...s, open: false }));

  // Onda 5 — KPIs reais do Data Lake
  const kpisState = useKPIsParlamentar(id);
  const heroKpis = extractHeroKPIs(kpisState.kpis);
  const ceapBreakdown = extractCeapBreakdown(kpisState.kpis);
  const hasKpis = kpisState.hasData;
  const kpisRaw = kpisState.kpis ?? {};
  const loadingKpis = kpisState.loading;

  // Onda 7 — dados vivos da API Câmara (CEAP detalhado, com. e eventos).
  const ceapDet = useCEAPDetalhado(id);
  const comissoes = useComissoesParlamentar(id);
  const eventos = useEventosParlamentar(id);

  const pdfRef = useRef(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState(null);

  const displayRecord = useMemo(() => enrichPoliticoRecord(politico), [politico]);

  const handleDownloadPDF = useCallback(async () => {
    setPdfError(null);
    const el = pdfRef.current;
    if (!el) {
      setPdfError("Conteúdo do relatório PDF não está disponível neste momento.");
      return;
    }
    setPdfBusy(true);
    try {
      const base =
        (displayRecord && pickNome(displayRecord)) ||
        politico?.nome ||
        politico?.nome_civil ||
        "parlamentar";
      const filename = dossiePdfFilename(base);
      await html2pdf()
        .set({
          margin: 10,
          filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#0B0F1A",
            logging: false,
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(el)
        .save();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido ao gerar o PDF.";
      setPdfError(msg);
    } finally {
      setPdfBusy(false);
    }
  }, [displayRecord, politico]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    // Cadeia universal: Firestore politicos → CEAP hint → roster (fuzzy) →
    // ex-parlamentar histórico. Garante que qualquer ID/slug compartilhado abra esta página.
    resolvePoliticoUniversal(id)
      .then((p) => {
        if (!mounted) return;
        setPolitico(p);
        setLoading(false);
      })
      .catch((e) => {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  // Emendas: o roster (Firestore) costuma não incluir microdados. O mesmo endpoint
  // de despesas CEAP já resolve o nome no BigQuery e anexa `emendas` ao JSON.
  useEffect(() => {
    if (!politico || !id) return;

    const hasEmendas =
      (Array.isArray(politico.emendas) && politico.emendas.length > 0) ||
      (Array.isArray(politico.emendas_parlamentares) &&
        politico.emendas_parlamentares.length > 0);
    if (hasEmendas) return;

    const nomeParl = String(
      qNome || politico?.nome || politico?.nome_civil || "",
    ).trim();
    const qNomeParam = nomeParl ? `nome=${encodeURIComponent(nomeParl)}` : "";
    const qIdParam = `id=${encodeURIComponent(String(id))}`;
    const idOrNome = [qNomeParam, qIdParam].filter(Boolean).join("&");
    if (!idOrNome) return;

    const ac = new AbortController();
    (async () => {
      try {
        const r = await fetch(
          `/api/datalake/politico-despesas?${idOrNome}&mode=preview`,
          { signal: ac.signal },
        );
        if (!r.ok) return;
        const data = await r.json();
        if (ac.signal.aborted) return;
        const em = data?.emendas;
        if (Array.isArray(em) && em.length > 0) {
          setPolitico((prev) => (prev ? { ...prev, emendas: em } : prev));
        }
      } catch (e) {
        if (e?.name === "AbortError") return;
      }
    })();

    return () => ac.abort();
  }, [politico, id, qNome]);

  // Fluxo da CTA principal (permanece nesta página após autenticação)
  const politicoPagePath = `/politico/${encodeURIComponent(id ?? "")}`;
  const ctaTo = isAuthenticated
    ? `${politicoPagePath}#pacote-forense`
    : `/login?redirect=${encodeURIComponent(politicoPagePath)}`;
  const ctaLabel = isAuthenticated
    ? "Contratar auditoria / dossiê completo"
    : `Entrar para contratar (${CREDIT_PRICE_DOSSIE_MATADOR} cr)`;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080B14] px-4 py-16 text-center text-[#8B949E]">
        <div className="mx-auto inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm">
          <span className="size-2 animate-pulse rounded-full bg-cyan-400" />
          Carregando parlamentar…
        </div>
      </div>
    );
  }

  if (error || !politico) {
    return (
      <div className="min-h-screen bg-[#080B14] px-4 py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-rose-400/30 bg-rose-400/10 p-6 text-center">
          <h1 className="text-xl font-semibold text-rose-100">
            Parlamentar não encontrado
          </h1>
          <p className="mt-2 text-sm text-rose-200/80">
            Não conseguimos localizar este registro. Verifique o ID/slug ou volte
            para a busca.
          </p>
          <Link
            to="/politica/busca"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-400/20 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-400/30"
          >
            Buscar parlamentar
            <ArrowRight className="size-4" strokeWidth={2} />
          </Link>
        </div>
      </div>
    );
  }

  const nome = politico?.nome ?? politico?.nome_civil ?? "—";
  const partido =
    politico?.partido ?? politico?.siglaPartido ?? politico?.party ?? "—";
  const uf =
    politico?.uf ?? politico?.siglaUf ?? politico?.estado ?? "—";
  const emendasListRaw = politico?.emendas ?? politico?.emendas_parlamentares;

  const cota =
    (heroKpis.ceap_acumulado > 0 ? heroKpis.ceap_acumulado : null) ??
    Number(
      politico?.cota_anual ??
        politico?.cota ??
        politico?.gasto_total ??
        politico?.ceap_total_acumulado ??
        0,
    );
  const score =
    (heroKpis.score_aurora > 0 ? heroKpis.score_aurora : null) ??
    Number(
      politico?.score_asmodeus ??
        politico?.score_risco ??
        politico?.risk_score ??
        politico?.score ??
        politico?.kpi_score_risco ??
        0,
    );
  // "Presença" deixa de ser presença em plenário (que não temos) e vira
  // "rastreabilidade do dossiê" — KPI honesto baseado em dado real.
  const presenca =
    (heroKpis.rastreabilidade_pct > 0 ? heroKpis.rastreabilidade_pct : null) ??
    Number(
      politico?.presenca ?? politico?.presenca_pct ?? politico?.kpi_presenca ?? 0,
    );
  const sinalizacoes =
    (heroKpis.qtd_notas_alto_risco > 0 ? heroKpis.qtd_notas_alto_risco : null) ??
    Number(
      politico?.sinalizacoes ??
        politico?.sinalizacoes_total ??
        politico?.kpi_sinalizacoes ??
        0,
    );

  const fotoUrl =
    politico?.foto ?? politico?.urlFoto ?? politico?.url_foto ?? null;
  // Onda 14 — selo “ex-parlamentar” quando o registro veio do CEAP histórico
  // (parâmetro povoado por ceapEntryToHistoricoRecord em universeRosterApi.js).
  const isHistorico = politico?.snapshot_origem === "ceap_historico";
  const avisoHistorico =
    politico?.aviso_historico ||
    "Parlamentar registrado no CEAP histórico, mas não consta no roster atual da Câmara/Senado.";

  const hasLiveCeap = !!(ceapDet && !ceapDet.loading && ceapDet.qtdNotas > 0);
  const showForensicKpis = hasKpis || hasLiveCeap;

  return (
    <div className="min-h-screen bg-[#05060d] text-[#F0F4FC]">
      <Helmet>
        <title>
          {nome} ({partido}/{uf}) · Auditoria parlamentar | Transparência BR
        </title>
        <meta
          name="description"
          content={`Auditoria forense e dossiê completo de ${nome} (${partido}/${uf}) — CEAP, emendas, PNCP e camadas correlatas. Contratação on-demand a partir de ${CREDIT_PRICE_DOSSIE_MATADOR} créditos.`}
        />
      </Helmet>

      {/* Backdrop estrelado */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              "radial-gradient(2px 2px at 20% 30%, rgba(255,255,255,0.4), transparent 50%)," +
              "radial-gradient(1.5px 1.5px at 70% 70%, rgba(255,255,255,0.3), transparent 50%)," +
              "radial-gradient(1.5px 1.5px at 85% 25%, rgba(34,211,238,0.4), transparent 50%)," +
              "radial-gradient(1px 1px at 10% 60%, rgba(167,139,250,0.4), transparent 50%)",
            backgroundSize:
              "600px 600px, 800px 800px, 700px 700px, 500px 500px",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#05060d]/40 to-[#05060d]" />
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-xs text-[#8B949E]">
          <Link to="/" className="hover:text-cyan-300">
            TransparênciaBR
          </Link>
          <ChevronRight className="size-3" />
          <Link to="/politica/busca" className="hover:text-cyan-300">
            Parlamentares
          </Link>
          <ChevronRight className="size-3" />
          <span className="text-white/80">{nome}</span>
        </nav>

        {isAuthenticated && !creditsUnlimited && countdown.labelShort ? (
          <div className="mb-6 rounded-2xl border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-sm text-amber-100/90">
            <span className="font-semibold text-amber-200">Créditos diários.</span>{" "}
            Faltam{" "}
            <span className="font-mono text-white">{countdown.labelShort}</span>{" "}
            para resetar seus{" "}
            <span className="font-mono text-white">{countdown.dailyCap}</span>{" "}
            créditos diários (cota não cumulativa — horário de Brasília).
          </div>
        ) : null}

        {/* Hero — header rico */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8 flex flex-col gap-6 rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-400/[0.06] via-violet-500/[0.04] to-transparent p-6 backdrop-blur-md sm:flex-row sm:items-center sm:p-8"
        >
          {fotoUrl ? (
            <img
              src={fotoUrl}
              alt={nome}
              className="size-24 shrink-0 rounded-2xl border border-white/10 object-cover sm:size-32"
              loading="lazy"
            />
          ) : (
            <div className="flex size-24 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 sm:size-32">
              <Users className="size-10 text-white/30" strokeWidth={1.5} />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p
              className={`text-[10px] font-semibold uppercase tracking-[0.28em] ${
                isHistorico ? "text-amber-300" : "text-cyan-300"
              }`}
            >
              {isHistorico
                ? "Ex-parlamentar · Registro CEAP histórico"
                : "Parlamentar federal · Câmara dos Deputados"}
            </p>
            <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              <span>{nome}</span>
              {isHistorico && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-300/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200"
                  title={avisoHistorico}
                >
                  Histórico
                </span>
              )}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <AuditoriaOnDemandButton politicoId={String(politico?.id ?? id ?? "")} />
            </div>
            <p className="mt-1 text-sm text-[#8B949E]">
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-xs">
                {partido}/{uf}
              </span>
              <span className="ml-2">ID Câmara: {politico?.id ?? "—"}</span>
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiBlock
                label="Score Aurora"
                value={showForensicKpis ? `${Math.round(score)} / 100` : "—"}
                accent="violet"
                hint={showForensicKpis ? "clique para detalhes" : "sem dado classificado"}
                onClick={() =>
                  setDrawer({
                    open: true,
                    payload: buildKpiDrawerPayload("score", {
                      kpisRaw,
                      heroKpis,
                      breakdown: ceapBreakdown,
                      hasKpis,
                      nome,
                    }),
                  })
                }
              />
              <KpiBlock
                label="CEAP classificado"
                value={showForensicKpis ? fmtBRL(cota) : "—"}
                accent="amber"
                hint={showForensicKpis ? "clique para série anual" : "em coleta"}
                onClick={() =>
                  setDrawer({
                    open: true,
                    payload: buildKpiDrawerPayload("ceap", {
                      kpisRaw,
                      heroKpis,
                      breakdown: ceapBreakdown,
                      hasKpis,
                      nome,
                    }),
                  })
                }
              />
              <KpiBlock
                label="Rastreabilidade"
                value={
                  showForensicKpis && presenca > 0
                    ? `${Math.round(presenca)}%`
                    : hasLiveCeap
                      ? `${ceapDet.qtdNotas} notas`
                      : "—"
                }
                accent="emerald"
                hint={showForensicKpis ? "qualidade do dossiê" : null}
                onClick={() =>
                  setDrawer({
                    open: true,
                    payload: buildKpiDrawerPayload("rastreabilidade", {
                      kpisRaw,
                      heroKpis,
                      breakdown: ceapBreakdown,
                      hasKpis,
                      nome,
                    }),
                  })
                }
              />
              <KpiBlock
                label="Alertas forenses"
                value={showForensicKpis ? fmtNum(sinalizacoes) : "—"}
                accent="rose"
                hint={showForensicKpis ? "clique para detalhes" : "a confirmar"}
                onClick={() =>
                  setDrawer({
                    open: true,
                    payload: buildKpiDrawerPayload("alto_risco", {
                      kpisRaw,
                      heroKpis,
                      breakdown: ceapBreakdown,
                      hasKpis,
                      nome,
                    }),
                  })
                }
              />
            </div>

            {/* Onda 14 — banner explicando que o parlamentar não consta no roster atual */}
            {isHistorico && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-300/30 bg-amber-300/5 p-3 text-sm">
                <span className="mt-0.5 size-2 shrink-0 rounded-full bg-amber-300" />
                <p className="text-[#D1D5DB]">
                  <span className="font-semibold text-amber-200">Registro histórico.</span>{" "}
                  {avisoHistorico} Os dados exibidos vieram do CEAP arquivado — o
                  parlamentar pode ter encerrado o mandato ou trocado de casa
                  legislativa.
                </p>
              </div>
            )}

            {/* Banner honesto quando o parlamentar ainda não foi classificado */}
            {!loadingKpis && !showForensicKpis && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm">
                <span className="mt-0.5 size-2 shrink-0 animate-pulse rounded-full bg-amber-300" />
                <p className="text-[#D1D5DB]">
                  Ainda não há classificação CEAP agregada neste perfil.{" "}
                  <span className="text-amber-200">
                    Contrate o pacote de auditoria para disparar a coleta e materialização das camadas
                  </span>{" "}
                  — o backend enfileira o processamento e atualiza os indicadores em seguida.
                </p>
              </div>
            )}
          </div>
        </motion.header>

        {/* CTA principal — contratação na mesma página */}
        <motion.section
          id="pacote-forense"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="mb-10 flex flex-col items-stretch gap-4 rounded-2xl border border-cyan-400/30 bg-gradient-to-r from-cyan-400/10 via-violet-500/10 to-transparent p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-5 shrink-0 text-cyan-300" strokeWidth={1.75} />
            <div>
              <p className="text-base font-semibold text-white">
                Auditoria completa forense — Dossiê completo
              </p>
              <p className="mt-0.5 text-sm text-[#8B949E]">
                Consolidação jurídica das seis camadas canônicas (CEAP, TSE, folha, viagens,
                emendas, PNCP), espectro político e anexos auditáveis. Pacote principal:{" "}
                <span className="text-cyan-300">
                  {CREDIT_PRICE_DOSSIE_MATADOR} créditos
                </span>
                .
              </p>
            </div>
          </div>
          <Link
            to={ctaTo}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-5 py-3 text-sm font-bold uppercase tracking-wider text-[#02040a] transition hover:brightness-110"
          >
            <Coins className="size-4" strokeWidth={2.25} />
            {ctaLabel}
          </Link>
        </motion.section>

        {isAuthenticated ? (
          <section className="mb-10 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">
              Débito imediato via Cloud Function + fila de coleta
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                disabled={purchaseBusy}
                onClick={() => purchaseThenGo("dossie_matador")}
                className="flex flex-col items-start gap-1 rounded-2xl border border-rose-400/40 bg-gradient-to-br from-rose-500/20 to-orange-600/10 px-4 py-4 text-left transition hover:brightness-110 disabled:opacity-50"
              >
                <span className="text-xs font-black uppercase tracking-widest text-rose-100">
                  Dossiê completo
                </span>
                <span className="text-2xl font-bold tabular-nums text-white">
                  {CREDIT_PRICE_DOSSIE_MATADOR}{" "}
                  <span className="text-sm font-semibold text-rose-200/80">cr</span>
                </span>
                <span className="text-[11px] leading-snug text-[#cbd5e1]">
                  Auditoria forense integral e recalculo das camadas materializadas.
                </span>
              </button>
              <button
                type="button"
                disabled={purchaseBusy}
                onClick={() => purchaseThenGo("ceap_completo")}
                className="flex flex-col items-start gap-1 rounded-2xl border border-cyan-400/35 bg-cyan-500/10 px-4 py-4 text-left transition hover:bg-cyan-500/15 disabled:opacity-50"
              >
                <span className="text-xs font-black uppercase tracking-widest text-cyan-100">
                  CEAP classificado — pacote
                </span>
                <span className="text-2xl font-bold tabular-nums text-white">
                  {CREDIT_PRICE_CEAP_COMPLETO}{" "}
                  <span className="text-sm font-semibold text-cyan-200/80">cr</span>
                </span>
                <span className="text-[11px] leading-snug text-[#8B949E]">
                  Foco em cota parlamentar, fornecedores e notas classificadas.
                </span>
              </button>
              <button
                type="button"
                disabled={purchaseBusy}
                onClick={() => purchaseThenGo("emendas_completas")}
                className="flex flex-col items-start gap-1 rounded-2xl border border-violet-400/35 bg-violet-500/10 px-4 py-4 text-left transition hover:bg-violet-500/15 disabled:opacity-50"
              >
                <span className="text-xs font-black uppercase tracking-widest text-violet-100">
                  Emendas — pacote
                </span>
                <span className="text-2xl font-bold tabular-nums text-white">
                  {CREDIT_PRICE_EMENDAS_COMPLETAS}{" "}
                  <span className="text-sm font-semibold text-violet-200/80">cr</span>
                </span>
                <span className="text-[11px] leading-snug text-[#8B949E]">
                  Microdados de emendas, beneficiários e rastreabilidade orçamentária.
                </span>
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={pdfBusy || !displayRecord}
                onClick={handleDownloadPDF}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-amber-100 transition hover:bg-amber-500/20 disabled:opacity-50"
              >
                <FileText className="size-4" strokeWidth={2} />
                {pdfBusy ? "Gerando PDF…" : "Exportar dossiê em PDF"}
              </button>
              {pdfError ? (
                <p className="text-xs text-rose-300">{pdfError}</p>
              ) : null}
            </div>
            <p className="text-[11px] text-[#8B949E]">
              Add-ons opcionais na mesma transação: PDF + laudo (+{CREDIT_ADDON_PDF_LAUDO} cr) · comparações
              avançadas (+{CREDIT_ADDON_COMPARACOES_AVANCADAS} cr).
            </p>
            {purchaseBusy ? (
              <p className="text-xs text-cyan-300">Processando débito…</p>
            ) : null}
            {purchaseError ? (
              <p className="text-xs text-rose-300">{purchaseError}</p>
            ) : null}
          </section>
        ) : null}

        {/* Despesas CEAP — seção principal com preview + paywall + filtros */}
        <DespesasSection
          nome={qNome || nome}
          politicoId={id}
        />
        <div className="my-6" />
        <PoliticoAnalytics politico={politico} ceapDet={ceapDet} />
        <div className="my-6" />
        <EmendasPoliticoSection politico={politico} politicoId={String(id ?? "")} />

        <div className="my-10" />

        {/* 6 categorias canônicas — preview público */}
        <section className="mb-10">
          <header className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300">
                Plano Mestre · 6 camadas
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                O que você recebe na auditoria completa
              </h2>
            </div>
          </header>

          <div className="grid gap-3 sm:grid-cols-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  const p = buildCamadaDrawerPayload(c.key, {
                      breakdown: ceapBreakdown,
                      hasKpis,
                      nome,
                      heroKpis,
                      ceapDet,
                      comissoes,
                      eventos,
                      emendasList: emendasListRaw,
                    });
                  setDrawer({ open: true, payload: p });
                }}
                className="group flex items-start gap-3 rounded-2xl border border-[#30363D] bg-[#0D1117]/80 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-400/40 hover:bg-[#0D1117]"
              >
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 font-mono text-xs text-white/70">
                  {c.n}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">
                      {c.label}
                    </h3>
                    {c.status === "available" ? (
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-200">
                        Disponível
                      </span>
                    ) : (
                      <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-200">
                        Em breve
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#8B949E]">
                    {c.teaser}
                  </p>
                  <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-widest text-cyan-300/0 transition group-hover:text-cyan-300/80">
                    Ver detalhes →
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Bonus — recursos extra */}
        <section className="mb-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-white/60">
            Recursos incluídos no dossiê completo
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <FeatureBox
              icon={<Radar className="size-4 text-cyan-300" strokeWidth={1.75} />}
              title="Radar OSINT"
              desc="Boatos validados x desmascarados, classificados por compliance."
            />
            <FeatureBox
              icon={<Shield className="size-4 text-violet-300" strokeWidth={1.75} />}
              title="Espectro político"
              desc="Posição ideológica calculada (E.S.P.E.C.T.R.O.) com transparência metodológica."
            />
            <FeatureBox
              icon={<FileText className="size-4 text-amber-300" strokeWidth={1.75} />}
              title="Exportação PDF"
              desc="Relatório estruturado pronto para juntar ao seu material investigativo."
            />
          </div>
        </section>

        {/* CTA final */}
        <section className="mb-6 rounded-3xl border border-white/10 bg-[#0D1117]/80 p-6 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200">
            Filosofia da casa
          </p>
          <p className="mx-auto mt-2 max-w-2xl text-base leading-relaxed text-[#C9D1D9]">
            Toda nota é suspeita até prova contrária. Não fazemos denúncia —
            apresentamos fatos auditáveis com fonte primária.
          </p>
          <Link
            to={ctaTo}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-6 py-3 text-sm font-bold uppercase tracking-wider text-[#02040a] transition hover:brightness-110"
          >
            <Lock className="size-4" strokeWidth={2.25} />
            {ctaLabel}
          </Link>
          {!isAuthenticated && (
            <p className="mt-3 text-[11px] text-white/40">
              Já tem conta?{" "}
              <Link
                to={`/login?redirect=${encodeURIComponent(politicoPagePath)}`}
                className="text-cyan-300 hover:underline"
              >
                Entrar
              </Link>{" "}
              · Sem créditos?{" "}
              <Link to="/creditos" className="text-cyan-300 hover:underline">
                Ver pacotes
              </Link>
            </p>
          )}
        </section>
      </div>

      {/* Área técnica para html2pdf — fora do fluxo visual */}
      <div
        className="pointer-events-none fixed -left-[10000px] top-0 w-[794px] overflow-hidden opacity-[0.02]"
        aria-hidden
      >
        {displayRecord ? (
          <DossiePDFContent
            ref={pdfRef}
            politico={displayRecord}
            alertas={
              Array.isArray(politico?.alertas_anexados)
                ? politico.alertas_anexados
                : Array.isArray(politico?.alertas)
                  ? politico.alertas
                  : []
            }
            ceapKpi={kpisRaw}
          />
        ) : null}
      </div>

      {/* Onda 6 — Drawer de drill-down inline */}
      <CamadaDrawer
        open={drawer.open}
        onClose={closeDrawer}
        payload={drawer.payload}
        ctaTo={ctaTo}
        ctaLabel={ctaLabel}
      />
    </div>
  );
}

// =============================================================================
// Subcomponentes
// =============================================================================
function KpiBlock({ label, value, accent = "cyan", hint = null, onClick = null }) {
  const map = {
    cyan: "border-cyan-400/30 bg-cyan-500/10 text-cyan-200",
    violet: "border-violet-400/30 bg-violet-500/10 text-violet-200",
    amber: "border-amber-400/30 bg-amber-500/10 text-amber-200",
    emerald: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    rose: "border-rose-400/30 bg-rose-500/10 text-rose-200",
  };
  const base = `rounded-xl border px-3 py-2 ${map[accent] ?? map.cyan}`;
  const interactive = onClick
    ? " cursor-pointer text-left transition hover:scale-[1.02] hover:brightness-110"
    : "";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick ?? undefined}
      className={`${base}${interactive} block w-full`}
    >
      <p className="text-[9px] font-semibold uppercase tracking-widest opacity-70">
        {label}
      </p>
      <p className="mt-1 font-mono text-base font-semibold tabular-nums">
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-[9px] uppercase tracking-wider opacity-50">
          {hint}
        </p>
      )}
    </Tag>
  );
}

function FeatureBox({ icon, title, desc }) {
  return (
    <div className="rounded-2xl border border-[#30363D] bg-[#0D1117]/80 p-4">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[#8B949E]">{desc}</p>
    </div>
  );
}
