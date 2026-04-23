const { z } = require('genkit');
const { ai } = require('../genkit.config');
const { gemini20Pro } = require('@genkit-ai/vertexai');

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
Você é um analista forense de transparência pública brasileira.
NÃO faça acusações. Apenas CLASSIFIQUE padrões e atribua riscos heurísticos.
Sempre cite trechos literais como "evidencia".

${contextoParlamentar ? `CONTEXTO DO PARLAMENTAR:\n${contextoParlamentar}\n\n` : ''}

CONTRATO A ANALISAR:
${textoContrato.slice(0, 500000)}
    `.trim();

    const { output } = await ai.generate({
      model: gemini20Pro,
      prompt,
      output: { schema: AnaliseSchema },
      config: { temperature: 0.2, maxOutputTokens: 8192 },
    });

    return output;
  }
);
