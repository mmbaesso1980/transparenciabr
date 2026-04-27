/**
 * Fluxo Dossiê Executivo — gera resumo de 1 página para parlamentar.
 * Motor único: gemini-2.5-pro (Líder Supremo agent_1777236402725).
 */
const { z } = require('genkit');
const { ai, SUPREME_AGENT_ID, SUPREME_MODEL } = require('../genkit.config');

// Tool placeholder — futura integração com BigQuery.
const queryBigQuery = ai.defineTool(
  {
    name: 'queryBigQuery',
    description: 'Queries the data warehouse for detailed parliamentary spending metrics.',
    inputSchema: z.object({ id_parlamentar: z.string() }),
    outputSchema: z.object({ totalCeap: z.number(), totalEmendas: z.number() }),
  },
  async (_input) => {
    return { totalCeap: 1000000, totalEmendas: 5000000 };
  }
);

exports.dossieExecutivoFlow = ai.defineFlow(
  {
    name: 'dossieExecutivoFlow',
    inputSchema: z.object({
      idParlamentar: z.string(),
      nomeParlamentar: z.string(),
    }),
    outputSchema: z.string(), // Markdown
  },
  async ({ idParlamentar, nomeParlamentar }) => {
    const prompt = `
Você é o agente ${SUPREME_AGENT_ID} (Líder Supremo / Gemini 2.5 Pro).
Gere um resumo executivo de 1 página (Markdown) para o parlamentar
${nomeParlamentar} (ID: ${idParlamentar}).
O resumo deve focar em transparência, com seções para gastos CEAP, Emendas
e Posições Ideológicas. Use a tool queryBigQuery para buscar valores exatos.
`;

    const { text } = await ai.generate({
      model: SUPREME_MODEL,
      prompt,
      tools: [queryBigQuery],
      config: { temperature: 0.3, maxOutputTokens: 8192 },
    });

    return text;
  }
);
