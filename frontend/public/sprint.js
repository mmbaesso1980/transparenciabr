// Servido por Cloud Function getSprintStatus via rewrite em firebase.json (mesma origem — sem CORS)
const STATUS_URL = '/api/sprint/status';
const FALLBACK_URL = '/sprint_status.json'; // caso o Hosting tenha cópia local

const $ = (id) => document.getElementById(id);
const fmtNum = (n) => (n ?? 0).toLocaleString('pt-BR');
const fmtBRL = (n) => 'R$ ' + (n ?? 0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
let lastFetch = null;

function ageStr(then){
  if(!then) return '—';
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if(s < 60) return `há ${s}s`;
  if(s < 3600) return `há ${Math.floor(s/60)}min`;
  return `há ${Math.floor(s/3600)}h`;
}

function card(title, body){ return `<div class="card"><h2>${title}</h2>${body}</div>`; }

function renderIngestao(ing){
  if(!ing) return card('Ingestão', '<div class="empty">sem dados</div>');
  let html = '';
  // CEAP por ano
  const ceap = Object.entries(ing.ceap || {}).filter(([_,v]) => v.bytes > 0);
  const ceapTotal = ceap.reduce((s,[_,v]) => s+v.bytes, 0);
  html += `<div class="row"><span class="l">CEAP Câmara (total)</span><span class="r ${ceapTotal>0?'ok':''}">${ing.ceap?.['2025']?.human ? humanFromBytes(ceapTotal) : '—'}</span></div>`;
  if(ceap.length){
    html += '<div style="padding:6px 0">' + ceap.map(([y,v]) => `<span class="chip">${y}: ${v.human}</span>`).join('') + '</div>';
  }
  // Emendas PIX
  const pix = Object.entries(ing.emendas_pix || {}).filter(([_,v]) => v.bytes > 0);
  if(pix.length){
    html += `<div class="row"><span class="l">Emendas PIX</span><span class="r ok">${pix.length} anos</span></div>`;
  } else {
    html += `<div class="row"><span class="l">Emendas PIX</span><span class="r">aguardando</span></div>`;
  }
  // CEAPS Senado
  const senado = Object.entries(ing.ceaps_senado || {}).filter(([_,v]) => v.bytes > 0);
  html += `<div class="row"><span class="l">CEAPS Senado</span><span class="r ${senado.length?'ok':''}">${senado.length ? senado.length+' anos' : 'aguardando'}</span></div>`;
  // Folha
  const fc = ing.funcionarios_camara?.bytes || 0;
  const ss = ing.servidores_senado?.bytes || 0;
  html += `<div class="row"><span class="l">Funcionários Câmara</span><span class="r ${fc?'ok':'warn'}">${fc ? ing.funcionarios_camara.human : 'aguardando'}</span></div>`;
  html += `<div class="row"><span class="l">Servidores Senado</span><span class="r ${ss?'ok':'warn'}">${ss ? ing.servidores_senado.human : 'aguardando'}</span></div>`;
  return card('📥 Ingestão · Data Lake', html);
}

function humanFromBytes(b){
  if(b<1024) return b+' B';
  if(b<1048576) return (b/1024).toFixed(1)+' KB';
  if(b<1073741824) return (b/1048576).toFixed(1)+' MB';
  return (b/1073741824).toFixed(2)+' GB';
}

function renderFetchApi(f){
  if(!f) return card('🕵️ FETCH-API', '<div class="empty">aguardando primeiro snapshot</div>');
  const sev = f.por_severidade || {};
  return card('🕵️ FETCH-API <span class="badge live">live</span>', `
    <div class="grid3">
      <div class="stat"><div class="k">suspeitos</div><div class="v big">${fmtNum(f.total_suspeitos || 0)}</div></div>
      <div class="stat"><div class="k">crítica</div><div class="v" style="color:var(--err)">${fmtNum(sev.CRITICA || 0)}</div></div>
      <div class="stat"><div class="k">alta</div><div class="v" style="color:var(--warn)">${fmtNum(sev.ALTA || 0)}</div></div>
    </div>
    <div class="row" style="margin-top:10px"><span class="l">snapshot</span><span class="r">${f.snapshot_date || '—'}</span></div>
    <div class="row"><span class="l">parlamentares</span><span class="r acc">${fmtNum(f.parlamentares_envolvidos || 0)}</span></div>
  `);
}

function renderSangue(s){
  if(!s) return card('🩸 SANGUE E PODER', '<div class="empty">aguardando ingestão Receita Federal QSA + árvore TSE</div>');
  return card('🩸 SANGUE E PODER <span class="badge live">live</span>', `
    <div class="grid3">
      <div class="stat"><div class="k">vínculos</div><div class="v big">${fmtNum(s.total_vinculos || 0)}</div></div>
      <div class="stat"><div class="k">parlamentares</div><div class="v">${fmtNum(s.parlamentares_envolvidos || 0)}</div></div>
      <div class="stat"><div class="k">CNPJs</div><div class="v">${fmtNum(s.cnpjs_envolvidos || 0)}</div></div>
    </div>
    <div class="row" style="margin-top:10px"><span class="l">valor suspeito</span><span class="r acc">${fmtBRL(s.valor_total_suspeito || 0)}</span></div>
    <div class="row"><span class="l">threshold Jaccard</span><span class="r">${s.threshold || 0.8}</span></div>
  `);
}

function renderVertex(v){
  if(!v) return card('🤖 Vertex Classifier', '<div class="empty">aguardando primeira execução</div>');
  const cats = v.por_categoria || {};
  const top = Object.entries(cats).sort((a,b) => b[1]-a[1]).slice(0,5);
  return card('🤖 Vertex Classifier <span class="badge live">live</span>', `
    <div class="grid2">
      <div class="stat"><div class="k">notas classificadas</div><div class="v big">${fmtNum(v.total || 0)}</div></div>
      <div class="stat"><div class="k">duração</div><div class="v">${v.duracao_s || '—'}s</div></div>
    </div>
    <details><summary>Top categorias</summary>
      ${top.map(([k,n]) => `<div class="row"><span class="l">${k}</span><span class="r">${fmtNum(n)}</span></div>`).join('')}
    </details>
  `);
}

function renderBuckets(b){
  if(!b) return '';
  return card('💾 Storage', `
    <div class="grid2">
      <div class="stat"><div class="k">raw bucket</div><div class="v">${b.raw}</div></div>
      <div class="stat"><div class="k">clean bucket</div><div class="v">${b.clean}</div></div>
    </div>
  `);
}

async function load(force){
  try{
    const url = STATUS_URL + '?t=' + Date.now();
    const r = await fetch(url, { cache: 'no-store' });
    if(!r.ok) throw new Error('HTTP '+r.status);
    const data = await r.json();
    lastFetch = Date.now();
    render(data);
  } catch(e){
    if(force) alert('Erro: ' + e.message);
    if(!lastFetch){
      $('root').innerHTML = `<div class="card"><div class="err-msg">⚠️ ${e.message}<br><br>O sprint pode ainda não ter publicado o primeiro status.<br>Aguarde alguns minutos e atualize.</div></div>`;
    }
  }
}

function render(d){
  $('tstxt').textContent = d.generated_at_brt || 'agora';
  const html = [
    renderIngestao(d.ingestao),
    renderFetchApi(d.forenses?.flavio),
    renderSangue(d.forenses?.sangue_poder),
    renderVertex(d.vertex?.ceap_classified_2025),
    renderBuckets(d.buckets),
  ].join('');
  $('root').innerHTML = html;
}

// auto-refresh
function tickAge(){
  $('age').textContent = lastFetch ? 'atualizado ' + ageStr(lastFetch) : 'aguardando primeira atualização';
}
setInterval(tickAge, 1000);
setInterval(() => load(false), 30_000);
load(false);
