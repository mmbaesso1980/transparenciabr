/**
 * @file EnriquecimentoCNPJ.jsx
 * @description Onda 7 — Cruzamento. Componente compacto que, dado um CNPJ,
 * exibe (a) razão social/atividade da BrasilAPI e (b) eventuais contratos
 * públicos (PNCP) do mesmo CNPJ. Usado dentro do CamadaDrawer para enriquecer
 * top fornecedores CEAP.
 *
 * Filosofia: "Não fazemos denúncia — apresentamos fatos." Mostramos o que o
 * Estado já publica em PNCP. O leitor faz o cruzamento.
 */

import { useCNPJDetalhe, usePNCPPorCNPJ } from "../hooks/useFornecedorEnriquecido.js";
import { Building2, FileSignature } from "lucide-react";

const fmtBRL = (v) =>
  Number.isFinite(Number(v))
    ? Number(v).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      })
    : "—";

export default function EnriquecimentoCNPJ({ cnpj, mostrarPNCP = true }) {
  const { data: detalhe, loading: loadingDet, notFound } = useCNPJDetalhe(cnpj);
  const { contratos, valorTotal, qtdContratos, loading: loadingPNCP } =
    usePNCPPorCNPJ(mostrarPNCP ? cnpj : null);

  if (!cnpj) return null;

  return (
    <div className="mt-1 space-y-1.5 text-[10px] text-white/55">
      <div className="flex items-start gap-1.5">
        <Building2 className="mt-0.5 size-3 shrink-0 opacity-60" strokeWidth={1.5} />
        <div className="min-w-0 flex-1">
          {loadingDet ? (
            <span className="opacity-50">Consultando Receita…</span>
          ) : notFound ? (
            <span className="opacity-50">CNPJ não localizado na Receita</span>
          ) : detalhe ? (
            <>
              <span className="font-medium text-white/75">{detalhe.razaoSocial}</span>
              {detalhe.atividadePrincipal && (
                <span className="block text-[9px] uppercase tracking-wider opacity-50">
                  {detalhe.atividadePrincipal} · {detalhe.uf}
                </span>
              )}
            </>
          ) : null}
        </div>
      </div>

      {mostrarPNCP && qtdContratos > 0 && (
        <div className="flex items-start gap-1.5">
          <FileSignature
            className="mt-0.5 size-3 shrink-0 text-amber-300/70"
            strokeWidth={1.5}
          />
          <div className="min-w-0 flex-1">
            <span className="font-mono text-amber-200/85">
              {qtdContratos} contrato{qtdContratos > 1 ? "s" : ""} no PNCP ·{" "}
              {fmtBRL(valorTotal)}
            </span>
            <span className="block text-[9px] uppercase tracking-wider text-amber-200/45">
              cruzamento: este fornecedor também tem contratos públicos
            </span>
            {contratos.slice(0, 2).map((c, i) => (
              <span
                key={i}
                className="block truncate text-[9px] text-white/40"
                title={c.objeto}
              >
                · {c.orgao} · {fmtBRL(c.valor)}
              </span>
            ))}
          </div>
        </div>
      )}

      {mostrarPNCP && !loadingPNCP && qtdContratos === 0 && detalhe && (
        <div className="flex items-start gap-1.5 opacity-40">
          <FileSignature className="mt-0.5 size-3 shrink-0" strokeWidth={1.5} />
          <span className="text-[9px] uppercase tracking-wider">
            Sem contratos públicos no PNCP nos últimos 2 anos
          </span>
        </div>
      )}
    </div>
  );
}
