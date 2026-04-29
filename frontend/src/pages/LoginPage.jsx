import { Loader2, LogIn, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import {
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from "../lib/firebase.js";

const ERROR_MESSAGES = {
  "auth/invalid-email": "E-mail inválido.",
  "auth/missing-email": "Informe o e-mail.",
  "auth/missing-password": "Informe a senha.",
  "auth/invalid-credential": "Credenciais inválidas.",
  "auth/wrong-password": "Senha incorreta.",
  "auth/user-not-found": "Conta não encontrada. Crie uma nova ou tente outro e-mail.",
  "auth/email-already-in-use": "Este e-mail já está cadastrado. Faça login.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/too-many-requests": "Muitas tentativas. Tente novamente em alguns minutos.",
  "auth/popup-closed-by-user": "Popup fechado antes da autenticação.",
  "auth/popup-blocked": "Popup bloqueado pelo navegador. Libere e tente novamente.",
  "auth/network-request-failed": "Falha de rede. Verifique sua conexão.",
  firebase_auth_unavailable: "Auth indisponível. Verifique a configuração do Firebase.",
};

function describeError(err) {
  if (!err) return "Não foi possível autenticar.";
  const code = err.code || err.message;
  return ERROR_MESSAGES[code] || err.message || "Falha ao autenticar.";
}

const REDIRECT_AFTER_LOGIN = "/universo";

export default function LoginPage() {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyProvider, setBusyProvider] = useState(null);
  const [error, setError] = useState(null);

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

  if (!loading && isAuthenticated) {
    return <Navigate to={redirectTarget} replace />;
  }

  async function handleEmailSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "signup") {
        await signUpWithEmail(email.trim(), password);
      } else {
        await signInWithEmail(email.trim(), password);
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    if (busyProvider) return;
    setError(null);
    setBusyProvider("google");
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusyProvider(null);
    }
  }

  const isAnonymousSession = !!user?.isAnonymous;
  const formDisabled = submitting || !!busyProvider;

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#0A0E17] px-4 py-12 text-[#F0F4FC]">
      <Helmet>
        <title>Acesso seguro | TransparênciaBR</title>
        <meta
          name="description"
          content="Autenticação obrigatória — entre com Google ou e-mail/senha para acessar o Centro de Operações."
        />
      </Helmet>

      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 10%, rgba(88,166,255,0.12), transparent 55%), radial-gradient(circle at 80% 90%, rgba(251,216,127,0.08), transparent 60%)",
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.4em] text-[#8B949E] transition hover:text-[#F0F4FC]"
        >
          <ShieldCheck className="size-3.5" strokeWidth={1.75} />
          TransparênciaBR · SOC
        </Link>

        <div className="rounded-2xl border border-[#30363D] bg-[#0D1117]/95 p-7 shadow-[0_0_60px_-20px_rgba(88,166,255,0.35)] backdrop-blur-md">
          <header className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#58A6FF]">
              Acesso restrito
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {mode === "signup" ? "Criar conta" : "Entrar no painel"}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[#8B949E]">
              Autenticação obrigatória para o Centro de Operações,
              dossiês e radar de deputados.
            </p>
          </header>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={formDisabled}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#30363D] bg-[#21262D] px-4 py-3 text-sm font-semibold text-[#F0F4FC] transition hover:border-[#58A6FF]/50 hover:bg-[#30363D] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyProvider === "google" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <GoogleIcon className="size-4" />
            )}
            <span>Continuar com Google</span>
          </button>

          <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.35em] text-[#484F58]">
            <span className="h-px flex-1 bg-[#30363D]" />
            <span>ou e-mail</span>
            <span className="h-px flex-1 bg-[#30363D]" />
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.25em] text-[#8B949E]">
                E-mail
              </span>
              <div className="flex items-center gap-2 rounded-xl border border-[#30363D] bg-[#0A0E17] px-3 py-2.5 focus-within:border-[#58A6FF]/60">
                <Mail className="size-4 text-[#484F58]" strokeWidth={1.75} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="voce@exemplo.com"
                  className="w-full bg-transparent text-sm text-[#F0F4FC] placeholder:text-[#484F58] focus:outline-none"
                />
              </div>
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
                className="w-full rounded-xl border border-[#30363D] bg-[#0A0E17] px-3 py-2.5 text-sm text-[#F0F4FC] placeholder:text-[#484F58] focus:border-[#58A6FF]/60 focus:outline-none"
              />
            </label>

            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200"
              >
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={formDisabled}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#58A6FF] px-4 py-3 text-sm font-semibold text-[#0A0E17] transition hover:bg-[#79B8FF] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LogIn className="size-4" strokeWidth={2} />
              )}
              <span>{mode === "signup" ? "Criar conta" : "Entrar"}</span>
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-[#8B949E]">
            {mode === "signup" ? "Já tem conta?" : "Ainda não tem conta?"}{" "}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode((prev) => (prev === "signup" ? "signin" : "signup"));
              }}
              className="font-semibold text-[#58A6FF] underline-offset-4 hover:underline"
            >
              {mode === "signup" ? "Fazer login" : "Criar agora"}
            </button>
          </p>

          {isAnonymousSession ? (
            <p className="mt-4 rounded-lg border border-[#30363D] bg-[#0A0E17] px-3 py-2 text-[11px] leading-relaxed text-[#8B949E]">
              Você está numa sessão anónima legada. Faça login com Google
              ou e-mail/senha para liberar o painel completo.
            </p>
          ) : null}
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-[#484F58]">
          Ao continuar você concorda com os termos de uso de monitoramento
          de transparência pública.
        </p>
      </div>
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
