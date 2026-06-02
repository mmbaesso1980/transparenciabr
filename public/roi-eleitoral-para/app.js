/* === ROI ELEITORAL PARÁ — 100% ONLINE · app.js v2 === */

// --- TIERS DE PAINEL DIGITAL ---
const TIER = {
  basico:       { min: 3,  max: 6,  tipico: 4.5,  plataforma: 800,  analise: 1200, hint: 'Formulário via redes sociais + Google Forms. Sem validação de duplicatas. Útil para sondagem interna rápida.' },
  intermediario:{ min: 7,  max: 12, tipico: 9,    plataforma: 1500, analise: 2500, hint: 'Painel programático com token único e deduplicação por IP — método equivalente ao usado pela Atlas Intel no início.' },
  avancado:     { min: 14, max: 22, tipico: 17,   plataforma: 2500, analise: 4500, hint: 'RDR por banner digital + pós-estratificação com dados do TSE/IBGE + auditoria completa. Equivalente Atlas Intel atual.' },
};

// --- VALOR DE MERCADO (exclusividade, benchmarks reais PA) ---
const MERCADO = {
  municipal: { base: 55000, multiplier: 1.0, max: 195000, label: 'Municipal (Belém / interior)' },
  estadual:  { base: 120000,multiplier: 1.5, max: 465000, label: 'Estadual (Gov. / Senado)' },
  federal:   { base: 75000, multiplier: 1.2, max: 280000, label: 'Federal (Dep. Federal)' },
};

const ORC_REF = { municipal: 2500000, estadual: 15000000, federal: 4500000 };

// --- ESTADO ---
let state = { amostra: 2000, tier: 'intermediario', fixos: 5000, margem: 40, escopo: 'municipal' };

// --- FORMATAÇÃO ---
const fmtBRL = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
const fmtMe  = n => { const me = 1.96 * Math.sqrt(0.25 / n) * 100; return '±' + me.toFixed(1).replace('.', ',') + '%'; };

// --- CÁLCULO ---
function calcular() {
  const { amostra, tier, fixos, margem, escopo } = state;
  const t  = TIER[tier];
  const sc = MERCADO[escopo];

  const custoPainel   = amostra * t.tipico;
  const custoPlat     = t.plataforma;
  const custoAnalise  = t.analise;
  const custoTotal    = custoPainel + custoPlat + custoAnalise + fixos;

  const precoVenda    = custoTotal / (1 - margem / 100);
  const lucro         = precoVenda - custoTotal;

  const fatorAmostra  = 0.7 + 0.3 * (amostra / 2000);
  const vmCalc        = sc.base * fatorAmostra * sc.multiplier + (amostra * 6);
  const vmMin         = custoTotal * 2.8;
  const valorMercado  = Math.min(Math.max(vmCalc, vmMin), sc.max);

  const roiMercado    = valorMercado / custoTotal;
  const pctOrc        = (precoVenda / ORC_REF[escopo]) * 100;

  return { custoPainel, custoPlat, custoAnalise, custoTotal, precoVenda, lucro, valorMercado, roiMercado, pctOrc, t };
}

// --- RENDER ---
function render() {
  const c = calcular();
  const { amostra, tier, fixos, margem, escopo } = state;

  // Margem de erro
  document.getElementById('margem-erro').textContent = fmtMe(amostra);

  // Hint do tier
  document.getElementById('tier-hint').textContent = TIER[tier].hint;

  // Números principais
  document.getElementById('custo-producao').textContent = fmtBRL(c.custoTotal);
  document.getElementById('preco-venda').textContent    = fmtBRL(c.precoVenda);
  document.getElementById('roi-valor').textContent      = c.roiMercado.toFixed(1).replace('.', ',') + '×';
  document.getElementById('valor-mercado').textContent  = fmtBRL(c.valorMercado);
  document.getElementById('vm-sub').textContent         = 'Benchmark ' + MERCADO[escopo].label;

  // Barra comparativa
  const tot = c.custoTotal + c.valorMercado;
  const pC  = (c.custoTotal / tot) * 100;
  const pM  = (c.valorMercado / tot) * 100;
  const bC  = document.getElementById('bar-custo');
  const bM  = document.getElementById('bar-mercado');
  bC.style.width = pC + '%';
  bM.style.width = pM + '%';
  bC.querySelector('.bar-label').style.display = pC < 18 ? 'none' : '';
  bM.querySelector('.bar-label').style.display = pM < 18 ? 'none' : '';

  // Insight
  const mult = c.roiMercado;
  let txt = '';
  if (mult >= 6) {
    txt = `🔥 ROI extraordinário: vender essa pesquisa como exclusiva rende ${mult.toFixed(1).replace('.', ',')}× o custo de produção. Para o candidato, pagar ${fmtBRL(c.valorMercado)} por inteligência exclusiva é menos de ${c.pctOrc.toFixed(1).replace('.', ',')}% do orçamento total de campanha.`;
  } else if (mult >= 3) {
    txt = `Sólido. A pesquisa pode ser vendida por ${fmtBRL(c.valorMercado)} — ${mult.toFixed(1).replace('.', ',')}× o custo de produção. O método online elimina campo presencial e entrega margem que nenhum instituto regional consegue com o mesmo preço.`;
  } else {
    txt = `Margem de ${mult.toFixed(1).replace('.', ',')}× é conservadora. Considere elevar o tier do painel ou migrar para escopo estadual para ampliar o diferencial de valor.`;
  }
  document.getElementById('insight-text').textContent = txt;

  // Detalhamento
  document.getElementById('br-n').textContent      = amostra.toLocaleString('pt-BR');
  document.getElementById('br-cpe').textContent    = 'R$ ' + c.t.tipico.toFixed(2).replace('.', ',');
  document.getElementById('br-painel').textContent  = fmtBRL(c.custoPainel);
  document.getElementById('br-plataforma').textContent = fmtBRL(c.custoPlat);
  document.getElementById('br-fixos').textContent   = fmtBRL(fixos);
  document.getElementById('br-analise').textContent = fmtBRL(c.custoAnalise);
  document.getElementById('br-total').innerHTML     = '<strong>' + fmtBRL(c.custoTotal) + '</strong>';
  document.getElementById('br-lucro').textContent   = '+ ' + fmtBRL(c.lucro);
  document.getElementById('br-venda').innerHTML     = '<strong>' + fmtBRL(c.precoVenda) + '</strong>';

  // Propostas inline
  renderPropostas(c);

  // Linha "você" na tabela de concorrentes
  const tdVoce = document.getElementById('td-voce');
  if (tdVoce) tdVoce.textContent = fmtBRL(c.precoVenda) + ' (venda)';

  // Cards de posicionamento
  const posC = document.getElementById('pos-custo-ref');
  const posV = document.getElementById('pos-venda-ref');
  const posP = document.getElementById('pos-preco-ref');
  if (posC) posC.textContent = '~' + fmtBRL(c.custoTotal);
  if (posV) posV.textContent = '~' + fmtBRL(c.precoVenda);
  if (posP) posP.textContent = fmtBRL(c.precoVenda);
}

function renderPropostas(base) {
  // PILOTO — 500 entrevistas, tier intermediário fixo
  const tP = TIER['intermediario'];
  const pCusto = 500 * tP.tipico + tP.plataforma + tP.analise * 0.6 + state.fixos * 0.7;
  const pVenda = pCusto / (1 - state.margem / 100);
  const pLucro = pVenda - pCusto;
  const pMercado = base.valorMercado * 0.45;
  const pROI = pMercado / pCusto;

  document.getElementById('pp-custo').textContent = fmtBRL(pCusto);
  document.getElementById('pp-venda').textContent = fmtBRL(pVenda);
  document.getElementById('pp-lucro').textContent = fmtBRL(pLucro);
  document.getElementById('pp-roi').textContent   = pROI.toFixed(1).replace('.', ',') + '×';

  // COMPLETA — amostra configurada × 3 ondas
  const t3 = TIER[state.tier];
  const cCusto = (state.amostra * t3.tipico + t3.plataforma + t3.analise) * 3 + state.fixos * 2.5;
  const cVenda = cCusto / (1 - state.margem / 100);
  const cLucro = cVenda - cCusto;
  const cMercado = Math.min(base.valorMercado * 3 * 0.75, MERCADO[state.escopo].max);
  const cROI = cMercado / cCusto;

  document.getElementById('pc-custo').textContent = fmtBRL(cCusto);
  document.getElementById('pc-venda').textContent = fmtBRL(cVenda);
  document.getElementById('pc-lucro').textContent = fmtBRL(cLucro);
  document.getElementById('pc-roi').textContent   = cROI.toFixed(1).replace('.', ',') + '×';
}

// --- EVENTOS ---
document.getElementById('amostra').addEventListener('input', e => {
  state.amostra = +e.target.value;
  document.getElementById('amostra-val').textContent = (+e.target.value).toLocaleString('pt-BR');
  render();
});
document.getElementById('fixos').addEventListener('input', e => {
  state.fixos = +e.target.value;
  document.getElementById('fixos-val').textContent = fmtBRL(+e.target.value);
  render();
});
document.getElementById('margem').addEventListener('input', e => {
  state.margem = +e.target.value;
  document.getElementById('margem-val').textContent = e.target.value + '%';
  render();
});

document.querySelectorAll('.tier-card').forEach(c => {
  c.addEventListener('click', () => {
    document.querySelectorAll('.tier-card').forEach(x => x.classList.remove('active'));
    c.classList.add('active');
    state.tier = c.dataset.tier;
    c.querySelector('input').checked = true;
    render();
  });
});

document.querySelectorAll('.scope-btn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.scope-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    state.escopo = b.dataset.scope;
    b.querySelector('input').checked = true;
    render();
  });
});

// Dark mode
(function() {
  const t = document.querySelector('[data-theme-toggle]');
  const r = document.documentElement;
  let d = r.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  r.setAttribute('data-theme', d);
  const setIcon = () => {
    if (!t) return;
    t.innerHTML = d === 'dark'
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  };
  setIcon();
  t && t.addEventListener('click', () => { d = d === 'dark' ? 'light' : 'dark'; r.setAttribute('data-theme', d); setIcon(); });
})();

render();
