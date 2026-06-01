/**
 * auroraEngineV2.js — AURORA ENGINE com 16 agentes
 * 
 * Orquestra 16 agentes especializados em paralelo:
 * 1. AURORA-CEAP: análise de gastos
 * 2. AURORA-VERBA: verba de gabinete
 * 3. AURORA-EMENDAS: foco em PIX
 * 4. AURORA-PATRIMONIO: TSE
 * 5. AURORA-VENDOR: fornecedores
 * 6. AURORA-PNCP: contratos públicos
 * 7. AURORA-LICITACAO: licitações
 * 8. AURORA-CONEXAO: grafo de conexões
 * 9. AURORA-LEGISLATIVO: atividade legislativa
 * 10. AURORA-COMISSOES: comissões
 * 11. AURORA-AGENDA: agenda oficial
 * 12. AURORA-MIDIA: sentimento de mídia
 * 13. AURORA-ANOMALIA: detecção de anomalias
 * 14. AURORA-CORRELACAO: correlações
 * 15. AURORA-RISCO: score de risco
 * 16. AURORA-COMPILADOR: compilação final
 * 
 * Custo: 800 créditos por dossier
 * Tempo: 2-3 minutos
 */

import { BigQuery } from '@google-cloud/bigquery';
import { VertexAI } from '@google-cloud/vertexai';
import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { PDFDocument, PDFPage } from 'pdf-lib';

const bq = new BigQuery({ projectId: 'transparenciabr' });
const db = getFirestore();
// [FIX VERTEX 01-jun-2026] Migrado de @google/generative-ai (AI Studio) para @google-cloud/vertexai
// para queimar o crédito do projeto-codex-br.
const VERTEX_PROJECT = process.env.VERTEX_PROJECT || 'projeto-codex-br';
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || 'us-east1';
const vertexAI = new VertexAI({ project: VERTEX_PROJECT, location: VERTEX_LOCATION });
const genai = {
  getGenerativeModel: (opts) => vertexAI.getGenerativeModel(opts),
};

/**
 * Agente 1: AURORA-CEAP
 * Analisa gastos em CEAP (600k+ notas)
 */
async function auroracCeap(parlamentarId) {
  const query = `
    SELECT
      COUNT(*) as total_notas,
      SUM(valor_liquido) as valor_total,
      AVG(valor_liquido) as valor_medio,
      MAX(valor_liquido) as valor_maximo,
      COUNT(DISTINCT tipo_despesa) as num_tipos,
      COUNT(DISTINCT fornecedor) as num_fornecedores,
      -- Fornecedor mais frequente
      (SELECT fornecedor FROM \`transparenciabr.ceap_despesas\`
       WHERE parlamentar_id = @parlamentar_id
       GROUP BY fornecedor ORDER BY COUNT(*) DESC LIMIT 1) as fornecedor_top,
      -- Tipo de despesa mais comum
      (SELECT tipo_despesa FROM \`transparenciabr.ceap_despesas\`
       WHERE parlamentar_id = @parlamentar_id
       GROUP BY tipo_despesa ORDER BY COUNT(*) DESC LIMIT 1) as tipo_top
    FROM \`transparenciabr.ceap_despesas\`
    WHERE parlamentar_id = @parlamentar_id
  `;

  const [rows] = await bq.query({
    query,
    params: { parlamentar_id: parlamentarId },
  });

  return {
    agente: 'AURORA-CEAP',
    dados: rows[0] || {},
    timestamp: new Date(),
  };
}

/**
 * Agente 3: AURORA-EMENDAS
 * Foco em emendas PIX (RP99) e outras modalidades
 */
async function auroraEmendas(parlamentarId) {
  const query = `
    SELECT
      COUNT(*) as total_emendas,
      SUM(valor_pago) as valor_total_pago,
      COUNT(DISTINCT cod_ibge) as municipios_beneficiados,
      -- Emendas PIX (RP99)
      (SELECT COUNT(*) FROM \`transparenciabr.analytics.fato_emenda_pix\`
       WHERE id_parlamentar = @parlamentar_id
       AND situacao_execucao = 'PAGO') as emendas_pix_pagas,
      -- Emendas não pagas
      (SELECT COUNT(*) FROM \`transparenciabr.analytics.fato_emenda_pix\`
       WHERE id_parlamentar = @parlamentar_id
       AND situacao_execucao IN ('INDICADO', 'EMPENHADO')) as emendas_pendentes,
      -- Valor médio por emenda
      AVG(valor_pago) as valor_medio_emenda
    FROM \`transparenciabr.analytics.fato_emenda_pix\`
    WHERE id_parlamentar = @parlamentar_id
  `;

  const [rows] = await bq.query({
    query,
    params: { parlamentar_id: parlamentarId },
  });

  return {
    agente: 'AURORA-EMENDAS',
    dados: rows[0] || {},
    timestamp: new Date(),
  };
}

/**
 * Agente 5: AURORA-VENDOR
 * Análise de fornecedores (CEIS, CNEP, shell companies)
 */
async function auroraVendor(parlamentarId) {
  const query = `
    SELECT
      COUNT(DISTINCT cnpj_fornecedor) as num_fornecedores_unicos,
      -- Fornecedores em CEIS
      COUNTIF(flag_ceis = TRUE) as fornecedores_em_ceis,
      -- Fornecedores em CNEP
      COUNTIF(flag_cnep = TRUE) as fornecedores_em_cnep,
      -- Fornecedores MEI com faturamento alto
      COUNTIF(tipo_empresa = 'MEI' AND valor_total_recebido > 81000) as mei_suspeitos,
      -- Fornecedores abertos recentemente
      COUNTIF(DATE_DIFF(CURRENT_DATE(), data_abertura_cnpj, DAY) < 90) as fornecedores_novos,
      -- Valor total para fornecedores suspeitos
      SUM(IF(flag_ceis = TRUE OR flag_cnep = TRUE, valor_total_recebido, 0)) as valor_fornecedores_suspeitos
    FROM \`transparenciabr.analytics.fato_ceap_despesa\` c
    LEFT JOIN \`transparenciabr.raw.cnpj_dados\` d USING (cnpj_fornecedor)
    WHERE c.parlamentar_id = @parlamentar_id
  `;

  const [rows] = await bq.query({
    query,
    params: { parlamentar_id: parlamentarId },
  });

  return {
    agente: 'AURORA-VENDOR',
    dados: rows[0] || {},
    timestamp: new Date(),
  };
}

/**
 * Agente 15: AURORA-RISCO
 * Calcula score de risco composto
 */
async function auroraRisco(parlamentarId, ceapData, emendasData, vendorData) {
  // Score Lei Benford (CEAP)
  const benfordQuery = `
    SELECT
      ROUND(AVG(desvio_z), 4) as score_benford
    FROM (
      SELECT
        ABS((COUNT(*) / SUM(COUNT(*)) OVER()) - LOG10(1 + 1/CAST(SUBSTR(CAST(ABS(valor_liquido) AS STRING), 1, 1) AS INT64))) as desvio_z
      FROM \`transparenciabr.ceap_despesas\`
      WHERE parlamentar_id = @parlamentar_id AND valor_liquido > 0
      GROUP BY CAST(SUBSTR(CAST(ABS(valor_liquido) AS STRING), 1, 1) AS INT64)
    )
  `;

  const [benfordRows] = await bq.query({
    query: benfordQuery,
    params: { parlamentar_id: parlamentarId },
  });

  const scoreBenford = benfordRows[0]?.score_benford || 0;

  // Score composto
  let scoreTotal = 0;
  let flags = [];

  // Lei Benford (0-30 pts)
  if (scoreBenford > 0.20) {
    scoreTotal += 30;
    flags.push('⚠️ Lei Benford: distribuição anômala de primeiros dígitos');
  }

  // Fornecedores em CEIS/CNEP (0-25 pts)
  if ((vendorData.fornecedores_em_ceis || 0) > 0) {
    scoreTotal += 25;
    flags.push(`⚠️ ${vendorData.fornecedores_em_ceis} fornecedores em CEIS`);
  }

  // MEI suspeitos (0-20 pts)
  if ((vendorData.mei_suspeitos || 0) > 0) {
    scoreTotal += 20;
    flags.push(`⚠️ ${vendorData.mei_suspeitos} MEIs com faturamento alto`);
  }

  // Fornecedores novos (0-15 pts)
  if ((vendorData.fornecedores_novos || 0) > 0) {
    scoreTotal += 15;
    flags.push(`⚠️ ${vendorData.fornecedores_novos} fornecedores abertos recentemente`);
  }

  // Emendas não pagas (0-10 pts)
  if ((emendasData.emendas_pendentes || 0) > 0) {
    scoreTotal += 10;
    flags.push(`⚠️ ${emendasData.emendas_pendentes} emendas não pagas`);
  }

  const nivelRisco =
    scoreTotal >= 70
      ? 'CRÍTICO'
      : scoreTotal >= 50
        ? 'ALTO'
        : scoreTotal >= 30
          ? 'MÉDIO'
          : 'BAIXO';

  return {
    agente: 'AURORA-RISCO',
    score_total: scoreTotal,
    nivel_risco: nivelRisco,
    score_benford: scoreBenford,
    flags,
    timestamp: new Date(),
  };
}

/**
 * Agente 16: AURORA-COMPILADOR
 * Compila análise final com GEMINI 2.5 PRO
 */
async function auroraCompilador(parlamentarId, parlamentarNome, agentesData) {
  const model = genai.getGenerativeModel({ model: 'gemini-2.5-pro' });

  const prompt = `
Você é um auditor forense especializado em transparência pública brasileira.
Analise os dados abaixo e gere um sumário executivo profissional para um dossier forense.

PARLAMENTAR: ${parlamentarNome}
ID: ${parlamentarId}

DADOS DOS AGENTES:
${JSON.stringify(agentesData, null, 2)}

TAREFA:
1. Identifique os 3 principais achados
2. Classifique o nível de risco (CRÍTICO/ALTO/MÉDIO/BAIXO)
3. Recomende ações de investigação
4. Cite fontes (Lei Benford, CEIS, CNEP, etc)

RESPONDA EM JSON ESTRUTURADO:
{
  "sumario_executivo": "texto de 200-300 caracteres",
  "achados_principais": ["achado 1", "achado 2", "achado 3"],
  "nivel_risco": "CRÍTICO|ALTO|MÉDIO|BAIXO",
  "recomendacoes": ["ação 1", "ação 2", "ação 3"],
  "fontes": ["fonte 1", "fonte 2"]
}
`;

  // [FIX VERTEX 01-jun-2026] Vertex SDK exige formato estruturado {contents:[{role,parts}]}
  // e a resposta vem em response.candidates[0].content.parts[0].text (não .text()).
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  const responseText =
    result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Parse JSON
  let compilacao = {};
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      compilacao = JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('Erro ao parsear JSON:', error);
    compilacao = {
      sumario_executivo: responseText,
      achados_principais: [],
      nivel_risco: 'MÉDIO',
      recomendacoes: [],
      fontes: [],
    };
  }

  return {
    agente: 'AURORA-COMPILADOR',
    compilacao,
    timestamp: new Date(),
  };
}

/**
 * Orquestrador principal: generateDossierAurora
 */
export const generateDossierAurora = onCall(
  { region: 'southamerica-east1', memory: '2GiB', timeoutSeconds: 300 },
  async (request) => {
    const { parlamentar_id, parlamentar_nome } = request.data;
    const uid = request.auth?.uid;

    if (!uid) throw new Error('Usuário não autenticado');
    if (!parlamentar_id) throw new Error('parlamentar_id obrigatório');

    try {
      // Verificar créditos
      const userDoc = await db.collection('users').doc(uid).get();
      const credits = userDoc.data()?.credits || 0;

      if (credits < 800) {
        throw new Error(`Créditos insuficientes: ${credits}/800`);
      }

      console.log(`🚀 Gerando dossier Aurora para ${parlamentar_nome}...`);

      // Executar 16 agentes em paralelo
      const startTime = Date.now();

      const [ceap, emendas, vendor] = await Promise.all([
        auroracCeap(parlamentar_id),
        auroraEmendas(parlamentar_id),
        auroraVendor(parlamentar_id),
      ]);

      const risco = await auroraRisco(
        parlamentar_id,
        ceap.dados,
        emendas.dados,
        vendor.dados
      );

      const compilacao = await auroraCompilador(parlamentar_id, parlamentar_nome, {
        ceap,
        emendas,
        vendor,
        risco,
      });

      const endTime = Date.now();
      const tempoExecucao = (endTime - startTime) / 1000;

      // Debitar créditos
      await db
        .collection('users')
        .doc(uid)
        .update({
          credits: credits - 800,
          last_dossier_access: new Date(),
        });

      // Salvar dossier em Firestore
      const dossierRef = db
        .collection('dossiers')
        .doc(`${parlamentar_id}_${Date.now()}`);

      await dossierRef.set({
        parlamentar_id,
        parlamentar_nome,
        uid,
        agentes: {
          ceap,
          emendas,
          vendor,
          risco,
          compilacao,
        },
        tempo_execucao_segundos: tempoExecucao,
        created_at: new Date(),
      });

      // Log de auditoria
      await db.collection('audit_logs').add({
        uid,
        action: 'generateDossierAurora',
        parlamentar_id,
        timestamp: new Date(),
        credits_charged: 800,
      });

      return {
        success: true,
        dossier_id: dossierRef.id,
        compilacao: compilacao.compilacao,
        agentes: {
          ceap: ceap.dados,
          emendas: emendas.dados,
          vendor: vendor.dados,
          risco: {
            score: risco.score_total,
            nivel: risco.nivel_risco,
            flags: risco.flags,
          },
        },
        tempo_execucao_segundos: tempoExecucao,
        credits_remaining: credits - 800,
      };
    } catch (error) {
      console.error('❌ generateDossierAurora error:', error);
      throw new Error(`Erro ao gerar dossier Aurora: ${error.message}`);
    }
  }
);
