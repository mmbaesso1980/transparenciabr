#!/usr/bin/env node
/**
 * ============================================================
 * TBR LGPD Anonymizer — engines/lgpd/anonymizer.js
 * ============================================================
 *
 * Lê documentos JSON do bucket bruto (gs://datalake-tbr-raw/),
 * aplica as regras de anonimização exigidas pela LGPD e grava
 * o resultado no bucket limpo (gs://datalake-tbr-clean/).
 *
 * Posição na cadeia de processamento:
 *   [ingestor universal] → [GCS raw] → [este módulo] → [GCS clean] → [LLM local/remoto]
 *
 * Uso:
 *   node engines/lgpd/anonymizer.js --input <prefix> [--limit N] [--dry-run]
 *
 * Variáveis de ambiente obrigatórias:
 *   LGPD_SALT                     — segredo para HMAC-SHA256 dos CPFs
 *
 * Variáveis de ambiente opcionais:
 *   DATALAKE_BUCKET_RAW           — padrão: datalake-tbr-raw
 *   DATALAKE_BUCKET_CLEAN         — padrão: datalake-tbr-clean
 *   GOOGLE_APPLICATION_CREDENTIALS — caminho para service account JSON
 *   LOG_VERBOSE                   — habilita logs de nível DEBUG
 *
 * Referências:
 *   - Doc mestre §3.3 em projeto_soberania_arquitetura.md
 *   - engines/09_lgpd_shield.py  (versão Firestore, lógica de base)
 *   - engines/22_lgpd_shield.py  (versão pipeline, padrões de regex)
 * ============================================================
 */

import { Storage }    from '@google-cloud/storage';
import crypto         from 'crypto';
import { parseArgs }  from 'node:util';
import { fileURLToPath } from 'node:url';

// ============================================================
// BLOCO 1 — Constantes e validação de ambiente
// ============================================================

const RAW_BUCKET   = process.env.DATALAKE_BUCKET_RAW   || 'datalake-tbr-raw';
const CLEAN_BUCKET = process.env.DATALAKE_BUCKET_CLEAN || 'datalake-tbr-clean';

/**
 * Salt para HMAC-SHA256. Lido do ambiente na primeira utilização (lazy).
 * Em produção, LGPD_SALT deve estar definido antes de qualquer chamada a hashCpf().
 * A CLI (main()) valida a presença do salt antes de processar qualquer blob.
 */
function getSalt() {
  const salt = process.env.LGPD_SALT;
  if (!salt) {
    // Erro fatal em runtime — lançado ao tentar anonimizar sem salt configurado.
    throw new Error('LGPD_SALT env var ausente — impossível anonimizar CPFs sem salt.');
  }
  return salt;
}

// ============================================================
// BLOCO 2 — Clientes GCS
// ============================================================

const storage     = new Storage();
const bucketRaw   = storage.bucket(RAW_BUCKET);
const bucketClean = storage.bucket(CLEAN_BUCKET);

// ============================================================
// BLOCO 3 — Cache de entidades públicas (políticos + fornecedores)
// ============================================================

/** Set de CPFs/CNPJs públicos (somente dígitos). Lookup O(1). */
let publicCpfCnpjSet = null;

/**
 * Carrega as listas de entidades públicas do bucket raw.
 * - _meta/politicos_publicos.json   → array de CPFs/CNPJs de parlamentares
 * - _meta/fornecedores_publicos.json → array de CNPJs de fornecedores em contratos públicos
 *
 * CPFs/CNPJs nessas listas são informação pública por força de lei
 * e não devem ser anonimizados.
 *
 * @returns {Set<string>} set de documentos (somente dígitos)
 */
async function loadPublicEntities() {
  if (publicCpfCnpjSet !== null) return publicCpfCnpjSet;

  publicCpfCnpjSet = new Set();
  const arquivos = [
    '_meta/politicos_publicos.json',
    '_meta/fornecedores_publicos.json',
  ];

  for (const arquivo of arquivos) {
    try {
      const [conteudo] = await bucketRaw.file(arquivo).download();
      const lista = JSON.parse(conteudo.toString('utf-8'));
      if (!Array.isArray(lista)) {
        log('WARN', 'lista_publica_formato_invalido', { arquivo });
        continue;
      }
      for (const doc of lista) {
        // Normaliza: apenas dígitos, para comparação uniforme
        const limpo = String(doc).replace(/\D/g, '');
        if (limpo.length >= 11) publicCpfCnpjSet.add(limpo);
      }
      log('INFO', 'lista_publica_carregada', {
        arquivo,
        entidades: lista.length,
        total_set: publicCpfCnpjSet.size,
      });
    } catch (err) {
      // Arquivo opcional — continua sem ele (pode não existir no ambiente de teste)
      log('WARN', 'lista_publica_nao_encontrada', {
        arquivo,
        erro: String(err.message),
      });
    }
  }

  return publicCpfCnpjSet;
}

// ============================================================
// BLOCO 4 — Expressões regulares de detecção de PII
// ============================================================

/**
 * Domínios institucionais governamentais brasileiros.
 * E-mails com esses TLDs de segundo nível são informação pública e não devem
 * ser anonimizados (Art. 8º LAI — Lei 12.527/2011).
 */
const GOV_DOMAIN_RE = /\.(?:gov|leg|jus|mp)\.br$/i;

/**
 * Padrões regex para as categorias de PII definidas no doc mestre §3.3.
 * Todos os padrões com flag /g são recriados via novo RegExp em cada uso
 * para evitar problemas com lastIndex em substituições recursivas.
 */
const REGEX = {
  /** CPF: 000.000.000-00 ou 00000000000 (sem pontuação) */
  cpf: () => /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,

  /** CNPJ: 00.000.000/0000-00 ou 00000000000000 */
  cnpj: () => /\b\d{2}\.?\d{3}\.?\d{3}\/?0001-?\d{2}\b|\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,

  /**
   * Telefone: (11) 99999-9999, 11999999999, 11 9 9999-9999
   * Cobre fixo (8 dígitos) e celular (9 dígitos) com/sem DDD formatado
   */
  telefone: () => /\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/g,

  /**
   * E-mail: captura todos os endereços de e-mail.
   * A exclusão de domínios governamentais é feita no callback de substituição
   * via GOV_DOMAIN_RE, porque o lookahead negativo não cobre subdomínios
   * (ex: "joao@tcu.gov.br" — o prefixo "tcu" impede o match do lookahead simples).
   */
  email: () => /\b[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}\b/gi,

  /** CID-10: letra + 2 dígitos, opcionalmente + ponto + dígito (ex: F32.0, K21) */
  cid: () => /\b[A-Z]\d{2}(\.\d)?\b/g,

  /**
   * Endereço residencial: logradouros comuns com número sequencial
   * Exemplos: "Rua das Flores, 123", "Av. Brasil 456", "Travessa Boa Vista, 7"
   */
  endereco: () => /\b(?:Rua|Av\.?|Avenida|Travessa|Tv\.?|Praça|Pç\.?)\s+[A-ZÀ-Ú][wÀ-ú\s\w]*?,?\s*\d+/gi,

  /**
   * Palavras-gatilho que indicam contexto médico.
   * CIDs só são redactados quando o documento contém pelo menos uma dessas palavras.
   */
  gatilhoMedico: /\b(consulta|exame|hospital|cl[íi]nica|tratamento|laudo|prontu[áa]rio)\b/i,
};

// ============================================================
// BLOCO 5 — Funções de anonimização por categoria
// ============================================================

/**
 * Gera hash HMAC-SHA256 para um CPF, usando o salt de ambiente.
 * Retorna os primeiros 16 hex chars com prefixo rastreável.
 *
 * Formato de saída: cpf_h_<16 hex chars>
 * Exemplo:          cpf_h_3a7f2b1c9e4d8a06
 *
 * @param {string} cpf - CPF com ou sem formatação
 * @returns {string}   - token anonimizado
 */
export function hashCpf(cpf) {
  const limpo = cpf.replace(/\D/g, '');
  const hash  = crypto.createHmac('sha256', getSalt()).update(limpo).digest('hex');
  return `cpf_h_${hash.slice(0, 16)}`;
}

/**
 * Mascara os últimos 4 dígitos de um telefone.
 * Preserva DDD e prefixo; substitui os últimos 4 dígitos por ****.
 *
 * Exemplos:
 *   "(11) 99999-1234" → "(11) 99999-****"
 *   "11999991234"     → "11999991****"  (heurístico)
 *
 * @param {string} telefone
 * @returns {string}
 */
export function maskTelefone(telefone) {
  // Remove os últimos 4 caracteres numéricos e substitui por ****
  return telefone.replace(/(\d{4})$/, '****');
}

/**
 * Substitui o local-part de um e-mail pessoal por ***.
 * Domínios governamentais nunca chegam aqui (filtrados pelo regex).
 *
 * Exemplo: "joao.silva@gmail.com" → "***@gmail.com"
 *
 * @param {string} email
 * @returns {string}
 */
export function maskEmail(email) {
  const arrobaIdx = email.indexOf('@');
  if (arrobaIdx === -1) return email;
  return `***${email.slice(arrobaIdx)}`;
}

// ============================================================
// BLOCO 6 — Motor de anonimização de texto
// ============================================================

/**
 * Aplica todas as regras de anonimização LGPD a uma string de texto.
 *
 * Ordem de processamento:
 *   1. Detecta contexto médico (gatilho para redact de CID)
 *   2. CPF civil → hash (exceto políticos públicos)
 *   3. CNPJ → mantém se público, hash se privado
 *   4. Telefone → máscara nos últimos 4 dígitos
 *   5. E-mail pessoal → mascara local-part
 *   6. Endereço residencial → [ENDERECO-REDACTED]
 *   7. CID médico → [CID-REDACTED] (somente se contexto médico)
 *
 * @param {string} texto  - texto bruto a anonimizar
 * @returns {{ texto: string, redacoes: object }} - texto limpo + contagem por categoria
 */
export function anonymizeText(texto) {
  if (typeof texto !== 'string' || texto.length === 0) {
    return { texto, redacoes: {} };
  }

  // Contadores por categoria para o manifest
  const redacoes = {
    cpf_hash:          0,
    cnpj_hash:         0,
    telefone_mask:     0,
    email_mask:        0,
    endereco_redacted: 0,
    cid_redacted:      0,
  };

  // 1. Detecta contexto médico antes de qualquer substituição
  const ehContextoMedico = REGEX.gatilhoMedico.test(texto);

  let out = texto;

  // 2. CPF: hash com salt (exceto públicos)
  out = out.replace(REGEX.cpf(), (match) => {
    const limpo = match.replace(/\D/g, '');
    if (publicCpfCnpjSet?.has(limpo)) return match; // CPF de político — mantém
    redacoes.cpf_hash++;
    return hashCpf(match);
  });

  // 3. CNPJ: hash se privado, mantém se público
  out = out.replace(REGEX.cnpj(), (match) => {
    const limpo = match.replace(/\D/g, '');
    if (publicCpfCnpjSet?.has(limpo)) return match; // Fornecedor público — mantém
    // CNPJs em contratos públicos são públicos por lei (Lei 12.527/2011)
    // A lista _meta/fornecedores_publicos.json contém os aprovados
    // Se não estiver na lista, aplica hash por precaução
    redacoes.cnpj_hash++;
    const hash = crypto.createHmac('sha256', getSalt()).update(limpo).digest('hex');
    return `cnpj_h_${hash.slice(0, 16)}`;
  });

  // 4. Telefone: mascara os últimos 4 dígitos
  out = out.replace(REGEX.telefone(), (match) => {
    redacoes.telefone_mask++;
    return maskTelefone(match);
  });

  // 5. E-mail pessoal: substitui local-part por ***
  //    Domínios governamentais (gov.br, leg.br, jus.br, mp.br) são mantidos em claro.
  out = out.replace(REGEX.email(), (match) => {
    const arrobaIdx = match.indexOf('@');
    const dominio   = arrobaIdx !== -1 ? match.slice(arrobaIdx + 1) : '';
    if (GOV_DOMAIN_RE.test(dominio)) return match; // excluí dominio governamental
    redacoes.email_mask++;
    return maskEmail(match);
  });

  // 6. Endereço residencial: redact total do logradouro
  out = out.replace(REGEX.endereco(), (match) => {
    redacoes.endereco_redacted++;
    return '[ENDERECO-REDACTED]';
  });

  // 7. CID médico: somente em contexto médico (gatilho obrigatório)
  if (ehContextoMedico) {
    out = out.replace(REGEX.cid(), (match, _grupo) => {
      redacoes.cid_redacted++;
      return '[CID-REDACTED]';
    });
  }

  return { texto: out, redacoes };
}

// ============================================================
// BLOCO 7 — Anonimização recursiva de objeto JSON
// ============================================================

/**
 * Percorre recursivamente um objeto JSON e anonimiza todas as strings.
 * Suporta: string, array, objeto plano. Valores não-string são preservados.
 *
 * @param {*} valor  - qualquer valor JSON (string, array, object, number, etc.)
 * @returns {{ valor: *, stats: object }} - valor limpo + estatísticas acumuladas
 */
export function anonymizeValue(valor) {
  // Acumulador de estatísticas para este subárvore
  const statsAcc = {
    cpf_hash:          0,
    cnpj_hash:         0,
    telefone_mask:     0,
    email_mask:        0,
    endereco_redacted: 0,
    cid_redacted:      0,
  };

  function somar(parcial) {
    for (const chave of Object.keys(statsAcc)) {
      statsAcc[chave] += (parcial[chave] || 0);
    }
  }

  if (typeof valor === 'string') {
    const { texto, redacoes } = anonymizeText(valor);
    somar(redacoes);
    return { valor: texto, stats: statsAcc };
  }

  if (Array.isArray(valor)) {
    const novoArray = [];
    for (const item of valor) {
      const { valor: itemLimpo, stats } = anonymizeValue(item);
      somar(stats);
      novoArray.push(itemLimpo);
    }
    return { valor: novoArray, stats: statsAcc };
  }

  if (valor !== null && typeof valor === 'object') {
    const novoObj = {};
    for (const [chave, v] of Object.entries(valor)) {
      const { valor: vLimpo, stats } = anonymizeValue(v);
      somar(stats);
      novoObj[chave] = vLimpo;
    }
    return { valor: novoObj, stats: statsAcc };
  }

  // number, boolean, null — sem alteração
  return { valor, stats: statsAcc };
}

/**
 * Anonimiza um objeto JSON completo (ponto de entrada para documentos).
 *
 * @param {object} obj - documento JSON bruto
 * @returns {{ obj: object, stats: object }}
 */
export function anonymizeObject(obj) {
  const { valor, stats } = anonymizeValue(obj);
  return { obj: valor, stats };
}

// ============================================================
// BLOCO 8 — Idempotência via hash de conteúdo
// ============================================================

/**
 * Calcula o hash SHA-256 de um Buffer/string para comparação de conteúdo.
 * Usado para detectar se o blob raw foi modificado desde a última execução.
 *
 * @param {Buffer|string} conteudo
 * @returns {string} hex SHA-256
 */
function hashConteudo(conteudo) {
  return crypto.createHash('sha256').update(conteudo).digest('hex');
}

/**
 * Lê os metadados de um blob no bucket clean.
 * Retorna o hash do conteúdo raw gravado anteriormente (se existir).
 *
 * @param {string} path - caminho do blob no bucket clean
 * @returns {string|null}
 */
async function getHashAnterior(path) {
  try {
    const file = bucketClean.file(path);
    const [meta] = await file.getMetadata();
    return meta?.metadata?.raw_content_hash || null;
  } catch {
    return null;
  }
}

// ============================================================
// BLOCO 9 — Processamento de um blob individual
// ============================================================

/**
 * Processa um único blob do bucket raw:
 *   1. Baixa o conteúdo bruto
 *   2. Verifica idempotência (hash do conteúdo)
 *   3. Faz parse JSON
 *   4. Anonimiza via anonymizeObject()
 *   5. Grava no bucket clean no mesmo path
 *   6. Grava manifest de auditoria
 *
 * @param {string}  rawPath - caminho do blob no bucket raw
 * @param {boolean} dryRun  - se true, apenas loga sem gravar
 * @returns {object}        - resultado com stats e status
 */
export async function processBlob(rawPath, dryRun = false) {
  const inicio = Date.now();

  // 1. Baixa conteúdo bruto
  let conteudoBuffer;
  try {
    [conteudoBuffer] = await bucketRaw.file(rawPath).download();
  } catch (err) {
    log('ERROR', 'blob_download_falhou', { path: rawPath, erro: String(err.message) });
    return { path: rawPath, status: 'erro_download', erro: String(err.message) };
  }

  const hashRaw = hashConteudo(conteudoBuffer);

  // 2. Idempotência: pula se clean já existe com o mesmo hash raw
  if (!dryRun) {
    const hashAnterior = await getHashAnterior(rawPath);
    if (hashAnterior && hashAnterior === hashRaw) {
      log('INFO', 'blob_skip_idempotente', {
        path:     rawPath,
        hash_raw: hashRaw.slice(0, 12),
      });
      return { path: rawPath, status: 'skip_idempotente' };
    }
  }

  // 3. Parse JSON
  let docJson;
  try {
    docJson = JSON.parse(conteudoBuffer.toString('utf-8'));
  } catch (err) {
    log('WARN', 'blob_parse_falhou', {
      path:  rawPath,
      erro:  String(err.message),
      bytes: conteudoBuffer.length,
    });
    return { path: rawPath, status: 'erro_parse', erro: String(err.message) };
  }

  // 4. Anonimiza
  const { obj: docLimpo, stats } = anonymizeObject(docJson);

  // 5. Adiciona metadados LGPD no documento limpo
  const docFinal = {
    ...docLimpo,
    _lgpd: {
      anonimizado_em:  new Date().toISOString(),
      hash_raw:        hashRaw.slice(0, 16), // prefixo para auditoria leve
      versao_motor:    '1.0.0',
      redacoes:        stats,
    },
  };

  if (dryRun) {
    log('INFO', 'dry_run_blob', {
      path:            rawPath,
      redacoes:        stats,
      latencia_ms:     Date.now() - inicio,
    });
    return { path: rawPath, status: 'dry_run', stats };
  }

  // 6. Grava no bucket clean
  const payload = JSON.stringify(docFinal, null, 0);
  try {
    await bucketClean.file(rawPath).save(payload, {
      contentType: 'application/json',
      metadata: {
        raw_content_hash:   hashRaw,
        lgpd_processed_at:  new Date().toISOString(),
        lgpd_motor_version: '1.0.0',
      },
    });
  } catch (err) {
    log('ERROR', 'blob_upload_falhou', { path: rawPath, erro: String(err.message) });
    return { path: rawPath, status: 'erro_upload', erro: String(err.message) };
  }

  // 7. Grava manifest de auditoria (ex: _lgpd_manifests/2026/05/arquivo.json)
  await gravarManifest(rawPath, stats, hashRaw);

  const latenciaMs = Date.now() - inicio;
  log('INFO', 'blob_processado', {
    path:        rawPath,
    redacoes:    stats,
    bytes:       payload.length,
    latencia_ms: latenciaMs,
  });

  return { path: rawPath, status: 'ok', stats, latencia_ms: latenciaMs };
}

// ============================================================
// BLOCO 10 — Manifest de auditoria
// ============================================================

/**
 * Grava um registro de auditoria no bucket clean.
 * Caminho: _lgpd_manifests/<ano>/<mes>/<timestamp>_<blob_hash>.json
 *
 * O manifest permite auditar quais documentos foram anonimizados,
 * quando, e quantas redações de cada categoria foram aplicadas.
 * NUNCA contém o dado original — apenas metadados.
 *
 * @param {string} rawPath  - path original no bucket raw
 * @param {object} stats    - contagem de redações por categoria
 * @param {string} hashRaw  - SHA-256 do conteúdo bruto
 */
async function gravarManifest(rawPath, stats, hashRaw) {
  const agora     = new Date();
  const ano       = agora.getFullYear();
  const mes       = String(agora.getMonth() + 1).padStart(2, '0');
  const ts        = agora.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const hashPfx   = hashRaw.slice(0, 8);
  const manifestPath = `_lgpd_manifests/${ano}/${mes}/${ts}_${hashPfx}.json`;

  const entrada = {
    timestamp:       agora.toISOString(),
    raw_path:        rawPath,
    hash_raw_prefix: hashRaw.slice(0, 16),
    redacoes:        stats,
    motor:           'lgpd/anonymizer.js@1.0.0',
  };

  try {
    await bucketClean.file(manifestPath).save(JSON.stringify(entrada), {
      contentType: 'application/json',
    });
  } catch (err) {
    // Manifest é melhor-esforço — não falha o processamento
    log('WARN', 'manifest_falhou', { manifest_path: manifestPath, erro: String(err.message) });
  }
}

// ============================================================
// BLOCO 11 — Processamento em lote (batch com p-limit)
// ============================================================

/**
 * Lista e processa em paralelo todos os blobs de um prefixo no bucket raw.
 * Usa concorrência limitada (10 paralelas) para não sobrecarregar a VM.
 *
 * @param {string}  prefix  - prefixo GCS (ex: "cgu/contratos/2026/05")
 * @param {number}  limit   - máximo de blobs a processar (padrão: 100)
 * @param {boolean} dryRun  - modo dry-run
 * @returns {object}        - estatísticas acumuladas do batch
 */
export async function processBatch(prefix = '', limit = 100, dryRun = false) {
  const CONCORRENCIA = 10;
  const inicio       = Date.now();

  // Lista blobs no bucket raw com o prefixo informado
  log('INFO', 'batch_inicio', { prefix, limit, dry_run: dryRun, bucket: RAW_BUCKET });

  let [arquivos] = await bucketRaw.getFiles({ prefix, maxResults: limit });

  // Filtra diretórios (GCS retorna "objetos" com / no final como pseudo-dirs)
  arquivos = arquivos.filter(f => !f.name.endsWith('/'));

  if (arquivos.length === 0) {
    log('WARN', 'batch_sem_arquivos', { prefix, bucket: RAW_BUCKET });
    return { total: 0, ok: 0, skip: 0, erro: 0, stats: {}, duracao_ms: 0 };
  }

  log('INFO', 'batch_arquivos_encontrados', { total: arquivos.length, prefix });

  // Acumuladores de estatísticas do batch
  const totalStats = {
    cpf_hash:          0,
    cnpj_hash:         0,
    telefone_mask:     0,
    email_mask:        0,
    endereco_redacted: 0,
    cid_redacted:      0,
  };
  let contOk    = 0;
  let contSkip  = 0;
  let contErro  = 0;

  // Worker pool: 10 paralelas usando p-limit nativo (sem dependência extra)
  // Implementação simples com semáforo de promessas
  const semaforo = new Semaphore(CONCORRENCIA);
  const tarefas  = arquivos.map(arquivo => semaforo.run(async () => {
    const resultado = await processBlob(arquivo.name, dryRun);

    if (resultado.status === 'ok' || resultado.status === 'dry_run') {
      contOk++;
      if (resultado.stats) {
        for (const chave of Object.keys(totalStats)) {
          totalStats[chave] += (resultado.stats[chave] || 0);
        }
      }
    } else if (resultado.status === 'skip_idempotente') {
      contSkip++;
    } else {
      contErro++;
    }

    return resultado;
  }));

  await Promise.allSettled(tarefas);

  const duracaoMs = Date.now() - inicio;

  log('INFO', 'batch_concluido', {
    total:       arquivos.length,
    ok:          contOk,
    skip:        contSkip,
    erro:        contErro,
    duracao_ms:  duracaoMs,
    stats:       totalStats,
  });

  return {
    total:      arquivos.length,
    ok:         contOk,
    skip:       contSkip,
    erro:       contErro,
    stats:      totalStats,
    duracao_ms: duracaoMs,
  };
}

// ============================================================
// BLOCO 12 — Semáforo (worker pool sem dependência externa)
// ============================================================

/**
 * Semáforo simples para limitar concorrência sem dependência de p-limit.
 * Inspirado no padrão do universal_ingestor.js, mas auto-contido aqui.
 */
class Semaphore {
  constructor(max) {
    this._max     = max;
    this._atual   = 0;
    this._fila    = [];
  }

  /**
   * Executa uma função assíncrona respeitando o limite de concorrência.
   * @param {Function} fn - função async a executar
   */
  run(fn) {
    return new Promise((resolve, reject) => {
      const tentar = () => {
        if (this._atual < this._max) {
          this._atual++;
          fn().then(resolve, reject).finally(() => {
            this._atual--;
            if (this._fila.length > 0) this._fila.shift()();
          });
        } else {
          this._fila.push(tentar);
        }
      };
      tentar();
    });
  }
}

// ============================================================
// BLOCO 13 — Logger estruturado JSON (compatível Cloud Logging)
// ============================================================

/**
 * Logger estruturado em JSON, alinhado ao formato do universal_ingestor.js.
 * Saída stderr para WARN/ERROR, stdout para INFO/DEBUG.
 * Compatível com Cloud Logging / Stackdriver.
 *
 * Exemplo:
 *   {"timestamp":"2026-05-01T10:00:00.000Z","severity":"INFO","event":"blob_processado",...}
 *
 * @param {'DEBUG'|'INFO'|'WARN'|'ERROR'} severity
 * @param {string} evento   - snake_case
 * @param {object} payload  - dados adicionais
 */
export function log(severity, evento, payload = {}) {
  if (severity === 'DEBUG' && !process.env.LOG_VERBOSE) return;

  const entrada = JSON.stringify({
    timestamp: new Date().toISOString(),
    severity,
    event:     evento,
    ...payload,
  });

  if (severity === 'ERROR' || severity === 'WARN') {
    process.stderr.write(entrada + '\n');
  } else {
    process.stdout.write(entrada + '\n');
  }
}

// ============================================================
// BLOCO 14 — Tabela de sumário final
// ============================================================

/**
 * Imprime no stdout a tabela de resultados do batch.
 * Formato legível para operadores e logs de CI/CD.
 *
 * @param {object} resultado - objeto retornado por processBatch()
 */
function imprimirTabelaFinal(resultado) {
  const { total, ok, skip, erro, stats, duracao_ms } = resultado;
  const s = stats || {};

  const linhas = [
    '',
    '╔══════════════════════════════════════════════════════════╗',
    '║       LGPD Anonymizer — Resumo do Batch                 ║',
    '╠══════════════════════════════════════════════════════════╣',
    `║  Total processados  : ${String(total).padEnd(33)}║`,
    `║  ✓ Anonimizados     : ${String(ok).padEnd(33)}║`,
    `║  ↷ Pulados (iguais) : ${String(skip).padEnd(33)}║`,
    `║  ✗ Erros            : ${String(erro).padEnd(33)}║`,
    '╠══════════════════════════════════════════════════════════╣',
    `║  CPFs  hash         : ${String(s.cpf_hash          || 0).padEnd(33)}║`,
    `║  CNPJs hash         : ${String(s.cnpj_hash         || 0).padEnd(33)}║`,
    `║  Tels  mask         : ${String(s.telefone_mask     || 0).padEnd(33)}║`,
    `║  Emails mask        : ${String(s.email_mask        || 0).padEnd(33)}║`,
    `║  CIDs  redacted     : ${String(s.cid_redacted      || 0).padEnd(33)}║`,
    `║  Endereços redacted : ${String(s.endereco_redacted || 0).padEnd(33)}║`,
    '╠══════════════════════════════════════════════════════════╣',
    `║  Duração            : ${String(`${duracao_ms} ms`).padEnd(33)}║`,
    '╚══════════════════════════════════════════════════════════╝',
    '',
  ];

  process.stdout.write(linhas.join('\n') + '\n');
}

// ============================================================
// BLOCO 15 — CLI (ponto de entrada)
// ============================================================

/**
 * Ponto de entrada via linha de comando.
 *
 * Flags suportadas:
 *   --input  <prefix>  Prefixo GCS no bucket raw (obrigatório)
 *   --output <prefix>  Prefixo alternativo no bucket clean (opcional)
 *   --limit  N         Máximo de blobs a processar (padrão: 100)
 *   --dry-run          Lista o que faria sem gravar
 */
async function main() {
  // Validação antecipada do salt — falha rápida antes de qualquer operação GCS
  if (!process.env.LGPD_SALT) {
    process.stderr.write(JSON.stringify({
      timestamp: new Date().toISOString(),
      severity:  'FATAL',
      event:     'salt_ausente',
      mensagem:  'LGPD_SALT env var ausente — encerrando para evitar PII sem anonimização.',
    }) + '\n');
    process.exit(1);
  }

  const { values } = parseArgs({
    options: {
      input:     { type: 'string' },
      output:    { type: 'string' },
      limit:     { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  if (!values.input) {
    process.stderr.write(
      'Uso: node anonymizer.js --input <prefix> [--limit N] [--dry-run]\n' +
      'Exemplo: node anonymizer.js --input cgu/contratos/2026 --limit 500\n'
    );
    process.exit(1);
  }

  const limite = parseInt(values.limit || '100', 10);
  const dryRun = values['dry-run'];

  log('INFO', 'cli_inicio', {
    input:       values.input,
    output:      values.output,
    limit:       limite,
    dry_run:     dryRun,
    bucket_raw:  RAW_BUCKET,
    bucket_clean: CLEAN_BUCKET,
  });

  // Carrega entidades públicas antes de processar
  await loadPublicEntities();

  // Processa o batch
  const resultado = await processBatch(values.input, limite, dryRun);

  // Exibe tabela final
  imprimirTabelaFinal(resultado);

  // Código de saída: 1 se houver erros no batch
  process.exit(resultado.erro > 0 ? 1 : 0);
}

// Executa apenas se invocado diretamente (não como módulo importado)
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    log('ERROR', 'erro_fatal', { mensagem: String(err.message), stack: err.stack });
    process.exit(1);
  });
}

// ============================================================
// Exports para uso como módulo em testes e outros scripts
// (funções sem export inline são re-exportadas aqui)
// ============================================================
export {
  loadPublicEntities,
  hashConteudo,
  REGEX,
  RAW_BUCKET,
  CLEAN_BUCKET,
};
