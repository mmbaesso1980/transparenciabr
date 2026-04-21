import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

/**
 * Reservado para login email/OAuth completo; por agora atalhos para sessão anónima já criada na app.
 */
export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col justify-center gap-6 px-6 py-12 text-center text-[#F0F4FC]">
      <Helmet>
        <title>Acesso | TransparênciaBR</title>
        <meta
          name="description"
          content="Rotas de acesso — a sessão anónima Firebase é criada automaticamente para créditos e dossiê."
        />
      </Helmet>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#8B949E]">
          Conta
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Acesso</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#8B949E]">
          A aplicação usa autenticação anónima por defeito para sincronizar créditos no Firestore. Login
          social completo pode ser ligado aqui sem alterar as rotas protegidas.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          className="rounded-xl border border-[#30363D] bg-[#21262D] px-6 py-3 text-sm font-semibold text-[#F0F4FC] transition hover:border-[#58A6FF]/40 hover:bg-[#30363D]"
          to="/dashboard"
        >
          Ir ao Centro de Operações
        </Link>
        <Link
          className="rounded-xl border border-transparent px-6 py-3 text-sm font-semibold text-[#58A6FF] underline-offset-4 hover:underline"
          to="/ranking"
        >
          Ver ranking
        </Link>
      </div>
    </div>
  );
}
