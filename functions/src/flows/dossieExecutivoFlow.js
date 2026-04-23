const { z } = require('genkit');
const { ai } = require('../genkit.config');
const { gemini20Pro } = require('@genkit-ai/vertexai');

// Tool placeholder to simulate querying BigQuery for dossier info.
const queryBigQuery = ai.defineTool(
  {
    name: 'queryBigQuery',
    description: 'Queries the data warehouse for detailed parliamentary spending metrics.',
    inputSchema: z.object({ id_parlamentar: z.string() }),
    outputSchema: z.object({ totalCeap: z.number(), totalEmendas: z.number() }),
  },
  async (input) => {
    // Placeholder - would integrate with BQ client
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
    outputSchema: z.string(), // Returns Markdown
  },
  async ({ idParlamentar, nomeParlamentar }) => {
    const prompt = `
Gere um resumo executivo de 1 página (Markdown) para o parlamentar ${nomeParlamentar} (ID: ${idParlamentar}).
O resumo deve focar em transparência, com seções para gastos CEAP, Emendas, e Posições Ideológicas.
Use a tool queryBigQuery para buscar valores exatos.
`;
    // We pass the tool to allow the LLM to fetch metrics
    const { text } = await ai.generate({
      model: gemini20Pro,
      prompt,
      tools: [queryBigQuery],
      config: { temperature: 0.3, maxOutputTokens: 8192 },
    });

    return text;
  }
);
