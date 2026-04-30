/**
 * <EmptyGraph/> — Estado vazio on-brand para o grafo do universo.
 *
 * Substitui mensagens técnicas (ex.: "Sem dados no grafo (configure Firebase
 * ou aguarde ingestão)") por linguagem operacional, sem expor jargão de infra.
 *
 * Uso:
 *   {showEmpty ? <EmptyGraph variant="search" /> : null}
 *   - variant="idle" — usuário ainda não pesquisou nada (silêncio elegante)
 *   - variant="search" — busca acionada e grafo retornou vazio
 *   - variant="loading" — opcional, fallback enquanto carrega
 */
export default function EmptyGraph({ variant = "search", className = "" }) {
  if (variant === "idle") return null;

  const message =
    variant === "loading"
      ? "Sincronizando o Lake…"
      : "Aguardando próxima sincronização do Lake.";

  return (
    <div
      role="status"
      aria-label="Grafo de conexões aguardando sincronização"
      className={`inline-flex items-center gap-2.5 px-2 py-1 text-[11px] leading-relaxed text-[#6e7681] ${className}`}
    >
      <NodesIcon className="size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function NodesIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ color: "#58A6FF", opacity: 0.45 }}
    >
      {/* central node */}
      <circle cx="16" cy="16" r="2.4" fill="currentColor" opacity="0.7" />
      {/* satellites */}
      <circle cx="6" cy="9" r="1.6" fill="currentColor" opacity="0.5" />
      <circle cx="26" cy="11" r="1.6" fill="currentColor" opacity="0.5" />
      <circle cx="22" cy="25" r="1.6" fill="currentColor" opacity="0.5" />
      {/* edges */}
      <line x1="16" y1="16" x2="6" y2="9" opacity="0.35" />
      <line x1="16" y1="16" x2="26" y2="11" opacity="0.35" />
      <line x1="16" y1="16" x2="22" y2="25" opacity="0.35" />
    </svg>
  );
}
