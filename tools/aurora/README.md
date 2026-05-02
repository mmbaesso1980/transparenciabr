# AURORA Burner v3 — TransparênciaBR

Engine de classificação CEAP em modo SATURADO.

## Arquitetura

- **L4 local (Ollama Gemma 27B)** → ~70% das notas (score 30-85)
- **Vertex Gemini 2.5 Flash** → notas alto risco (score regex ≥ 85)
- **Vertex Gemini 2.5 Pro** → reanálise profunda das top top (Flash score ≥ 92)
- **Filtro regex pré-LLM** → descarta ~70% das notas óbvias antes de tocar GPU

## Comando único (rodar na VM tbr-mainframe)

```bash
cd ~/aurora && python3 burner_v3.py
```

## Default de produção

- 24 workers
- batch 50 notas/chamada Ollama
- Vertex Flash + Pro ativos por padrão
- Anos 2020-2026 (7 anos)
- Skip existing ativo

## Métricas

```bash
cat /tmp/burner_metrics.json | python3 -c "import json,sys; d=json.load(sys.stdin); p=d['pairs']; secs=[x['secs'] for x in p[-10:]]; print(f'Pares: {len(p)} | Média últimos 10: {sum(secs)/max(len(secs),1):.1f}s/par')"
```

## Logs

```bash
tail -f /var/log/tbr/burner_v2.log
```
