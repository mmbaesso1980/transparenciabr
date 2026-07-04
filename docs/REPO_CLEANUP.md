# Tarefas de Limpeza do Repositório

Este documento lista tarefas de manutenção para manter o repositório `transparenciabr` organizado e eficiente.

## 1. Remoção de Branches Inativos

**Justificativa:** Com o tempo, branches de funcionalidades (`feat/*`), correções (`fix/*`), ou experimentos (`cursor/*`) são mesclados ou abandonados. Deixá-los no repositório polui a lista de branches e pode causar confusão.

**Ação Recomendada:**

O Comandante ou um desenvolvedor com permissões de escrita deve executar os seguintes comandos para remover os branches que não estão mais em desenvolvimento ativo.

### Passo 1: Listar Branches Inativos (Padrões Conhecidos)

```bash
# Lista branches remotos que correspondem aos padrões de inatividade
git branch -r | grep -E 'origin/cursor/|origin/feat/|origin/deploy/'
```

### Passo 2: Remover um Branch

Para cada branch identificado no passo anterior (por exemplo, `origin/feat/old-feature`), execute:

```bash
# Remove o branch remoto
git push origin --delete feat/old-feature
```

**Atenção:** Tenha certeza de que o branch não contém trabalho importante e não mesclado antes de deletá-lo.

---
*Este documento foi gerado pelo Maestro v1.0 como parte de sua tarefa de melhoria contínua.*
