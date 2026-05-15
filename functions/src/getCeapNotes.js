/**
 * getCeapNotes.js — Trazer notas CEAP processadas do BigQuery
 * 
 * Endpoint: GET /getCeapNotes?parlamentar_id=XXX&limit=100
 * Custo: 100 créditos para acesso completo
 * 
 * Retorna lista de notas CEAP com:
 * - data_emissao, tipo_despesa, valor_liquido
 * - fornecedor, cnpj, url_documento (clicável)
 * - flags de risco (Lei Benford, anomalia temporal, etc)
 */

import { BigQuery } from '@google-cloud/bigquery';
import { onCall } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();
const bq = new BigQuery({ projectId: 'transparenciabr' });

export const getCeapNotes = onCall(
  { region: 'southamerica-east1', memory: '2GiB', timeoutSeconds: 300 },
  async (request) => {
    const { parlamentar_id, limit = 100, offset = 0 } = request.data;
    const uid = request.auth?.uid;

    if (!uid) throw new Error('Usuário não autenticado');
    if (!parlamentar_id) throw new Error('parlamentar_id obrigatório');

    try {
      // Verificar créditos do usuário
      const userDoc = await db.collection('users').doc(uid).get();
      const credits = userDoc.data()?.credits || 0;

      if (credits < 100) {
        throw new Error(`Créditos insuficientes: ${credits}/100`);
      }

      // Query BigQuery para trazer notas CEAP
      const query = `
        SELECT
          parlamentar_id,
          autor,
          ano,
          mes,
          data_emissao,
          tipo_despesa,
          cod_documento,
          tipo_documento,
          num_documento,
          valor_documento,
          valor_glosa,
          valor_liquido,
          fornecedor,
          cnpj_cpf_fornecedor,
          url_documento,
          -- Flags de risco
          CASE 
            WHEN valor_liquido > 5000 THEN 'ALTO'
            WHEN valor_liquido > 2000 THEN 'MEDIO'
            ELSE 'BAIXO'
          END as flag_valor,
          -- Lei Benford (primeiro dígito)
          CAST(SUBSTR(CAST(ABS(valor_liquido) AS STRING), 1, 1) AS INT64) as primeiro_digito,
          fetched_at
        FROM \`transparenciabr.ceap_despesas\`
        WHERE parlamentar_id = @parlamentar_id
        ORDER BY data_emissao DESC
        LIMIT @limit OFFSET @offset
      `;

      const options = {
        query,
        params: {
          parlamentar_id,
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      };

      const [rows] = await bq.query(options);

      // Contar total de notas
      const countQuery = `
        SELECT COUNT(*) as total
        FROM \`transparenciabr.ceap_despesas\`
        WHERE parlamentar_id = @parlamentar_id
      `;

      const [countRows] = await bq.query({
        query: countQuery,
        params: { parlamentar_id },
      });

      const total = countRows[0]?.total || 0;

      // Debitar créditos
      await db
        .collection('users')
        .doc(uid)
        .update({
          credits: credits - 100,
          last_ceap_access: new Date(),
        });

      // Log de acesso
      await db.collection('audit_logs').add({
        uid,
        action: 'getCeapNotes',
        parlamentar_id,
        timestamp: new Date(),
        credits_charged: 100,
      });

      return {
        success: true,
        data: rows,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: offset + parseInt(limit) < total,
        },
        credits_remaining: credits - 100,
      };
    } catch (error) {
      console.error('❌ getCeapNotes error:', error);
      throw new Error(`Erro ao buscar notas CEAP: ${error.message}`);
    }
  }
);

/**
 * getCeapSummary.js — Resumo de notas CEAP (gratuito)
 * 
 * Retorna:
 * - Total de notas
 * - Valor total gasto
 * - Tipo de despesa mais comum
 * - Fornecedor mais frequente
 */
export const getCeapSummary = onCall(
  { region: 'southamerica-east1', memory: '1GiB', timeoutSeconds: 60 },
  async (request) => {
    const { parlamentar_id } = request.data;

    if (!parlamentar_id) throw new Error('parlamentar_id obrigatório');

    try {
      const query = `
        SELECT
          COUNT(*) as total_notas,
          SUM(valor_liquido) as valor_total,
          AVG(valor_liquido) as valor_medio,
          MAX(valor_liquido) as valor_maximo,
          MIN(valor_liquido) as valor_minimo,
          -- Tipo de despesa mais comum
          (SELECT tipo_despesa FROM \`transparenciabr.ceap_despesas\`
           WHERE parlamentar_id = @parlamentar_id
           GROUP BY tipo_despesa
           ORDER BY COUNT(*) DESC
           LIMIT 1) as tipo_despesa_mais_comum,
          -- Fornecedor mais frequente
          (SELECT fornecedor FROM \`transparenciabr.ceap_despesas\`
           WHERE parlamentar_id = @parlamentar_id
           GROUP BY fornecedor
           ORDER BY COUNT(*) DESC
           LIMIT 1) as fornecedor_mais_frequente
        FROM \`transparenciabr.ceap_despesas\`
        WHERE parlamentar_id = @parlamentar_id
      `;

      const [rows] = await bq.query({
        query,
        params: { parlamentar_id },
      });

      return {
        success: true,
        data: rows[0] || {},
      };
    } catch (error) {
      console.error('❌ getCeapSummary error:', error);
      throw new Error(`Erro ao buscar resumo CEAP: ${error.message}`);
    }
  }
);
