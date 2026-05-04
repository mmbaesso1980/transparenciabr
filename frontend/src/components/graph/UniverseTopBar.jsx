import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function UniverseTopBar({ totalParlamentares = 594 }) {
  return (
    <div className="pointer-events-auto fixed top-20 left-1/2 z-40 -translate-x-1/2">
      <div
        className="flex items-center gap-4 rounded-full border border-white/10 bg-zinc-900/70 px-5 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.4)] backdrop-blur-xl"
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-sm text-zinc-300">
            Você está vendo{" "}
            <span className="font-semibold text-white">{totalParlamentares}</span>{" "}
            parlamentares
          </span>
        </div>
        <div className="h-4 w-px bg-white/15" />
        <Link
          to="/status"
          className="group flex items-center gap-2 text-sm font-semibold text-orange-400 transition-colors hover:text-orange-300"
        >
          Ir para o status
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
