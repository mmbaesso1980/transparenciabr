/**
 * DespesasSection — Seção de despesas CEAP na PoliticoPage.
 *
 * Busca dados da API getPoliticoDespesas, mostra preview grátis (top 10),
 * paywall de 100 créditos para desbloquear todas, filtros, alertas em vermelho,
 * e links clicáveis para nota fiscal oficial.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  Filter,
  Lock,
  Search,
  X,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { CREDIT_PRICE_UNLOCK_CEAP_LISTA } from "../../data/creditPricing.js";
import { fetchPoliticoUnlockSnapshot, unlockPoliticoDataCallable } from "../../lib/politicoUnlocks.js";
import { fmtNum } from "../../utils/formatBRL.js";

const PREVIEW_COUNT = 10;
const UNLOCK_COST = CREDIT_PRICE_UNLOCK_CEAP_LISTA;

const fmtBrl = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/** Badge de alerta */
function AlertBadge({ alertas }) {
  if (!alertas || alertas.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {alertas.map((raw, i) => {
        // alertas can be strings or objects {tipo, msg, severidade}
        const label = typeof raw === "string" ? raw : raw?.tipo || raw?.msg || String(raw);
        const sev = typeof raw === "object" ? raw?.severidade : "";
        const isRed =
          label.includes("valor_alto") ||
          label.includes("valor_redondo") ||
          label.includes("benford") ||
          label.includes("critico") ||
          sev === "alta" ||
          sev === "critica";
        return (
          <span
            key={i}
            className={`inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              isRed
                ? "border border-red-500/50 bg-red-500/15 text-red-400"
                : "border border-yellow-600/50 bg-yellow-900/30 text-yellow-500"
            }`}
          >
            <AlertTriangle className="size-3" strokeWidth={2} />
            {label.replace(/_/g, " ")}
          </span>
        );
      })}
    </div>
  );
}

export default function DespesasSection({ nome, politicoId }) {
  const { isAuthenticated, user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unlocked, setUnlocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState(null);

  // Filters
  const [searchText, setSearchText] = useState("");
  const [tipoFilter, setTipoFilter] = useState("");
  const [anoFilter, setAnoFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState("valor_desc");

  // Sincroniza desbloqueio pago (Firestore subcoleção — escrita só no backend)
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!isAuthenticated || !user?.uid || !politicoId) {
        if (!cancel) setUnlocked(false);
        return;
      }
      try {
        const snap = await fetchPoliticoUnlockSnapshot(user.uid, politicoId);
        if (!cancel) setUnlocked(!!snap.ceap_full);
      } catch {
        if (!cancel) setUnlocked(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [isAuthenticated, user?.uid, politicoId]);

  // Fetch data
  useEffect(() => {
    if (!nome && !politicoId) return;
    setLoading(true);
    setError(null);
    const mode = unlocked ? "full" : "preview";
    const qNome = nome ? `nome=${encodeURIComponent(nome)}` : "";
    const qId = politicoId ? `id=${encodeURIComponent(politicoId)}` : "";
    const idOrNome = [qNome, qId].filter(Boolean).join("&");
    const url = `/api/datalake/politico-despesas?${idOrNome}&mode=${mode}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [nome, politicoId, unlocked]);

  // Unlock handler
  const handleUnlock = useCallback(async () => {
    if (!isAuthenticated) {
      setUnlockError("Faça login para desbloquear as despesas.");
      return;
    }
    if (!String(politicoId || "").trim()) {
      setUnlockError("Identificador do parlamentar indisponível para débito seguro.");
      return;
    }
    setUnlocking(true);
    setUnlockError(null);
    try {
      await unlockPoliticoDataCallable(politicoId, "ceap");
      setUnlocked(true);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setUnlockError(
        /insufficient|Saldo insuficiente|failed-precondition/i.test(raw)
          ? `Créditos insuficientes. Necessário: ${UNLOCK_COST} créditos.`
          : `Erro: ${raw}`,
      );
    } finally {
      setUnlocking(false);
    }
  }, [isAuthenticated, politicoId]);

  // Extract filter options
  const tipoOptions = useMemo(() => {
    if (!data?.despesas) return [];
    const set = new Set(data.despesas.map((d) => d.tipo_despesa).filter(Boolean));
    return [...set].sort();
  }, [data]);

  const anoOptions = useMemo(() => {
    if (!data?.despesas) return [];
    const set = new Set(
      data.despesas.map((d) => d.data_emissao?.slice(0, 4)).filter(Boolean)
    );
    return [...set].sort().reverse();
  }, [data]);

  // Filter and sort
  const filteredDespesas = useMemo(() => {
    if (!data?.despesas) return [];
    let arr = [...data.despesas];

    if (searchText) {
      const q = searchText.toLowerCase();
      arr = arr.filter(
        (d) =>
          (d.fornecedor || "").toLowerCase().includes(q) ||
          (d.tipo_despesa || "").toLowerCase().includes(q)
      );
    }
    if (tipoFilter) {
      arr = arr.filter((d) => d.tipo_despesa === tipoFilter);
    }
    if (anoFilter) {
      arr = arr.filter((d) => d.data_emissao?.startsWith(anoFilter));
    }

    // Sort
    switch (sortBy) {
      case "valor_desc":
        arr.sort((a, b) => (b.valor || 0) - (a.valor || 0));
        break;
      case "valor_asc":
        arr.sort((a, b) => (a.valor || 0) - (b.valor || 0));
        break;
      case "data_desc":
        arr.sort((a, b) => (b.data_emissao || "").localeCompare(a.data_emissao || ""));
        break;
      case "data_asc":
        arr.sort((a, b) => (a.data_emissao || "").localeCompare(b.data_emissao || ""));
        break;
      case "alertas":
        arr.sort((a, b) => (b.alertas?.length || 0) - (a.alertas?.length || 0));
        break;
      default:
        break;
    }

    return arr;
  }, [data, searchText, tipoFilter, anoFilter, sortBy]);

  // Stats
  const totalComAlerta = useMemo(
    () => (data?.despesas || []).filter((d) => d.alertas?.length > 0).length,
    [data]
  );

  // Build URL client-side for preview mode (backend only sends url_documento in full mode)
  const enrichedDespesas = useMemo(() => {
    return filteredDespesas.map(d => {
      if (d.url_documento) return d;
      const numDoc = String(d.num_documento || "").trim();
      if (numDoc && /^\d+$/.test(numDoc)) {
        return { ...d, url_documento: `https://www.camara.leg.br/cota-parlamentar/documentos/publ/${numDoc}.pdf` };
      }
      return d;
    });
  }, [filteredDespesas]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0D1117]/90 p-6">
        <div className="flex items-center gap-3 text-[#8B949E]">
          <span className="size-2 animate-pulse rounded-full bg-cyan-400" />
          Carregando despesas CEAP…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-6">
        <p className="text-sm text-rose-200">Erro ao carregar despesas: {error}</p>
      </div>
    );
  }

  if (!data || !data.despesas || data.despesas.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0D1117]/90 p-6">
        <h2 className="text-xl font-bold text-white">Despesas CEAP</h2>
        <p className="mt-2 text-sm text-[#8B949E]">
          Nenhuma despesa encontrada para este parlamentar no BigQuery.
        </p>
      </div>
    );
  }

  const visibleDespesas = unlocked ? enrichedDespesas : enrichedDespesas.slice(0, PREVIEW_COUNT);
  const hiddenCount = data.resumo?.total_despesas
    ? Math.max(0, data.resumo.total_despesas - PREVIEW_COUNT)
    : 0;

  return (
    <section className="rounded-2xl border border-white/10 bg-[#0D1117]/95 p-6 sm:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300">
            BigQuery · ceap_despesas
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">
            Despesas CEAP — Auditoria
          </h2>
          <p className="mt-1 text-sm text-[#8B949E]">
            {fmtNum(data.resumo?.total_despesas)} despesas ·{" "}
            {fmtBrl(data.resumo?.total_brl)} total ·{" "}
            <span className="text-red-400 font-semibold">
              {fmtNum(data.resumo?.total_com_alerta)} com alerta
            </span>
          </p>
        </div>

        {/* Filter toggle */}
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
        >
          <Filter className="size-4" strokeWidth={1.75} />
          Filtros
          <ChevronDown
            className={`size-4 transition ${showFilters ? "rotate-180" : ""}`}
            strokeWidth={2}
          />
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="mb-6 grid gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder="Buscar fornecedor ou tipo..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-3 text-sm text-white placeholder-white/30 outline-none focus:border-cyan-400/50"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Tipo filter */}
          <select
            value={tipoFilter}
            onChange={(e) => setTipoFilter(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
          >
            <option value="">Todos os tipos</option>
            {tipoOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {/* Ano filter */}
          <select
            value={anoFilter}
            onChange={(e) => setAnoFilter(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
          >
            <option value="">Todos os anos</option>
            {anoOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
          >
            <option value="valor_desc">↓ Maior valor</option>
            <option value="valor_asc">↑ Menor valor</option>
            <option value="data_desc">↓ Mais recente</option>
            <option value="data_asc">↑ Mais antigo</option>
            <option value="alertas">⚠ Com alertas primeiro</option>
          </select>
        </div>
      )}

      {/* Results count */}
      {(searchText || tipoFilter || anoFilter) && (
        <p className="mb-4 text-xs text-[#8B949E]">
          {fmtNum(filteredDespesas.length)} resultado(s) encontrado(s)
          {!unlocked && filteredDespesas.length > PREVIEW_COUNT && (
            <span className="text-amber-300"> · mostrando {PREVIEW_COUNT} de preview</span>
          )}
        </p>
      )}

      {/* Expense list */}
      <div className={unlocked ? "max-h-[600px] overflow-y-auto pr-2" : ""}>
        <ul className="space-y-3">
          {visibleDespesas.map((d, idx) => {
            const hasAlert = d.alertas && d.alertas.length > 0;
            return (
              <li
                key={`${d.fornecedor}-${d.data_emissao}-${d.valor}-${idx}`}
                className={`rounded-lg border px-4 py-3 transition ${
                  hasAlert
                    ? "border-red-500/30 bg-red-500/5 hover:bg-red-500/10"
                    : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Alertas */}
                    <AlertBadge alertas={d.alertas} />

                    {/* Fornecedor + data */}
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p
                        className="min-w-0 flex-1 truncate text-base font-semibold text-white"
                        title={d.fornecedor}
                      >
                        {d.fornecedor || "Fornecedor não informado"}
                      </p>
                      <span className="shrink-0 text-xs text-[#8B949E]">
                        {d.data_emissao ? new Date(d.data_emissao).toLocaleDateString("pt-BR") : "—"}
                      </span>
                    </div>

                    {/* Tipo */}
                    {d.tipo_despesa && (
                      <p className="mt-1 text-xs text-[#8B949E]">{d.tipo_despesa}</p>
                    )}
                  </div>

                  {/* Valor + link */}
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {d.url_documento ? (
                      <a
                        href={d.url_documento}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`font-mono text-lg font-bold tabular-nums hover:underline ${
                          hasAlert ? "text-red-400" : "text-cyan-300"
                        }`}
                      >
                        {fmtBrl(d.valor)}
                      </a>
                    ) : (
                      <p
                        className={`font-mono text-lg font-bold tabular-nums ${
                          hasAlert ? "text-red-400" : "text-cyan-300"
                        }`}
                      >
                        {fmtBrl(d.valor)}
                      </p>
                    )}
                    {d.url_documento ? (
                      <a
                        href={d.url_documento}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#58A6FF] hover:underline"
                      >
                        Ver nota fiscal
                        <ExternalLink className="size-3" strokeWidth={2} />
                      </a>
                    ) : (
                      <span className="text-[10px] text-white/30">sem link</span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Paywall / unlock */}
      {!unlocked && hiddenCount > 0 && (
        <div className="mt-6 rounded-xl border border-red-500/30 bg-[#0D1117] p-6 text-center">
          <Lock className="mx-auto size-10 text-red-400" strokeWidth={1.75} />
          <p className="mt-4 text-lg font-bold text-white">
            {fmtNum(hiddenCount)} despesas ocultas
          </p>
          <p className="mt-2 text-sm text-[#8B949E]">
            Desbloqueie todas as despesas com links clicáveis, alertas detalhados e
            filtros completos por apenas{" "}
            <span className="font-bold text-cyan-300">{UNLOCK_COST} créditos</span>.
          </p>
          {unlockError && (
            <p className="mt-2 text-sm text-rose-400">{unlockError}</p>
          )}
          <button
            type="button"
            disabled={unlocking}
            onClick={handleUnlock}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-6 py-3 text-sm font-bold uppercase tracking-wider text-[#02040a] transition hover:brightness-110 disabled:opacity-50"
          >
            {unlocking ? "Debitando…" : `Desbloquear por ${UNLOCK_COST} créditos`}
          </button>
          {!isAuthenticated && (
            <p className="mt-3 text-xs text-white/40">
              Faça login primeiro para usar seus créditos.
            </p>
          )}
        </div>
      )}

      {/* Unlocked message */}
      {unlocked && (
        <div className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-center text-sm text-emerald-200">
          ✓ Desbloqueado — mostrando todas as {fmtNum(filteredDespesas.length)} despesas
        </div>
      )}
    </section>
  );
}
