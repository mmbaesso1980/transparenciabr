import { Filter, Lock, LogIn, PanelRightOpen, X } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";

import {
  fetchRadarComercialForOwner,
  fetchRadarDossiersForOwner,
  getFirebaseApp,
  getFirebaseAuth,
  signInWithGoogle,
} from "../lib/firebase.js";

const ADMIN_UID = (import.meta.env.VITE_RADAR_ADMIN_UID || "").trim();

function tsMs(v) {
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return 0;
}

function fmtBrl(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

/** Normaliza linhas jurídicas + comerciais para grelha única. */
function mergedRows(juridico, comercial) {
  const j = (Array.isArray(juridico) ? juridico : []).map((r) => {
    const ag = r.analise_gemini && typeof r.analise_gemini === "object" ? r.analise_gemini : {};
    const resumo = typeof ag.resumo_fato === "string" ? ag.resumo_fato : "";
    return {
      key: `j-${r.id}`,
      bucket: "juridico",
      area:
        typeof r.area === "string"
          ? r.area
          : typeof r.painel_area === "string"
            ? r.painel_area
            : "—",
      municipio: String(r.municipio ?? r.codigo_ibge_municipio ?? "—").slice(0, 80),
      urgencia: String(r.urgencia ?? "—"),
      titulo: String(resumo || r.area || "Dossiê").slice(0, 200),
      valor: null,
      criado_ms: tsMs(r.criado_em ?? r.atualizado_em),
      raw: r,
    };
  });

  const c = (Array.isArray(comercial) ? comercial : []).map((r) => ({
    key: `c-${r.id}`,
    bucket: "comercial",
    area: "comercial",
    municipio: String(r.municipio ?? r.codigo_ibge_municipio ?? "—").slice(0, 80),
    urgencia: String(r.urgencia ?? "PIPELINE"),
    titulo: String(r.titulo ?? r.origem ?? "Lead").slice(0, 160),
    valor: r.valor_estimado ?? null,
    criado_ms: tsMs(r.criado_em ?? r.atualizado_em),
    raw: r,
  }));

  return [...j, ...c].sort((a, b) => b.criado_ms - a.criado_ms);
}

export default function RadarPage() {
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [rowsJ, setRowsJ] = useState([]);
  const [rowsC, setRowsC] = useState([]);
  const [filtroArea, setFiltroArea] = useState(""); /* juridico | comercial | '' */
  const [filtroMun, setFiltroMun] = useState("");
  const [filtroUrg, setFiltroUrg] = useState("");
  const [modalRow, setModalRow] = useState(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!getFirebaseApp() || !auth) return undefined;
    const unsub = onAuthStateChanged(auth, (u) => setUser(u ?? null));
    return () => unsub();
  }, []);

  const load = useCallback(async () => {
    if (!user?.uid || user.uid !== ADMIN_UID) return;
    setBusy(true);
    setErr(null);
    try {
      const [j, c] = await Promise.all([
        fetchRadarDossiersForOwner(user.uid),
        fetchRadarComercialForOwner(user.uid),
      ]);
      setRowsJ(j);
      setRowsC(c);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "fetch_failed");
    } finally {
      setBusy(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const tableData = useMemo(
    () => mergedRows(rowsJ, rowsC),
    [rowsJ, rowsC],
  );

  const filtered = useMemo(() => {
    return tableData.filter((r) => {
      if (filtroArea === "juridico" && r.bucket !== "juridico") return false;
      if (filtroArea === "comercial" && r.bucket !== "comercial") return false;
      if (filtroMun.trim()) {
        const q = filtroMun.trim().toLowerCase();
        if (!r.municipio.toLowerCase().includes(q)) return false;
      }
      if (filtroUrg.trim()) {
        const q = filtroUrg.trim().toLowerCase();
        if (!r.urgencia.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tableData, filtroArea, filtroMun, filtroUrg]);

  const accessOk = Boolean(ADMIN_UID && user?.uid === ADMIN_UID);
  const configOk = Boolean(ADMIN_UID);

  async function handleGoogle() {
    setErr(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "google_signin_failed");
    }
  }

  return (
    <>
      <Helmet>
        <title>Radar — QG Advocacia | TransparênciaBR</title>
      </Helmet>

      <div className="min-h-full bg-[#050608] px-4 py-6 font-mono text-[#00FF9D] sm:px-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[#1c2128] pb-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.4em] text-[#8B949E]">
              Painel administrativo · Análise Forense
            </p>
            <h1 className="mt-1 text-lg font-bold tracking-tight text-[#39FFB6]">
              RADAR DOSSIERS — LEGALTECH + COMERCIAL
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <Lock className="size-3.5 text-[#FF7B54]" aria-hidden />
            <span className="text-[#8B949E]">
              sessão: {user?.uid ? `${user.uid.slice(0, 8)}…` : "—"}
            </span>
            {!accessOk ? (
              <button
                type="button"
                onClick={() => void handleGoogle()}
                className="inline-flex items-center gap-1 rounded border border-[#39FFB6]/40 bg-[#0D1117] px-3 py-1.5 text-[11px] font-semibold text-[#39FFB6] hover:bg-[#161B22]"
              >
                <LogIn className="size-3.5" />
                Entrar com Google
              </button>
            ) : null}
          </div>
        </div>

        {!configOk ? (
          <p className="text-sm text-[#f85149]">
            Defina <span className="font-mono">VITE_RADAR_ADMIN_UID</span> no ambiente de build.
          </p>
        ) : null}

        {configOk && !accessOk ? (
          <p className="max-w-xl text-xs leading-relaxed text-[#8B949E]">
            Acesso exclusivo: inicie sessão com a conta Google cujo UID coincide com{" "}
            <span className="font-mono text-[#C9D1D9]">VITE_RADAR_ADMIN_UID</span>. A sessão anónima
            não corresponde ao painel administrativo.
          </p>
        ) : null}

        {accessOk ? (
          <>
            <div className="mb-3 flex flex-wrap items-end gap-3 text-[11px] text-[#8B949E]">
              <label className="flex items-center gap-1.5">
                <Filter className="size-3.5" />
                Área
                <select
                  value={filtroArea}
                  onChange={(e) => setFiltroArea(e.target.value)}
                  className="rounded border border-[#30363D] bg-[#0D1117] px-2 py-1 text-[#39FFB6]"
                >
                  <option value="">Todas</option>
                  <option value="juridico">Jurídico</option>
                  <option value="comercial">Comercial</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                Município
                <input
                  value={filtroMun}
                  onChange={(e) => setFiltroMun(e.target.value)}
                  placeholder="contém…"
                  className="w-40 rounded border border-[#30363D] bg-[#0D1117] px-2 py-1 text-[#C9D1D9] placeholder:text-[#484F58]"
                />
              </label>
              <label className="flex items-center gap-1.5">
                Urgência
                <input
                  value={filtroUrg}
                  onChange={(e) => setFiltroUrg(e.target.value)}
                  placeholder="ALTA / …"
                  className="w-32 rounded border border-[#30363D] bg-[#0D1117] px-2 py-1 text-[#C9D1D9]"
                />
              </label>
              <button
                type="button"
                onClick={() => void load()}
                disabled={busy}
                className="rounded border border-[#30363D] px-2 py-1 text-[#8B949E] hover:text-[#39FFB6] disabled:opacity-40"
              >
                {busy ? "Atualizando…" : "Recarregar"}
              </button>
            </div>

            {err ? (
              <p className="mb-2 text-xs text-[#f85149]">{err}</p>
            ) : null}

            <div className="overflow-x-auto border border-[#1c2128] bg-[#010409]">
              <table className="w-full min-w-[880px] border-collapse text-left text-[11px] leading-snug">
                <thead>
                  <tr className="border-b border-[#1c2128] bg-[#0D1117] text-[#8B949E]">
                    <th className="px-2 py-2 font-semibold">ÁREA</th>
                    <th className="px-2 py-2 font-semibold">TIPO</th>
                    <th className="px-2 py-2 font-semibold">MUNICÍPIO</th>
                    <th className="px-2 py-2 font-semibold">URG</th>
                    <th className="px-2 py-2 font-semibold">VALOR EST.</th>
                    <th className="px-2 py-2 font-semibold">RESUMO</th>
                    <th className="px-2 py-2 font-semibold w-28">AÇÃO</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.key}
                      className="border-b border-[#161B22] hover:bg-[#0D1117]/80"
                    >
                      <td className="px-2 py-1.5 align-top text-[#39FFB6]">{r.area}</td>
                      <td className="px-2 py-1.5 align-top uppercase text-[#8B949E]">
                        {r.bucket}
                      </td>
                      <td className="px-2 py-1.5 align-top text-[#C9D1D9]">{r.municipio}</td>
                      <td className="px-2 py-1.5 align-top text-[#FFB86C]">{r.urgencia}</td>
                      <td className="px-2 py-1.5 align-top text-[#00C2FF]">
                        {r.bucket === "comercial" ? fmtBrl(r.valor) : "—"}
                      </td>
                      <td className="max-w-md px-2 py-1.5 align-top text-[#C9D1D9]">
                        {r.titulo}
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <button
                          type="button"
                          onClick={() => setModalRow(r)}
                          className="inline-flex items-center gap-1 rounded border border-[#39FFB6]/35 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#39FFB6] hover:bg-[#161B22]"
                        >
                          <PanelRightOpen className="size-3.5" />
                          Expandir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-[11px] text-[#484F58]">
                  Nenhuma linha neste filtro.
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {modalRow ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative max-h-[88vh] w-full max-w-3xl overflow-y-auto border border-[#30363D] bg-[#0D1117] p-5 text-[#C9D1D9] shadow-2xl">
            <button
              type="button"
              aria-label="Fechar"
              onClick={() => setModalRow(null)}
              className="absolute right-3 top-3 rounded p-1 text-[#8B949E] hover:bg-[#21262D] hover:text-[#F0F4FC]"
            >
              <X className="size-5" />
            </button>
            <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#58A6FF]">
              Dossiê · {modalRow.bucket}
            </p>
            <h2 className="mt-2 font-mono text-base font-semibold text-[#F0F4FC]">
              {modalRow.raw?.titulo ?? modalRow.raw?.area ?? "Detalhe"}
            </h2>
            <div className="mt-4 space-y-4 font-mono text-[11px] leading-relaxed">
              {modalRow.bucket === "juridico" && modalRow.raw?.analise_gemini ? (
                <pre className="overflow-x-auto rounded border border-[#30363D] bg-[#010409] p-3 text-[#7EE787]">
                  {JSON.stringify(modalRow.raw.analise_gemini, null, 2)}
                </pre>
              ) : null}
              {modalRow.bucket === "comercial" ? (
                <pre className="overflow-x-auto rounded border border-[#30363D] bg-[#010409] p-3 text-[#79C0FF]">
                  {JSON.stringify(
                    {
                      valor_estimado: modalRow.raw?.valor_estimado,
                      orgao_contato: modalRow.raw?.orgao_contato,
                      origem: modalRow.raw?.origem,
                    },
                    null,
                    2,
                  )}
                </pre>
              ) : null}
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#8B949E]">
                  Fontes & links
                </p>
                <ul className="list-inside list-disc space-y-1 text-[#58A6FF]">
                  {(modalRow.raw?.fontes || []).map((f, i) => (
                    <li key={i}>
                      {typeof f.url_fonte === "string" && f.url_fonte.startsWith("http") ? (
                        <a href={f.url_fonte} target="_blank" rel="noreferrer" className="underline">
                          {f.url_fonte.slice(0, 120)}
                          {f.url_fonte.length > 120 ? "…" : ""}
                        </a>
                      ) : null}
                      {typeof f.url === "string" && f.url.startsWith("http") ? (
                        <a href={f.url} target="_blank" rel="noreferrer" className="underline">
                          {f.url.slice(0, 120)}
                        </a>
                      ) : (
                        <span className="text-[#8B949E]">{JSON.stringify(f).slice(0, 200)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
