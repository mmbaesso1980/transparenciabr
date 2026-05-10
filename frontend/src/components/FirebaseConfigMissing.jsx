import { Link } from "react-router-dom";

/**
 * Bloco comum quando `getFirebaseApp()` falha (build sem VITE_FIREBASE_*).
 */
export default function FirebaseConfigMissing({ context = "esta página" }) {
  return (
    <div
      role="status"
      className="mx-auto mt-10 max-w-xl rounded-2xl border border-amber-500/30 bg-amber-950/20 px-6 py-6 text-sm leading-relaxed text-[#E6EDF3]"
    >
      <p className="font-semibold text-amber-100">Firebase não configurado no bundle</p>
      <p className="mt-2 text-[#C9D1D9]">
        Para usar {context}, defina as variáveis{" "}
        <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[12px] text-[#7DD3FC]">
          VITE_FIREBASE_*
        </code>{" "}
        no ambiente de build e volte a gerar o frontend.
      </p>
      <p className="mt-3 text-xs text-[#8B949E]">
        Áreas públicas (landing, universo, partidos, status) continuam disponíveis sem estas chaves.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          to="/"
          className="rounded-lg border border-[#30363D] bg-[#0D1117] px-4 py-2 text-xs font-semibold text-[#58A6FF] hover:border-[#58A6FF]/45"
        >
          Página inicial
        </Link>
        <Link
          to="/status"
          className="rounded-lg border border-[#30363D] px-4 py-2 text-xs font-semibold text-[#8B949E] hover:border-[#58A6FF]/35 hover:text-[#C9D1D9]"
        >
          Status operacional
        </Link>
      </div>
    </div>
  );
}
