/**
 * Espelho frontend da Legião 100 — alinhado com `manus_office/agent_registry.py`.
 *
 * 10 crews originais × 10 agentes + 11ª crew especializada (Dossiê Forense v1.0) + Maestro.
 *
 * Quando o backend reportar status agent-by-agent em Firestore (`dossies_v1/{slug}.agents`),
 * a chave usada é `${crew.id}-${agent.shortId}` (ex.: `crew-dossie-forense-v1-identificacao`)
 * ou para as 10 crews originais `${crew.id}-a01..a10`.
 */

export const TOTENS = ["🐺", "🦉", "🦅", "🐉", "⚡", "🔮", "🛡️", "⚔️", "🗡️", "🏹"];

const CREW_TEMPLATES = [
  ["crew-forense", "Forense & CEAP", "🔬", "Auditoria de notas, Benford, fornecedores e risco CEAP."],
  ["crew-emendas", "Emendas & PIX", "💸", "Rastreio de emendas, beneficiários terminais e anomalias de repasse."],
  ["crew-pncp", "Contratos PNCP", "📑", "Dispensas, sobrepreço e vencedores recorrentes."],
  ["crew-patrimonio", "Patrimônio TSE", "🏛️", "Evolução patrimonial e outliers entre mandatos."],
  ["crew-gabinete", "Gabinete & Vínculos", "👥", "Parentesco, sócios e folha do gabinete."],
  ["crew-viagens", "Viagens & Pedágios", "🛣️", "Geolocalização de passagens e padrões anômalos."],
  ["crew-osint", "OSINT & Mídia", "📡", "Coleta aberta e cruzamento com registro oficial."],
  ["crew-risco", "Risco & Score", "⚠️", "Modelagem de risco e priorização de alvos."],
  ["crew-dossie", "Dossiê Executivo", "📋", "Consolidação narrativa e citação de fontes."],
  ["crew-deploy", "Engenharia & Entrega", "🛠️", "Especificação técnica e entrega de artefactos."],
];

const FORENSIC_V1_AGENTS = [
  ["identificacao", "Identificação", "TSE + Câmara API + perfis sociais."],
  ["ceap_anomalias", "CEAP Anomalias", "Portal Câmara CEAP + Benford + Z-score."],
  ["emendas", "Emendas", "Portal Transparência emendas autoria/pagamento."],
  ["judicial", "Judicial", "TRF/STF/PJe consulta processos."],
  ["eixo5_empresas", "Empresas (Eixo 5)", "CNPJs exclusivos + cruzamento sócios + Direct Data."],
  ["osint", "OSINT", "Sherlock + Wayback + dorks."],
  ["contraditorio", "Contraditório", "Manifestações públicas (CNN/Folha/UOL/Instagram)."],
  ["falso_positivo", "Falso Positivo", "Google Scholar + Lattes + LinkedIn anti-imputação."],
  ["fonte_primaria", "Fonte Primária", "Normalizador fonte primária citável."],
  ["decisao_judicial", "Decisão Judicial", "Watcher TRF/STF/PJe decisões novas."],
];

function buildLegacyCrews() {
  return CREW_TEMPLATES.map(([id, nome, emoji, missao]) => ({
    id,
    nome,
    emoji,
    missao,
    forensic: false,
    agentes: Array.from({ length: 10 }, (_, idx) => {
      const i = idx + 1;
      const totem = TOTENS[idx % TOTENS.length];
      return {
        id: `${id}-a${String(i).padStart(2, "0")}`,
        shortId: `a${String(i).padStart(2, "0")}`,
        nome: `${nome.split(" ")[0]} · Operador ${String(i).padStart(2, "0")}`,
        avatar: totem,
        papel: `Operador ${i} da crew «${nome}». Foco: ${missao}`,
      };
    }),
  }));
}

function buildForensicV1Crew() {
  return {
    id: "crew-dossie-forense-v1",
    nome: "Dossiê Forense v1.0",
    emoji: "🧬",
    missao: "Pipeline de 10 agentes especializados nos eixos da skill v1.0.",
    forensic: true,
    agentes: FORENSIC_V1_AGENTS.map(([shortId, nome, papel], idx) => ({
      id: `crew-dossie-forense-v1-${shortId}`,
      shortId,
      nome,
      avatar: TOTENS[idx % TOTENS.length],
      papel,
    })),
  };
}

export const CREWS = [...buildLegacyCrews(), buildForensicV1Crew()];

export const MAESTRO = {
  id: "maestro-001",
  nome: "Maestro Supremo",
  avatar: "🎖️",
  papel:
    "Comandante da legião — coordena as 11 crews, valida tom INFORMATIVO, garante 40–55 findings e consolida o dossiê final.",
};

export function totalAgentes() {
  return CREWS.reduce((acc, c) => acc + c.agentes.length, 0);
}
