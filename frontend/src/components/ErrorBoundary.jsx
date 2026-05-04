import { Component } from "react";

/**
 * Evita tela totalmente preta quando um componente lança no render.
 * Mostra mensagem mínima + stack em dev.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary:", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isDev = Boolean(import.meta.env?.DEV);

    return (
      <div
        className="min-h-dvh px-6 py-10"
        style={{
          background: "linear-gradient(165deg, #050d18 0%, #0a1628 100%)",
          color: "#e2e8f0",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <h1 className="text-lg font-semibold text-white">Algo falhou ao renderizar</h1>
        <p className="mt-2 max-w-xl text-sm text-slate-400">
          Recarregue a página. Se o problema continuar, abra o console do navegador (F12) e envie o
          erro à equipe.
        </p>
        <p className="mt-4 rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-amber-200/95">
          {String(error?.message || error)}
        </p>
        {isDev && error?.stack ? (
          <pre className="mt-4 max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[10px] text-slate-400">
            {error.stack}
          </pre>
        ) : null}
      </div>
    );
  }
}
