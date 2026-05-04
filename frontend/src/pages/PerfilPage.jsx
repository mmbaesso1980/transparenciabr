import { Bell, CreditCard, FileText, Shield, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

import { getFirebaseAuth, getFirestoreDb } from "../lib/firebase.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useUserCredits } from "../hooks/useUserCredits.js";
import { doc, getDoc } from "firebase/firestore";

const STORAGE_KEY = "transparenciabr_watchlist_ids";

const TABS = [
  { id: "conta", label: "Minha conta", icon: User },
  { id: "extrato", label: "Extrato de créditos", icon: CreditCard },
  { id: "dossies", label: "Meus dossiês", icon: FileText },
  { id: "seguranca", label: "Segurança", icon: Shield },
];

function readLocalWatchlist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export default function PerfilPage() {
  const { user, loading: authLoading } = useAuth();
  const { credits, godMode } = useUserCredits();
  const [tab, setTab] = useState("conta");
  const [ids, setIds] = useState(() => readLocalWatchlist());
  const [remoteIds, setRemoteIds] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const db = getFirestoreDb();
      const auth = getFirebaseAuth();
      const uid = auth?.currentUser?.uid;
      if (!db || !uid) return;
      try {
        const snap = await getDoc(doc(db, "usuarios", uid));
        const wl = snap.data()?.watchlist;
        if (cancelled) return;
        if (Array.isArray(wl)) {
          setRemoteIds(wl.map(String));
        }
      } catch {
        /* rules / offline */
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setIds(readLocalWatchlist());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const effectiveIds = useMemo(() => {
    if (remoteIds && remoteIds.length > 0) return remoteIds;
    return ids;
  }, [remoteIds, ids]);

  return (
    <>
      <Helmet>
        <title>Perfil — TransparênciaBR</title>
      </Helmet>

      <div className="min-h-full bg-[#080B14] px-4 py-8 text-[#F0F4FC] sm:px-6 sm:py-10">
        <div className="mx-auto max-w-3xl">
          <header className="mb-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#8B949E]">
              Área autenticada
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">Perfil operador</h1>
            <p className="mt-2 text-sm text-[#8B949E]">
              Gestão de conta, créditos, atalhos aos dossiês e boas práticas de segurança.
            </p>
          </header>

          <div
            className="mb-6 flex flex-wrap gap-2 border-b border-[#30363D] pb-4"
            role="tablist"
            aria-label="Secções do perfil"
          >
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={[
                    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                    active
                      ? "bg-[#161B22] text-[#58A6FF] ring-1 ring-[#58A6FF]/40"
                      : "text-[#8B949E] hover:bg-[#161B22]/80 hover:text-[#C9D1D9]",
                  ].join(" ")}
                >
                  <Icon className="size-4" strokeWidth={1.75} />
                  {t.label}
                </button>
              );
            })}
          </div>

          {tab === "conta" && (
            <section
              className="glass rounded-2xl border border-[#30363D] bg-[#0D1117]/80 p-6"
              role="tabpanel"
            >
              <h2 className="text-sm font-semibold text-[#C9D1D9]">Minha conta</h2>
              {authLoading ? (
                <p className="mt-4 text-sm text-[#8B949E]">A carregar sessão…</p>
              ) : user ? (
                <dl className="mt-4 space-y-3 font-mono text-sm">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-[#8B949E]">UID</dt>
                    <dd className="mt-1 break-all text-[#58A6FF]">{user.uid}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-[#8B949E]">Email</dt>
                    <dd className="mt-1 text-[#C9D1D9]">{user.email || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-[#8B949E]">Modo</dt>
                    <dd className="mt-1 text-[#C9D1D9]">{godMode ? "Operador elevado" : "Standard"}</dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-4 text-sm text-[#8B949E]">
                  Sem sessão ativa.{" "}
                  <Link to="/login" className="font-semibold text-[#58A6FF] hover:underline">
                    Iniciar sessão
                  </Link>
                  .
                </p>
              )}
            </section>
          )}

          {tab === "extrato" && (
            <section
              className="glass rounded-2xl border border-[#30363D] bg-[#0D1117]/80 p-6"
              role="tabpanel"
            >
              <h2 className="text-sm font-semibold text-[#C9D1D9]">Extrato de créditos</h2>
              <p className="mt-2 text-sm text-[#8B949E]">
                Saldo em tempo real a partir de <span className="font-mono">usuarios/{`{uid}`}</span>{" "}
                (Firestore). Débitos de 200 créditos aplicam-se ao laboratório premium do dossiê.
              </p>
              <p className="mt-6 font-mono text-3xl font-bold text-[#58A6FF]">
                {credits === null ? "…" : credits}{" "}
                <span className="text-base font-normal text-[#8B949E]">créditos</span>
              </p>
              <Link
                to="/creditos"
                className="mt-6 inline-flex rounded-lg border border-[#58A6FF]/40 px-4 py-2 text-sm font-semibold text-[#58A6FF] hover:bg-[#58A6FF]/10"
              >
                Gerir planos →
              </Link>
            </section>
          )}

          {tab === "dossies" && (
            <section
              className="glass rounded-2xl border border-[#30363D] bg-[#0D1117]/80 p-6"
              role="tabpanel"
            >
              <div className="flex items-center gap-2 border-b border-[#21262D] pb-4">
                <Bell className="size-4 text-[#f97316]" strokeWidth={1.75} />
                <h2 className="text-sm font-semibold tracking-tight">Meus dossiês (watchlist)</h2>
                <span className="ml-auto font-mono text-[11px] text-[#8B949E]">
                  {effectiveIds.length} item(ns)
                </span>
              </div>

              {effectiveIds.length === 0 ? (
                <p className="py-12 text-center text-sm text-[#8B949E]">
                  Nenhum parlamentar na lista. Use <span className="font-medium text-[#C9D1D9]">Monitorizar</span>{" "}
                  num dossiê.
                </p>
              ) : (
                <ul className="mt-4 flex flex-col gap-2">
                  {effectiveIds.map((polId) => (
                    <li key={polId}>
                      <Link
                        to={`/dossie/${encodeURIComponent(polId)}`}
                        className="flex items-center justify-between rounded-xl border border-[#30363D]/80 bg-[#161B22]/90 px-4 py-3 text-sm transition hover:border-[#58A6FF]/45"
                      >
                        <span className="font-mono text-[13px] text-[#58A6FF]">{polId}</span>
                        <span className="text-[11px] text-[#8B949E]">Abrir dossiê →</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === "seguranca" && (
            <section
              className="glass rounded-2xl border border-[#30363D] bg-[#0D1117]/80 p-6"
              role="tabpanel"
            >
              <h2 className="text-sm font-semibold text-[#C9D1D9]">Segurança</h2>
              <ul className="mt-4 list-inside list-disc space-y-2 text-sm leading-relaxed text-[#8B949E]">
                <li>Nunca partilhe sessão ou tokens fora do domínio oficial.</li>
                <li>Use palavra-passe forte e autenticação de dois fatores na conta Google.</li>
                <li>Os dados exibidos são públicos ou agregados — não exponha dados pessoais de terceiros.</li>
                <li>
                  Política completa:{" "}
                  <Link to="/privacidade" className="text-[#58A6FF] hover:underline">
                    Privacidade & LGPD
                  </Link>
                  .
                </li>
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
