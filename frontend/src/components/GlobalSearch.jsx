import { Search } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useCameraFocus } from "../context/CameraFocusContext.jsx";

/**
 * Pesquisa global por ID de documento (`politicos/{id}`).
 * Na Home: aciona rastreamento orbital + navegação após interpolação.
 * Nas demais rotas: navegação direta (1× leitura ocorre na página de destino).
 */
export default function GlobalSearch({ className = "" }) {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const { requestTrackToPolitician } = useCameraFocus();

  function submit(e) {
    e.preventDefault();
    const id = q.trim();
    if (!id) return;
    if (location.pathname === "/") {
      requestTrackToPolitician(id);
    } else {
      navigate(`/dossie/${encodeURIComponent(id)}`);
    }
    setQ("");
  }

  return (
    <form
      onSubmit={submit}
      className={`flex items-center gap-2 ${className}`}
      role="search"
      aria-label="Pesquisa por identificador"
    >
      <div className="relative flex min-w-0 flex-1 items-center">
        <Search
          className="pointer-events-none absolute left-3 size-4 text-[#8B949E]"
          strokeWidth={1.75}
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ID do documento…"
          autoComplete="off"
          className="w-full min-w-0 rounded-lg border border-[#30363D] bg-[#0D1117] py-2 pl-10 pr-3 text-sm text-[#F0F4FC] placeholder:text-[#484F58] outline-none ring-[#58A6FF] focus:border-[#58A6FF]/50 focus:ring-2"
        />
      </div>
      <button
        type="submit"
        className="shrink-0 rounded-lg border border-[#30363D] bg-[#21262D] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#F0F4FC] transition hover:bg-[#30363D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58A6FF]"
      >
        Ir
      </button>
    </form>
  );
}
