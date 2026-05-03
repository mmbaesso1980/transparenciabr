#!/usr/bin/env python3
"""
Trilho 2 — Gemma classifica 2.000 leads top-score região Carpes.
1 slot Ollama (NUM_PARALLEL=1), sequencial, ~16h, termina domingo 16h.

NÃO BLOQUEIA TRILHO 1. Roda em background.
Output: ~/leads_prev_marco/leads_2k_carpes_gemma.csv
"""
import os, sys, json, time, asyncio, httpx, csv, glob, logging
import pandas as pd

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
log = logging.getLogger(__name__)

XLSX_DIR = "/home/manusalt13/leads_prev_marco"
OUT_CSV = "/home/manusalt13/leads_prev_marco/leads_2k_carpes_gemma.csv"
OLLAMA_URL = "http://127.0.0.1:11434"
OLLAMA_MODEL = "gemma2:27b-instruct-q4_K_M"
SAMPLE_SIZE = 2000

CIDADES_CARPES = [
    'PIRASSUNUNGA', 'VALINHOS', 'CAMPINAS', 'LIMEIRA', 'PIRACICABA',
    'RIO CLARO', 'MOGI', 'LEME', 'ARARAS', 'SAO CARLOS', 'SÃO CARLOS',
    'SUMARE', 'SUMARÉ', 'INDAIATUBA', 'JUNDIAI', 'JUNDIAÍ', 'AMERICANA'
]

PROMPT = """Você é um analista jurídico previdenciarista. Analise este indeferimento INSS e responda APENAS em JSON válido:

LEAD:
- Município: {municipio}
- UF: {uf}
- Espécie: {especie}
- Motivo indeferimento: {motivo}
- Idade aprox: {idade}

Retorne JSON com:
{{"qualificado": true|false, "score": 0-100, "tese_juridica": "string curta", "urgencia": "alta|media|baixa", "motivo_qualificacao": "string curta"}}

JSON:"""


def find_col(df, candidates):
    for c in df.columns:
        for cand in candidates:
            if cand.lower() in c.lower():
                return c
    return None


def load_and_filter():
    log.info(f"📁 Lendo XLSX de {XLSX_DIR}")
    files = sorted(glob.glob(f"{XLSX_DIR}/Beneficios_Indeferidos*.xlsx"))
    dfs = []
    for f in files:
        log.info(f"  📖 {os.path.basename(f)}")
        df = pd.read_excel(f, engine='openpyxl')
        df.columns = [c.strip().lower().replace(' ', '_').replace('-', '_') for c in df.columns]
        dfs.append(df)
    full = pd.concat(dfs, ignore_index=True, sort=False)
    log.info(f"📊 Total Brasil: {len(full):,}")
    
    col_uf = find_col(full, ['uf'])
    col_municipio = find_col(full, ['munic', 'cidade'])
    col_motivo = find_col(full, ['motivo', 'despacho'])
    col_idade = find_col(full, ['idade'])
    col_especie = find_col(full, ['espec', 'beneficio'])
    log.info(f"  Cols: UF={col_uf}, Mun={col_municipio}, Motivo={col_motivo}, Idade={col_idade}, Esp={col_especie}")
    
    # Filtro região Carpes
    if col_uf and col_municipio:
        mask_uf = full[col_uf].astype(str).str.upper().str.contains('SP', na=False)
        mask_cidade = full[col_municipio].astype(str).str.upper().apply(
            lambda x: any(c in x for c in CIDADES_CARPES)
        )
        regiao = full[mask_uf & mask_cidade].copy()
        log.info(f"📍 Região Carpes: {len(regiao):,}")
    else:
        regiao = full
    
    # Score determinístico pra ranquear top-2000
    def score_det(row):
        s = 0
        if col_motivo:
            m = str(row.get(col_motivo, '')).lower()
            if 'incapacidade' in m: s += 30
            if 'constata' in m: s += 20
            if 'pericia' in m or 'perícia' in m: s += 15
        if col_idade:
            try:
                idade = int(float(str(row.get(col_idade, '0')).replace(',', '.')))
                if idade > 70: s += 25
                elif idade > 55: s += 15
                elif idade > 45: s += 8
            except: pass
        return s
    
    regiao['_score_det'] = regiao.apply(score_det, axis=1)
    regiao = regiao.sort_values('_score_det', ascending=False).head(SAMPLE_SIZE)
    log.info(f"🎯 Top {SAMPLE_SIZE} por score determinístico")
    
    return regiao, {'uf': col_uf, 'municipio': col_municipio, 'motivo': col_motivo, 'idade': col_idade, 'especie': col_especie}


async def classify(client, lead, cols, idx, total):
    prompt = PROMPT.format(
        municipio=str(lead.get(cols['municipio'], 'N/A'))[:50],
        uf=str(lead.get(cols['uf'], 'N/A'))[:5],
        especie=str(lead.get(cols['especie'], 'N/A'))[:50] if cols['especie'] else 'N/A',
        motivo=str(lead.get(cols['motivo'], 'N/A'))[:200] if cols['motivo'] else 'N/A',
        idade=str(lead.get(cols['idade'], 'N/A'))[:5] if cols['idade'] else 'N/A',
    )
    try:
        r = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": OLLAMA_MODEL, "prompt": prompt, "format": "json", "stream": False,
                  "options": {"temperature": 0.1, "num_predict": 200, "num_ctx": 2048}, "keep_alive": -1},
            timeout=httpx.Timeout(600.0, connect=15.0)
        )
        r.raise_for_status()
        classif = json.loads(r.json()['response'])
        return {**lead.to_dict(), **{f"_g_{k}": v for k, v in classif.items()}, '_g_ok': True}
    except Exception as e:
        return {**lead.to_dict(), '_g_ok': False, '_g_err': str(e)[:150]}


async def main():
    log.info("=" * 60)
    log.info(f"TRILHO 2 — GEMMA 27B CLASSIFICA {SAMPLE_SIZE} LEADS CARPES")
    log.info("=" * 60)
    
    df, cols = load_and_filter()
    
    # CSV append-mode pra resiliência (se cair, retoma)
    written = set()
    if os.path.exists(OUT_CSV):
        with open(OUT_CSV) as f:
            r = csv.DictReader(f)
            for row in r:
                key = f"{row.get(cols['municipio'],'')}-{row.get(cols['motivo'],'')[:30]}"
                written.add(key)
        log.info(f"📂 CSV existente: {len(written)} já feitos, retomando")
    
    t0 = time.time()
    ok_count = 0
    
    fout = open(OUT_CSV, 'a', newline='')
    writer = None
    
    async with httpx.AsyncClient(timeout=httpx.Timeout(600.0, connect=15.0)) as client:
        for idx, (_, lead) in enumerate(df.iterrows(), 1):
            key = f"{lead.get(cols['municipio'],'')}-{str(lead.get(cols['motivo'],''))[:30]}"
            if key in written:
                continue
            
            result = await classify(client, lead, cols, idx, SAMPLE_SIZE)
            
            if writer is None:
                writer = csv.DictWriter(fout, fieldnames=list(result.keys()))
                if os.path.getsize(OUT_CSV) == 0:
                    writer.writeheader()
            writer.writerow(result)
            fout.flush()
            
            if result.get('_g_ok'):
                ok_count += 1
            
            if idx % 25 == 0:
                elapsed = (time.time() - t0) / 60
                rate = idx / elapsed if elapsed > 0 else 0
                eta = (SAMPLE_SIZE - idx) / rate if rate > 0 else 0
                log.info(f"📈 {idx}/{SAMPLE_SIZE} — {ok_count} OK — {rate:.1f} leads/min — ETA {eta:.0f}min")
    
    fout.close()
    log.info(f"✅ {ok_count}/{SAMPLE_SIZE} OK em {(time.time()-t0)/60:.0f}min")
    log.info(f"📄 CSV: {OUT_CSV}")


if __name__ == "__main__":
    asyncio.run(main())
