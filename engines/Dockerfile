# Universal ingest (Node 20)
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
ENTRYPOINT ["node", "ingestors/universal_ingestor.js"]
