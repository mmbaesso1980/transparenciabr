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
  placeholder = "Buscar político ou fornecedor...",
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
    <div className="absolute top-4 left-4 z-50">
      <div className="bg-[#0a1628]/70 backdrop-blur-md rounded-lg border border-[#1a2b42] shadow-lg p-3 flex items-center gap-2">
        <input
          ref={inputRef}
          type="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          aria-label="Buscar político ou fornecedor no universo"
          className="w-64 bg-transparent text-[#58A6FF] placeholder-[#94A3B8] outline-none text-sm"
        />
        <button
          type="button"
          onClick={handleSubmit}
          aria-label="Executar busca no universo"
          className="text-white hover:text-[#58A6FF] transition-colors shrink-0"
        >
          <Search className="size-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}
