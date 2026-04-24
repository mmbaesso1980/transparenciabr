## 🔐 REGRA CRÍTICA DE SEGURANÇA — Credenciais em CI/CD

Sempre que um workflow precisar escrever credenciais (service accounts, tokens, chaves privadas) em arquivos no runner, siga OBRIGATORIAMENTE este padrão:

### ❌ PROIBIDO
```bash
echo "$SECRET" > sa.json
algum-comando --credentials sa.json
rm -f sa.json   # ← NÃO executa se o comando anterior falhar
```

### ✅ OBRIGATÓRIO
```bash
SA_FILE=$(mktemp)
trap 'rm -f "$SA_FILE"' EXIT
echo "$SECRET" > "$SA_FILE"
chmod 600 "$SA_FILE"
export GOOGLE_APPLICATION_CREDENTIALS="$SA_FILE"
algum-comando-que-pode-falhar
```

### Justificativa
- `trap ... EXIT` dispara em QUALQUER saída do shell (sucesso, erro, SIGTERM, timeout), garantindo que a credencial nunca fique no disco do runner
- `mktemp` gera nome aleatório em `/tmp`, evitando colisão e acesso previsível
- `chmod 600` impede leitura por outros usuários no runner compartilhado
- Nunca usar nomes fixos como `sa.json`, `credentials.json` na working directory do projeto — pode acabar versionado por acidente

### Validação obrigatória
Ao final de qualquer step que manipule credenciais, adicione:
```yaml
- name: Verify no credentials left behind
  if: always()
  run: |
    if [ -n "$(find . -name '*.json' -path '*/sa*' 2>/dev/null)" ]; then
      echo "❌ Arquivo de credencial detectado após step!"
      exit 1
    fi
```
