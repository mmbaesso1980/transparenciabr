/**
 * Overlay de controle de modos bottom-center no UniversePage.
 * Props:
 *   currentMode: string — modo ativo (ex: "default")
 *   onModeChange(modeId: string) — chamado ao selecionar um modo
 */

const MODES = [
  { id: "default", label: "Visão Geral" },
  { id: "bentobox", label: "Bentobox" },
  { id: "rank-global", label: "Rank Global" },
  { id: "parties", label: "Partidos" },
  { id: "suppliers", label: "Fornecedores" },
];

export default function MissionControlFooter({ currentMode, onModeChange }) {
  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 sm:bottom-28">
      <div className="bg-[#0a1628]/70 backdrop-blur-md rounded-lg border border-[#1a2b42] shadow-lg p-3 flex gap-3">
        {MODES.map((mode) => {
          const isActive = currentMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onModeChange?.(mode.id)}
              aria-label={`Alternar para modo ${mode.label}`}
              aria-pressed={isActive}
              className={
                isActive
                  ? "rounded-md px-3 py-1.5 text-xs font-bold transition-colors bg-[#58A6FF] text-[#02040a]"
                  : "rounded-md px-3 py-1.5 text-xs font-medium transition-colors bg-[#02040a]/50 text-white hover:text-[#58A6FF] hover:bg-[#0a1628]"
              }
            >
              {mode.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
