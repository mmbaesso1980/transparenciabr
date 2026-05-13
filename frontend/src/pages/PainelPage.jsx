/**
 * Painel Aurora — placeholder mínimo para o bundle de produção.
 * (O ficheiro anterior continha apenas um comentário e quebrava `vite build`.)
 */
export default function PainelPage() {
  return (
    <div className="min-h-[40vh] bg-[#05060d] px-6 py-16 text-center text-[#C9D1D9]">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
        Painel Aurora
      </p>
      <p className="mx-auto mt-3 max-w-md text-sm text-[#8B949E]">
        Esta rota está reservada para o painel imersivo. Use o universo ou a página
        do parlamentar enquanto o layout completo é restaurado no repositório.
      </p>
    </div>
  );
}
