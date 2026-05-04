/**
 * @fileoverview Cloud Function HTTP callable — generateInitialPetition
 *
 * Gera petição inicial de revisão de indeferimento INSS em formato DOCX,
 * utilizando Vertex AI Gemini 2.5 Pro para elaboração da tese jurídica.
 *
 * Pré-condição obrigatória: o advogado deve ter aberto o contato do lead
 * via openContactBigData antes (lock em /lead_unlocks/{oab}_{leadId}).
 *
 * Paywall: desconta créditos do usuário conforme pricing em /pricing/leads_prev.
 *
 * Path destino no repo: functions/src/leads/generateInitialPetition.js
 *
 * @module generateInitialPetition
 */

'use strict';

const functions = require('firebase-functions');
const { logger } = require('firebase-functions');
const { HttpsError } = require('firebase-functions/v2/https');
const { Storage } = require('@google-cloud/storage');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const axios = require('axios');

const vertexProAdapter = require('./adapters/vertexProAdapter');
const cnpjAdapter = require('./adapters/cnpjAdapter');
const { fetchLeadByHash } = require('./utils/bqLeadFetcher');
const {
  getPricing,
  getSaldo,
  cobrarCreditos,
  getUnlockData,
  unlockExists,
} = require('./utils/firestoreCredits');

/** Projeto GCP */
const GCP_PROJECT = process.env.GCLOUD_PROJECT || 'transparenciabr';

/** Bucket GCS para templates e petições geradas */
const GCS_BUCKET = process.env.GCS_BUCKET || 'tbr-leads-staging';

/** Prefixo para templates de petição */
const TEMPLATE_PREFIX = 'templates/peticoes';

/** Prefixo para petições geradas */
const PETICOES_PREFIX = 'peticoes';

/** Validade do Signed URL em minutos */
const SIGNED_URL_MINUTES = 15;

/**
 * Mapeamento de tipo_acao → nome do template DOCX.
 * Sprint 1: apenas template_universal.docx.
 * Sprint 2: templates específicos por tipo_acao (decisão do Comandante).
 */
const TEMPLATE_MAP = {
  pcd_idade: 'template_universal.docx', // Sprint 2: → template_pcd.docx
  pcd_tempo: 'template_universal.docx', // Sprint 2: → template_pcd.docx
  bpc_idoso: 'template_universal.docx', // Sprint 2: → template_bpc.docx
  bpc_def: 'template_universal.docx',   // Sprint 2: → template_bpc.docx
  _default: 'template_universal.docx',
};

/**
 * Mapa de UF → Comarca Capital (simplificação v1).
 * Usado para preencher o campo {{COMARCA}} na petição.
 */
const UF_COMARCA_MAP = {
  AC: 'Rio Branco', AL: 'Maceió', AM: 'Manaus', AP: 'Macapá',
  BA: 'Salvador', CE: 'Fortaleza', DF: 'Brasília', ES: 'Vitória',
  GO: 'Goiânia', MA: 'São Luís', MG: 'Belo Horizonte', MS: 'Campo Grande',
  MT: 'Cuiabá', PA: 'Belém', PB: 'João Pessoa', PE: 'Recife',
  PI: 'Teresina', PR: 'Curitiba', RJ: 'Rio de Janeiro', RN: 'Natal',
  RO: 'Porto Velho', RR: 'Boa Vista', RS: 'Porto Alegre', SC: 'Florianópolis',
  SE: 'Aracaju', SP: 'São Paulo', TO: 'Palmas',
};

/**
 * Cloud Function HTTPS callable: generateInitialPetition
 *
 * Input: { leadId: string, advogadoOAB: string, advogadoCNPJ: string, templateOverride?: string }
 * Auth: obrigatória (context.auth)
 *
 * @type {functions.HttpsFunction}
 */
exports.generateInitialPetition = functions.https.onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 300, // 5 minutos — Vertex + DOCX podem demorar
    memory: '1GiB',
  },
  async (data, context) => {
    // ══════════════════════════════════════════════════════════════════════
    // 1. AUTENTICAÇÃO
    // ══════════════════════════════════════════════════════════════════════
    if (!context.auth) {
      logger.warn('generateInitialPetition: tentativa sem autenticação.');
      throw new HttpsError(
        'unauthenticated',
        'Autenticação obrigatória para gerar petições.'
      );
    }

    const uid = context.auth.uid;

    // ══════════════════════════════════════════════════════════════════════
    // 2. VALIDAÇÃO DE INPUT
    // ══════════════════════════════════════════════════════════════════════
    const { leadId, advogadoOAB, advogadoCNPJ, templateOverride } = data || {};

    if (!leadId || typeof leadId !== 'string' || !leadId.trim()) {
      throw new HttpsError('invalid-argument', 'leadId é obrigatório.');
    }
    if (!advogadoOAB || typeof advogadoOAB !== 'string' || !advogadoOAB.trim()) {
      throw new HttpsError('invalid-argument', 'advogadoOAB é obrigatório.');
    }
    if (!advogadoCNPJ || typeof advogadoCNPJ !== 'string' || !advogadoCNPJ.trim()) {
      throw new HttpsError('invalid-argument', 'advogadoCNPJ é obrigatório.');
    }

    const leadIdLimpo = leadId.trim();
    const oabLimpo = advogadoOAB.trim().toUpperCase();
    const cnpjLimpo = advogadoCNPJ.replace(/\D/g, '');

    const lockKey = `${oabLimpo}_${leadIdLimpo}`;
    // Chave de idempotência da petição — inclui tipo para separar da cobrança de contato
    const peticaoLockKey = `peticao_${oabLimpo}_${leadIdLimpo}`;

    logger.info('generateInitialPetition: iniciando processamento.', {
      uid,
      oab: oabLimpo,
      leadId: leadIdLimpo.slice(0, 8) + '...',
      lockKey,
    });

    // ══════════════════════════════════════════════════════════════════════
    // 3. PRÉ-CONDIÇÃO: unlock de contato deve existir
    // ══════════════════════════════════════════════════════════════════════
    let unlockData;
    try {
      unlockData = await getUnlockData(lockKey);
    } catch (err) {
      throw new HttpsError('internal', 'Erro ao verificar pré-condição de desbloqueio.');
    }

    if (!unlockData) {
      logger.warn('generateInitialPetition: unlock de contato inexistente.', { lockKey });
      throw new HttpsError(
        'failed-precondition',
        'É necessário desbloquear o contato do lead antes de gerar a petição. ' +
          'Chame openContactBigData primeiro. (must_unlock_contact_first)'
      );
    }

    // ══════════════════════════════════════════════════════════════════════
    // 4. PRICING E VERIFICAÇÃO DE SALDO
    // ══════════════════════════════════════════════════════════════════════
    let pricing;
    try {
      pricing = await getPricing();
    } catch (err) {
      throw new HttpsError('internal', 'Erro ao carregar tabela de preços.');
    }

    const custo = pricing.peticao_initial;

    let saldoAtual;
    try {
      saldoAtual = await getSaldo(uid);
    } catch (err) {
      throw new HttpsError('internal', 'Erro ao consultar saldo de créditos.');
    }

    if (saldoAtual < custo) {
      logger.warn('generateInitialPetition: saldo insuficiente.', {
        uid, saldo: saldoAtual, custo,
      });
      throw new HttpsError(
        'resource-exhausted',
        `Créditos insuficientes. Saldo: ${saldoAtual}. Necessário: ${custo}. (insufficient_credits)`
      );
    }

    // ══════════════════════════════════════════════════════════════════════
    // 5. BUSCAR LEAD NO BIGQUERY
    // ══════════════════════════════════════════════════════════════════════
    let lead;
    try {
      lead = await fetchLeadByHash(leadIdLimpo);
    } catch (err) {
      throw new HttpsError('internal', 'Erro ao consultar base de dados de leads.');
    }

    if (!lead) {
      throw new HttpsError('not-found', `Lead ${leadIdLimpo} não encontrado.`);
    }

    // ══════════════════════════════════════════════════════════════════════
    // 6. BUSCAR DADOS PÚBLICOS DO CNPJ DO ADVOGADO
    // ══════════════════════════════════════════════════════════════════════
    let dadosCnpj;
    try {
      dadosCnpj = await cnpjAdapter.fetchPublic(cnpjLimpo);
    } catch (err) {
      logger.warn('generateInitialPetition: falha ao buscar CNPJ — usando dados mínimos.', {
        message: err.message,
        cnpj: cnpjLimpo.slice(0, 8) + '***',
      });
      // Não bloqueia — advogado pode ter CNPJ individual ou falha pontual da API
      dadosCnpj = {
        razao_social: `OAB ${oabLimpo}`,
        nome_fantasia: '',
        endereco: 'Endereço não disponível — informar manualmente',
        telefone_publico: '',
        email: '',
        municipio: '',
        uf: '',
        cep: '',
        situacao_cadastral: 'DESCONHECIDA',
      };
    }

    // ══════════════════════════════════════════════════════════════════════
    // 7. VERTEX AI — GERAR TESE JURÍDICA
    // ══════════════════════════════════════════════════════════════════════
    logger.info('generateInitialPetition: solicitando tese jurídica ao Vertex AI.', {
      especie: lead.especie_beneficio,
      tipo_acao: lead.tipo_acao,
    });

    let tesesJuridicas;
    try {
      tesesJuridicas = await vertexProAdapter.generateLegalThesis({
        cpf: lead.cpf,
        nome: lead.nome || unlockData.leadNome || 'Requerente',
        motivo_indeferimento: lead.motivo_indeferimento,
        especie_beneficio: lead.especie_beneficio,
        tipo_acao: lead.tipo_acao,
        dt_indeferimento: lead.dt_indeferimento,
        uf: lead.uf,
      });
    } catch (err) {
      if (err.message?.startsWith('VERTEX_DAILY_CAP_EXCEEDED')) {
        throw new HttpsError(
          'resource-exhausted',
          'Limite diário de processamento Vertex AI atingido. Tente novamente amanhã.'
        );
      }
      logger.error('generateInitialPetition: falha no Vertex AI.', { message: err.message });
      throw new HttpsError('internal', 'Falha ao gerar tese jurídica. Tente novamente.');
    }

    // ══════════════════════════════════════════════════════════════════════
    // 8. SELECIONAR E RENDERIZAR TEMPLATE DOCX
    // ══════════════════════════════════════════════════════════════════════
    const templateNome = templateOverride || TEMPLATE_MAP[lead.tipo_acao] || TEMPLATE_MAP._default;
    const templatePath = `${TEMPLATE_PREFIX}/${templateNome}`;

    logger.info('generateInitialPetition: carregando template DOCX.', {
      templateNome,
      templatePath,
    });

    const storage = new Storage({ projectId: GCP_PROJECT });
    const bucket = storage.bucket(GCS_BUCKET);

    // Baixar template do GCS
    let templateBuffer;
    try {
      const [templateBytes] = await bucket.file(templatePath).download();
      templateBuffer = templateBytes;
    } catch (err) {
      logger.error('generateInitialPetition: template não encontrado no GCS.', {
        templatePath,
        message: err.message,
      });
      throw new HttpsError(
        'not-found',
        `Template ${templateNome} não encontrado. Verifique se o arquivo foi enviado para ` +
          `gs://${GCS_BUCKET}/${templatePath}`
      );
    }

    // Preparar variáveis de substituição
    const comarca = UF_COMARCA_MAP[lead.uf?.toUpperCase()] || lead.municipio || 'Comarca não identificada';
    const dataHoje = _formatDataBR(new Date());

    const templateVars = {
      // Advogado
      ADVOGADO_NOME: dadosCnpj.razao_social || `OAB ${oabLimpo}`,
      ADVOGADO_OAB: oabLimpo,
      ADVOGADO_CNPJ: _formatCnpj(cnpjLimpo),
      ADVOGADO_ENDERECO: dadosCnpj.endereco || 'Endereço não informado',

      // Lead (dados do unlock BigData)
      LEAD_NOME: unlockData.leadNome || lead.nome || 'Requerente',
      LEAD_CPF: _formatCpf(lead.cpf || ''),
      LEAD_ENDERECO: unlockData.address
        ? _formatEnderecoUnlock(unlockData.address)
        : 'Endereço a confirmar com cliente',

      // Dados do caso
      ESPECIE_NOME: lead.especie_beneficio || 'Benefício Previdenciário',
      MOTIVO_INDEFERIMENTO: lead.motivo_indeferimento || 'Motivo não especificado',
      DT_INDEFERIMENTO: _formatDataBR(lead.dt_indeferimento) || 'Data não informada',

      // Tese jurídica (Vertex AI)
      TESE_JURIDICA: tesesJuridicas.tese || '',
      FUNDAMENTOS: _listaParaTexto(tesesJuridicas.fundamentos),
      JURISPRUDENCIAS: _listaParaTexto(tesesJuridicas.jurisprudencias),
      PEDIDOS: _listaParaTexto(tesesJuridicas.pedidos),

      // Localização e data
      DATA_HOJE: dataHoje,
      COMARCA: comarca,
    };

    // Renderizar DOCX com docxtemplater
    let docxBuffer;
    try {
      const zip = new PizZip(templateBuffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });

      doc.render(templateVars);
      docxBuffer = doc.getZip().generate({ type: 'nodebuffer' });
    } catch (err) {
      logger.error('generateInitialPetition: erro ao renderizar DOCX.', {
        message: err.message,
        properties: err.properties,
      });
      throw new HttpsError(
        'internal',
        'Erro ao gerar documento DOCX. Verifique o template e tente novamente.'
      );
    }

    // ══════════════════════════════════════════════════════════════════════
    // 9. UPLOAD DO DOCX GERADO PARA GCS
    // ══════════════════════════════════════════════════════════════════════
    const timestamp = Date.now();
    const peticaoId = `${oabLimpo}_${leadIdLimpo}_${timestamp}`;
    const gcsPath = `${PETICOES_PREFIX}/${oabLimpo}/${leadIdLimpo}_${timestamp}.docx`;

    logger.info('generateInitialPetition: fazendo upload para GCS.', { gcsPath });

    try {
      const gcsFile = bucket.file(gcsPath);
      await gcsFile.save(docxBuffer, {
        metadata: {
          contentType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          metadata: {
            leadId: leadIdLimpo,
            oab: oabLimpo,
            uid,
            geradoEm: new Date().toISOString(),
            modelo: 'gemini-2.5-pro',
          },
        },
      });
    } catch (err) {
      logger.error('generateInitialPetition: falha no upload GCS.', { message: err.message });
      throw new HttpsError('internal', 'Erro ao salvar petição. Tente novamente.');
    }

    // ══════════════════════════════════════════════════════════════════════
    // 10. GERAR SIGNED URL (15 minutos)
    // ══════════════════════════════════════════════════════════════════════
    let downloadUrl;
    try {
      const [signedUrl] = await bucket.file(gcsPath).getSignedUrl({
        action: 'read',
        expires: Date.now() + SIGNED_URL_MINUTES * 60 * 1000,
      });
      downloadUrl = signedUrl;
    } catch (err) {
      logger.error('generateInitialPetition: falha ao gerar Signed URL.', { message: err.message });
      throw new HttpsError('internal', 'Petição gerada mas erro ao criar link de download.');
    }

    // ══════════════════════════════════════════════════════════════════════
    // 11. COBRAR CRÉDITOS EM TRANSAÇÃO FIRESTORE
    // ══════════════════════════════════════════════════════════════════════
    let resultadoCobranca;
    try {
      resultadoCobranca = await cobrarCreditos({
        uid,
        lockKey: peticaoLockKey,
        custo,
        tipo: 'peticao_initial',
        leadId: leadIdLimpo,
        unlockData: {
          oab: oabLimpo,
          peticaoId,
          gcsPath,
          templateUsado: templateNome,
          geradoEm: new Date().toISOString(),
        },
      });
    } catch (err) {
      if (err.message?.startsWith('SALDO_INSUFICIENTE')) {
        throw new HttpsError(
          'resource-exhausted',
          'Créditos insuficientes (verificação concorrente). (insufficient_credits)'
        );
      }
      logger.error('generateInitialPetition: falha na transação de cobrança.', {
        message: err.message,
      });
      // Petição já gerada e salva no GCS — log de erro mas entrega o documento
      logger.warn('generateInitialPetition: ATENÇÃO — petição entregue sem cobrança. Investigar!', {
        uid, peticaoId, custo,
      });
      // Em produção: acionar alerta de billing
      resultadoCobranca = { creditosRestantes: saldoAtual, foiIdempotente: false };
    }

    // ══════════════════════════════════════════════════════════════════════
    // 12. RETORNO
    // ══════════════════════════════════════════════════════════════════════
    logger.info('generateInitialPetition: petição gerada e entregue com sucesso.', {
      uid,
      peticaoId,
      gcsPath,
      custo,
      creditsRemaining: resultadoCobranca.creditosRestantes,
    });

    return {
      success: true,
      downloadUrl,
      peticaoId,
      creditsRemaining: resultadoCobranca.creditosRestantes,
      _meta: {
        templateUsado: templateNome,
        comarca,
        gcsPath,
        signedUrlExpiraEm: new Date(Date.now() + SIGNED_URL_MINUTES * 60 * 1000).toISOString(),
      },
    };
  }
);

// ── Helpers de formatação ─────────────────────────────────────────────────────

/**
 * Formata CPF no padrão XXX.XXX.XXX-XX.
 * @param {string} cpf
 * @returns {string}
 */
function _formatCpf(cpf) {
  const c = cpf.replace(/\D/g, '');
  if (c.length !== 11) return cpf;
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
}

/**
 * Formata CNPJ no padrão XX.XXX.XXX/XXXX-XX.
 * @param {string} cnpj
 * @returns {string}
 */
function _formatCnpj(cnpj) {
  const c = cnpj.replace(/\D/g, '');
  if (c.length !== 14) return cnpj;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

/**
 * Formata data no padrão DD/MM/AAAA.
 * @param {Date|string} data
 * @returns {string}
 */
function _formatDataBR(data) {
  if (!data) return '';
  const d = data instanceof Date ? data : new Date(data);
  if (isNaN(d.getTime())) return String(data);
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/**
 * Converte array de strings em texto numerado para inserção no DOCX.
 * @param {string[]} lista
 * @returns {string}
 */
function _listaParaTexto(lista) {
  if (!Array.isArray(lista) || lista.length === 0) return 'Não disponível.';
  return lista.map((item, i) => `${i + 1}. ${item}`).join('\n');
}

/**
 * Formata endereço do unlock BigData para string legível.
 * @param {Object} address
 * @returns {string}
 */
function _formatEnderecoUnlock(address) {
  if (!address) return '';
  return [
    address.logradouro,
    address.numero ? `, ${address.numero}` : '',
    address.municipio ? ` — ${address.municipio}` : '',
    address.uf ? `/${address.uf}` : '',
    address.cep ? ` — CEP ${address.cep}` : '',
  ]
    .join('')
    .trim();
}
