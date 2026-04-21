import { Activity, Stethoscope } from "lucide-react";
import { useMemo } from "react";

/**
 * D.R.A.C.U.L.A. — leitura da malha de saúde (1× no documento `politicos` / `malha_saude`).
 *
 * @param {{ politico?: Record<string, unknown> | null }} props
 */
export default function HealthAuditSection({ politico = null }) {
  const malha = useMemo(() => {
    const m = politico?.malha_saude;
    return m && typeof m === "object" ? m : null;
  }, [politico]);

  const hospitais = useMemo(() => {
    const h = malha?.hospitais;
    return Array.isArray(h) ? h : [];
  }, [malha]);

  const resumo = malha?.contratos_pncp_resumo;
  const ossEmPncp = resumo?.oss_cnpjs_em_contratos;
  const nOssPncp = Array.isArray(ossEmPncp) ? ossEmPncp.length : 0;

  if (!malha) {
    return (
      <section className="glass-card col-span-12 max-w-full min-w-0 px-4 pb-6 sm:px-6">
        <div className="rounded-xl border border-[#30363D]/80 bg-[#0D1117]/40 px-6 py-10 text-center sm:px-8">
          <Stethoscope
            className="mx-auto size-10 text-[#484F58]"
            strokeWidth={1.5}
            aria-hidden
          />
          <p className="mt-3 text-sm font-medium text-[#C9D1D9]">
            Auditoria de saúde (malha CNES × PNCP) ainda não sincronizada
          </p>
          <p className="mx-auto mt-2 max-w-lg text-[13px] text-[#8B949E]">
            Sincronize a malha de saúde (CNES × contratos) após a ingestão PNCP. Os dados serão
            embutidos no documento do parlamentar (sem leituras adicionais no dossiê).
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="glass-card col-span-12 max-w-full min-w-0 px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Stethoscope className="size-5 text-[#f97316]" strokeWidth={1.75} aria-hidden />
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-[#F0F4FC]">
              Malha de saúde — OSS e hospitais
            </h2>
            <p className="text-[11px] text-[#8B949E]">
              CNES (Base dos Dados) · cruzamento PNCP · Motor Forense TransparênciaBR
            </p>
          </div>
        </div>
        {nOssPncp > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#f85149]/45 bg-[#f85149]/10 px-3 py-1 text-[11px] font-semibold text-[#fecaca]">
            <Activity className="size-3.5" aria-hidden />
            OSS em contratos PNCP: {nOssPncp}
          </span>
        ) : (
          <span className="text-[11px] text-[#484F58]">
            Sem OSS mantenedora como fornecedor PNCP nos dados atuais
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {hospitais.length === 0 ? (
          <p className="col-span-full text-center text-sm text-[#8B949E]">
            Nenhum estabelecimento com mantenedora (CNPJ 14 dígitos) encontrado nos municípios-alvo.
          </p>
        ) : (
          hospitais.map((h, idx) => {
            const alerta = Boolean(h?.alerta_oss_em_contratos_pncp);
            return (
              <article
                key={`${h?.cnpj_estabelecimento ?? idx}-${h?.ibge ?? ""}`}
                className={[
                  "glass flex flex-col overflow-hidden rounded-xl border bg-[#0D1117]/75 backdrop-blur-md transition",
                  alerta
                    ? "border-[#f85149]/40 shadow-[0_0_24px_rgba(248,81,73,0.08)]"
                    : "border-[#30363D] hover:border-[#58A6FF]/25",
                ].join(" ")}
              >
                <div className="border-b border-[#21262D] px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 text-[15px] font-semibold leading-snug text-[#F0F4FC]">
                      {String(h?.nome_fantasia || "Estabelecimento")}
                    </h3>
                    {alerta ? (
                      <span className="shrink-0 rounded-md border border-[#f85149]/50 bg-[#f85149]/15 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-[#fecaca]">
                        Risco
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-md border border-[#30363D] bg-[#21262D] px-2 py-0.5 font-mono text-[10px] text-[#8B949E]">
                        Normal
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 font-mono text-[10px] text-[#484F58]">
                    IBGE {String(h?.ibge || "—")} · Estab. {String(h?.cnpj_estabelecimento || "—")}
                  </p>
                </div>
                <div className="flex flex-1 flex-col gap-2 px-4 py-3">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[#8B949E]">
                      OSS mantenedora
                    </p>
                    <p className="mt-1 font-mono text-xs font-semibold text-[#58A6FF]">
                      {String(h?.cnpj_mantenedora || "—")}
                    </p>
                  </div>
                  {alerta ? (
                    <p className="text-[11px] leading-relaxed text-[#fca5a5]">
                      CNPJ da mantenedora aparece como contratado PNCP neste âmbito territorial.
                    </p>
                  ) : (
                    <p className="text-[11px] text-[#8B949E]">
                      Sem sobreposição automática com fornecedor PNCP neste recorte.
                    </p>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      {malha?.atualizado_em ? (
        <p className="mt-4 font-mono text-[10px] text-[#484F58]">
          Atualizado em: {String(malha.atualizado_em)}
        </p>
      ) : null}
    </section>
  );
}
