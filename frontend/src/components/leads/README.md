# LeadCardPro — Guia de Integração

Componente React para a página `/radar-legal` da plataforma **TransparênciaBR**.  
Substitui o `LeadCard` atual com suporte a dois paywalls separados e três estados de exibição.

---

## Estrutura de arquivos

```
lead_card_components/
├── LeadCardPro.jsx                    ← Componente principal
├── hooks/
│   ├── useLeadUnlockStatus.js         ← Estado de desbloqueio (Firestore)
│   └── useUserCredits.js              ← Saldo de créditos em tempo real
├── modals/
│   ├── ConfirmContactUnlockModal.jsx  ← Paywall 1: confirmação de contatos
│   ├── GeneratePetitionModal.jsx      ← Paywall 2: confirmação de petição
│   └── InsufficientCreditsModal.jsx   ← Modal de créditos insuficientes
└── toasts/
    └── leadToasts.js                  ← Helpers de notificação
```

---

## Dependências npm a adicionar

| Pacote           | Versão recomendada | Motivo                                              |
|------------------|--------------------|-----------------------------------------------------|
| `react-hot-toast`| `^2.4.1`           | Sistema de notificações (toasts)                    |

Verificar se os pacotes abaixo já estão instalados — **não reinstalar** se existirem:

| Pacote           | Observação                                          |
|------------------|-----------------------------------------------------|
| `firebase`       | Web SDK — obrigatório                               |
| `framer-motion`  | Se presente no projeto, pode substituir as `transition-*` CSS nas mudanças de estado do card |

### Instalação

```bash
npm install react-hot-toast
```

### Configuração do Toaster (adicionar uma única vez em `App.jsx` ou `main.jsx`)

```jsx
import { Toaster } from 'react-hot-toast';

// Dentro do JSX raiz:
<Toaster position="top-right" toastOptions={{ style: { fontFamily: 'Inter, sans-serif' } }} />
```

---

## Props do LeadCardPro

```jsx
<LeadCardPro
  lead={lead}
  advogado={advogado}
  onComprarCreditos={handleComprar}
/>
```

### `lead` — objeto obrigatório

| Campo                | Tipo                             | Obrigatório | Descrição                                              |
|----------------------|----------------------------------|-------------|--------------------------------------------------------|
| `id`                 | `string`                         | Sim         | ID único do lead (Firestore/BigQuery)                  |
| `nomeAnonimizado`    | `string`                         | Sim         | Ex: `"M.A.C. - SP"`                                   |
| `faixaIdade`         | `string`                         | Sim         | Ex: `"35–40"`                                          |
| `especieBeneficio`   | `string`                         | Sim         | Ex: `"41 – Aposentadoria por Idade"`                   |
| `motivoIndeferimento`| `string`                         | Sim         | Ex: `"Falta de qualidade de segurado"`                 |
| `dataIndeferimento`  | `string \| Date`                 | Sim         | ISO string ou objeto Date                              |
| `scoreQualificacao`  | `number` (0–100)                 | Sim         | Pontuação visual na barra de score                     |
| `teseJuridica`       | `string`                         | Sim         | Campo `_g_tese_juridica` do BigQuery (gerado por IA)   |
| `tags`               | `string[]`                       | Sim         | Ex: `["PCD - Idade"]`                                  |
| `urgencia`           | `'alta' \| 'media' \| 'baixa'`  | Sim         | Define cor da tag de urgência                          |

### `advogado` — objeto obrigatório

| Campo  | Tipo     | Descrição                     |
|--------|----------|-------------------------------|
| `oab`  | `string` | Ex: `"SP123456"`              |
| `cnpj` | `string` | Ex: `"00.000.000/0001-00"`    |
| `nome` | `string` | Nome completo do advogado      |

### `onComprarCreditos` — função opcional

Chamada quando o usuário clica em "Adquirir créditos" no `InsufficientCreditsModal`.  
Tipicamente deve navegar para `/planos` ou abrir um modal de compra.

---

## Como integrar na página /radar-legal

### 1. Copiar os arquivos para o projeto

```bash
cp -r lead_card_components/ src/components/LeadCardPro/
```

Ajustar os imports relativos ao Firebase em:
- `hooks/useLeadUnlockStatus.js` — linha `import { db } from '../../firebase'`
- `hooks/useUserCredits.js` — linha `import { db } from '../../firebase'`
- `LeadCardPro.jsx` — linha `import { functions } from '../firebase'`

### 2. Substituir o LeadCard atual

**Antes (exemplo):**
```jsx
// src/pages/RadarLegal.jsx
import LeadCard from '../components/LeadCard';

{leads.map((lead) => (
  <LeadCard key={lead.id} lead={lead} />
))}
```

**Depois:**
```jsx
// src/pages/RadarLegal.jsx
import { LeadCardPro } from '../components/LeadCardPro/LeadCardPro';
import { useNavigate } from 'react-router-dom';

const navigate = useNavigate();

// Advogado logado — adaptar conforme seu hook de auth existente
const advogado = {
  oab:  currentUser.oab,
  cnpj: currentUser.cnpj,
  nome: currentUser.displayName,
};

{leads.map((lead) => (
  <LeadCardPro
    key={lead.id}
    lead={lead}
    advogado={advogado}
    onComprarCreditos={() => navigate('/planos')}
  />
))}
```

### 3. Estrutura esperada no Firestore

```
/lead_unlocks/{oab}_{leadId}
  ├── leadId:       string
  ├── oab:          string
  ├── unlockedAt:   Timestamp
  ├── expiresAt:    Timestamp   ← 90 dias após unlockedAt
  ├── contatos: {
  │     nomeCompleto:     string
  │     telefones:        string[]
  │     emails:           string[]
  │     enderecoCompleto: string
  │     statusPJe:        'limpo' | 'pendente' | 'desqualificado'
  │   }
  └── peticoes: Array<{
        url:       string
        geradaEm:  Timestamp
        expiraEm:  Timestamp
      }>

/users/{uid}
  └── credits: number
```

### 4. Resposta esperada das Cloud Functions

**`openContactBigData`** — resposta em caso de sucesso:
```json
{
  "contatos": {
    "nomeCompleto":     "Maria Aparecida Costa",
    "telefones":        ["(11) 99999-0000"],
    "emails":           ["maria@email.com"],
    "enderecoCompleto": "Rua das Flores, 123 — Bairro, Cidade - SP",
    "statusPJe":        "limpo"
  }
}
```

**`generateInitialPetition`** — resposta em caso de sucesso:
```json
{
  "url": "https://storage.googleapis.com/.../peticao_xxx.docx"
}
```

**Códigos de erro tratados automaticamente:**
| Código HTTP | Significado                      | Comportamento no card              |
|-------------|----------------------------------|------------------------------------|
| `412`       | PJe: processo posterior existe   | Toast amarelo, sem cobrança        |
| `402`       | Créditos insuficientes           | Modal InsufficientCreditsModal     |
| Outros      | Erro genérico                    | Toast vermelho                     |

---

## Custos de crédito

Os valores estão definidos como constantes no topo de `LeadCardPro.jsx`:

```js
const CUSTO_CONTATOS = 10; // Paywall 1 — ajustar conforme produto
const CUSTO_PETICAO  = 25; // Paywall 2 — ajustar conforme produto
```

---

## Variantes responsivas

| Breakpoint      | Comportamento                                          |
|-----------------|--------------------------------------------------------|
| `< sm (640px)`  | Layout empilhado: header em coluna, dl em 1 coluna, botões em coluna (inverso: cancelar embaixo) |
| `>= sm (640px)` | dl em 2 colunas, botões em linha horizontal            |

O card em si não tem largura fixada — adapta-se ao container da grade da página.  
Recomendação de grid na página `/radar-legal`:

```jsx
<div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
  {leads.map(...)}
</div>
```

---

## Acessibilidade

- Todos os botões possuem `aria-label` descritivo com nome do lead e custo
- Modais usam `role="dialog"` + `aria-modal="true"` + `aria-labelledby`/`aria-describedby`
- `InsufficientCreditsModal` usa `role="alertdialog"` (ação crítica)
- Foco é movido automaticamente para o primeiro elemento interativo ao abrir qualquer modal
- `Escape` fecha todos os modais (bloqueado durante loading)
- Textos de loading usam `aria-live="polite"` para leitores de tela
- Score bar usa `role="progressbar"` com `aria-valuenow/min/max`
- Tags usam `role="list"` / `role="listitem"`
- Estado de carregamento do card usa `aria-busy="true"`
- Foco visível em todos os elementos interativos via `focus-visible:ring-2`

---

## Observações de integração adicionais

1. **Banner âmbar existente (PR #164):** manter intacto — o `LeadCardPro` não interfere com ele.
2. **Mock `leadsPrevidenciario.js`:** durante testes locais, o campo `id` deve ser uma string não vazia para que o hook `useLeadUnlockStatus` funcione corretamente. Para IDs sintéticos, o hook retornará `BASICO` ao não encontrar documento no Firestore.
3. **Framer Motion:** se já estiver instalado no projeto, as transições CSS (`transition-shadow`, `transition-colors`, `transition-opacity`) podem ser substituídas por `motion.div` + variantes `AnimatePresence` nas mudanças de estado do card para animações mais elaboradas. Não é obrigatório.

---

## Sugestões de microtexto / copy

| Elemento                         | Texto atual (componente)                                              | Alternativa mais incisiva                                                      |
|----------------------------------|-----------------------------------------------------------------------|--------------------------------------------------------------------------------|
| Botão Abrir Contatos             | "Abrir Contatos"                                                      | "Ver Dados do Cliente"                                                          |
| Tooltip petição desabilitada     | "Abra os contatos primeiro"                                           | "Desbloqueie o lead antes de gerar a petição"                                  |
| Modal contatos — aviso PJe       | "Se tiver, NÃO será cobrado."                                         | "Lead com processo ativo? Zero cobrança — você fica protegido."                |
| Toast lead desqualificado        | "Lead desqualificado — não foi cobrado. Atualizamos o status."        | "Processo localizado no PJe. Nenhum crédito debitado — lead desqualificado."   |
| Saldo após — campo no modal      | "Saldo após"                                                          | "Seu saldo após esta operação"                                                  |
| Countdown petição                | "Expira em MM:SS"                                                     | "Link válido por MM:SS — baixe agora"                                           |
| Histórico colapsado              | "3 petições geradas · ver histórico"                                  | "3 versões geradas — ver todas"                                                 |
