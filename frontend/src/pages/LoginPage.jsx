import { Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import PoliticianOrb from "../components/PoliticianOrb.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import {
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from "../lib/firebase.js";

/**
 * LoginPage — Identificação de analista (split-screen 50/50).
 *
 * Painel esquerdo: atmosfera on-brand (mini-orbes + headline).
 * Painel direito: formulário com hierarquia explícita
 *   Google (primário, branco sólido) > E-mail (secundário, outline ciano).
 *
 * Erros de infra (auth indisponível) viram toast âmbar discreto.
 * Erros de credencial são inline abaixo do campo de senha.
 */

const ERROR_MESSAGES = {
  "auth/invalid-email": "E-mail inválido.",
  "auth/missing-email": "Informe o e-mail.",
  "auth/missing-password": "Informe a senha.",
  "auth/invalid-credential": "Credenciais não reconhecidas. Verifique e-mail e senha.",
  "auth/wrong-password": "Senha incorreta.",
  "auth/user-not-found": "Conta não encontrada. Crie uma nova ou tente outro e-mail.",
  "auth/email-already-in-use": "Este e-mail já está cadastrado. Faça login.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/too-many-requests": "Muitas tentativas. Tente novamente em alguns minutos.",
  "auth/popup-closed-by-user": "Janela fechada antes da autenticação.",
  "auth/popup-blocked": "Popup bloqueado pelo navegador. Libere e tente novamente.",
  "auth/network-request-failed": "Falha de rede. Verifique sua conexão.",
};

const INFRA_ERROR_MESSAGE =
  "Sistema de acesso temporariamente indisponível. Tente novamente em instantes.";

function describeError(err) {
  if (!err) return { kind: "credential", message: "Não foi possível autenticar." };
  const code = err.code || err.message;
  if (code === "firebase_auth_unavailable") {
    return { kind: "infra", message: INFRA_ERROR_MESSAGE };
  }
  return {
    kind: "credential",
    message: ERROR_MESSAGES[code] || err.message || "Falha ao autenticar.",
  };
}

const REDIRECT_AFTER_LOGIN = "/universo";

// Mini-orbes do painel atmosférico — mesmas seeds dos 6 portais da landing.
const ATMOSPHERE_ORBS = [
  { seed: "aurora.ceap", score: 90 },
  { seed: "aurora.patrimonio", score: 78 },
  { seed: "aurora.gabinete", score: 72 },
  { seed: "aurora.viagens", score: 65 },
  { seed: "aurora.emendas", score: 82 },
  { seed: "aurora.contratos", score: 60 },
];

export default function LoginPage() {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyProvider, setBusyProvider] = useState(null);
  const [credError, setCredError] = useState(null);
  const [infraToast, setInfraToast] = useState(null);

  const searchParams = new URLSearchParams(location.search);
  const redirectQuery = searchParams.get("redirect");

  const fromState =
    location.state && typeof location.state === "object" ? location.state.from : null;

  const redirectTarget = (() => {
    if (
      typeof redirectQuery === "string" &&
      redirectQuery.startsWith("/") &&
      redirectQuery !== "/login"
    ) {
      return redirectQuery;
    }
    if (
      typeof fromState === "string" &&
      fromState.startsWith("/") &&
      fromState !== "/login"
    ) {
      return fromState;
    }
    return REDIRECT_AFTER_LOGIN;
  })();

  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectTarget, { replace: true });
    }
  }, [isAuthenticated, navigate, redirectTarget]);

  // Auto-dismiss do toast de infra após 6s
  useEffect(() => {
    if (!infraToast) return;
    const t = setTimeout(() => setInfraToast(null), 6000);
    return () => clearTimeout(t);
  }, [infraToast]);

  if (!loading && isAuthenticated) {
    return <Navigate to={redirectTarget} replace />;
  }

  function handleAuthError(err) {
    const { kind, message } = describeError(err);
    if (kind === "infra") {
      setInfraToast(message);
      setCredError(null);
    } else {
      setCredError(message);
    }
  }

  async function handleEmailSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setCredError(null);
    setSubmitting(true);
    try {
      if (mode === "signup") {
        await signUpWithEmail(email.trim(), password);
      } else {
        await signInWithEmail(email.trim(), password);
      }
    } catch (err) {
      handleAuthError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    if (busyProvider) return;
    setCredError(null);
    setBusyProvider("google");
    try {
      await signInWithGoogle();
    } catch (err) {
      handleAuthError(err);
    } finally {
      setBusyProvider(null);
    }
  }

  const isAnonymousSession = !!user?.isAnonymous;
  const formDisabled = submitting || !!busyProvider;

  return (
    <div className="relative flex min-h-dvh overflow-hidden bg-[#0A0E1A] text-[#F0F4FC]">
      <Helmet>
        <title>Identificação de analista | TransparênciaBR</title>
        <meta
          name="description"
          content="Acesso ao Centro de Operações TransparênciaBR — autentique com Google ou e-mail/senha para abrir dossiês e o radar de mandatos."
        />
      </Helmet>

      {/* PAINEL ATMOSFÉRICO — só >= md */}
      <aside
        aria-hidden="true"
        className="relative hidden w-1/2 flex-col justify-center overflow-hidden border-r border-[#21262D]/50 px-12 md:flex"
        style={{
          backgroundColor: "#0A0E1A",
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        {/* radial sutil dos orbes ao fundo */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 30%, rgba(125,211,252,0.06), transparent 50%), radial-gradient(circle at 70% 70%, rgba(253,224,71,0.05), transparent 55%)",
          }}
        />

        {/* Mini-orbes 3x2 */}
        <div className="relative z-10 mb-10 grid w-fit grid-cols-3 gap-3" style={{ opacity: 0.32 }}>
          {ATMOSPHERE_ORBS.map((orb) => (
            <PoliticianOrb
              key={orb.seed}
              identity={orb.seed}
              score={orb.score}
              size={28}
              ariaLabel=""
            />
          ))}
        </div>

        {/* Headline atmosférico */}
        <h2 className="relative z-10 max-w-md text-[28px] font-light leading-[1.35] tracking-tight text-[#CDCCCA]">
          Inteligência aberta.
          <br />
          Mandatos sob análise permanente.
        </h2>

        <p className="relative z-10 mt-4 max-w-sm text-[13px] leading-relaxed text-[#6B7280]">
          OSINT forense em 513 deputados, 81 senadores e 5.568 prefeituras.
          Cada dossiê é montado a partir de fontes primárias.
        </p>

        {/* Selo SOC */}
        <div className="absolute bottom-8 left-12 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.4em] text-[#374151]">
          <ShieldCheck className="size-3" strokeWidth={1.75} />
          TransparênciaBR · SOC
        </div>
      </aside>

      {/* PAINEL DIREITO — formulário */}
      <main className="relative flex w-full flex-col items-center justify-center bg-[#0D1117] px-6 py-12 md:w-1/2 md:px-10">
        <div className="w-full max-w-[380px]">
          {/* Link voltar (mobile) */}
          <Link
            to="/"
            className="mb-8 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.4em] text-[#8B949E] transition hover:text-[#F0F4FC] md:hidden"
          >
            <ShieldCheck className="size-3.5" strokeWidth={1.75} />
            TransparênciaBR · SOC
          </Link>

          {/* Eyebrow */}
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#58A6FF]">
            Acesso restrito
          </p>

          {/* H1 */}
          <h1 className="mt-3 text-[28px] font-semibold tracking-tight text-[#F9FAFB]">
            {mode === "signup" ? "Criar conta de analista" : "Identificação de analista"}
          </h1>

          {/* Subtítulo on-brand */}
          <p className="mt-2 text-[13px] leading-relaxed text-[#6B7280]">
            Centro de Operações · Dossiês · Radar de Mandatos
          </p>

          {/* CTA primário: Google (branco sólido, dominante) */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={formDisabled}
            aria-label="Autenticar com conta Google"
            className="mt-7 flex h-12 w-full items-center justify-center gap-2.5 rounded-md bg-white text-[15px] font-semibold text-[#1A1A1A] shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition hover:bg-[#F3F4F6] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyProvider === "google" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <GoogleIcon className="size-[18px]" />
            )}
            <span>Continuar com Google</span>
          </button>

          {/* Separador */}
          <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.35em] text-[#484F58]">
            <span className="h-px flex-1 bg-[#21262D]" />
            <span>ou e-mail</span>
            <span className="h-px flex-1 bg-[#21262D]" />
          </div>

          {/* Form e-mail */}
          <form onSubmit={handleEmailSubmit} className="space-y-3" noValidate>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.25em] text-[#8B949E]">
                E-mail
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="voce@exemplo.com"
                className="w-full rounded-md border border-[#21262D] bg-[#0A0E1A] px-3 py-2.5 text-sm text-[#F0F4FC] placeholder:text-[#484F58] focus:border-[#58A6FF]/60 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.25em] text-[#8B949E]">
                Senha
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder="••••••••"
                className="w-full rounded-md border border-[#21262D] bg-[#0A0E1A] px-3 py-2.5 text-sm text-[#F0F4FC] placeholder:text-[#484F58] focus:border-[#58A6FF]/60 focus:outline-none"
              />
              {credError ? (
                <p className="mt-1.5 text-[12px] leading-relaxed text-[#F87171]">
                  {credError}
                </p>
              ) : null}
            </label>

            {/* CTA secundário: e-mail (outline ciano) */}
            <button
              type="submit"
              disabled={formDisabled}
              className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[#58A6FF] bg-transparent text-sm font-medium text-[#58A6FF] transition hover:bg-[rgba(88,166,255,0.06)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <span>{mode === "signup" ? "Criar conta" : "Entrar"}</span>
              )}
            </button>
          </form>

          {/* Toggle signin/signup */}
          <p className="mt-5 text-center text-xs text-[#8B949E]">
            {mode === "signup" ? "Já tem conta?" : "Ainda não tem conta?"}{" "}
            <button
              type="button"
              onClick={() => {
                setCredError(null);
                setMode((prev) => (prev === "signup" ? "signin" : "signup"));
              }}
              className="font-semibold text-[#58A6FF] underline-offset-4 hover:underline"
            >
              {mode === "signup" ? "Fazer login" : "Criar agora"}
            </button>
          </p>

          {isAnonymousSession ? (
            <p className="mt-4 rounded-md border border-[#21262D] bg-[#0A0E1A] px-3 py-2 text-[11px] leading-relaxed text-[#8B949E]">
              Você está numa sessão anônima legada. Faça login com Google
              ou e-mail/senha para liberar o painel completo.
            </p>
          ) : null}

          <p className="mt-8 text-center text-[11px] leading-relaxed text-[#484F58]">
            Ao continuar você concorda com os termos de uso de
            monitoramento de transparência pública.
          </p>
        </div>
      </main>

      {/* TOAST de erro de infra — não-bloqueante, âmbar, auto-dismiss 6s */}
      {infraToast ? (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed bottom-6 right-6 z-[9999] flex max-w-sm items-start gap-3 rounded-md border-l-[3px] border-[#F59E0B] bg-[#1C1B19] px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
        >
          <span className="mt-0.5 inline-block size-1.5 rounded-full bg-[#F59E0B]" aria-hidden />
          <p className="flex-1 text-[13px] leading-relaxed text-[#CDCCCA]">{infraToast}</p>
          <button
            type="button"
            onClick={() => setInfraToast(null)}
            className="ml-2 text-[#6B7280] transition hover:text-[#F0F4FC]"
            aria-label="Fechar aviso"
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}

function GoogleIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.227c0-.745-.067-1.46-.191-2.146H12v4.062h5.385a4.604 4.604 0 0 1-1.997 3.022v2.51h3.232c1.892-1.743 2.98-4.31 2.98-7.448Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.964-.895 6.62-2.425l-3.232-2.51c-.896.6-2.04.96-3.388.96-2.605 0-4.81-1.76-5.598-4.123H3.06v2.59A9.997 9.997 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.402 13.902a5.997 5.997 0 0 1 0-3.804V7.508H3.06a10.005 10.005 0 0 0 0 8.984l3.342-2.59Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.973c1.469-.022 2.882.532 3.953 1.547l2.86-2.86C16.957 3.034 14.582 2 12 2 8.082 2 4.7 4.246 3.06 7.508l3.342 2.59C7.19 7.736 9.395 5.973 12 5.973Z"
      />
    </svg>
  );
}
