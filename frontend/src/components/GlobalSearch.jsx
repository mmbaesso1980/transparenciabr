import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useCameraFocus } from "../context/CameraFocusContext.jsx";
import { fetchPoliticosCollection, getFirebaseApp } from "../lib/firebase.js";
import { pickNome } from "../utils/dataParsers.js";

/** Cache em módulo — uma leitura por sessão por instância da SPA. */
let politicosCache = null;
let politicosInflight = null;

function normalize(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

async function loadPoliticosOnce() {
  if (politicosCache) return politicosCache;
  if (politicosInflight) return politicosInflight;
  politicosInflight = fetchPoliticosCollection()
    .then((rows) => {
      politicosCache = Array.isArray(rows) ? rows : [];
      return politicosCache;
    })
    .catch(() => {
      politicosCache = [];
      return politicosCache;
    })
    .finally(() => {
      politicosInflight = null;
    });
  return politicosInflight;
}

/**
 * Pesquisa por ID ou nome (`politicos`). Na Home: foco orbital + navegação.
 */
export default function GlobalSearch({ className = "" }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();
  const { requestTrackToPolitician } = useCameraFocus();
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!getFirebaseApp()) return undefined;
    let cancelled = false;
    loadPoliticosOnce().then((rows) => {
      if (!cancelled) setCatalog(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const matches = useMemo(() => {
    const term = normalize(q);
    if (term.length < 2) return [];
    const out = [];
    for (const p of catalog) {
      const id = String(p.id ?? "").trim();
      const nome = normalize(pickNome(p));
      if (!id) continue;
      if (id.toLowerCase().includes(term) || nome.includes(term)) {
        out.push({ id, nome: pickNome(p) || id });
      }
      if (out.length >= 8) break;
    }
    return out;
  }, [q, catalog]);

  const goDossie = useCallback(
    (id) => {
      const clean = String(id).trim();
      if (!clean) return;
      if (location.pathname === "/") {
        requestTrackToPolitician(clean);
      }
      navigate(`/dossie/${encodeURIComponent(clean)}`);
      setQ("");
      setOpen(false);
    },
    [location.pathname, navigate, requestTrackToPolitician],
  );

  function submit(e) {
    e.preventDefault();
    const id = q.trim();
    if (!id) return;
    if (matches.length === 1) {
      goDossie(matches[0].id);
      return;
    }
    goDossie(id);
  }

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <form
        onSubmit={submit}
        className="flex items-center gap-2"
        role="search"
        aria-label="Pesquisa por político"
      >
        <div className="relative flex min-w-0 flex-1 items-center">
          <Search
            className="pointer-events-none absolute left-3 size-4 text-[#8B949E]"
            strokeWidth={1.75}
          />
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Nome ou ID do político…"
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

      {open && matches.length > 0 ? (
        <ul
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-lg border border-[#30363D] bg-[#0D1117]/98 py-1 shadow-xl backdrop-blur-md"
          role="listbox"
        >
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm text-[#F0F4FC] transition hover:bg-[#21262D]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => goDossie(m.id)}
              >
                <span className="truncate font-medium">{m.nome}</span>
                <span className="font-mono text-[11px] text-[#8B949E]">{m.id}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
