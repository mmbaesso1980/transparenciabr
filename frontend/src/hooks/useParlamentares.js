/**
 * useParlamentares — Lista os 513 deputados a partir do Firestore.
 *
 * Lê `politicos` collection (já existe `fetchPoliticosCollection` em lib/firebase.js).
 * Cache agressivo (1h) para evitar reler 513 docs a cada navegação.
 *
 * Saída padronizada para os bentos do Painel:
 *   { id, nome, partido, uf, cota, frugalidade, sinalizacoes, score, presenca, ... }
 *
 * Onde `id` é SEMPRE o doc.id real do Firestore (ID Câmara ou slug canônico),
 * compatível com a rota `/politico/:id` que o BentoModal navega.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchPoliticosCollection } from "../lib/firebase.js";

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Normaliza um doc cru de `politicos` para o shape esperado pelos bentos. */
function normalizeParlamentar(p) {
  if (!p || !p.id) return null;
  // Tolerar nomes de campo variados — schema do Firestore evoluiu ao longo do projeto.
  const partido =
    p.partido ?? p.siglaPartido ?? p.partidoSigla ?? p.party ?? "—";
  const uf =
    p.uf ?? p.siglaUf ?? p.estado ?? p.unidadeFederativa ?? "—";
  const cota = numOr0(
    p.cota_anual ??
      p.cota ??
      p.gasto_total ??
      p.ceap_total_acumulado ??
      p.kpi_cota ??
      0,
  );
  const frugalidade = numOr0(
    p.frugalidade ?? p.score_frugalidade ?? p.kpi_frugalidade ?? 0,
  );
  const sinalizacoes = numOr0(
    p.sinalizacoes ?? p.sinalizacoes_total ?? p.kpi_sinalizacoes ?? 0,
  );
  const score = numOr0(
    p.score_risco ??
      p.risk_score ??
      p.score ??
      p.kpi_score_risco ??
      0,
  );
  const presenca = numOr0(
    p.presenca ?? p.presenca_pct ?? p.kpi_presenca ?? 0,
  );

  return {
    id: p.id, // ← doc.id real, navegável em /politico/:id
    nome: p.nome ?? p.nome_civil ?? p.name ?? "—",
    partido,
    uf,
    cota,
    frugalidade,
    sinalizacoes,
    score,
    presenca,
    foto: p.foto ?? p.fotoUrl ?? p.urlFoto ?? null,
  };
}

function numOr0(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Hook principal. */
export function useParlamentares() {
  return useQuery({
    queryKey: ["parlamentares-collection-v1"],
    queryFn: async () => {
      const all = await fetchPoliticosCollection();
      return all
        .map(normalizeParlamentar)
        .filter(Boolean)
        .filter((p) => p.id && p.nome && p.nome !== "—");
    },
    staleTime: ONE_HOUR_MS,
    gcTime: 2 * ONE_HOUR_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
