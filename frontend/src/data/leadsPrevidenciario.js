/**
 * Mock realista de leads previdenciários — Operação Trilho 1.
 * Substituível por hook que puxa BQ (transparenciabr.tbr_inss.beneficios_indeferidos)
 * assim que o pipeline INSS terminar de carregar.
 *
 * Dados gerados deterministicamente (mesmo seed → mesmo resultado).
 */

const NOMES_BR = [
  "Maria","José","Antônio","João","Francisco","Ana","Luiz","Paulo","Carlos","Manoel",
  "Pedro","Marcos","Raimundo","Sebastião","Antonia","Marcelo","Rafael","Daniel","Marcos",
  "Bruno","Eduardo","Felipe","Gustavo","Henrique","Igor","Júlio","Lucas","Mateus",
  "Nelson","Otávio","Patrícia","Renata","Sandra","Teresa","Valéria","Wagner","Xênia",
  "Adriana","Beatriz","Cláudia","Débora","Eliane","Fernanda","Gabriela","Heloísa","Isabel",
  "Joana","Karina","Letícia","Mônica","Natália","Olívia","Priscila","Roberta","Silvana",
];
const SOBRENOMES_BR = [
  "Silva","Santos","Oliveira","Souza","Rodrigues","Ferreira","Alves","Pereira","Lima",
  "Gomes","Costa","Ribeiro","Martins","Carvalho","Almeida","Lopes","Soares","Fernandes",
  "Vieira","Barbosa","Rocha","Dias","Nunes","Marques","Cardoso","Reis","Araújo","Mendes",
];

const MOTIVOS_INDEFERIMENTO = [
  { codigo: "M19", descricao: "Falta de qualidade de segurado" },
  { codigo: "M22", descricao: "Falta de carência" },
  { codigo: "M30", descricao: "Não comprovação de incapacidade laborativa" },
  { codigo: "M41", descricao: "Não comprovação do tempo de contribuição" },
  { codigo: "M55", descricao: "Idade insuficiente" },
  { codigo: "M71", descricao: "Atividade rural não comprovada" },
  { codigo: "M88", descricao: "Vínculo trabalhista não reconhecido" },
];

const ESPECIES_BENEFICIO = [
  { codigo: "B31", nome: "Auxílio-Doença" },
  { codigo: "B32", nome: "Aposentadoria por Invalidez" },
  { codigo: "B41", nome: "Aposentadoria por Idade" },
  { codigo: "B42", nome: "Aposentadoria por Tempo de Contribuição" },
  { codigo: "B87", nome: "BPC/LOAS" },
  { codigo: "B91", nome: "Auxílio-Acidente" },
];

const MUNICIPIOS_TRILHO_1 = [
  { nome: "Pirassununga", uf: "SP", peso: 5 },
  { nome: "Valinhos", uf: "SP", peso: 5 },
  { nome: "Campinas", uf: "SP", peso: 3 },
  { nome: "Limeira", uf: "SP", peso: 2 },
  { nome: "Rio Claro", uf: "SP", peso: 2 },
  { nome: "Araras", uf: "SP", peso: 2 },
  { nome: "Leme", uf: "SP", peso: 1 },
  { nome: "Vinhedo", uf: "SP", peso: 1 },
];

// PRNG determinístico — Mulberry32
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

function genCPF(rand) {
  const n = Array.from({ length: 9 }, () => Math.floor(rand() * 10));
  // CPF mock — não calcula DV real, só formato visual.
  return `${n.slice(0,3).join("")}.${n.slice(3,6).join("")}.${n.slice(6,9).join("")}-${Math.floor(rand()*100).toString().padStart(2,"0")}`;
}

function maskCPF(cpf) {
  // Mascarar para LGPD — mostra só primeiros 3 + últimos 2: 123.***.***-45
  return cpf.replace(/^(\d{3})\.\d{3}\.\d{3}-(\d{2})$/, "$1.***.***-$2");
}

function genNomeCompleto(rand) {
  return `${pick(NOMES_BR, rand)} ${pick(SOBRENOMES_BR, rand)} ${pick(SOBRENOMES_BR, rand)}`;
}

function genDataIndeferimento(rand) {
  // Distribui ao longo de 2025
  const meses = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const m = Math.floor(rand() * 12);
  const d = 1 + Math.floor(rand() * 28);
  return { mes: meses[m], dia: d, ano: 2025, ts: new Date(2025, m, d).getTime() };
}

/**
 * Gera N leads qualificados (score >= 70).
 * Score combina: prazo desde indeferimento, motivo recorrível, idade >55, valor relevante.
 */
function generateQualified(n = 2000, seed = 42) {
  const rand = mulberry32(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const municipio = pickWeighted(MUNICIPIOS_TRILHO_1, rand);
    const motivo = pick(MOTIVOS_INDEFERIMENTO, rand);
    const especie = pick(ESPECIES_BENEFICIO, rand);
    const data = genDataIndeferimento(rand);
    const idade = 35 + Math.floor(rand() * 45); // 35-80
    const valor = 1320 + Math.floor(rand() * 8000); // R$ 1.320 (salário mínimo) a R$ 9.320
    const meses_atras = (Date.now() - data.ts) / (1000 * 60 * 60 * 24 * 30);

    // Score 70-99 para qualificados
    let score = 70;
    if (motivo.codigo === "M30" || motivo.codigo === "M41") score += 10; // recorríveis
    if (idade >= 55) score += 5;
    if (meses_atras < 6) score += 7; // prazo prescricional ainda longo
    if (valor > 3000) score += 4;
    if (municipio.nome === "Pirassununga" || municipio.nome === "Valinhos") score += 3;
    score = Math.min(99, Math.round(score + rand() * 5));

    const cpf = genCPF(rand);
    out.push({
      id: `lead_${i + 1}`,
      protocolo: `${(2025_000_000 + i * 137 + Math.floor(rand() * 1000)).toString()}`,
      nome: genNomeCompleto(rand),
      cpf_mascarado: maskCPF(cpf),
      idade,
      municipio: municipio.nome,
      uf: municipio.uf,
      especie_codigo: especie.codigo,
      especie_nome: especie.nome,
      motivo_codigo: motivo.codigo,
      motivo_descricao: motivo.descricao,
      data_indeferimento: `${String(data.dia).padStart(2,"0")}/${String(new Date(2025, ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"].indexOf(data.mes), 1).getMonth()+1).padStart(2,"0")}/2025`,
      data_ts: data.ts,
      meses_desde_indeferimento: Math.round(meses_atras * 10) / 10,
      valor_estimado_beneficio: valor,
      score_qualificacao: score,
      probabilidade_revisao: score >= 90 ? "alta" : score >= 80 ? "média" : "moderada",
      tese_recomendada:
        motivo.codigo === "M30" ? "Perícia médica judicial + laudo particular complementar" :
        motivo.codigo === "M41" ? "Justificação administrativa de tempo + CTPS rural" :
        motivo.codigo === "M22" ? "Reconhecimento de vínculo via CNIS retificado" :
        motivo.codigo === "M19" ? "Ação de manutenção de qualidade segurado por desemprego" :
        motivo.codigo === "M55" ? "Conversão por tempo especial (aposentadoria especial)" :
        motivo.codigo === "M71" ? "Reconhecimento atividade rural por testemunhas + CNIS rural" :
        "Reconhecimento vínculo informal por documentos auxiliares",
    });
  }
  // Ordena por score desc
  out.sort((a, b) => b.score_qualificacao - a.score_qualificacao);
  return out;
}

// Exporta lazy para evitar congelar no boot
let _cache = null;
export function getQualifiedLeads() {
  if (!_cache) _cache = generateQualified(2000, 42);
  return _cache;
}

export const LEADS_KPIS = {
  total_pool: 9_642_108, // 9,6M leads brutos no INSS
  qualificados: 2000,
  alta_probabilidade: 612,
  media_probabilidade: 858,
  moderada_probabilidade: 530,
  ticket_medio_estimado: 4280,
  receita_potencial_setup: 2000 * 12000, // R$ 24M se todos virarem cliente (BV)
  municipios_foco: ["Pirassununga", "Valinhos"],
  ultima_atualizacao: "04/05/2026 12:00",
};

export const FILTROS_DISPONIVEIS = {
  municipios: MUNICIPIOS_TRILHO_1.map((m) => m.nome),
  motivos: MOTIVOS_INDEFERIMENTO,
  especies: ESPECIES_BENEFICIO,
  faixas_score: [
    { label: "Alta (90+)", min: 90, max: 100 },
    { label: "Média (80-89)", min: 80, max: 89 },
    { label: "Moderada (70-79)", min: 70, max: 79 },
  ],
};
