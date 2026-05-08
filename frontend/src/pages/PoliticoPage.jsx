/**
 * PoliticoPage — Landing pública por parlamentar (Onda 3).
 *
 * Rota: /politico/:id  (PÚBLICA, sem ProtectedRoute)
 *
 * Esta é a "página de vendas" prioritária do TransparênciaBR. Visitante chega,
 * vê o esqueleto preview do dossiê (header rico, KPIs públicos, índices das 6
 * categorias canônicas) e recebe CTA para abrir o dossiê completo (200 cr).
 *
 * Fluxo:
 *   Anônimo  → "Comprar dossiê (200 cr)" → /login?redirect=/dossie/:id
 *   Logado   → "Abrir dossiê completo"  → /dossie/:id (paywall interno cuida do débito)
 *
 * Filosofia: "Toda nota é suspeita até prova contrária." Mostramos só o que é
 * público — KPIs agregados que já vêm do Firestore. Detalhes ficam atrás do paywall.
 */

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
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

import { fetchPoliticoByIdOrSlug } from "../lib/firebase.js";
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
import CamadaDrawer from "../components/CamadaDrawer.jsx";

const DOSSIE_PRICE_CREDITS = 200;

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
    teaser: "Microdados LOA, beneficiários por CNPJ, concentração temporal.",
    status: "coming",
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
  { breakdown, hasKpis, nome, heroKpis, ceapDet, comissoes, eventos },
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
    case "emendas":
      return blocoEmBreve(
        "Emendas & PIX RP6/RP7/RP99",
        "Camada 5 · Em breve",
        "Microdados de execução orçamentária das emendas individuais e de bancada (RP6/RP7/RP99) com beneficiários por CNPJ e concentração temporal. BigQuery `projeto-codex-br.fiscalizapa.emendas_*` já existe; falta o agregador por parlamentar.",
        [
          "BigQuery · projeto-codex-br.fiscalizapa.emendas",
          "SIOP · Sistema Integrado de Planejamento e Orçamento",
        ],
      );
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
  const { isAuthenticated } = useAuth();
  const [politico, setPolitico] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Onda 5 — KPIs reais do Data Lake (GCS ceap_classified/) via CF pública.
  const { kpis: kpisRaw, hasData: hasKpis, loading: loadingKpis } = useKPIsParlamentar(id);
  const heroKpis = extractHeroKPIs(kpisRaw);
  const breakdown = extractCeapBreakdown(kpisRaw);

  // Onda 6 — drawer inline para drill-down clicável.
  const [drawer, setDrawer] = useState({ open: false, payload: null });
  const closeDrawer = () => setDrawer((s) => ({ ...s, open: false }));

  // Onda 7 — dados vivos da API Câmara (CEAP detalhado, com. e eventos).
  const ceapDet = useCEAPDetalhado(id);
  const comissoes = useComissoesParlamentar(id);
  const eventos = useEventosParlamentar(id);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    fetchPoliticoByIdOrSlug(id)
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

  // Fluxo da CTA principal (compra/abertura do dossiê)
  const dossieRoute = `/dossie/${encodeURIComponent(id ?? "")}`;
  const ctaTo = isAuthenticated
    ? dossieRoute
    : `/login?redirect=${encodeURIComponent(dossieRoute)}`;
  const ctaLabel = isAuthenticated
    ? "Abrir dossiê completo"
    : `Comprar dossiê (${DOSSIE_PRICE_CREDITS} créditos)`;

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
  // Onda 5 — prioriza dado real do Data Lake; fallback para Firestore se houver.
  const cota =
    heroKpis.ceap_acumulado ??
    Number(
      politico?.cota_anual ??
        politico?.cota ??
        politico?.gasto_total ??
        politico?.ceap_total_acumulado ??
        0,
    );
  const score =
    heroKpis.score_aurora ??
    Number(
      politico?.score_risco ??
        politico?.risk_score ??
        politico?.score ??
        politico?.kpi_score_risco ??
        0,
    );
  // "Presença" deixa de ser presença em plenário (que não temos) e vira
  // "rastreabilidade do dossiê" — KPI honesto baseado em dado real.
  const presenca = heroKpis.rastreabilidade_pct ??
    Number(
      politico?.presenca ?? politico?.presenca_pct ?? politico?.kpi_presenca ?? 0,
    );
  // "Sinalizações" agora é a contagem real de notas em alto risco.
  const sinalizacoes = heroKpis.qtd_notas_alto_risco ??
    Number(
      politico?.sinalizacoes ??
        politico?.sinalizacoes_total ??
        politico?.kpi_sinalizacoes ??
        0,
    );
  const fotoUrl =
    politico?.foto ?? politico?.urlFoto ?? politico?.url_foto ?? null;

  return (
    <div className="min-h-screen bg-[#05060d] text-[#F0F4FC]">
      <Helmet>
        <title>
          {nome} ({partido}/{uf}) · Dossiê | Transparência BR
        </title>
        <meta
          name="description"
          content={`Dossiê completo de ${nome} (${partido}/${uf}) — CEAP, emendas, PNCP, TSE, folha do gabinete e mais. Pagamento on-demand a partir de ${DOSSIE_PRICE_CREDITS} créditos.`}
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
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300">
              Parlamentar federal · Câmara dos Deputados
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
              {nome}
            </h1>
            <p className="mt-1 text-sm text-[#8B949E]">
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-xs">
                {partido}/{uf}
              </span>
              <span className="ml-2">ID Câmara: {politico?.id ?? "—"}</span>
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiBlock
                label="Score Aurora"
                value={hasKpis ? `${Math.round(score)} / 100` : "—"}
                accent="violet"
                hint={hasKpis ? "clique para detalhes" : "sem dado classificado"}
                onClick={() =>
                  setDrawer({
                    open: true,
                    payload: buildKpiDrawerPayload("score", {
                      kpisRaw,
                      heroKpis,
                      breakdown,
                      hasKpis,
                      nome,
                    }),
                  })
                }
              />
              <KpiBlock
                label="CEAP classificado"
                value={hasKpis ? fmtBRL(cota) : "—"}
                accent="amber"
                hint={hasKpis ? "clique para série anual" : "em coleta"}
                onClick={() =>
                  setDrawer({
                    open: true,
                    payload: buildKpiDrawerPayload("ceap", {
                      kpisRaw,
                      heroKpis,
                      breakdown,
                      hasKpis,
                      nome,
                    }),
                  })
                }
              />
              <KpiBlock
                label="Rastreabilidade"
                value={hasKpis && presenca > 0 ? `${Math.round(presenca)}%` : "—"}
                accent="emerald"
                hint={hasKpis ? "qualidade do dossiê" : null}
                onClick={() =>
                  setDrawer({
                    open: true,
                    payload: buildKpiDrawerPayload("rastreabilidade", {
                      kpisRaw,
                      heroKpis,
                      breakdown,
                      hasKpis,
                      nome,
                    }),
                  })
                }
              />
              <KpiBlock
                label="Notas alto risco"
                value={hasKpis ? fmtNum(sinalizacoes) : "—"}
                accent="rose"
                hint={hasKpis ? "clique para detalhes" : "a confirmar"}
                onClick={() =>
                  setDrawer({
                    open: true,
                    payload: buildKpiDrawerPayload("alto_risco", {
                      kpisRaw,
                      heroKpis,
                      breakdown,
                      hasKpis,
                      nome,
                    }),
                  })
                }
              />
            </div>

            {/* Banner honesto quando o parlamentar ainda não foi classificado */}
            {!loadingKpis && !hasKpis && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm">
                <span className="mt-0.5 size-2 shrink-0 animate-pulse rounded-full bg-amber-300" />
                <p className="text-[#D1D5DB]">
                  Este parlamentar ainda não foi processado pelo motor Aurora.{" "}
                  <span className="text-amber-200">
                    Abra o dossiê completo para disparar a coleta sob demanda
                  </span>{" "}
                  — cruzamos CEAP, viagens e folha em ~30 segundos.
                </p>
              </div>
            )}
          </div>
        </motion.header>

        {/* CTA principal — barra fixa no topo do conteúdo */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="mb-10 flex flex-col items-stretch gap-4 rounded-2xl border border-cyan-400/30 bg-gradient-to-r from-cyan-400/10 via-violet-500/10 to-transparent p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-5 shrink-0 text-cyan-300" strokeWidth={1.75} />
            <div>
              <p className="text-base font-semibold text-white">
                Dossiê completo on-demand
              </p>
              <p className="mt-0.5 text-sm text-[#8B949E]">
                Cruzamento das 6 camadas canônicas (CEAP, TSE, Folha, Viagens,
                Emendas, PNCP) + Espectro político e radar OSINT.{" "}
                <span className="text-cyan-300">
                  {DOSSIE_PRICE_CREDITS} créditos por dossiê.
                </span>
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

        {/* 6 categorias canônicas — preview público */}
        <section className="mb-10">
          <header className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300">
                Plano Mestre · 6 camadas
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                O que você recebe ao abrir o dossiê
              </h2>
            </div>
          </header>

          <div className="grid gap-3 sm:grid-cols-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() =>
                  setDrawer({
                    open: true,
                    payload: buildCamadaDrawerPayload(c.key, {
                      breakdown,
                      hasKpis,
                      nome,
                      heroKpis,
                      ceapDet,
                      comissoes,
                      eventos,
                    }),
                  })
                }
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
            Bonus inclusos no dossiê
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
                to={`/login?redirect=${encodeURIComponent(dossieRoute)}`}
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
