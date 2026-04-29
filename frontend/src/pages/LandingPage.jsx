import { ArrowRight, Loader2, Lock, Mail, Search, Sparkles, Zap } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";

import BrandLogo from "../components/BrandLogo.jsx";
import CreditosGOD from "../components/CreditosGOD.jsx";
import PoliticianOrb from "../components/PoliticianOrb.jsx";
import LandingHeroGraph from "../components/landing/LandingHeroGraph.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useTransparencyReportsUniverso } from "../hooks/useTransparencyReportsUniverso.js";

/**
 * Vitrine pública (/) — universo 3D ao fundo, hero FOMO + 6 portais coloridos
 * com orbes determinísticas (algoritmo CPF + score). Login pelo gate ou direto
 * via botões Google / e-mail.
 */

// Categorias de investigação — orbes-portal estilo data.gov.uk.
// `seed` é determinístico (mesma seed = mesma cor sempre).
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
    seed: "asmodeus.gabinete",
    score: 72,
    label: "Folha do Gabinete",
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

export default function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { graphData, loading, error, findPoliticoByQuery } =
    useTransparencyReportsUniverso(180);

  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingPolitico, setPendingPolitico] = useState({
    id: "",
    nome: "",
  });

  const emptyGraph = !loading && (!graphData.nodes?.length || error === "firebase_unavailable");

  const openGate = useCallback((nome, politicoId) => {
    const id = String(politicoId || "").trim();
    const name = String(nome || "").trim() || "este parlamentar";
    if (!id) return;
    if (isAuthenticated) {
      navigate(`/dossie/${encodeURIComponent(id)}`);
      return;
    }
    setPendingPolitico({ id, nome: name });
    setModalOpen(true);
  }, [isAuthenticated, navigate]);

  const handleSearch = useCallback(
    (e) => {
      e.preventDefault();
      const match = findPoliticoByQuery(query);
      if (!match) {
        setPendingPolitico({ id: "", nome: "" });
        setModalOpen(true);
        return;
      }
      openGate(match.nome, match.id);
    },
    [findPoliticoByQuery, openGate, query],
  );

  const handleNodeClick = useCallback(
    (node) => {
      if (!node || typeof node !== "object") return;
      if (node.tipo === "partido") return;
      const pid = node.politicoId;
      if (!pid) return;
      openGate(node.label, pid);
    },
    [openGate],
  );

  const loginHref = useMemo(() => {
    if (!pendingPolitico.id) return "/login";
    return `/login?redirect=${encodeURIComponent(`/dossie/${pendingPolitico.id}`)}`;
  }, [pendingPolitico.id]);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#02040a] text-[#F0F4FC]">
      <Helmet>
        <title>TransparênciaBR — Cada deputado tem um dossiê. O do seu, você ainda não viu.</title>
        <meta
          name="description"
          content="OSINT forense em 513 deputados, 81 senadores e 5.568 prefeituras. 300 créditos diários grátis ao logar — investigue qualquer mandato em 30 segundos."
        />
        <meta property="og:title" content="TransparênciaBR — Motor Forense Cívico" />
        <meta
          property="og:description"
          content="Cada deputado tem um dossiê. O do seu, você ainda não viu. 300 créditos/dia grátis ao logar."
        />
        <meta property="og:type" content="website" />
        <meta name="theme-color" content="#02040a" />
      </Helmet>

      {/* Universo 3D ao fundo — só a hero. Não cobre as orbes 2D abaixo. */}
      <div className="absolute inset-x-0 top-0 z-0 h-[100dvh]">
        <LandingHeroGraph
          graphData={graphData}
          onNodeClick={handleNodeClick}
          empty={emptyGraph}
        />
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-[100dvh] bg-[radial-gradient(ellipse_at_50%_15%,rgba(88,166,255,0.07),transparent_50%),radial-gradient(ellipse_at_70%_80%,rgba(239,68,68,0.05),transparent_45%)]"
      />

      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-[#30363D]/50 bg-[#02040a]/80 px-4 py-3 backdrop-blur-md sm:px-8">
        <BrandLogo to="/" variant="full" size="md" />
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <CreditosGOD />
          <Link
            to="/login?provider=google"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#30363D] bg-[#0d1117]/80 px-3 text-xs font-semibold uppercase tracking-wide text-[#C9D1D9] transition hover:border-[#7DD3FC]/45 hover:text-[#F0F4FC]"
          >
            <Lock className="size-3.5" strokeWidth={2} aria-hidden />
            <span>Entrar</span>
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-[1480px] flex-col gap-10 px-4 pb-16 sm:px-6 lg:px-8">
        {/* HERO — FOMO, logo, selo créditos, CTAs login */}
        <section className="flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center pt-10 text-center">
          <BrandLogo to="/" variant="icon" size="lg" className="mb-7 scale-[2.2]" withGlow />

          <h1 className="pointer-events-none max-w-4xl text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-[#F0F4FC] drop-shadow-[0_4px_32px_rgba(0,0,0,0.85)] sm:text-5xl md:text-6xl lg:text-[4rem]">
            Cada deputado tem um dossiê.
            <br />
            <span className="bg-gradient-to-r from-[#FDE047] via-[#FDBA74] to-[#7DD3FC] bg-clip-text text-transparent">
              O do seu, você ainda não viu.
            </span>
          </h1>

          <p className="pointer-events-none mt-5 max-w-2xl text-base leading-7 text-[#AAB4C8] sm:text-lg">
            OSINT forense em <strong className="text-[#F0F4FC]">513 deputados</strong>,{" "}
            <strong className="text-[#F0F4FC]">81 senadores</strong> e{" "}
            <strong className="text-[#F0F4FC]">5.568 prefeituras</strong>. Investigue
            qualquer mandato em 30 segundos — com contraditório ativo e fonte primária.
          </p>

          {/* Selo FOMO — créditos diários */}
          <div className="pointer-events-none mt-6 inline-flex items-center gap-2.5 rounded-full border border-[#FDE047]/35 bg-gradient-to-r from-[#FDE047]/15 via-[#FDBA74]/12 to-[#7DD3FC]/15 px-4 py-2 text-[12px] font-semibold tracking-wide text-[#FDE047] backdrop-blur-md">
            <Zap className="size-3.5" strokeWidth={2.25} />
            <span className="uppercase tracking-[0.18em]">300 créditos / dia</span>
            <span className="text-[#AAB4C8] normal-case tracking-normal">
              grátis ao logar · renovam todo dia
            </span>
          </div>

          {/* Busca — abre modal de gate ou navega ao dossiê */}
          <form
            onSubmit={handleSearch}
            className="pointer-events-auto mt-8 w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0d1117]/55 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-md"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0">
              <label className="sr-only" htmlFor="landing-search">
                Pesquisar político
              </label>
              <input
                id="landing-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pesquise seu político..."
                autoComplete="off"
                className="min-h-12 flex-1 rounded-xl border border-transparent bg-[#080b14]/90 px-4 text-base text-[#F0F4FC] outline-none ring-0 placeholder:text-[#6e7681] focus:border-[#58A6FF]/45 sm:rounded-l-xl sm:rounded-r-none sm:px-5"
              />
              <button
                type="submit"
                className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#58A6FF] px-6 text-sm font-bold uppercase tracking-wide text-[#02040a] shadow-[0_0_28px_rgba(88,166,255,0.35)] transition hover:bg-[#79b8ff] sm:rounded-l-none sm:rounded-r-xl"
              >
                {loading ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                ) : (
                  <Search className="size-5" strokeWidth={2} aria-hidden />
                )}
                Buscar
              </button>
            </div>
            <p className="mt-3 px-2 text-left text-[11px] leading-relaxed text-[#8B949E]">
              {loading
                ? "A carregar transparency_reports…"
                : error && error !== "firebase_unavailable"
                  ? `Firestore: ${error}`
                  : emptyGraph
                    ? "Sem dados no grafo (configure Firebase ou aguarde ingestão)."
                    : `${graphData.nodes.length} nós · ${graphData.links.length} ligações (amostra).`}
            </p>
          </form>

          {/* CTAs login Google / e-mail */}
          <div className="pointer-events-auto mt-6 flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
            <Link
              to="/login?provider=google"
              className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#F0F4FC] px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-[#02040a] shadow-[0_16px_40px_rgba(125,211,252,0.22)] transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7DD3FC]"
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
              className="inline-flex items-center justify-center gap-2.5 rounded-xl border border-[#30363D] bg-[#0D1117]/80 px-6 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-[#F0F4FC] backdrop-blur-md transition hover:border-[#7DD3FC]/55 hover:bg-[#21262D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7DD3FC]"
            >
              <Mail className="size-4" strokeWidth={2} />
              Entrar com e-mail
            </Link>
            <Link
              to="/login?redirect=%2Funiverso"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-transparent px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-[#9CCBFF] transition hover:text-[#F0F4FC]"
            >
              Entrar no universo
              <ArrowRight className="size-4" strokeWidth={2} />
            </Link>
          </div>
        </section>

        {/* PORTAIS — orbes-categoria estilo data.gov.uk */}
        <section
          aria-labelledby="categorias-heading"
          className="relative rounded-[1.75rem] border border-[#30363D] bg-[#0D1117]/88 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-7"
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
                Cada orbe é uma frente de auditoria autônoma. Você abre, ela
                devolve os mandatos com risco mais alto naquela frente.
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
                  className="group flex h-full flex-col gap-4 rounded-2xl border border-[#21262D] bg-[#080B14]/72 p-5 text-left transition hover:-translate-y-0.5 hover:border-[#7DD3FC]/40 hover:bg-[#0D1117]/85 hover:shadow-[0_20px_50px_rgba(125,211,252,0.15)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7DD3FC]"
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
      </main>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gate-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[#58A6FF]/25 bg-[#0d1117]/95 p-6 shadow-[0_0_60px_rgba(88,166,255,0.18)]">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#58A6FF]/35 bg-[#58A6FF]/12 text-[#58A6FF]">
                <Lock className="size-5" strokeWidth={2} aria-hidden />
              </span>
              <div className="text-left">
                <h2 id="gate-title" className="text-lg font-semibold text-[#F0F4FC]">
                  Inicie sessão
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[#C9D1D9]">
                  Faça login para abrir o dossiê investigativo de{" "}
                  <strong className="text-[#F0F4FC]">
                    {pendingPolitico.nome || "o parlamentar"}
                  </strong>{" "}
                  e ganhe <strong className="text-[#FBD87F]">300 créditos</strong> na sua conta (cota diária freemium).
                </p>
                {!pendingPolitico.id ? (
                  <p className="mt-2 text-xs text-amber-200/90">
                    Não encontrámos correspondência para a pesquisa. Ajuste o nome ou use o grafo.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl border border-[#30363D] px-4 py-2.5 text-sm font-medium text-[#C9D1D9] hover:bg-[#21262D]"
                onClick={() => setModalOpen(false)}
              >
                Fechar
              </button>
              <Link
                to={loginHref}
                state={pendingPolitico.id ? { from: `/dossie/${pendingPolitico.id}` } : undefined}
                className="rounded-xl bg-[#F0F4FC] px-4 py-2.5 text-sm font-semibold text-[#02040a] hover:bg-white"
                onClick={() => setModalOpen(false)}
              >
                Ir para login
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
