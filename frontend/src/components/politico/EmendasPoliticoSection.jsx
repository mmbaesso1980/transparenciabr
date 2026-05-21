import { useCallback, useEffect, useState } from "react";
import { Lock } from "lucide-react";

import { useAuth } from "../../context/AuthContext.jsx";
import {
  CREDIT_PRICE_UNLOCK_EMENDAS_LISTA,
} from "../../data/creditPricing.js";
import { labelRpForTipo, normalizeEmendasList } from "../../utils/emendasNormalize.js";
import { fetchPoliticoUnlockSnapshot, unlockPoliticoDataCallable } from "../../lib/politicoUnlocks.js";

const FREE_COUNT = 3;

const fmtBrl = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
};

function pickFavorecido(row) {
  const nome = String(
    row?.beneficiario_nome ??
      row?.favorecido ??
      row?.razao_social_favorecido ??
      row?.nome_favorecido ??
      row?.credor_nome ??
      row?.descricao_normalizada ??
      "",
  ).trim();
  if (nome) return nome.slice(0, 160);
  const loc = [row?.municipio_favorecido, row?.uf_favorecido].filter(Boolean).join(" / ");
  if (loc) return loc.slice(0, 160);
  const m = [row?.municipio, row?.estado].filter(Boolean).join(" / ");
  return m ? m.slice(0, 160) : "—";
}

function pickValorPagoEmpenhado(row) {
  const empenhado = Number(
    row?.valor_empenhado ?? row?.valorEmpenhado ?? row?.valor_normalizado ?? row?.valor ?? 0,
  );
  const pago = Number(row?.valor_pago ?? row?.valorPago ?? row?.valor_pago_normalizado ?? 0);
  return { empenhado: Number.isFinite(empenhado) ? empenhado : 0, pago: Number.isFinite(pago) ? pago : 0 };
}

/**
 * @param {{ politico: Record<string, unknown>; politicoId: string }} props
 */
export default function EmendasPoliticoSection({ politico, politicoId }) {
  const { user, isAuthenticated } = useAuth();
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const rows = normalizeEmendasList(
    Array.isArray(politico?.emendas) ? politico.emendas : politico?.emendas_parlamentares ?? [],
  );

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!isAuthenticated || !user?.uid || !politicoId) {
        if (!cancel) setUnlocked(false);
        return;
      }
      try {
        const snap = await fetchPoliticoUnlockSnapshot(user.uid, politicoId);
        if (!cancel) setUnlocked(!!snap.emendas_full);
      } catch {
        if (!cancel) setUnlocked(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [isAuthenticated, user?.uid, politicoId]);

  const handleUnlock = useCallback(async () => {
    if (!isAuthenticated) {
      setErr("Inicie sessão para desbloquear a base completa de emendas.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await unlockPoliticoDataCallable(politicoId, "emendas");
      setUnlocked(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }, [isAuthenticated, politicoId]);

  const visible = unlocked ? rows : rows.slice(0, FREE_COUNT);
  const hidden = Math.max(0, rows.length - FREE_COUNT);

  return (
    <section className="relative rounded-2xl border border-violet-400/25 bg-[#0D1117]/95 p-6 sm:p-8">
      <header className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-violet-300">
          Emendas orçamentárias
        </p>
        <h2 className="mt-1 text-xl font-semibold text-white">Caixa preta das emendas</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#8B949E]">
          Cruzamento ativo com Diários Oficiais e Transferegov para rastrear o recebedor final e a execução
          real do recurso. Os valores exibidos refletem empenho e pagamento conforme bases públicas
          integradas.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-[#8B949E]">
          Não há emendas vinculadas a este cadastro neste momento. Após atualização cadastral ou coleta
          complementar, a tabela será preenchida automaticamente.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-white/5">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-white/50">
                  <th className="px-3 py-2">Ano</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2 text-right">Empenhado</th>
                  <th className="px-3 py-2 text-right">Pago</th>
                  <th className="px-3 py-2">Favorecido / destino</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row, i) => {
                  const { empenhado, pago } = pickValorPagoEmpenhado(row);
                  const tipo = labelRpForTipo(row.tipo_emenda) || row.tipo_emenda;
                  return (
                    <tr key={i} className="border-b border-white/5 text-[#C9D1D9]">
                      <td className="px-3 py-2 font-mono text-xs">{row.ano ?? "—"}</td>
                      <td className="px-3 py-2 text-xs font-semibold text-violet-200">{tipo}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{fmtBrl(empenhado)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{fmtBrl(pago)}</td>
                      <td className="px-3 py-2 text-xs text-[#8B949E]">{pickFavorecido(row)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!unlocked && hidden > 0 ? (
            <div className="relative mt-4 min-h-[140px] overflow-hidden rounded-xl border border-white/10">
              <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#05060d]/80 px-4 backdrop-blur-md">
                <Lock className="size-8 text-violet-300" strokeWidth={1.5} />
                <p className="text-center text-sm font-semibold text-white">
                  {hidden} emenda(s) adicionais sob sigilo comercial
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleUnlock}
                  className="pointer-events-auto inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-600 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-50"
                >
                  {busy
                    ? "Processando…"
                    : `Ver emendas completas e destinos — desbloquear (${CREDIT_PRICE_UNLOCK_EMENDAS_LISTA} cr)`}
                </button>
                {err ? <p className="pointer-events-auto text-center text-xs text-rose-300">{err}</p> : null}
                {!isAuthenticated ? (
                  <p className="pointer-events-auto text-center text-[11px] text-white/50">
                    É necessário iniciar sessão para debitar créditos com segurança.
                  </p>
                ) : null}
              </div>
              <div className="p-3 opacity-30">
                <p className="text-[10px] text-white/40">Pré-visualização bloqueada</p>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
