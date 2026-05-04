/**
 * Mock realista de leads previdenciários alinhado ao ICP REAL do
 * Carpes (matriz "Tickets de ação 2026 × Perfil do Cliente IDEAL").
 *
 * Foco operacional 04/05/2026: PCD (LC 142/2013) — "hoje é ouro" — Valinhos.
 *
 * Substituível por hook BQ assim que o pipeline INSS terminar:
 *   transparenciabr.tbr_inss.beneficios_indeferidos
 * + enriquecimento Syslint (CPF → telefone, email, empresa, Serasa, endereço).
 *
 * Funil ideal (Carpes 04/05 11:15):
 *   1. acha leads → 2. checa CPF no TRF3 (litispendência) → se sim, DESCARTA
 *   3. enriquece com Serasa+contato → 4. ataca por ligação/MKT/visita
 */

// ============================================================
// 11 TICKETS DE AÇÃO 2026 (matriz ICP — imagem do Carpes)
// ============================================================
export const TIPOS_ACAO = [
  {
    id: "revisao",
    grupo: "Revisão",
    label: "Revisão de aposentadoria",
    icp: "Aposentados há menos de 8 anos",
    ticket_min: 3000, ticket_max: 10000,
    foco_atual: false,
  },
  {
    id: "planejamento",
    grupo: "Planejamento",
    label: "Planejamento previdenciário",
    icp: "Homens/mulheres acima de 50 anos + 25 anos de trabalho ou pagamento INSS",
    ticket_min: 2000, ticket_max: 6000,
    foco_atual: false,
  },
  {
    id: "especial",
    grupo: "Aposentadorias",
    label: "Aposentadoria especial (insalubridade)",
    icp: "Trabalharam mais de 20 anos em situações insalubres / periculosas",
    ticket_min: 8000, ticket_max: 30000,
    foco_atual: false,
  },
  {
    id: "tempo_contribuicao",
    grupo: "Aposentadorias",
    label: "Por tempo de contribuição/trabalho",
    icp: "Homens 34-35 anos · Mulheres 29-30 anos (foco regras de transição: pedágio 50%, 100%, pontos)",
    ticket_min: 4000, ticket_max: 12000,
    foco_atual: false,
  },
  {
    id: "idade",
    grupo: "Aposentadorias",
    label: "Por idade",
    icp: "Homens 65 / Mulheres 62 + carência mínima de 15 anos contribuição",
    ticket_min: 3000, ticket_max: 8000,
    foco_atual: false,
  },
  {
    id: "rural",
    grupo: "Aposentadorias",
    label: "Rural",
    icp: "Homens 60+ · Mulheres 55+ · 15 anos trabalho rural em regime familiar",
    ticket_min: 5000, ticket_max: 15000,
    foco_atual: false,
  },
  {
    id: "hibrida",
    grupo: "Aposentadorias",
    label: "Híbrida (Rural + Urbana)",
    icp: "Atingiu idade (65H/62M), <15 anos CTPS, mas trabalhou na roça na infância/juventude",
    ticket_min: 4000, ticket_max: 10000,
    foco_atual: false,
  },
  {
    id: "pcd_idade",
    grupo: "PCD (LC 142/2013) ⭐",
    label: "Deficiência por idade",
    icp: "Mulheres 50-55 · Homens 55-60 · 15-30 anos CLT · histórico longo com deficiência (visão monocular = ouro)",
    ticket_min: 12000, ticket_max: 30000,
    foco_atual: true,
    nota: "Visão monocular: lei classifica como deficiência, comprovação simples, público amplo que não sabe que tem direito",
  },
  {
    id: "pcd_tempo",
    grupo: "PCD (LC 142/2013) ⭐",
    label: "Deficiência por tempo de contribuição",
    icp: "Homens 25-33 anos contrib · Mulheres 20-28 anos (tempo varia: grave/moderada/leve)",
    ticket_min: 10000, ticket_max: 28000,
    foco_atual: true,
    nota: "Foco em leads com laudos antigos da condição",
  },
  {
    id: "bit",
    grupo: "Benefícios por Incapacidade",
    label: "BIT — Auxílio-doença",
    icp: "Trabalhadores afastados >15 dias por doença/acidente/cirurgia. Qualidade segurado + 12 meses carência",
    ticket_min: 2000, ticket_max: 8000,
    foco_atual: false,
  },
  {
    id: "bip",
    grupo: "Benefícios por Incapacidade",
    label: "BIP — Aposentadoria por invalidez",
    icp: "Segurados com laudos médicos robustos · incapacidade total e definitiva · sem reabilitação possível",
    ticket_min: 5000, ticket_max: 18000,
    foco_atual: false,
  },
  {
    id: "aa",
    grupo: "Benefícios por Incapacidade",
    label: "AA — Auxílio-acidente",
    icp: "Sofreram acidente (qualquer natureza), recuperaram, voltaram a trabalhar com sequelas. Não pode ser MEI",
    ticket_min: 3000, ticket_max: 10000,
    foco_atual: false,
  },
  {
    id: "pm",
    grupo: "Pensão",
    label: "Pensão por Morte (PM)",
    icp: "Viúvos(as), companheiros(as), filhos <21 ou com deficiência de segurados falecidos",
    ticket_min: 4000, ticket_max: 15000,
    foco_atual: false,
  },
  {
    id: "bpc_idoso",
    grupo: "BPC/LOAS",
    label: "BPC/LOAS — Idoso",
    icp: "65+ anos sem contribuição INSS · vulnerabilidade · renda <1/4 SM · CadÚnico",
    ticket_min: 2000, ticket_max: 6000,
    foco_atual: false,
  },
  {
    id: "bpc_def",
    grupo: "BPC/LOAS ⭐",
    label: "BPC/LOAS — Deficiência",
    icp: "Qualquer idade (inclusive crianças) com deficiência/impedimentos longo prazo · vulnerabilidade · CadÚnico",
    ticket_min: 3000, ticket_max: 10000,
    foco_atual: true,
  },
];

// ============================================================
// MUNICÍPIOS — foco operacional Trilho 1 (Valinhos + raio 25km)
// ============================================================
const MUNICIPIOS = [
  { nome: "Valinhos", uf: "SP", peso: 8 },           // ⭐ Foco principal
  { nome: "Vinhedo", uf: "SP", peso: 4 },            // raio 25km
  { nome: "Itatiba", uf: "SP", peso: 4 },            // raio 25km
  { nome: "Louveira", uf: "SP", peso: 3 },           // raio 25km
  { nome: "Campinas", uf: "SP", peso: 4 },           // zona sul Campinas
  { nome: "Pirassununga", uf: "SP", peso: 5 },       // base Carpes
  { nome: "Limeira", uf: "SP", peso: 2 },
  { nome: "Rio Claro", uf: "SP", peso: 2 },
  { nome: "Araras", uf: "SP", peso: 2 },
  { nome: "Leme", uf: "SP", peso: 1 },
];

// ============================================================
// LITISPENDÊNCIA TRF3 — status mock (será real via PJe token Carpes)
// ============================================================
const LITISPENDENCIA_STATUS = [
  { codigo: "LIVRE", label: "Livre", peso: 70, cor: "emerald" },        // 70% sem ação
  { codigo: "VERIFICAR", label: "Verificar", peso: 22, cor: "amber" },  // 22% suspeitos
  { codigo: "DESCARTAR", label: "Descartar", peso: 8, cor: "red" },     // 8% com ação ativa
];

// ============================================================
// Pools de nomes / sobrenomes
// ============================================================
const NOMES = [
  "Maria","José","Antônio","João","Francisco","Ana","Luiz","Paulo","Carlos","Manoel",
  "Pedro","Marcos","Raimundo","Sebastião","Antonia","Marcelo","Rafael","Daniel",
  "Bruno","Eduardo","Felipe","Gustavo","Henrique","Igor","Júlio","Lucas","Mateus",
  "Nelson","Otávio","Patrícia","Renata","Sandra","Teresa","Valéria","Wagner",
  "Adriana","Beatriz","Cláudia","Débora","Eliane","Fernanda","Gabriela","Heloísa","Isabel",
  "Joana","Karina","Letícia","Mônica","Natália","Olívia","Priscila","Roberta","Silvana",
  "Vanessa","Yara","Zilda","Augusto","Benedito","Cláudio","Diego","Edson","Fábio",
];
const SOBRENOMES = [
  "Silva","Santos","Oliveira","Souza","Rodrigues","Ferreira","Alves","Pereira","Lima",
  "Gomes","Costa","Ribeiro","Martins","Carvalho","Almeida","Lopes","Soares","Fernandes",
  "Vieira","Barbosa","Rocha","Dias","Nunes","Marques","Cardoso","Reis","Araújo","Mendes",
];

const EMPRESAS_POOL = [
  "Metalúrgica Vale Verde Ltda","Hospital São Vicente","Fábrica Têxtil Itatiba",
  "Construtora Spiandorelli","Oficina Mecânica Vinhedo","Frigorífico Campinas",
  "Cerâmica Louveira","Posto Ipiranga Rod. Anhanguera","Padaria Pão Dourado",
  "Indústria Química ProQuim","Transportadora Rota Verde","Confecção Stilo Mulher",
  "Gráfica Print Master","Mercado Bom Preço","Distribuidora de Bebidas Sul",
  "Construções Itamarati","Sítio Esperança (rural)","Fazenda Boa Vista (rural)",
  "Aposentado(a) — sem vínculo ativo","Autônomo registrado",
];

const CONDICOES_PCD = [
  "Visão monocular (CID H54.4)",
  "Deficiência auditiva parcial bilateral",
  "Mobilidade reduzida — sequela de AVC",
  "Deficiência intelectual leve",
  "Deficiência motora moderada",
  "Cadeirante (lesão medular)",
  "Cegueira total (CID H54.0)",
  "Surdez profunda bilateral",
  "Amputação de membro inferior",
  "Esclerose múltipla",
  "Distrofia muscular",
  "TEA — Transtorno do Espectro Autista",
];

// ============================================================
// PRNG determinístico (Mulberry32)
// ============================================================
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(arr, rand) {
  return arr[Math.floor(rand() * arr.length)];
}

function pickWeighted(arr, rand) {
  const total = arr.reduce((s, x) => s + (x.peso || 1), 0);
  let r = rand() * total;
  for (const x of arr) {
    r -= (x.peso || 1);
    if (r <= 0) return x;
  }
  return arr[0];
}

function fmtCPF(rand) {
  const digits = Array.from({ length: 9 }, () => Math.floor(rand() * 10));
  const d1 = Math.floor(rand() * 10);
  const d2 = Math.floor(rand() * 10);
  return `${digits.slice(0,3).join("")}.${digits.slice(3,6).join("")}.${digits.slice(6,9).join("")}-${d1}${d2}`;
}
function maskCPF(cpf) {
  return cpf.replace(/^(\d{3})\.\d{3}\.\d{3}-(\d{2})$/, "$1.***.***-$2");
}

function fmtTelefone(rand) {
  const ddd = pick([19, 11, 13, 12, 15, 17], rand);
  const d1 = 9;
  const d2 = Math.floor(rand() * 10);
  const rest = Array.from({ length: 7 }, () => Math.floor(rand() * 10)).join("");
  return `(${ddd}) ${d1}${d2}${rest.slice(0,3)}-${rest.slice(3)}`;
}
function maskTelefone(tel) {
  return tel.replace(/(\(\d{2}\)\s\d)\d{3}(-\d{4})/, "$1****$2");
}

function fmtSerasa(rand) {
  // Mock simples — 30% bom (700+), 50% regular (500-700), 20% ruim (<500)
  const r = rand();
  if (r < 0.3) return { score: 700 + Math.floor(rand() * 300), faixa: "Bom" };
  if (r < 0.8) return { score: 500 + Math.floor(rand() * 200), faixa: "Regular" };
  return { score: 300 + Math.floor(rand() * 200), faixa: "Ruim" };
}

function fmtEndereco(municipio, rand) {
  const ruas = ["Rua das Palmeiras","Av. Brasil","Rua XV de Novembro","Rua São José",
                "Av. Independência","Rua Marechal Deodoro","Rua Sete de Setembro","Av. Paulista"];
  const num = 50 + Math.floor(rand() * 1500);
  return `${pick(ruas, rand)}, ${num} · ${municipio.nome}/${municipio.uf}`;
}

function fmtEmail(nome, rand) {
  const provs = ["gmail.com","hotmail.com","outlook.com","yahoo.com.br","uol.com.br"];
  const slug = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z]/g,"").slice(0, 12);
  return `${slug}${Math.floor(rand() * 99)}@${pick(provs, rand)}`;
}

// ============================================================
// Geração de leads — distribuição por TICKET DE AÇÃO
// ============================================================
// Distribuição de quantos leads por ticket (priorizando PCD = "ouro")
const DISTRIBUICAO_LEADS = {
  pcd_idade: 380,        // ⭐ FOCO 04/05
  pcd_tempo: 320,        // ⭐ FOCO 04/05
  bpc_def: 240,          // ⭐ FOCO 04/05
  rural: 220,
  hibrida: 180,
  especial: 150,
  tempo_contribuicao: 130,
  idade: 120,
  revisao: 90,
  bit: 60,
  bip: 40,
  pm: 35,
  aa: 20,
  bpc_idoso: 10,
  planejamento: 5,
};

function generateLeads(seed = 42) {
  const rand = mulberry32(seed);
  const out = [];
  let id = 0;

  for (const tipoId of Object.keys(DISTRIBUICAO_LEADS)) {
    const tipo = TIPOS_ACAO.find((t) => t.id === tipoId);
    if (!tipo) continue;
    const n = DISTRIBUICAO_LEADS[tipoId];

    for (let i = 0; i < n; i++) {
      id++;
      const municipio = pickWeighted(MUNICIPIOS, rand);
      const nomeCompleto = `${pick(NOMES, rand)} ${pick(SOBRENOMES, rand)} ${pick(SOBRENOMES, rand)}`;
      const cpf = fmtCPF(rand);
      const telefone = fmtTelefone(rand);
      const serasa = fmtSerasa(rand);

      // Idade alinhada ao ICP de cada ticket
      let idade;
      if (tipoId === "revisao") idade = 60 + Math.floor(rand() * 20);
      else if (tipoId === "planejamento") idade = 50 + Math.floor(rand() * 12);
      else if (tipoId === "especial") idade = 45 + Math.floor(rand() * 15);
      else if (tipoId === "tempo_contribuicao") idade = 53 + Math.floor(rand() * 10);
      else if (tipoId === "idade") idade = 62 + Math.floor(rand() * 10);
      else if (tipoId === "rural") idade = 55 + Math.floor(rand() * 18);
      else if (tipoId === "hibrida") idade = 58 + Math.floor(rand() * 12);
      else if (tipoId === "pcd_idade") idade = 50 + Math.floor(rand() * 12);
      else if (tipoId === "pcd_tempo") idade = 43 + Math.floor(rand() * 17);
      else if (tipoId === "bit") idade = 30 + Math.floor(rand() * 30);
      else if (tipoId === "bip") idade = 40 + Math.floor(rand() * 25);
      else if (tipoId === "aa") idade = 35 + Math.floor(rand() * 25);
      else if (tipoId === "pm") idade = 35 + Math.floor(rand() * 35);
      else if (tipoId === "bpc_idoso") idade = 65 + Math.floor(rand() * 20);
      else if (tipoId === "bpc_def") idade = 18 + Math.floor(rand() * 60);
      else idade = 45 + Math.floor(rand() * 25);

      // Tempo de contribuição
      let tempoContrib;
      if (["bpc_idoso","bpc_def"].includes(tipoId)) tempoContrib = 0;
      else if (tipoId === "rural") tempoContrib = 0; // rural não usa contrib
      else tempoContrib = Math.max(0, Math.min(idade - 18, 15 + Math.floor(rand() * 25)));

      // Litispendência — distribuição ponderada
      const litisp = pickWeighted(LITISPENDENCIA_STATUS, rand);

      // Score de match com ICP (0-100)
      let score = 60 + Math.floor(rand() * 25);
      if (tipo.foco_atual) score += 10;                                            // PCD/BPC bonus
      if (municipio.nome === "Valinhos" || municipio.nome === "Pirassununga") score += 5;
      if (litisp.codigo === "LIVRE") score += 5;
      if (litisp.codigo === "DESCARTAR") score -= 30;
      score = Math.max(0, Math.min(99, score));

      // Ticket estimado (com variação)
      const ticket = tipo.ticket_min + Math.floor(rand() * (tipo.ticket_max - tipo.ticket_min));

      // PCD: condição específica
      const condicaoPcd = ["pcd_idade","pcd_tempo","bpc_def"].includes(tipoId)
        ? pick(CONDICOES_PCD, rand)
        : null;

      // Empresa atual (proxy de CTPS)
      const empresa = pick(EMPRESAS_POOL, rand);

      out.push({
        id: `lead_${id}`,
        // Identificação
        nome: nomeCompleto,
        cpf,
        cpf_mascarado: maskCPF(cpf),
        idade,
        // Contato (Syslint)
        telefone,
        telefone_mascarado: maskTelefone(telefone),
        email: fmtEmail(nomeCompleto, rand),
        endereco: fmtEndereco(municipio, rand),
        // Localização
        municipio: municipio.nome,
        uf: municipio.uf,
        // Vínculo
        empresa_atual: empresa,
        tempo_contribuicao_anos: tempoContrib,
        // Ticket de ação
        tipo_acao_id: tipo.id,
        tipo_acao_label: tipo.label,
        tipo_acao_grupo: tipo.grupo,
        tipo_acao_icp: tipo.icp,
        foco_atual: tipo.foco_atual,
        // Condição (se PCD/BPC def)
        condicao_pcd: condicaoPcd,
        // Serasa
        serasa_score: serasa.score,
        serasa_faixa: serasa.faixa,
        // Litispendência TRF3
        litispendencia_status: litisp.codigo,
        litispendencia_label: litisp.label,
        litispendencia_cor: litisp.cor,
        // Score do match com ICP
        score_match_icp: score,
        prob_conversao:
          score >= 90 ? "alta" :
          score >= 75 ? "média" : "moderada",
        // Ticket
        ticket_estimado_brl: ticket,
        // Tese / abordagem
        tese_recomendada: gerarTese(tipo.id, condicaoPcd),
        proxima_acao:
          litisp.codigo === "DESCARTAR" ? "Descartar — litispendência ativa" :
          litisp.codigo === "VERIFICAR" ? "Validar PJe TRF3 antes de contato" :
          score >= 85 ? "Ligar HOJE — alta conversão" :
          score >= 70 ? "Campanha WhatsApp + qualificação 5 perguntas" :
          "Lista nutrição (e-mail mensal)",
      });
    }
  }

  // Ordena por score desc
  out.sort((a, b) => b.score_match_icp - a.score_match_icp);
  return out;
}

function gerarTese(tipoId, condicao) {
  switch (tipoId) {
    case "revisao":
      return "Revisão da vida toda + tetos pré-1991 (STF Tema 1102) + ações revisionais com base em CNIS retificado.";
    case "planejamento":
      return "Análise prospectiva: simulação por regra de transição, escolha do melhor enquadramento e timing de DER.";
    case "especial":
      return "Reconhecimento de tempo especial via PPP + LTCAT + perícia técnica. Conversão integral pré-2019.";
    case "tempo_contribuicao":
      return "Pedágio 50% / 100% / sistema de pontos — escolha cirúrgica. CNIS retificado + TSV reconhecidos.";
    case "idade":
      return "Aposentadoria por idade urbana — ajuste fino na carência (15 anos) + revisão de salários de contribuição.";
    case "rural":
      return "Justificação administrativa + testemunhas + retificação CNIS rural. CTPS rural quando houver.";
    case "hibrida":
      return "Tempo rural infância/juventude + tempo urbano CTPS = aposentadoria híbrida (TST/STJ pacificado).";
    case "pcd_idade":
      return condicao
        ? `Aposentadoria PCD por idade (LC 142/2013) — ${condicao}. Comprovação simples, ticket alto.`
        : "Aposentadoria PCD por idade — LC 142/2013. Mulher 55 / Homem 60 + 15 anos contrib como PCD.";
    case "pcd_tempo":
      return condicao
        ? `Aposentadoria PCD por tempo (LC 142/2013) — ${condicao}. Tempo varia: grave/moderada/leve.`
        : "Aposentadoria PCD por tempo de contribuição — perícia médica administrativa + laudos antigos.";
    case "bit":
      return "Auxílio-doença (B31) — laudo + perícia administrativa. Recurso INSS se negado, JEF em 90 dias.";
    case "bip":
      return "Aposentadoria por invalidez (B32) — laudo robusto + impossibilidade de reabilitação. Prova testemunhal.";
    case "aa":
      return "Auxílio-acidente (B91) — sequela + nexo causal + redução capacidade laborativa. Pode acumular com salário.";
    case "pm":
      return "Pensão por morte — qualidade segurado do falecido + dependência econômica. Cota individual permanente.";
    case "bpc_idoso":
      return "BPC/LOAS Idoso — 65+, renda per capita ≤1/4 SM (R$ 379,50 em 2025), CadÚnico atualizado.";
    case "bpc_def":
      return condicao
        ? `BPC/LOAS Deficiência — ${condicao}. Vulnerabilidade + impedimento de longo prazo (>2 anos).`
        : "BPC/LOAS Deficiência — qualquer idade, deficiência + vulnerabilidade socioeconômica.";
    default:
      return "Análise individual recomendada — consulta inicial gratuita.";
  }
}

// ============================================================
// Cache lazy + KPIs derivados
// ============================================================
let _cache = null;
export function getQualifiedLeads() {
  if (!_cache) _cache = generateLeads(42);
  return _cache;
}

function calcKpis() {
  const leads = getQualifiedLeads();
  const totalQualificados = leads.length;
  const livres = leads.filter((l) => l.litispendencia_status === "LIVRE").length;
  const descartar = leads.filter((l) => l.litispendencia_status === "DESCARTAR").length;
  const verificar = leads.filter((l) => l.litispendencia_status === "VERIFICAR").length;
  const altoMatch = leads.filter((l) => l.score_match_icp >= 85).length;
  const focoPcd = leads.filter((l) => l.foco_atual).length;
  const ticketMedio = Math.round(leads.reduce((s, l) => s + l.ticket_estimado_brl, 0) / totalQualificados);
  const receitaPotencial = leads
    .filter((l) => l.litispendencia_status !== "DESCARTAR")
    .reduce((s, l) => s + l.ticket_estimado_brl, 0);

  // Por ticket de ação
  const porTipo = {};
  for (const t of TIPOS_ACAO) porTipo[t.id] = 0;
  for (const l of leads) porTipo[l.tipo_acao_id] = (porTipo[l.tipo_acao_id] || 0) + 1;

  return {
    total_pool: 9_642_108,                 // pool bruto INSS 2025 (real)
    qualificados: totalQualificados,
    livres,
    verificar,
    descartar,
    alto_match_icp: altoMatch,
    foco_pcd: focoPcd,
    ticket_medio: ticketMedio,
    receita_potencial: receitaPotencial,
    municipios_foco: ["Valinhos", "Pirassununga"],
    fonte_enriquecimento: "Syslint (CPF → telefone, e-mail, empresa, Serasa, endereço)",
    fonte_litispendencia: "PJe TRF3 — token Carpes (a integrar)",
    ultima_atualizacao: "04/05/2026 12:10",
    por_tipo: porTipo,
  };
}

let _kpisCache = null;
export function getLeadsKpis() {
  if (!_kpisCache) _kpisCache = calcKpis();
  return _kpisCache;
}

// Exports legados (compat)
export const LEADS_KPIS = new Proxy({}, {
  get(_t, k) { return getLeadsKpis()[k]; }
});

export const FILTROS_DISPONIVEIS = {
  municipios: MUNICIPIOS.map((m) => m.nome),
  tipos_acao: TIPOS_ACAO,
  litispendencia: LITISPENDENCIA_STATUS,
  faixas_score: [
    { label: "Alta (85+)", min: 85, max: 100 },
    { label: "Média (70-84)", min: 70, max: 84 },
    { label: "Moderada (<70)", min: 0, max: 69 },
  ],
  faixas_serasa: [
    { label: "Bom (700+)", min: 700, max: 1000 },
    { label: "Regular (500-699)", min: 500, max: 699 },
    { label: "Ruim (<500)", min: 0, max: 499 },
  ],
};
