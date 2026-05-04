import { Search } from "lucide-react";
import { useRef, useState } from "react";

/**
 * Overlay de busca top-left no UniversePage.
 * Props:
 *   onSearchSubmit(searchTerm: string) — chamado ao pressionar Enter ou clicar na lupa
 *   placeholder?: string
 */
export default function UniverseSearchInput({
  onSearchSubmit,
  placeholder = "O que você quer auditar hoje?",
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const inputRef = useRef(null);

  const handleSubmit = () => {
    const term = searchTerm.trim();
    if (!term) return;
    onSearchSubmit?.(term);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-20 z-40 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-xl rounded-2xl border border-white/[0.12] bg-[#0a1628]/75 px-4 py-3 shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_0_1px_rgba(88,166,255,0.08)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Search className="size-5 shrink-0 text-[#7DD3FC]" strokeWidth={2} aria-hidden />
          <input
            ref={inputRef}
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            aria-label="Pesquisar no universo de transparência"
            className="flex-1 bg-transparent text-base font-medium text-[#F0F4FC] outline-none placeholder:text-[#7A8AA0]"
          />
          <button
            type="button"
            onClick={handleSubmit}
            aria-label="Executar busca no universo"
            className="shrink-0 rounded-lg bg-[#58A6FF] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[#02040a] shadow-[0_0_24px_rgba(88,166,255,0.35)] transition hover:bg-[#7DD3FC]"
          >
            Auditar
          </button>
        </div>
      </div>
    </div>
  );
}
