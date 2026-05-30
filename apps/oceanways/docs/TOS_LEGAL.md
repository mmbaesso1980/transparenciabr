# Ocean Ways — TOS, Legal e Compliance

**Versão:** R1  
**Data:** 2026-05-30  
**Responsável:** Comandante Maurílio Baesso  

---

## Aviso crítico: TOS das companhias aéreas e programas de fidelidade

**ANTES de implementar qualquer integração técnica**, o Maestro (ou engenheiro responsável) deve verificar os Termos de Serviço da fonte alvo. Este documento consolida os principais riscos identificados.

---

## Regra de ouro

```
API oficial documentada >> Affiliate/parceiro >> Nenhuma integração

NUNCA fazer scraping/parsing de HTML de:
  - Sites de companhias aéreas (smiles.com.br, united.com, etc.)
  - Portais de programas de fidelidade
  - Motores de busca de award flights concorrentes

SEM autorização expressa por escrito ou via TOS permissiva.
```

Violação de TOS expõe Ocean Ways a:
- Bloqueio de IP permanente
- Ação legal (CFAA nos EUA, LGPD/Marco Civil no BR)
- Banimento de contas de parceiros
- Danos reputacionais ao Comandante e à plataforma

---

## Avaliação por fonte

### smiles.com.br (GOL)
- **TOS**: Proíbe expressamente scraping automatizado
- **Risco**: ALTO — detecção ativa de bots
- **Caminho legal**: Verificar se Smiles tem programa de afiliados com API; contatar parceria comercial
- **Decisão R1**: NÃO integrar via scraping. Placeholder `sources/smiles.py` com `raise NotImplementedError`

### United MileagePlus
- **API**: developer.united.com — Offers API
- **TOS**: Uso permitido com API key registrada
- **Risco**: BAIXO se usar API oficial
- **Decisão R1**: Integrar via API oficial. Registrar conta de developer.

### Air France / KLM Flying Blue
- **API**: developer.airfranceklm.com
- **TOS**: Uso permitido com API key; plano freemium disponível
- **Risco**: BAIXO se usar API oficial
- **Decisão R1**: Integrar via API oficial.

### seek.travel
- **TOS**: A verificar — consultar https://seek.travel/terms antes de implementar
- **Risco**: Indeterminado
- **Decisão**: Contatar equipe seek.travel sobre affiliate/partner API. Implementar só com autorização.

### point.me
- **TOS**: A verificar — contatar via formulário de parceria
- **Risco**: Indeterminado
- **Decisão**: Aguardar retorno antes de implementar.

### Amadeus (GDS)
- **API**: developers.amadeus.com — self-service
- **TOS**: Permitido uso comercial com API key paga
- **Risco**: BAIXO — plataforma B2B projetada para este uso
- **Decisão R1**: Candidato principal de fallback.

---

## LGPD — Lei Geral de Proteção de Dados

### Dados coletados e base legal

| Dado | Finalidade | Base Legal LGPD | Retenção |
|------|------------|-----------------|----------|
| E-mail | Autenticação, notificações | Execução de contrato | Até exclusão de conta |
| UID Firebase | Identificação interna | Execução de contrato | Até exclusão de conta |
| Histórico de buscas (rota, datas) | Personalização, alertas | Legítimo interesse / consentimento | 12 meses |
| Dados de pagamento | Cobrança | Execução de contrato | 5 anos (legislação fiscal) |
| Logs de acesso (IP, user-agent) | Segurança, auditoria | Legítimo interesse | 6 meses |

**PII NUNCA gravada no BigQuery em texto claro**: rotas de busca são associadas ao `uid` anonimizado, não ao e-mail.

### Direitos do titular

Ocean Ways deve implementar (R1 obrigatório):

- **Acesso**: `GET /api/users/me/data` → retorna todos os dados do usuário em JSON
- **Correção**: `PATCH /api/users/me` → atualiza perfil
- **Exclusão**: `DELETE /api/users/me` → apaga Firestore doc + agenda pseudonimização de BigQuery rows
- **Portabilidade**: `GET /api/users/me/export` → download JSON com histórico

### Consentimento

- Ao cadastrar, usuário aceita Política de Privacidade (link obrigatório no formulário)
- Checkbox explícito para: (a) armazenar histórico de buscas; (b) receber alertas por e-mail
- Checkbox NÃO pode ser pré-marcado
- Log de consentimento gravado em Firestore `users/{uid}.consent_log` (imutável)

### DPO

- Versão R1: Comandante Maurílio Baesso assume papel de DPO interino
- E-mail de contato privacidade: a definir (ex: `privacidade@oceanways.com.br`)
- Registro na ANPD: verificar obrigatoriedade conforme volume de dados

---

## Isenção de responsabilidade (disclaimer)

Ocean Ways é um **agregador de informações de disponibilidade** e **não é agente de viagens** nem **vende passagens aéreas**. 

- Não garantimos disponibilidade em tempo real — dados têm delay inerente
- O usuário deve confirmar disponibilidade diretamente na companhia aérea ou programa antes de transferir milhas
- Valores em milhas e taxas são informativos — sujeitos a alteração pelas companhias sem aviso
- Ocean Ways não é responsável por perdas de milhas, taxas cobradas ou indisponibilidade após a busca

**Este disclaimer deve aparecer**: no rodapé de cada resultado de busca + na página de Termos de Uso.

---

## Termos de Uso — Esboço R1

O arquivo `TOS.md` neste diretório é um esboço técnico. O documento legal final deve ser revisado por advogado antes do lançamento público. Pontos mínimos:

1. Definição do serviço (agregador, não agência)
2. Elegibilidade (maiores de 18 anos)
3. Modelo de créditos — o que é reembolsável e o que não é
4. Proibições de uso (revendas de créditos, automação não autorizada via nossa API)
5. Limitação de responsabilidade
6. Jurisdição: Brasil, foro de São Paulo - SP
7. Política de Privacidade (LGPD) — documento separado

---

## Checklist legal antes do lançamento público

- [ ] TOS revisado por advogado especializado em direito digital
- [ ] Política de Privacidade LGPD revisada e publicada
- [ ] Registro como operador de dados na ANPD (verificar threshold)
- [ ] Contratos com cada fonte de API (United, AF/KLM, Amadeus) assinados
- [ ] Conta verificada no Stripe (KYB completo)
- [ ] Conta MercadoPago Business verificada
- [ ] CNPJ Ocean Ways ou operação sob CNPJ existente do Comandante definido
