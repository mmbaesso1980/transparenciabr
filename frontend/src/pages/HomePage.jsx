import { Canvas } from "@react-three/fiber";
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  Database,
  FileSearch,
  Mail,
  Network,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

import BrandLogo from "../components/BrandLogo.jsx";
import GlobalSearch from "../components/GlobalSearch.jsx";
import PoliticianOrb from "../components/PoliticianOrb.jsx";
import UniverseGraph from "../components/UniverseGraph.jsx";
import { fetchPoliticosCollection, getFirebaseApp } from "../lib/firebase.js";

const PIPELINE_STEPS = [
  {
    code: "00",
    title: "Ingestao resiliente",
    body: "PNCP, emendas, TCU e bases legislativas entram por cursores seguros, NDJSON e backoff anti-deadlock.",
  },
  {
    code: "02",
    title: "Purificacao BigQuery",
    body: "Moedas viram FLOAT64, datas seguem ISO 8601 e CPFs soltos sao ofuscados antes da camada analitica.",
  },
  {
    code: "05",
    title: "Visao documental",
    body: "Contratos e notas fiscais em PDF/imagem passam por Enterprise Document OCR, preservando custo de nuvem.",
  },
  {
    code: "06",
    title: "Oraculo semantico",
    body: "Gemini 2.5 Pro (Lider Supremo agent_1777236402725) analisa clausulas sob direito administrativo brasileiro e devolve JSON deterministico.",
  },
  {
    code: "15",
    title: "Predicao BQML",
    body: "K-Means e ARIMA_PLUS rodam dentro do BigQuery para detectar fachadas e surtos temporais de gasto.",
  },
  {
    code: "17",
    title: "Dossie desnormalizado",
    body: "O Firestore recebe um unico documento pronto para renderizar Bento Boxes sem joins no navegador.",
  },
];

const CAPABILITY_CARDS = [
  {
    icon: Database,
    title: "BigQuery como reator analitico",
    body: "As agregacoes pesadas, modelos BQML e janelas temporais ficam no cluster do Google, sem dataframes no cliente.",
  },
  {
    icon: BrainCircuit,
    title: "IA confinada por protocolo",
    body: "Prompts de sistema restritos, temperatura baixa e saida JSON reduzem alucinacoes e preservam auditoria tecnica.",
  },
  {
    icon: ShieldCheck,
    title: "Cota protegida por design",
    body: "Firestore serve snapshots compactados, regras bloqueiam escrita publica e o cliente cacheia leituras por 24h.",
  },
];

const METRICS = [
  ["Engines", "00-17", "pipeline modular"],
  ["Cache", "24h", "leituras reduzidas"],
  ["Firestore", "1 doc", "dossie sem joins"],
];

// Categorias de investigação — cada uma é uma orbe-portal estilo data.gov.uk.
// `seed` é o input determinístico do algoritmo (mesmo seed = mesma cor sempre).
// `score` modula a urgência visual (90 = vermelho profundo · 35 = pastel).
const INVESTIGATION_CATEGORIES = [
  {
    seed: "asmodeus.ceap",
    score: 90,
    label: "Cota CEAP",
    headline: "R$ 4 bi/ano",
    body: "Cada nota é suspeita até prova contrária. Locação, combustível, divulgação parlamentar — auditados nota a nota.",
    to: "/ranking?modulo=ceap",
    cta: "Investigar gastos",
  },
  {
    seed: "asmodeus.patrimonio",
    score: 78,
    label: "Patrimônio TSE",
    headline: "+1.200%",
    body: "Crescimento patrimonial entre eleições. Bens declarados vs. faixa salarial — outliers expostos.",
    to: "/ranking?modulo=patrimonio",
    cta: "Ver enriquecimento",
  },
  {
    seed: "asmodeus.flavio",
    score: 72,
    label: "Folha F.L.A.V.I.O.",
    headline: "21 secretários",
    body: "Familiares, sócios e fantasmas no gabinete. Cruzamento CPF × empresa × parentesco.",
    to: "/ranking?modulo=folha",
    cta: "Mapear gabinete",
  },
  {
    seed: "asmodeus.viagens",
    score: 65,
    label: "Viagens & Pedágios",
    headline: "48 passagens",
    body: "Carro alugado em Brasília, pedágio no Rio. SEM PARAR não mente — geolocalização forense.",
    to: "/ranking?modulo=viagens",
    cta: "Rastrear deslocamento",
  },
  {
    seed: "asmodeus.emendas",
    score: 82,
    label: "Emendas & PIX",
    headline: "R$ 50 bi",
    body: "Emendas relator, individuais e PIX. Beneficiários terminais, ONGs sem CNAE, prefeituras-fachada.",
    to: "/ranking?modulo=emendas",
    cta: "Seguir o dinheiro",
  },
  {
    seed: "asmodeus.contratos",
    score: 60,
    label: "Contratos PNCP",
    headline: "3,7 mi licitações",
    body: "Vencedores recorrentes, sobrepreço, dispensa indevida. OCR + Gemini sob direito administrativo.",
    to: "/ranking?modulo=contratos",
    cta: "Auditar licitações",
  },
];

export default function HomePage() {
  const [politicos, setPoliticos] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!getFirebaseApp()) {
        if (!cancelled) {
          setPoliticos([]);
          setLoadError("missing_config");
        }
        return;
      }
      try {
        const rows = await fetchPoliticosCollection();
        if (!cancelled) {
          setPoliticos(rows);
          setLoadError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setPoliticos([]);
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = politicos === null;
  const totalPoliticos = Array.isArray(politicos) ? politicos.length : 0;
  const graphPoliticos = useMemo(
    () => (Array.isArray(politicos) ? politicos.slice(0, 420) : []),
    [politicos],
  );

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#080B14] text-[#F0F4FC]">
      <Helmet>
        <title>Transparência BR · Motor Forense Cívico</title>
        <meta
          name="description"
          content="TransparênciaBR — ecossistema cívico com ingestão PNCP, OCR, Gemini, BigQuery ML e dossiês desnormalizados no Firestore."
        />
        <meta property="og:title" content="Transparência BR · A.S.M.O.D.E.U.S." />
        <meta
          property="og:description"
          content="Do dado bruto governamental ao dossiê visual em tempo real: BigQuery, Firestore e IA forense."
        />
        <meta property="og:type" content="website" />
        <meta name="theme-color" content="#080B14" />
      </Helmet>

      <Canvas
        frameloop="always"
        camera={{ position: [0, 0, 14], fov: 50 }}
        gl={{ antialias: true, alpha: false }}
        className="fixed inset-0 block h-full w-full touch-none opacity-45"
      >
        <UniverseGraph politicos={graphPoliticos} />
      </Canvas>

      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(88,166,255,0.18),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(167,139,250,0.14),transparent_30%),linear-gradient(180deg,rgba(8,11,20,0.20),#080B14_78%)]" />

      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-[#30363D]/70 bg-[#080B14]/88 px-6 py-3 backdrop-blur-md sm:px-10">
        <BrandLogo to="/" variant="full" size="md" />
        <nav
          className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8B949E] sm:gap-5"
          aria-label="Entrada rápida"
        >
          <Link className="text-[#F0F4FC] transition hover:text-[#58A6FF]" to="/dashboard">
            Overview
          </Link>
          <Link className="transition hover:text-[#58A6FF]" to="/ranking">
            Entities
          </Link>
          <Link className="transition hover:text-[#58A6FF]" to="/ranking">
            Financials
          </Link>
          <Link className="transition hover:text-[#58A6FF]" to="/ranking">
            Risk
          </Link>
          <Link className="transition hover:text-[#58A6FF]" to="/mapa">
            Map
          </Link>
          <Link className="transition hover:text-[#58A6FF]" to="/alertas">
            Alerts
          </Link>
          <Link className="transition hover:text-[#58A6FF]" to="/dashboard">
            Reports
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-[1480px] flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10">
        <section className="grid min-h-[calc(100dvh-7rem)] items-center gap-8 py-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="max-w-4xl">
            <BrandLogo to="/" variant="full" size="lg" className="mb-6" withGlow />

            <h1 className="text-balance text-5xl font-semibold tracking-[-0.055em] text-[#F0F4FC] drop-shadow-[0_2px_24px_rgba(0,0,0,0.85)] sm:text-6xl lg:text-7xl">
              Cada deputado tem um dossiê.
              <br />
              <span className="bg-gradient-to-r from-[#FDE047] via-[#FDBA74] to-[#7DD3FC] bg-clip-text text-transparent">
                O do seu, você ainda não viu.
              </span>
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-[#AAB4C8] sm:text-lg">
              OSINT forense em <strong className="text-[#F0F4FC]">513 deputados</strong>,{" "}
              <strong className="text-[#F0F4FC]">81 senadores</strong> e{" "}
              <strong className="text-[#F0F4FC]">5.568 prefeituras</strong>. Investigue
              qualquer mandato em 30 segundos — com contratório ativo e fonte primária.
            </p>

            {/* Selo FOMO — créditos diários */}
            <div className="mt-6 inline-flex items-center gap-2.5 rounded-full border border-[#FDE047]/35 bg-gradient-to-r from-[#FDE047]/15 via-[#FDBA74]/12 to-[#7DD3FC]/15 px-4 py-2 text-[12px] font-semibold tracking-wide text-[#FDE047]">
              <Zap className="size-3.5" strokeWidth={2.25} />
              <span className="uppercase tracking-[0.18em]">300 créditos / dia</span>
              <span className="text-[#AAB4C8] normal-case tracking-normal">
                grátis ao logar · renovam todo dia
              </span>
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                to="/login?provider=google"
                className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#F0F4FC] px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-[#080B14] shadow-[0_16px_40px_rgba(125,211,252,0.22)] transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7DD3FC]"
              >
                <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.12c-.22-.66-.35-1.36-.35-2.12s.13-1.46.35-2.12V7.04H2.18A11 11 0 001 12c0 1.78.43 3.46 1.18 4.96l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
                </svg>
                Entrar com Google
              </Link>
              <Link
                to="/login?provider=email"
                className="inline-flex items-center justify-center gap-2.5 rounded-xl border border-[#30363D] bg-[#0D1117]/80 px-6 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-[#F0F4FC] transition hover:border-[#7DD3FC]/55 hover:bg-[#21262D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7DD3FC]"
              >
                <Mail className="size-4" strokeWidth={2} />
                Entrar com e-mail
              </Link>
              <Link
                to="/dossie/220645"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-transparent px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-[#9CCBFF] transition hover:text-[#F0F4FC]"
              >
                Ver dossiê exemplo
                <ArrowRight className="size-4" strokeWidth={2} />
              </Link>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {METRICS.map(([label, value, caption]) => (
                <div key={label} className="rounded-2xl border border-[#30363D] bg-[#0D1117]/78 p-4 backdrop-blur-md">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8B949E]">
                    {label}
                  </p>
                  <p className="mt-2 font-data text-3xl font-semibold text-[#58A6FF]">
                    {value}
                  </p>
                  <p className="mt-1 text-xs text-[#8B949E]">{caption}</p>
                </div>
              ))}
            </div>
          </div>

          <aside className="rounded-[1.75rem] border border-[#30363D] bg-[#0D1117]/82 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4 border-b border-[#21262D] pb-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#8B949E]">
                  Controle operacional
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">Busca e grafo cívico</h2>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4ADE80]/35 bg-[#4ADE80]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#4ADE80]">
                <Activity className="size-3" />
                Online
              </span>
            </div>

            <div className="mt-5">
              <GlobalSearch />
              <p className="mt-3 text-xs leading-6 text-[#8B949E]">
                Pesquise por nome ou ID. O dossie final e servido por um documento
                Firestore desnormalizado, reduzindo leituras e evitando joins no front-end.
              </p>
            </div>

            <div className="mt-6 grid gap-3">
              {CAPABILITY_CARDS.map(({ icon: Icon, title, body }) => (
                <article key={title} className="rounded-2xl border border-[#21262D] bg-[#080B14]/72 p-4">
                  <div className="flex gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#58A6FF]/25 bg-[#58A6FF]/10 text-[#58A6FF]">
                      <Icon className="size-5" strokeWidth={1.75} />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
                      <p className="mt-1 text-xs leading-5 text-[#8B949E]">{body}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-[#30363D] bg-[#101827]/70 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8B949E]">
                Estado do catalogo
              </p>
              <p className="mt-2 text-sm text-[#C9D1D9]">
                {loading
                  ? "Sincronizando catalogo visual..."
                  : loadError
                    ? "Home operacional mesmo sem telemetria do catalogo."
                    : `${totalPoliticos.toLocaleString("pt-BR")} entidades politicas indexadas para busca.`}
              </p>
            </div>
          </aside>
        </section>

        {/* Categorias de investigação — orbes-portal estilo data.gov.uk */}
        <section
          aria-labelledby="categorias-heading"
          className="rounded-[1.75rem] border border-[#30363D] bg-[#0D1117]/88 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-7"
        >
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#FDE047]">
                Por onde quer começar?
              </p>
              <h2
                id="categorias-heading"
                className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
              >
                Seis portais. Um único veredito por mandato.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-[#AAB4C8]">
                Cada orbe é uma frente de auditoria autônoma. Você abre, ela abre o
                dossiê dos políticos com risco mais alto naquela frente.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#FDE047]/30 bg-[#FDE047]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#FDE047]">
              <Sparkles className="size-3" />
              Atualizado hoje
            </span>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {INVESTIGATION_CATEGORIES.map((cat) => (
              <li key={cat.seed}>
                <Link
                  to={cat.to}
                  className="group flex h-full flex-col gap-4 rounded-2xl border border-[#21262D] bg-[#080B14]/72 p-5 transition hover:-translate-y-0.5 hover:border-[#7DD3FC]/40 hover:bg-[#0D1117]/85 hover:shadow-[0_20px_50px_rgba(125,211,252,0.15)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7DD3FC]"
                >
                  <div className="flex items-start gap-4">
                    <PoliticianOrb
                      identity={cat.seed}
                      score={cat.score}
                      size={64}
                      withRing
                      ariaLabel={`Orbe ${cat.label}`}
                      className="shrink-0 transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8B949E]">
                        {cat.label}
                      </p>
                      <p className="font-data mt-1 text-2xl font-semibold tracking-tight text-[#F0F4FC]">
                        {cat.headline}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm leading-6 text-[#AAB4C8]">{cat.body}</p>
                  <span className="mt-auto inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#7DD3FC] transition group-hover:gap-2.5 group-hover:text-[#F0F4FC]">
                    {cat.cta}
                    <ArrowRight className="size-3.5" strokeWidth={2.25} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-[1.75rem] border border-[#30363D] bg-[#0D1117]/88 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8B949E]">
                Pipeline anti-deadlock
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Engines conectadas do PNCP ao dossie publico.
              </h2>
            </div>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl border border-[#30363D] bg-[#21262D]/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#F0F4FC] transition hover:border-[#58A6FF]/45"
            >
              Centro de Operacoes
              <ArrowRight className="size-3.5" />
            </Link>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {PIPELINE_STEPS.map((step) => (
              <article key={step.code} className="group rounded-2xl border border-[#21262D] bg-[#080B14]/70 p-4 transition hover:border-[#58A6FF]/35">
                <div className="flex items-start gap-3">
                  <span className="font-data flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#58A6FF]/25 bg-[#58A6FF]/10 text-lg font-semibold text-[#58A6FF]">
                    {step.code}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight text-[#F0F4FC]">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-xs leading-6 text-[#8B949E]">{step.body}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-4 pb-8 lg:grid-cols-[0.95fr_1.05fr]">
          <article className="rounded-[1.75rem] border border-[#30363D] bg-[#0D1117]/88 p-6 backdrop-blur-xl">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl border border-[#A78BFA]/30 bg-[#A78BFA]/10 text-[#A78BFA]">
                <FileSearch className="size-5" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8B949E]">
                  Protocolo Oraculo
                </p>
                <h2 className="text-xl font-semibold tracking-tight">Auditoria semantica deterministica</h2>
              </div>
            </div>
            <p className="text-sm leading-7 text-[#AAB4C8]">
              O texto extraido de contratos e notas fiscais e analisado por Gemini com
              instrucoes de sistema restritas. A resposta nasce em JSON: indice de risco,
              fraudes detectadas e resumo de auditoria, pronta para BigQuery e Firestore.
            </p>
          </article>

          <article className="rounded-[1.75rem] border border-[#30363D] bg-[#0D1117]/88 p-6 backdrop-blur-xl">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl border border-[#4ADE80]/30 bg-[#4ADE80]/10 text-[#4ADE80]">
                <Network className="size-5" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8B949E]">
                  Front-end 3D
                </p>
                <h2 className="text-xl font-semibold tracking-tight">Visualizacao com custo controlado</h2>
              </div>
            </div>
            <p className="text-sm leading-7 text-[#AAB4C8]">
              Cada dossie e lido como snapshot unico em <code className="text-[#58A6FF]">transparency_reports</code>.
              O cache local de 24 horas protege cotas do Firestore enquanto o usuario navega
              por grafo, ranking, alertas e relatorios.
            </p>
          </article>
        </section>
      </main>
    </div>
  );
}
