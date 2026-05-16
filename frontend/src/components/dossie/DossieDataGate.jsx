import PanelSkeleton from "./PanelSkeleton.jsx";

/**
 * Estados de carregamento e erro da rota do dossiê.
 */
export default function DossieDataGate({ loading, error, children }) {
  if (loading) {
    return <PanelSkeleton />;
  }

  if (error === "missing_config") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-[#8B949E]">
          Conector de dados indisponível. Configure as variáveis de ambiente do projeto Firebase para este
          ambiente de build.
        </p>
      </div>
    );
  }

  if (error === "missing_id") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-6 text-sm text-[#f85149]">
        Identificador ausente na rota.
      </div>
    );
  }

  if (error === "not_found") {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium text-[#F0F4FC]">Registro não encontrado</p>
        <p className="max-w-md text-xs text-[#8B949E]">
          Não há documento em{" "}
          <span className="font-mono text-[#C9D1D9]">transparency_reports</span>, nem em{" "}
          <span className="font-mono text-[#C9D1D9]">politicos</span> (ID ou{" "}
          <span className="font-mono text-[#C9D1D9]">slug</span>), nem em{" "}
          <span className="font-mono text-[#C9D1D9]">parlamentares</span> por slug — e o ID não consta no
          cadastro público de parlamentares (roster Câmara/Senado).
        </p>
      </div>
    );
  }

  if (error && error !== "not_found") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-6 text-center text-sm text-[#f85149]">
        Falha ao recuperar dados: {error}
      </div>
    );
  }

  return children;
}
