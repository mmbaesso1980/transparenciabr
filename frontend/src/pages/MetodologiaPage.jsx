import MarkdownPage from "./MarkdownPage.jsx";

export default function MetodologiaPage() {
  return (
    <MarkdownPage
      docPath="/docs/METODOLOGIA_DISCLAIMER.md"
      title="Metodologia & Disclaimer"
      description="Metodologia, scores e disclaimer legal da TransparênciaBR (AURORA Engine)."
      lead="Como calculamos scores, que dados entram no datalake (GCS) e limites legais: indicadores são computacionais, não sentença. Leia o corpo legal completo abaixo."
    />
  );
}
