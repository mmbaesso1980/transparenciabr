/**
 * getUniversoGraph.js — Buscar grafo de conexões entre parlamentares
 * 
 * Endpoint: GET /getUniversoGraph?filtro_partido=PT&filtro_tipo_conexao=empresa_comum
 * Custo: 200 créditos
 * 
 * Retorna grafo 3D com:
 * - Nós: parlamentares, empresas, pessoas
 * - Links: conexões entre nós
 * - Atributos: tipo, tamanho, cor
 */

import { BigQuery } from '@google-cloud/bigquery';
import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

const bq = new BigQuery({ projectId: 'transparenciabr' });
const db = getFirestore();

export const getUniversoGraph = onCall(
  { region: 'southamerica-east1', memory: '2GiB', timeoutSeconds: 120 },
  async (request) => {
    const { filtro_partido, filtro_tipo_conexao } = request.data;
    const uid = request.auth?.uid;

    if (!uid) throw new Error('Usuário não autenticado');

    try {
      // Verificar créditos
      const userDoc = await db.collection('users').doc(uid).get();
      const credits = userDoc.data()?.credits || 0;

      if (credits < 200) {
        throw new Error(`Créditos insuficientes: ${credits}/200`);
      }

      console.log('🚀 Gerando grafo de conexões...');

      // Query 1: Buscar parlamentares
      const parlamentaresQuery = `
        SELECT
          id_parlamentar,
          nome_completo,
          partido,
          sigla_partido,
          uf,
          COUNT(DISTINCT fornecedor) as num_fornecedores
        FROM \`transparenciabr.analytics.dim_parlamentar\` p
        LEFT JOIN \`transparenciabr.ceap_despesas\` c ON p.id_parlamentar = c.parlamentar_id
        ${filtro_partido ? 'WHERE p.sigla_partido = @partido' : ''}
        GROUP BY id_parlamentar, nome_completo, partido, sigla_partido, uf
        LIMIT 100
      `;

      const params = {};
      if (filtro_partido) params.partido = filtro_partido;

      const [parlamentares] = await bq.query({
        query: parlamentaresQuery,
        params,
      });

      console.log(`📊 ${parlamentares.length} parlamentares encontrados`);

      // Query 2: Buscar empresas comuns
      const empresasQuery = `
        SELECT
          c1.fornecedor as empresa,
          c1.cnpj_cpf_fornecedor as cnpj,
          COUNT(DISTINCT c1.parlamentar_id) as num_parlamentares,
          SUM(c1.valor_liquido) as valor_total,
          ARRAY_AGG(DISTINCT c1.parlamentar_id) as parlamentares_ids
        FROM \`transparenciabr.ceap_despesas\` c1
        WHERE c1.parlamentar_id IN (${parlamentares.map((p) => p.id_parlamentar).join(',')})
        GROUP BY empresa, cnpj
        HAVING num_parlamentares >= 2
        ORDER BY num_parlamentares DESC
        LIMIT 50
      `;

      const [empresas] = await bq.query({ query: empresasQuery });

      console.log(`🏢 ${empresas.length} empresas comuns encontradas`);

      // Montar grafo
      const nodes = [];
      const links = [];
      const nodeMap = new Map();

      // Adicionar nós de parlamentares
      for (const parl of parlamentares) {
        const nodeId = `parl_${parl.id_parlamentar}`;
        nodes.push({
          id: parl.nome_completo,
          type: 'parlamentar',
          parlamentar_id: parl.id_parlamentar,
          partido: parl.sigla_partido,
          uf: parl.uf,
          size: 8 + parl.num_fornecedores * 0.5,
          color: '#ef4444',
        });
        nodeMap.set(nodeId, parl.nome_completo);
      }

      // Adicionar nós de empresas
      for (const empresa of empresas) {
        const nodeId = `emp_${empresa.cnpj}`;
        nodes.push({
          id: empresa.empresa,
          type: 'empresa',
          cnpj: empresa.cnpj,
          num_parlamentares: empresa.num_parlamentares,
          valor_total: empresa.valor_total,
          size: 6 + empresa.num_parlamentares * 0.8,
          color: '#10b981',
        });
        nodeMap.set(nodeId, empresa.empresa);

        // Adicionar links entre parlamentares e empresa
        for (const parl_id of empresa.parlamentares_ids) {
          const parlNode = parlamentares.find((p) => p.id_parlamentar === parl_id);
          if (parlNode) {
            links.push({
              source: parlNode.nome_completo,
              target: empresa.empresa,
              type: 'empresa_comum',
              value: empresa.valor_total,
            });
          }
        }
      }

      // Query 3: Buscar pessoas comuns (se filtro_tipo_conexao incluir)
      if (!filtro_tipo_conexao || filtro_tipo_conexao === 'pessoa_comum') {
        const pessoasQuery = `
          SELECT
            pessoa_nome,
            COUNT(DISTINCT parlamentar_id) as num_parlamentares,
            ARRAY_AGG(DISTINCT parlamentar_id) as parlamentares_ids
          FROM \`transparenciabr.analytics.fato_conexao_pessoas\`
          WHERE parlamentar_id IN (${parlamentares.map((p) => p.id_parlamentar).join(',')})
          GROUP BY pessoa_nome
          HAVING num_parlamentares >= 2
          ORDER BY num_parlamentares DESC
          LIMIT 30
        `;

        const [pessoas] = await bq.query({ query: pessoasQuery });

        for (const pessoa of pessoas) {
          const nodeId = `pes_${pessoa.pessoa_nome}`;
          nodes.push({
            id: pessoa.pessoa_nome,
            type: 'pessoa',
            num_parlamentares: pessoa.num_parlamentares,
            size: 5 + pessoa.num_parlamentares * 0.6,
            color: '#f59e0b',
          });
          nodeMap.set(nodeId, pessoa.pessoa_nome);

          // Adicionar links
          for (const parl_id of pessoa.parlamentares_ids) {
            const parlNode = parlamentares.find((p) => p.id_parlamentar === parl_id);
            if (parlNode) {
              links.push({
                source: parlNode.nome_completo,
                target: pessoa.pessoa_nome,
                type: 'pessoa_comum',
              });
            }
          }
        }
      }

      // Debitar créditos
      await db
        .collection('users')
        .doc(uid)
        .update({
          credits: credits - 200,
          last_universo_access: new Date(),
        });

      // Log de auditoria
      await db.collection('audit_logs').add({
        uid,
        action: 'getUniversoGraph',
        timestamp: new Date(),
        credits_charged: 200,
        nodes_count: nodes.length,
        links_count: links.length,
      });

      return {
        success: true,
        graph: {
          nodes,
          links,
        },
        stats: {
          num_parlamentares: parlamentares.length,
          num_empresas: empresas.length,
          num_conexoes: links.length,
        },
        credits_remaining: credits - 200,
      };
    } catch (error) {
      console.error('❌ getUniversoGraph error:', error);
      throw new Error(`Erro ao gerar grafo: ${error.message}`);
    }
  }
);
