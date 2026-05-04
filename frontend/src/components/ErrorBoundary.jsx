import { Component } from "react";

/**
 * Evita tela totalmente preta quando um componente lança no render.
 * Painel claro para contrastar com o tema dark do app.
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
          backgroundColor: "#fafafa",
          backgroundImage: "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)",
          color: "#0f172a",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div
          className="mx-auto max-w-2xl rounded-2xl border-2 border-red-600 bg-white p-6 shadow-xl"
          role="alert"
        >
          <h1 className="text-xl font-bold text-red-700">Erro ao renderizar a interface</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            Recarregue a página. Se continuar, abra o console (F12) e envie o texto abaixo à equipe.
          </p>
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-mono text-sm text-red-900">
            {String(error?.message || error)}
          </p>
        </div>
        {isDev && error?.stack ? (
          <pre className="mx-auto mt-6 max-h-[45vh] max-w-2xl overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-300 bg-slate-900 p-4 font-mono text-[11px] text-slate-200">
            {error.stack}
          </pre>
        ) : null}
      </div>
    );
  }
}
