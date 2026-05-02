# RUNBOOK NERO — Disparar Saturação Total na VM
**Comandante**: Maurílio Baesso
**Hardware**: g2-standard-8 · 1× L4 24GB
**Branch**: `feat/aurora-v4-nero`

---

## 🚀 COMANDO ÚNICO PRO CLOUD SHELL

Cole isso no Cloud Shell pra clonar, instalar e disparar tudo:

```bash
# 1. SSH na VM
gcloud compute ssh tbr-mainframe --zone=us-central1-a --project=transparenciabr

# === A partir daqui, dentro da VM ===

# 2. Clone branch NERO
cd ~ && rm -rf transparenciabr_nero
git clone -b feat/aurora-v4-nero https://github.com/mmbaesso1980/transparenciabr.git transparenciabr_nero
cd transparenciabr_nero/tools/aurora

# 3. Instalar deps (uma vez)
sudo apt-get install -y python3-pip
pip3 install --user httpx[http2] google-cloud-aiplatform vertexai

# 4. Confirmar Ollama vivo
curl -s http://127.0.0.1:11434/api/tags | head -20

# 5. Logs centralizados
sudo mkdir -p /var/log/tbr && sudo chown $(whoami) /var/log/tbr

# 6. (Opcional) chave Portal Transparência
export PORTAL_KEY="SUA_CHAVE_AQUI"   # se não tiver, deixa vazio — pula 11 endpoints

# 7. DISPARAR OS 4 PROCESSOS EM PARALELO (saturando tudo)
nohup python3 burner_v4_nero.py --workers 6 --batch 50 --vertex-flash on --vertex-pro on > /var/log/tbr/burner.out 2>&1 &
echo "burner PID: $!"

nohup python3 crawlers_nero.py --arsenal arsenal_mestre.json --interval-min 60 > /var/log/tbr/crawlers.out 2>&1 &
echo "crawlers PID: $!"

# Aguarde 30min antes de classificador PNCP (pra crawlers gerarem dados RAW)
( sleep 1800 && nohup python3 pncp_classifier.py --workers 2 > /var/log/tbr/pncp.out 2>&1 ) &

# Aguarde 60min antes do resolver (precisa CEAP + emendas)
( sleep 3600 && nohup python3 emendas_resolver.py --ano 2025 > /var/log/tbr/resolver.out 2>&1 ) &

echo "✅ NERO disparado. Confira logs:"
echo "   tail -f /var/log/tbr/burner.log"
echo "   tail -f /var/log/tbr/crawlers.log"
```

---

## 📊 MONITORAMENTO

### GPU/CPU em tempo real
```bash
# Em outra aba SSH
nvidia-smi -l 5            # GPU a cada 5s — alvo: util 95-100%
htop                        # CPU/RAM
```

### Logs por proc
```bash
tail -f /var/log/tbr/burner.log       # 6 streams Ollama + Vertex
tail -f /var/log/tbr/crawlers.log     # 30 crawlers async
tail -f /var/log/tbr/pncp.log         # classificador PNCP
tail -f /var/log/tbr/resolver.log     # grafo emendas
```

### Crescimento do datalake
```bash
gsutil du -sh gs://datalake-tbr-raw/
gsutil du -sh gs://datalake-tbr-clean/
gsutil ls gs://datalake-tbr-raw/      # subdirs novos = crawlers funcionando
```

---

## 🛑 EMERGÊNCIA — PARAR TUDO

```bash
# Mata os 4 processos
pkill -f burner_v4_nero
pkill -f crawlers_nero
pkill -f pncp_classifier
pkill -f emendas_resolver

# Mata Vertex em loop (se necessário)
gcloud ai operations list --region=us-central1 --filter="state=RUNNING" --format="value(name)" | xargs -I {} gcloud ai operations cancel {} --region=us-central1
```

---

## ⚙️ AJUSTES SE A L4 NÃO SATURAR

Se `nvidia-smi` mostra util < 80%:
1. Aumenta `--batch` para 80 (mais notas por chamada)
2. Verifica se outros procs tomaram parte da VRAM: `nvidia-smi`
3. Reduz `num_ctx` no burner se Gemma estourar memória

Se `nvidia-smi` mostra OOM (Out of Memory):
1. Reduz `--workers` pra 4
2. Reduz `--batch` pra 30
3. Verifica se Gemma 27B q4 ainda está único modelo loaded: `curl http://127.0.0.1:11434/api/ps`

---

## 🔑 CHAVES PENDENTES

1. **Portal Transparência CGU** — registro grátis em https://api.portaldatransparencia.gov.br/swagger-ui.html
   Sem ela, **11 endpoints CRÍTICOS** não rodam (servidores, viagens, emendas, contratos, convênios, gastos, licitações, CEIS, CNEP, CEPIM).
2. **Vertex SA permissions** — confirmar que `tbr-ingestor@transparenciabr.iam.gserviceaccount.com` tem `roles/aiplatform.user`:
   ```bash
   gcloud projects get-iam-policy transparenciabr --flatten="bindings[].members" --filter="bindings.members:tbr-ingestor*" --format="value(bindings.role)"
   ```

---

## 📈 EXPECTATIVA DE SATURAÇÃO (24h)

| Métrica | Alvo |
|---|---|
| GPU util | 95-100% |
| GPU mem | ~22 GB / 24 GB |
| CPU | 60-70% |
| Rede | ~30-50 MB/s |
| Notas CEAP processadas | ~600k |
| Crawlers rodadas | 24 (1/h) |
| Vertex Flash chamadas | ~60k |
| Vertex Pro chamadas | ~6k |
| Custo Vertex 24h | ~R$ 297 |

---

## 🆘 SE A L4 LOTAR (>= 24h saturada e ainda muita fila)

Aluga 2ª VM **preemptible** (60% mais barata):
```bash
gcloud compute instances create tbr-mainframe-2 \
  --zone=us-central1-b \
  --machine-type=g2-standard-8 \
  --accelerator=type=nvidia-l4,count=1 \
  --provisioning-model=SPOT \
  --instance-termination-action=STOP \
  --image-family=pytorch-latest-gpu \
  --image-project=deeplearning-platform-release \
  --boot-disk-size=200GB
```
Replica setup com `--start-from 297` (pega 2ª metade do roster).
