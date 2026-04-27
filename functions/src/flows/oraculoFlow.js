/**
 * Fluxo Oráculo — analisa contratos públicos.
 * Motor único: gemini-2.5-pro (Líder Supremo agent_1777236402725).
 */
const { z } = require('genkit');
const { ai, SUPREME_AGENT_ID, SUPREME_MODEL } = require('../genkit.config');

const AchadoSchema = z.object({
  tipo: z.enum([
    'FRACIONAMENTO', 'SOBREPRECO', 'EMPRESA_FANTASMA',
    'NEPOTISMO', 'CONFLITO_INTERESSE', 'DIRECIONAMENTO',
    'DOCUMENTACAO_IRREGULAR', 'OUTRO'
  ]),
  severidade: z.enum(['baixa', 'moderada', 'alta', 'critica']),
  descricao: z.string(),
  evidencia: z.string(),
  citacaoFonte: z.string().optional(),
});

const AnaliseSchema = z.object({
  risco: z.enum(['baixo', 'moderado', 'alto', 'critico']),
  achados: z.array(AchadoSchema),
  resumo: z.string().max(280),
  recomendacoes: z.array(z.string()),
  disclaimers: z.array(z.string()),
});

exports.oraculoAnalisarContrato = ai.defineFlow(
  {
    name: 'oraculoAnalisarContrato',
    inputSchema: z.object({
      textoContrato: z.string(),
      contextoParlamentar: z.string().optional(),
    }),
    outputSchema: AnaliseSchema,
  },
  async ({ textoContrato, contextoParlamentar }) => {
    const prompt = `
Você é o agente ${SUPREME_AGENT_ID} (Líder Supremo / Gemini 2.5 Pro), atuando como
analista forense de transparência pública brasileira.
NÃO faça acusações. Apenas CLASSIFIQUE padrões e atribua riscos heurísticos.
Sempre cite trechos literais como "evidencia".

${contextoParlamentar ? `CONTEXTO DO PARLAMENTAR:\n${contextoParlamentar}\n\n` : ''}

CONTRATO A ANALISAR:
${textoContrato.slice(0, 500000)}
    `.trim();

    const { output } = await ai.generate({
      model: SUPREME_MODEL,
      prompt,
      output: { schema: AnaliseSchema },
      config: { temperature: 0.2, maxOutputTokens: 8192 },
    });

    return output;
  }
);
