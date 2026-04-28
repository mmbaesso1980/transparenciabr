/**
 * Rede demonstração — Universo de Orbes (partidos, políticos, fornecedores).
 * @returns {{ nodes: object[], links: object[] }}
 */
export function buildMockUniversoOrbes() {
  const nodes = [
    {
      id: "p-psol",
      label: "PSOL",
      tipo: "partido",
      tier: "grande",
      riskScore: 22,
      critical: false,
    },
    {
      id: "p-pl",
      label: "PL",
      tipo: "partido",
      tier: "grande",
      riskScore: 35,
      critical: false,
    },
    {
      id: "p-pt",
      label: "PT",
      tipo: "partido",
      tier: "grande",
      riskScore: 28,
      critical: false,
    },
    {
      id: "pol-220645",
      label: "Erika Hilton",
      tipo: "politico",
      tier: "medio",
      riskScore: 58,
      critical: false,
      dossieId: "220645",
    },
    {
      id: "pol-m",
      label: "Deputado · MG",
      tipo: "politico",
      tier: "medio",
      riskScore: 44,
      critical: false,
    },
    {
      id: "pol-r",
      label: "Senador · RJ",
      tipo: "politico",
      tier: "medio",
      riskScore: 72,
      critical: false,
    },
    {
      id: "forn-com",
      label: "COMUNICAÇÃO XYZ LTDA",
      tipo: "fornecedor",
      tier: "pequeno",
      riskScore: 81,
      critical: true,
    },
    {
      id: "forn-loc",
      label: "LOCAÇÃO VEÍCULOS S.A.",
      tipo: "fornecedor",
      tier: "pequeno",
      riskScore: 76,
      critical: true,
    },
    {
      id: "forn-pass",
      label: "PASSAGENS AÉREAS — PACOTE",
      tipo: "fornecedor",
      tier: "pequeno",
      riskScore: 48,
      critical: false,
    },
    {
      id: "forn-cons",
      label: "CONSULTORIA GENÉRICA ME",
      tipo: "fornecedor",
      tier: "pequeno",
      riskScore: 92,
      critical: true,
    },
  ];

  const links = [
    { source: "pol-220645", target: "p-psol", risk: 24 },
    { source: "pol-m", target: "p-pt", risk: 30 },
    { source: "pol-r", target: "p-pl", risk: 38 },
    { source: "forn-com", target: "pol-220645", risk: 88 },
    { source: "forn-loc", target: "pol-220645", risk: 79 },
    { source: "forn-pass", target: "pol-r", risk: 42 },
    { source: "forn-cons", target: "pol-m", risk: 95 },
    { source: "forn-loc", target: "pol-r", risk: 71 },
  ];

  return { nodes, links };
}
