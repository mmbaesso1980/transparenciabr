# ALERTA G.O.A.T. — auditoria pós-push (SecOps / QA)

Auditoria automática dos 4 pilares. **Falhas encontradas e corrigidas nesta branch.**

---

## Pilar 3 — Blindagem de infraestrutura (SecOps)

**Problema:** `scripts/run_dayfull.sh` exportava uma chave literal de API do Portal da Transparência (CGU) quando `PORTAL_TRANSPARENCIA_API_KEY` estava vazia. Isso viola a regra de nenhuma chave hardcoded no repositório.

**Correção aplicada:** removido o fallback com literal; a fase 4 passa a **falhar de propósito** com mensagem clara se a variável não estiver definida (CI/shell deve injetar o segredo).

```bash
if [ -z "${PORTAL_TRANSPARENCIA_API_KEY:-}" ]; then
  echo "ERRO (G.O.A.T. / SecOps): PORTAL_TRANSPARENCIA_API_KEY não definida."
  echo "Defina no shell ou CI — nunca commitar chaves nem usar fallback fixo no repositório."
  exit 1
fi
```

**Ação operacional:** se a chave que estava no script em histórico Git for válida em produção, **revogar/rotacionar** no painel da API de dados (CGU) e guardar o novo valor só em Secret Manager / variáveis de ambiente do runner.

---

## Pilar 1 — Arquitetura de inteligência (consistência documental)

**Problema:** `docs/dev/MANIFESTO_ARQUITETURA.md` descrevia o motor Vertex como "Gemini 1.5 Pro" em três trechos, em desalinhamento com o Líder Supremo **Gemini 2.5** e `agent_1777236402725`.

**Correção aplicada:** documento atualizado para **Gemini 2.5 Pro (Líder Supremo)** e referência explícita ao ID do agente na decisão de escala para Vertex.

---

## Pilares verificados sem violação (resumo)

| Pilar | Resultado |
| --- | --- |
| 1 (código runtime) | Chamadas e modelos alinhados a `agent_1777236402725` e `gemini-2.5-pro` em `functions/`, `functions/src/genkit.config.js`, engines Python relevantes. |
| 2 (Cofre / GOD) | `frontend/src/lib/firebase.js` — GOD `manusalt13@gmail.com` com `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`; demais com 300/dia não cumulativo. |
| 4 (UI/CEAP) | Sem `w-screen` no frontend; CEAP com `urlDocumento` e parsers contra `[object Object]` em `dataParsers.js` / `CeapMonitorSection.jsx`. |

---

*G.O.A.T. — TransparênciaBR. Encerrar alertas futuros quando não houver divergência; este arquivo documenta a última interceptação.*
