/**
 * generateHotpages.js — Gerar hotpages para 594 parlamentares
 * 
 * Executa uma vez para popular Firestore com dados básicos
 * Cada hotpage contém:
 * - Dados básicos (foto, nome, partido, UF)
 * - Resumo de gastos (CEAP, emendas, fornecedores)
 * - Botões CTA: "Ver notas CEAP (100 cr)" e "Dossier Forense (800 cr)"
 * 
 * Run: firebase functions:shell
 *      > generateHotpages()
 */

import { BigQuery } from '@google-cloud/bigquery';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import fetch from 'node-fetch';

const bq = new BigQuery({ projectId: 'transparenciabr' });
const db = getFirestore();

export const generateHotpages = onCall(
  { region: 'southamerica-east1', memory: '2GiB', timeoutSeconds: 600 },
  async (request) => {
    // Verificar permissão (apenas admin)
    if (request.auth?.token?.admin !== true) {
      throw new HttpsError('permission-denied', 'Apenas admins podem gerar hotpages');
    }

    try {
      console.log('🚀 Iniciando geração de hotpages...');

      // 1. Buscar lista de parlamentares do roster
      const rosterQuery = `
        SELECT
          id_parlamentar,
          nome_completo,
          partido,
          sigla_partido,
          uf,
          foto_url,
          casa,
          situacao
        FROM \`transparenciabr.analytics.dim_parlamentar\`
        WHERE situacao IN ('EXERCICIO', 'LICENCA')
        ORDER BY casa DESC, nome_completo ASC
      `;

      const [parlamentares] = await bq.query({ query: rosterQuery });
      console.log(`📊 Encontrados ${parlamentares.length} parlamentares`);

      // 2. Para cada parlamentar, buscar resumo de gastos
      const hotpages = [];
      let processed = 0;

      for (const parl of parlamentares) {
        try {
          // Resumo CEAP
          const ceapQuery = `
            SELECT
              COUNT(*) as total_notas,
              SUM(valor_liquido) as valor_total,
              AVG(valor_liquido) as valor_medio,
              COUNT(DISTINCT fornecedor) as num_fornecedores,
              COUNT(DISTINCT tipo_despesa) as num_tipos
            FROM \`transparenciabr.ceap_despesas\`
            WHERE parlamentar_id = @parlamentar_id
          `;

          const [ceapData] = await bq.query({
            query: ceapQuery,
            params: { parlamentar_id: parl.id_parlamentar },
          });

          const ceap = ceapData[0] || {};

          // Resumo Emendas (PIX + RP6-RP9)
          const emendasQuery = `
            SELECT
              COUNT(*) as total_emendas,
              SUM(valor_pago) as valor_total_pago,
              COUNT(DISTINCT cod_ibge) as municipios_beneficiados
            FROM \`transparenciabr.analytics.fato_emenda_pix\`
            WHERE id_parlamentar = @parlamentar_id
              AND situacao_execucao = 'PAGO'
          `;

          const [emendasData] = await bq.query({
            query: emendasQuery,
            params: { parlamentar_id: parl.id_parlamentar },
          });

          const emendas = emendasData[0] || {};

          // Score de risco básico (Lei Benford)
          const riskQuery = `
            SELECT
              ROUND(AVG(desvio_z), 4) as score_benford,
              COUNTIF(desvio_z > 0.30) as digitos_anomalos
            FROM (
              SELECT
                CAST(SUBSTR(CAST(ABS(valor_liquido) AS STRING), 1, 1) AS INT64) as primeiro_digito,
                ABS(
                  (COUNT(*) / SUM(COUNT(*)) OVER()) - LOG10(1 + 1/CAST(SUBSTR(CAST(ABS(valor_liquido) AS STRING), 1, 1) AS INT64))
                ) as desvio_z
              FROM \`transparenciabr.ceap_despesas\`
              WHERE parlamentar_id = @parlamentar_id
                AND valor_liquido > 0
              GROUP BY primeiro_digito
            )
          `;

          const [riskData] = await bq.query({
            query: riskQuery,
            params: { parlamentar_id: parl.id_parlamentar },
          });

          const risk = riskData[0] || {};

          // Montar hotpage
          const hotpage = {
            id_parlamentar: parl.id_parlamentar,
            nome_completo: parl.nome_completo,
            partido: parl.partido,
            sigla_partido: parl.sigla_partido,
            uf: parl.uf,
            foto_url: parl.foto_url,
            casa: parl.casa,
            situacao: parl.situacao,

            // Resumos
            ceap: {
              total_notas: ceap.total_notas || 0,
              valor_total: ceap.valor_total || 0,
              valor_medio: ceap.valor_medio || 0,
              num_fornecedores: ceap.num_fornecedores || 0,
              num_tipos: ceap.num_tipos || 0,
            },

            emendas: {
              total_emendas: emendas.total_emendas || 0,
              valor_total_pago: emendas.valor_total_pago || 0,
              municipios_beneficiados: emendas.municipios_beneficiados || 0,
            },

            // Score de risco
            score_benford: risk.score_benford || 0,
            digitos_anomalos: risk.digitos_anomalos || 0,
            nivel_risco: risk.score_benford > 0.20 ? 'ALTO' : 'MEDIO',

            // Timestamps
            created_at: new Date(),
            updated_at: new Date(),
          };

          hotpages.push(hotpage);
          processed++;

          if (processed % 50 === 0) {
            console.log(`✅ ${processed}/${parlamentares.length} hotpages processados`);
          }
        } catch (error) {
          console.error(`Erro ao processar ${parl.nome_completo} (${parl.id_parlamentar}):`, error.message);
        }
      }

      // 3. Salvar hotpages no Firestore (batch)
      console.log(`💾 Salvando ${hotpages.length} hotpages no Firestore...`);

      const batch = db.batch();
      let batchCount = 0;

      for (const hotpage of hotpages) {
        const docRef = db
          .collection('parlamentares')
          .doc(hotpage.id_parlamentar);

        batch.set(docRef, hotpage, { merge: true });
        batchCount++;

        if (batchCount % 100 === 0) {
          await batch.commit();
          console.log(`✅ ${batchCount} documentos salvos`);
        }
      }

      // Commit final
      if (batchCount % 100 !== 0) {
        await batch.commit();
      }

      console.log(`✅ Todas as ${hotpages.length} hotpages foram salvas!`);

      return {
        success: true,
        message: `${hotpages.length} hotpages geradas com sucesso`,
        total: hotpages.length,
      };
    } catch (error) {
      console.error('Erro ao gerar hotpages:', error.message);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Erro ao gerar hotpages: ${error.message}`);
    }
  }
);

/**
 * getHotpage.js — Buscar hotpage de um parlamentar
 * 
 * Endpoint: GET /getHotpage?parlamentar_id=XXX
 * Gratuito (sem custo de créditos)
 */
export const getHotpage = onCall(
  { region: 'southamerica-east1', memory: '512MB', timeoutSeconds: 10 },
  async (request) => {
    const { parlamentar_id } = request.data;

    if (!parlamentar_id) throw new HttpsError('invalid-argument', 'parlamentar_id obrigatório');

    try {
      const docRef = db.collection('parlamentares').doc(parlamentar_id);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new HttpsError('not-found', `Parlamentar ${parlamentar_id} não encontrado`);
      }

      return {
        success: true,
        data: doc.data(),
      };
    } catch (error) {
      console.error('getHotpage error:', error.message);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Erro ao buscar hotpage: ${error.message}`);
    }
  }
);
