import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import BrandLogo from "../components/BrandLogo.jsx";

function resolveDocSrc(docPath) {
  const base = import.meta.env.BASE_URL || "/";
  const path = docPath.startsWith("/") ? docPath : `/${docPath}`;
  if (base === "/") return path;
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${trimmed}${path}`;
}

export default function MarkdownPage({ docPath, title, description }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const src = resolveDocSrc(docPath);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then((t) => {
        if (!cancelled) {
          setContent(t);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Não foi possível carregar o documento.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div className="min-h-dvh bg-[#02040a] text-[#C9D1D9]">
      <Helmet>
        <title>{title} — TransparênciaBR</title>
        {description ? (
          <meta name="description" content={description} />
        ) : null}
      </Helmet>

      <header className="border-b border-[#30363D]/60 bg-[#02040a]/90 px-4 py-3 backdrop-blur-md sm:px-8">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <BrandLogo to="/" variant="full" size="md" />
          <nav
            className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8B949E] sm:gap-3"
            aria-label="Documentos legais"
          >
            <Link
              to="/sobre"
              className="text-[#7DD3FC] transition hover:text-[#F0F4FC]"
            >
              Sobre
            </Link>
            <span aria-hidden className="text-[#30363D]">
              ·
            </span>
            <Link
              to="/metodologia"
              className="text-[#7DD3FC] transition hover:text-[#F0F4FC]"
            >
              Metodologia
            </Link>
            <span aria-hidden className="text-[#30363D]">
              ·
            </span>
            <Link
              to="/termos"
              className="text-[#7DD3FC] transition hover:text-[#F0F4FC]"
            >
              Termos
            </Link>
            <span aria-hidden className="text-[#30363D]">
              ·
            </span>
            <Link
              to="/privacidade"
              className="text-[#7DD3FC] transition hover:text-[#F0F4FC]"
            >
              Privacidade
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="mb-8 text-2xl font-bold tracking-tight text-[#F0F4FC] sm:text-3xl">
          {title}
        </h1>
        {loading ? (
          <p className="text-sm text-[#8B949E]">Carregando…</p>
        ) : error ? (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {error}
          </p>
        ) : (
          <article
            className="legal-markdown space-y-4 text-sm leading-relaxed text-[#C9D1D9]
                       [&_a]:text-[#7DD3FC] [&_a]:underline [&_a]:underline-offset-2
                       [&_blockquote]:border-l-2 [&_blockquote]:border-[#30363D] [&_blockquote]:pl-4 [&_blockquote]:text-[#8B949E]
                       [&_code]:rounded [&_code]:bg-[#0d1117] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px]
                       [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-[#F0F4FC]
                       [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-[#E6EDF3]
                       [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6
                       [&_p]:my-3 [&_strong]:text-[#F0F4FC]
                       [&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px]
                       [&_td]:border [&_td]:border-[#30363D] [&_td]:px-3 [&_td]:py-2
                       [&_th]:border [&_th]:border-[#30363D] [&_th]:bg-[#0d1117] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </article>
        )}
      </main>

      <footer className="border-t border-[#30363D]/50 px-4 py-8 text-center text-[11px] text-[#6e7681] sm:px-8">
        <p>
          TransparênciaBR © {new Date().getFullYear()} · Dados públicos · IA pode conter erros
        </p>
        <p className="mt-2">
          <Link to="/metodologia" className="text-[#7DD3FC] hover:underline">
            Metodologia
          </Link>
          {" · "}
          <Link to="/termos" className="text-[#7DD3FC] hover:underline">
            Termos
          </Link>
          {" · "}
          <Link to="/privacidade" className="text-[#7DD3FC] hover:underline">
            Privacidade
          </Link>
          {" · "}
          <a
            href="mailto:contato@transparenciabr.com.br"
            className="text-[#7DD3FC] hover:underline"
          >
            Contato
          </a>
        </p>
      </footer>
    </div>
  );
}
