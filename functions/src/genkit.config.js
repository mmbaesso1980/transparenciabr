const { genkit } = require('genkit');
const { vertexAI, gemini20Pro } = require('@genkit-ai/vertexai');
const { firebase } = require('@genkit-ai/firebase');

const ai = genkit({
  plugins: [
    vertexAI({ location: 'us-central1', projectId: 'transparenciabr' }),
    firebase(),
  ],
  model: gemini20Pro,
});

module.exports = { ai };
