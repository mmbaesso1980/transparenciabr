// mockData.js — Dados mock fiéis ao look do Painel v2
// Substituir por dados reais via usePainelData.js no final do dia 07/05

const PARTIDOS = ['PL','PT','MDB','PSD','UNIÃO','PP','REPUBLICANOS','PSDB','PDT','NOVO','PSB','PCdoB','SOLIDARIEDADE','PODE','CIDADANIA'];
const UFS = ['SP','RJ','MG','BA','RS','PR','PE','CE','GO','SC','MA','PA','PB','ES','PI','AL','RN','MT','MS','DF','SE','AM','RO','TO','AC','AP','RR'];

const NOMES = [
  'Erika Hilton','Marco Aurélio','Marco Tunaz','Amina Uhas','Bacha Tanta','Josuca Giten','Reda Elerno','Santa Aurélio',
  'Ricardo Salles','Tabata Amaral','Kim Kataguiri','Joice Hasselmann','Alexandre Frota','Eduardo Bolsonaro','Luiza Erundina',
  'Guilherme Boulos','Sâmia Bomfim','Glauber Braga','Camila Jara','Talíria Petrone','Dani Cunha','Soraya Santos',
  'Carlos Zarattini','Alessandro Molon','Paulo Pimenta','Lindbergh Farias','Henrique Fontana','Maria do Rosário',
  'Aécio Neves','Rodrigo Maia','Arthur Lira','Baleia Rossi','Hugo Motta','Elmar Nascimento','Antonio Brito',
  'Gilberto Kassab','José Aníbal','Bruno Araújo','Marcus Pestana','Pedro Paulo','Nilson Pinto','Otávio Leite',
  'Reinaldo Azambuja','Rodrigo Rollemberg','Aloysio Nunes','Ronaldo Caiado','Mauro Mendes','Wilson Lima','Helder Barbalho','Cláudio Castro'
];

// 50 parlamentares fake — usados para o ranking 513 (ciclamos pra preencher)
export const parlamentares = Array.from({ length: 513 }, (_, i) => {
  const idx = i % NOMES.length;
  const partido = PARTIDOS[i % PARTIDOS.length];
  const uf = UFS[i % UFS.length];
  const seed = (i * 9301 + 49297) % 233280;
  const rand = seed / 233280;
  return {
    id: `parl_${i + 1}`,
    nome: i < NOMES.length ? NOMES[idx] : `${NOMES[idx]} ${Math.floor(i / NOMES.length) + 1}`,
    partido,
    uf,
    cota: Math.round((rand * 1_300_000 + 50_000) * 100) / 100,
    frugalidade: Math.round((1 - rand) * 100),
    score: Math.round(rand * 100),
    sinalizacoes: Math.floor(rand * 12),
    presenca: Math.round(50 + rand * 50),
    votos: Math.floor(rand * 1500 + 200),
    projetos: Math.floor(rand * 80),
    faltas: Math.floor(rand * 30),
    setor: ['Petróleo','Construção','Saúde','Educação','Banca','Agro','Mineração','Tech'][i % 8],
  };
});

// B01 Pontuação Brasil — Indicador Aurora agregado nacional
export const pontuacaoBrasil = {
  score: 73,
  delta: +2,
  serie30d: [68, 69, 71, 70, 72, 73, 71, 72, 73, 74, 73, 75, 74, 73, 72, 73, 74, 75, 73, 72, 73, 74, 73, 71, 72, 73, 74, 73, 72, 73],
};

// B02 Maiores Cotas — top 5
export const maioresCotas = parlamentares
  .slice()
  .sort((a, b) => b.cota - a.cota)
  .slice(0, 5);

// B03 Sinalizações SOC — feed ao vivo
export const sinalizacoesSOC = {
  total: 47,
  feed: [
    { id: 1, tipo: 'CEAP', texto: '3 últimos feed items consent o emenda e nevatente do Brasileiros', ts: '08:32' },
    { id: 2, tipo: 'CNPJ', texto: '3 últimos feed items sobreo CNPJ 13.455.00% do premissio', ts: '08:21' },
    { id: 3, tipo: 'EMENDA', texto: '3 últimos feed items conte da emenda e 3 CNPJ dis beneficiarior', ts: '08:14' },
    { id: 4, tipo: 'CONTRATO', texto: 'Aditivo de R$ 12mi em contrato sem licitação flagrado', ts: '08:02' },
    { id: 5, tipo: 'TSE', texto: 'Doação cruzada parlamentar↔beneficiário detectada', ts: '07:58' },
  ],
};

// B04 Mapa UF Brasil — heatmap por UF
export const mapaUF = UFS.map((uf, i) => ({
  uf,
  intensidade: Math.round(((i * 7919) % 100)),
  total: Math.floor(((i * 6151) % 50) + 5),
}));

// B05 Pulso CEAP
export const pulsoCEAP = {
  queimadoHoje: 1_200_000,
  quotaMensal: 3_157_894,
  pctConsumido: 38,
};

// B06 Mata UF Brasil — versão escura/negativa do mapa
export const mataUF = UFS.map((uf, i) => ({
  uf,
  risco: Math.round(((i * 4099) % 100)),
}));

// B07 Emendas Críticas
export const emendasCriticas = {
  queimadoHoje: 1_200_000,
  pctConsumido: 38,
  topCnpj: [
    { rank: 1, cnpj: 'CNPJ #1', risco: 'Risco' },
    { rank: 2, cnpj: 'CNPJ #2', risco: 'Risco' },
    { rank: 3, cnpj: 'CNPJ #3', risco: 'Risco' },
  ],
};

// B08 Contratos PNCP — histograma de risk_score
export const contratosPNCP = {
  histograma: [
    { bucket: 0, count: 12 },
    { bucket: 20, count: 28 },
    { bucket: 40, count: 45 },
    { bucket: 60, count: 38 },
    { bucket: 80, count: 22 },
    { bucket: 100, count: 8 },
  ],
};

// B09 Radar Jurídico
export const radarJuridico = {
  leadsAtivos: 12,
  conversao: 0.34,
};

// B10 Meu Universo — cards dos planetas (alvos pessoais)
export const meuUniverso = [
  { id: 'erika',   nome: 'Erika Hilton',   cor: '#9b8cff', emoji: '🪐' },
  { id: 'marco',   nome: 'Marco Aurélio',  cor: '#ff6b6b', emoji: '🔴' },
  { id: 'tunaz',   nome: 'Marco Tunaz',    cor: '#4ade80', emoji: '🟢' },
  { id: 'amina',   nome: 'Amina Uhas',     cor: '#fbbf24', emoji: '🟡' },
  { id: 'bacha',   nome: 'Bacha Tanta',    cor: '#a78bfa', emoji: '🟣' },
  { id: 'josuca',  nome: 'Josuca Giten',   cor: '#f87171', emoji: '🔴' },
];

// B11 Mais Frugais — top 5 frugalidade
export const maisFrugais = parlamentares
  .slice()
  .sort((a, b) => b.frugalidade - a.frugalidade)
  .slice(0, 5);

// B12 Influência Setorial — Sankey simplificado
export const influenciaSetorial = {
  esquerda: ['Petróleo','Construção','Saúde','Banca'],
  direita: ['PL','PT','MDB','PSD'],
  links: [
    { from: 'Petróleo', to: 'PL', valor: 35 },
    { from: 'Petróleo', to: 'PT', valor: 22 },
    { from: 'Construção', to: 'PT', valor: 41 },
    { from: 'Construção', to: 'MDB', valor: 28 },
    { from: 'Saúde', to: 'MDB', valor: 19 },
    { from: 'Saúde', to: 'PSD', valor: 33 },
    { from: 'Banca', to: 'PSD', valor: 47 },
    { from: 'Banca', to: 'PL', valor: 25 },
  ],
};

// B13 Atividade Legislativa — agregado
export const atividadeLegislativa = {
  presenca: 89,
  votos: 1247,
  projetos: 23,
  faltas: 17,
};

// B14 Promessa × Entrega — word cloud
export const promessaEntrega = {
  campanha: [
    { palavra: 'educação', tamanho: 48 },
    { palavra: 'saúde', tamanho: 42 },
    { palavra: 'infraestrutura', tamanho: 28 },
    { palavra: 'segurança', tamanho: 22 },
  ],
  entrega: { valor: 1_247_836.42, metrica: 'emenda values' },
};

// B15 Pulso Federal — termômetro
export const pulsoFederal = {
  executado: 1_247_836_420,
  orcado: 2_500_000_000,
  pct: 49.9,
};

// B16 Rede Empresarial — grafo simplificado
export const redeEmpresarial = {
  nodes: [
    { id: 'a', tipo: 'parlamentar', label: 'Parl. A' },
    { id: 'b', tipo: 'cnpj', label: 'CNPJ B' },
    { id: 'c', tipo: 'cnpj', label: 'CNPJ C' },
    { id: 'd', tipo: 'parlamentar', label: 'Parl. D' },
    { id: 'e', tipo: 'cnpj', label: 'CNPJ E' },
    { id: 'f', tipo: 'parlamentar', label: 'Parl. F' },
  ],
  edges: [
    { from: 'a', to: 'b' }, { from: 'a', to: 'c' },
    { from: 'b', to: 'd' }, { from: 'c', to: 'e' },
    { from: 'd', to: 'e' }, { from: 'e', to: 'f' },
  ],
};

// B17 Abertura por Órgão — barras horizontais
export const aberturaOrgao = [
  { orgao: 'Câmara Federal',   pct: 87 },
  { orgao: 'Senado',           pct: 72 },
  { orgao: 'TCU',              pct: 95 },
  { orgao: 'Min. Saúde',       pct: 64 },
];

export const headerInfo = {
  creditos: 1247,
  user: 'Comandante Baesso',
};
