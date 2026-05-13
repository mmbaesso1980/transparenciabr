import {
  Bell,
  CreditCard,
  FileText,
  Shield,
  User,
  Crown,
  TrendingUp,
  ChevronRight,
  Award,
  LogOut,
  Smartphone,
  Mail,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

import { getFirestoreDb } from "../lib/firebase.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useUserCredits } from "../hooks/useUserCredits.js";
import useUniverseRoster from "../hooks/useUniverseRoster.js";
import { doc, getDoc } from "firebase/firestore";

const STORAGE_KEY = "transparenciabr_watchlist_ids";
const NOTIF_PREFS_KEY = "transparenciabr_notif_prefs_v1";

function defaultNotifPrefs() {
  return { emailAlerts: true, pushAlerts: false, weeklyDigest: true };
}

function loadNotifPrefs() {
  try {
    const raw = localStorage.getItem(NOTIF_PREFS_KEY);
    if (!raw) return defaultNotifPrefs();
    const j = JSON.parse(raw);
    return {
      emailAlerts: j.emailAlerts !== false,
      pushAlerts: j.pushAlerts === true,
      weeklyDigest: j.weeklyDigest !== false,
    };
  } catch {
    return defaultNotifPrefs();
  }
}

function persistNotifPrefs(p) {
  try {
    localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(p));
  } catch {
    /* quota / private mode */
  }
}

const TABS = [
  { id: "conta",     label: "Minha conta",       icon: User },
  { id: "extrato",   label: "Extrato de créditos", icon: CreditCard },
  { id: "dossies",   label: "Meus dossiês",      icon: FileText },
  { id: "seguranca", label: "Segurança",         icon: Shield },
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

function tierFromCredits(credits) {
  if (credits == null) return { name: "Carregando…", color: "#8B949E", icon: User };
  if (credits >= 4000) return { name: "Investigador", color: "#a78bfa", icon: Crown };
  if (credits >= 1500) return { name: "Jornalista",   color: "#22d3ee", icon: Award };
  if (credits > 0)     return { name: "Starter",      color: "#34d399", icon: User };
  return { name: "Sem créditos", color: "#8B949E", icon: User };
}

export default function PerfilPage() {
  const { user, loading: authLoading } = useAuth();
  const { credits, godMode, unlimited, profileDisplayName } = useUserCredits();
  const { roster: universeRoster } = useUniverseRoster();
  const [tab, setTab] = useState("conta");
  const [ids, setIds] = useState(() => readLocalWatchlist());
  const [remoteIds, setRemoteIds] = useState(null);
  const [notifPrefs, setNotifPrefs] = useState(() => loadNotifPrefs());

  const rosterById = useMemo(() => {
    const m = new Map();
    for (const p of universeRoster) {
      const id = String(p.id ?? "").trim();
      if (id) m.set(id, p);
    }
    return m;
  }, [universeRoster]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const db = getFirestoreDb();
      const uid = user?.uid;
      if (!db || !uid) {
        if (!cancelled) setRemoteIds(null);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "usuarios", uid));
        const wl = snap.data()?.watchlist;
        if (cancelled) return;
        if (Array.isArray(wl)) {
          setRemoteIds(wl.map(String));
        } else {
          setRemoteIds(null);
        }
      } catch {
        if (!cancelled) setRemoteIds(null);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

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

  const tier = tierFromCredits(godMode || unlimited ? 9999 : credits);
  const TierIcon = tier.icon;
  const displayName =
    profileDisplayName?.trim() ||
    user?.displayName?.trim() ||
    user?.email?.split("@")[0] ||
    "Operador";
  const initial = (displayName || user?.email || "?")[0]?.toUpperCase() || "?";

  return (
    <>
      <Helmet>
        <title>Perfil — TransparênciaBR</title>
      </Helmet>

      <div className="min-h-full bg-[#080B14] px-4 py-8 text-[#F0F4FC] sm:px-6 sm:py-10">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#8B949E]">
              Área autenticada
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Perfil operador</h1>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
            {/* Sidebar */}
            <aside className="lg:sticky lg:top-6 lg:self-start space-y-4">
              {/* Card identidade */}
              <div className="rounded-2xl border border-[#30363D] bg-[#0D1117] p-5">
                <div className="flex flex-col items-center text-center">
                  <div className="relative">
                    <div
                      className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-semibold text-white shadow-2xl"
                      style={{
                        background: `linear-gradient(135deg, ${tier.color}, #1f2937)`,
                        boxShadow: `0 0 30px -8px ${tier.color}80`,
                      }}
                    >
                      {initial}
                    </div>
                    <div
                      className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center bg-[#0D1117] border-2 border-[#30363D]"
                      title={tier.name}
                    >
                      <TierIcon size={14} style={{ color: tier.color }} strokeWidth={2} />
                    </div>
                  </div>
                  <p className="mt-4 text-sm font-semibold text-[#F0F4FC] truncate max-w-full">
                    {displayName}
                  </p>
                  <p className="text-[11px] text-[#8B949E] truncate max-w-full">{user?.email || "—"}</p>

                  <div
                    className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider border"
                    style={{
                      background: `${tier.color}15`,
                      borderColor: `${tier.color}40`,
                      color: tier.color,
                    }}
                  >
                    <TierIcon size={11} strokeWidth={2.4} />
                    {tier.name}
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-white/5">
                  <p className="text-[10px] uppercase tracking-wider text-[#8B949E]">Saldo</p>
                  <p className="text-2xl font-bold tabular-nums text-cyan-300 mt-1">
                    {godMode || unlimited ? "∞" : credits ?? "…"}{" "}
                    <span className="text-xs font-normal text-[#8B949E]">créditos</span>
                  </p>
                  <Link
                    to="/creditos"
                    className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-cyan-500/15 border border-cyan-400/40 px-3 py-2 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25 transition-all"
                  >
                    <TrendingUp size={13} strokeWidth={1.8} />
                    Aumentar plano
                  </Link>
                </div>
              </div>

              {/* Tabs verticais */}
              <nav className="rounded-2xl border border-[#30363D] bg-[#0D1117] p-2" role="tablist">
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
                        "w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                        active
                          ? "bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-400/30"
                          : "text-[#8B949E] hover:bg-white/[0.04] hover:text-[#F0F4FC]",
                      ].join(" ")}
                    >
                      <Icon size={16} strokeWidth={1.75} />
                      <span className="flex-1 text-left">{t.label}</span>
                      {active && <ChevronRight size={14} />}
                    </button>
                  );
                })}
              </nav>

              <Link
                to="/logout"
                className="flex items-center justify-center gap-1.5 rounded-2xl border border-[#30363D] bg-[#0D1117] px-3 py-3 text-xs text-[#8B949E] hover:border-red-400/40 hover:text-red-300 transition-all"
              >
                <LogOut size={13} strokeWidth={1.8} />
                Encerrar sessão
              </Link>
            </aside>

            {/* Content */}
            <main>
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                {tab === "conta" && (
                  <section className="rounded-2xl border border-[#30363D] bg-[#0D1117] p-6" role="tabpanel">
                    <h2 className="text-base font-semibold text-[#F0F4FC]">Minha conta</h2>
                    <p className="text-xs text-[#8B949E] mt-1">
                      Identificação, sessão atual e nível de operação.
                    </p>

                    {authLoading ? (
                      <p className="mt-6 text-sm text-[#8B949E]">A carregar sessão…</p>
                    ) : user ? (
                      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {[
                          { label: "UID", value: user.uid, mono: true, accent: "cyan" },
                          { label: "Email", value: user.email || "—", mono: false },
                          {
                            label: "Modo de operação",
                            value:
                              godMode || unlimited
                                ? "Operador elevado (ilimitado / god mode)"
                                : "Standard",
                            mono: false,
                            accent: godMode || unlimited ? "violet" : null,
                          },
                          { label: "Provedor", value: user.providerData?.[0]?.providerId || "—", mono: true },
                        ].map((f, i) => (
                          <div
                            key={i}
                            className="rounded-xl border border-[#30363D] bg-[#080B14] p-4"
                          >
                            <p className="text-[10px] uppercase tracking-wider text-[#8B949E]">{f.label}</p>
                            <p
                              className={[
                                "mt-1 break-all text-sm",
                                f.mono ? "font-mono" : "",
                                f.accent === "cyan" ? "text-cyan-300" : f.accent === "violet" ? "text-violet-300" : "text-[#F0F4FC]",
                              ].join(" ")}
                            >
                              {f.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-6 text-sm text-[#8B949E]">
                        Sem sessão ativa.{" "}
                        <Link to="/login" className="font-semibold text-cyan-400 hover:underline">
                          Iniciar sessão
                        </Link>
                        .
                      </p>
                    )}

                    <div className="mt-8 pt-6 border-t border-white/5">
                      <h3 className="text-sm font-semibold text-[#F0F4FC] mb-3">Notificações</h3>
                      <p className="mb-3 text-[11px] leading-relaxed text-[#8B949E]">
                        Preferências guardadas neste navegador. Integração com a conta e envio real de e-mail
                        serão ligados numa próxima versão.
                      </p>
                      <div className="space-y-2">
                        {[
                          {
                            key: "emailAlerts",
                            icon: Mail,
                            label: "Email — alertas de novos sinais nos meus alvos",
                          },
                          {
                            key: "pushAlerts",
                            icon: Smartphone,
                            label: "Push — sinalizações críticas em tempo real",
                          },
                          {
                            key: "weeklyDigest",
                            icon: Bell,
                            label: "Resumo semanal aos domingos",
                          },
                        ].map((n) => (
                          <label
                            key={n.key}
                            className="flex items-center gap-3 rounded-xl border border-[#30363D] bg-[#080B14] px-4 py-3 cursor-pointer hover:border-cyan-400/30 transition-colors"
                          >
                            <n.icon size={15} className="text-[#8B949E] flex-shrink-0" strokeWidth={1.6} />
                            <span className="flex-1 text-xs text-[#F0F4FC]">{n.label}</span>
                            <input
                              type="checkbox"
                              checked={Boolean(notifPrefs[n.key])}
                              className="accent-cyan-400 cursor-pointer"
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setNotifPrefs((prev) => {
                                  const next = { ...prev, [n.key]: checked };
                                  persistNotifPrefs(next);
                                  return next;
                                });
                              }}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  </section>
                )}

                {tab === "extrato" && (
                  <section className="rounded-2xl border border-[#30363D] bg-[#0D1117] p-6" role="tabpanel">
                    <h2 className="text-base font-semibold text-[#F0F4FC]">Extrato de créditos</h2>
                    <p className="text-xs text-[#8B949E] mt-1">
                      Saldo em tempo real a partir de <span className="font-mono text-cyan-300">usuarios/{`{uid}`}</span> (Firestore).
                      Débitos de 200 créditos no laboratório premium do dossiê.
                    </p>

                    <div
                      className="mt-6 rounded-2xl p-6 border border-cyan-400/30"
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(34,211,238,0.08), rgba(167,139,250,0.04))",
                      }}
                    >
                      <p className="text-[10px] uppercase tracking-wider text-cyan-300/70">Saldo atual</p>
                      <p className="mt-1 text-5xl font-bold tabular-nums text-cyan-300">
                        {godMode || unlimited ? "∞" : credits === null ? "…" : credits}
                      </p>
                      <p className="text-sm text-[#8B949E] mt-1">créditos disponíveis</p>
                      <Link
                        to="/creditos"
                        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/30 transition-all"
                      >
                        Comprar mais créditos
                        <ChevronRight size={14} />
                      </Link>
                    </div>

                    <div className="mt-8">
                      <h3 className="text-sm font-semibold text-[#F0F4FC] mb-3">Atividade recente</h3>
                      <p className="text-xs text-[#8B949E] mb-4">
                        Exemplo visual do extrato. O histórico real debitado na sua conta será listado aqui
                        quando o endpoint de transações estiver exposto ao cliente.
                      </p>
                      <ul className="space-y-2">
                        {[
                          { d: "Hoje", h: "08:14", desc: "Dossiê laboratório premium", val: -200 },
                          { d: "Ontem", h: "21:02", desc: "Compra · pacote Jornalista", val: +1500 },
                          { d: "03/05", h: "14:33", desc: "Dossiê laboratório premium", val: -200 },
                        ].map((tx, i) => (
                          <li
                            key={i}
                            className="flex items-center gap-3 rounded-xl border border-[#30363D]/80 bg-[#080B14] px-4 py-3"
                          >
                            <div className="flex-shrink-0 text-center">
                              <p className="text-[11px] text-[#8B949E] tabular-nums">{tx.d}</p>
                              <p className="text-[9px] text-[#484F58] tabular-nums">{tx.h}</p>
                            </div>
                            <p className="flex-1 text-xs text-[#F0F4FC]">{tx.desc}</p>
                            <p
                              className={`text-sm font-semibold tabular-nums ${
                                tx.val > 0 ? "text-emerald-400" : "text-red-400"
                              }`}
                            >
                              {tx.val > 0 ? "+" : ""}
                              {tx.val}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </section>
                )}

                {tab === "dossies" && (
                  <section className="rounded-2xl border border-[#30363D] bg-[#0D1117] p-6" role="tabpanel">
                    <div className="flex items-center gap-2 border-b border-[#21262D] pb-4">
                      <Bell className="size-4 text-amber-400" strokeWidth={1.75} />
                      <h2 className="text-base font-semibold tracking-tight text-[#F0F4FC]">
                        Meus dossiês (watchlist)
                      </h2>
                      <span className="ml-auto font-mono text-[11px] text-[#8B949E]">
                        {effectiveIds.length} item(ns)
                      </span>
                    </div>

                    {effectiveIds.length === 0 ? (
                      <div className="py-16 text-center">
                        <div
                          className="w-16 h-16 mx-auto rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4"
                        >
                          <FileText size={28} className="text-[#484F58]" strokeWidth={1.4} />
                        </div>
                        <p className="text-sm text-[#8B949E] max-w-sm mx-auto">
                          Nenhum parlamentar na lista. Use{" "}
                          <span className="text-[#F0F4FC] font-medium">Salvar no Universo</span>{" "}
                          numa hotpage para começar a monitorar.
                        </p>
                        <Link
                          to="/painel"
                          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/15 border border-cyan-400/40 px-4 py-2 text-sm text-cyan-200 hover:bg-cyan-500/25"
                        >
                          Ir ao painel
                          <ChevronRight size={14} />
                        </Link>
                      </div>
                    ) : (
                      <ul className="mt-4 grid sm:grid-cols-2 gap-2">
                        {effectiveIds.map((polId) => {
                          const pol = rosterById.get(polId);
                          const title = pol?.nome ? String(pol.nome) : polId;
                          const meta = pol
                            ? [String(pol.partido || "").trim(), String(pol.uf || "").trim()]
                                .filter(Boolean)
                                .join(" · ")
                            : "";
                          return (
                          <li key={polId}>
                            <Link
                              to={`/dossie/${encodeURIComponent(polId)}`}
                              className="flex items-center justify-between gap-3 rounded-xl border border-[#30363D]/80 bg-[#080B14] px-4 py-3 text-sm transition hover:border-cyan-400/40 hover:bg-cyan-500/[0.04] group"
                            >
                              <div className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-[#F0F4FC]">{title}</span>
                                <span className="mt-0.5 block truncate font-mono text-[11px] text-[#8B949E]">
                                  {meta ? `${meta} · ` : ""}
                                  {polId}
                                </span>
                              </div>
                              <ChevronRight size={14} className="shrink-0 text-[#484F58] group-hover:text-cyan-400" />
                            </Link>
                          </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                )}

                {tab === "seguranca" && (
                  <section className="rounded-2xl border border-[#30363D] bg-[#0D1117] p-6" role="tabpanel">
                    <h2 className="text-base font-semibold text-[#F0F4FC]">Segurança</h2>
                    <p className="text-xs text-[#8B949E] mt-1">
                      Boas práticas e controle de sessão.
                    </p>

                    <div className="mt-6 space-y-3">
                      {[
                        {
                          title: "Autenticação",
                          desc: "Login Google. 2FA recomendado na sua conta Google.",
                          status: "ok",
                        },
                        {
                          title: "Sessão atual",
                          desc: `Iniciada via ${user?.providerData?.[0]?.providerId || "—"}`,
                          status: "ok",
                        },
                        {
                          title: "Compartilhamento",
                          desc: "Nunca compartilhe links de dossiê fora do domínio oficial.",
                          status: "info",
                        },
                        {
                          title: "Privacidade de terceiros",
                          desc: "Os dados exibidos são públicos ou agregados — não exponha dados pessoais externos.",
                          status: "info",
                        },
                      ].map((item, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-[#30363D] bg-[#080B14] p-4 flex items-start gap-3"
                        >
                          <div
                            className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                              item.status === "ok" ? "bg-emerald-400" : "bg-cyan-400"
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#F0F4FC]">{item.title}</p>
                            <p className="text-xs text-[#8B949E] mt-0.5 leading-relaxed">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 pt-6 border-t border-white/5">
                      <Link to="/privacidade" className="text-xs text-cyan-400 hover:underline">
                        Política de privacidade & LGPD →
                      </Link>
                    </div>
                  </section>
                )}
              </motion.div>
            </main>
          </div>
        </div>
      </div>
    </>
  );
}
