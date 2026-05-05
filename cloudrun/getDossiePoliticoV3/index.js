const { SearchServiceClient } = require('@google-cloud/discoveryengine').v1;
const { VertexAI } = require('@google-cloud/aiplatform');
const functions = require('@google-cloud/functions-framework');
const cors = require('cors')({ origin: true });

const PROJECT = process.env.VERTEX_PROJECT_ID || 'projeto-codex-br';
const DATASTORES = [
  'tbr-fs2-politicos','tbr-fs2-alertas-bodes','tbr-fs2-ghosts','tbr-fs2-dossies',
  'tbr-fs2-espectro','tbr-fs2-voting','tbr-fs2-malha-saude','tbr-fs2-transparency',
  'tbr-fs2-neutrality','tbr-fs2-diarios-atos'
];
const search = new SearchServiceClient({ apiEndpoint: 'discoveryengine.googleapis.com' });

async function buscarEvidencias(query) {
  return Promise.all(DATASTORES.map(async ds => {
    const sc = `projects/${PROJECT}/locations/global/collections/default_collection/dataStores/${ds}/servingConfigs/default_search`;
    try {
      const [resp] = await search.search({ servingConfig: sc, query, pageSize: 5 });
      return { datastore: ds, results: (resp || []).slice(0, 5).map(r => ({ id: r.id, struct: r.document?.structData })) };
    } catch (e) { return { datastore: ds, error: (e.message || '').slice(0, 200) }; }
  }));
}

async function gerarDossie(query, evidencias) {
  const vertex = new VertexAI({ project: PROJECT, location: 'us-central1' });
  const model = vertex.getGenerativeModel({
    model: 'gemini-1.5-pro',
    generationConfig: { maxOutputTokens: 8192, temperature: 0.2 }
  });
  const contexto = JSON.stringify(evidencias).slice(0, 60000);
  const prompt = `Voce e analista de dados publicos da TransparenciaBR. Com base EXCLUSIVAMENTE nas evidencias factuais abaixo, redija um relatorio tecnico em portugues formal sobre: "${query}".

REGRAS:
- Toda afirmacao deve citar a fonte: [datastore:id]
- Nao inferir alem do que esta nas evidencias. Se faltar dado, escreva "Sem evidencia indexada para este item".
- Tom factual, tecnico, sem juizo de valor ou denuncia.
- Estrutura: 1) Identificacao 2) Indicadores de risco objetivos 3) Atividade legislativa registrada 4) Despesas CEAP relevantes 5) Conexoes empresariais 6) Conclusao (apenas o que as fontes suportam).

EVIDENCIAS:
${contexto}`;
  const result = await model.generateContent(prompt);
  return result.response.candidates[0].content.parts[0].text;
}

functions.http('getDossiePoliticoV3', (req, res) => {
  cors(req, res, async () => {
    if (req.method === 'OPTIONS') return res.status(204).send('');
    try {
      const query = req.query.q || (req.body && (req.body.query || req.body.q));
      if (!query || query.length < 2) return res.status(400).json({ error: 'parametro q ausente' });
      const t0 = Date.now();
      const evidencias = await buscarEvidencias(query);
      const dossie = await gerarDossie(query, evidencias);
      return res.status(200).json({
        query, elapsed_ms: Date.now() - t0,
        dossie_factual: dossie, evidencias_brutas: evidencias,
        modelo: 'gemini-1.5-pro'
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: e.message });
    }
  });
});
