# Ocean Ways — Cobertura de Rotas e Fontes

**Versão:** R1  
**Data:** 2026-05-30  

---

## Rotas prioritárias R1

| Rota              | IATA Origem | IATA Destino | Alianças relevantes | Notas |
|-------------------|-------------|--------------|---------------------|-------|
| Rio → Nova York   | GIG         | JFK          | Star + SkyTeam + OW | Alta demanda viajantes premium BR |
| SP → Londres      | GRU         | LHR          | Star + SkyTeam + OW | Conexão Europa principal |
| SP → Roma         | GRU         | FCO          | Star + SkyTeam      | ITA Airways (Star) + conexões |

**Nota GIG vs GRU**: buscas do Rio devem incluir GRU como origin alternativo (muitos voos BR-internacionais concentrados em GRU). Maestro: implementar `nearby_airports` no schema de busca.

### Rotas R2 (fast-follow)

- GRU → CDG (Paris)
- GRU → MIA (Miami)
- GRU → EZE (Buenos Aires — regional curta distância)
- GIG → MIA
- BSB → JFK (Brasília)
- FOR → LIS (Fortaleza → Lisboa — rota TAP popular)

---

## Alianças e programas cobertos

### Star Alliance (cobertura R1 completa)

| Programa           | Companhia          | Tipo de acesso |
|--------------------|--------------------|----------------|
| Smiles             | GOL (parceiro Star)| API direta (pesquisar) |
| United MileagePlus | United Airlines    | Offers API (documentada) |
| ANA Mileage Club   | ANA                | Pesquisar API |
| Avianca LifeMiles  | Avianca            | Pesquisar API |
| Miles&More         | Lufthansa Group    | Pesquisar API |
| ITA Miles          | ITA Airways        | Pesquisar — recente |

### SkyTeam (cobertura R1 parcial)

| Programa           | Companhia          | Tipo de acesso |
|--------------------|--------------------|----------------|
| Flying Blue        | Air France / KLM   | API parceiro (documentada) |
| Delta SkyMiles     | Delta Air Lines    | Pesquisar — restritivo |
| Aeromexico Rewards | Aeromexico         | R2 |

### Oneworld (cobertura R1 parcial)

| Programa           | Companhia          | Tipo de acesso |
|--------------------|--------------------|----------------|
| American AAdvantage| American Airlines  | Pesquisar |
| British Airways Avios | British Airways  | Pesquisar — requer credencial comercial |
| Iberia Plus        | Iberia             | Pesquisar |
| LATAM Pass         | LATAM Airlines     | API direta (pesquisar — migrou OW) |

---

## Fontes de dados — Pesquisa e avaliação

### seek.travel

- **O que é**: Agregador de disponibilidade award flights, foco em business/first
- **Status**: Verificar existência de API affiliate/parceiro
- **TOS risk**: Médio — verificar se permite acesso programático
- **Ação Maestro**: `GET https://seek.travel` → inspecionar robots.txt + documentação de API/affiliate

### point.me

- **O que é**: Motor de busca award availability, interface limpa
- **Status**: Tem API para parceiros — verificar pricing e TOS
- **URL**: https://point.me
- **Ação Maestro**: Contatar via affiliate/partnership form; verificar se oferecem API key de desenvolvimento

### AwardWallet

- **O que é**: Rastreamento de saldos de programas de fidelidade
- **Foco**: Rastrear saldo do usuário, não disponibilidade de voos
- **Relevância Ocean Ways**: Menor para R1 (não é buscador de voos) — considerar integração de "mostrar saldo do programa" em R2
- **Ação Maestro**: Avaliar API de acesso a saldos com permissão do usuário

### APIs diretas das companhias

| Companhia     | API / Portal                          | Observação |
|---------------|---------------------------------------|------------|
| United        | developer.united.com                   | Offers API documentada; requer chave |
| Air France/KLM| developer.airfranceklm.com             | API shopping; plano freemium disponível |
| British Airways| developer.britishairways.com          | Requer credencial comercial (IATA nº) |
| LATAM         | developer.latam.com                   | Verificar disponibilidade award search |
| American      | Não tem API pública award search       | R2 — via GDS ou parceiro |

### Alternativas e fallbacks

- **Amadeus for Developers** (https://developers.amadeus.com): GDS com API award search — self-service com sandbox. Custo por chamada em produção. **Candidato forte para R1 como fallback.**
- **Sabre Dev Studio** (https://developer.sabre.com): Similar ao Amadeus — verificar award availability endpoint
- **awardhacker.com patterns**: Projeto open-source com lógica de busca award — verificar licença antes de reutilizar

---

## Estratégia de fallback por rota

```
Para cada rota buscada:
  1. Checar fontes de API oficial ativas para os programas solicitados
  2. Se source indisponível ou rate limited → tentar Amadeus como fallback
  3. Se resultado vazio → retornar "no availability found" com timestamp
  4. NUNCA retornar resultado stale sem indicar que é de cache
```

---

## Dados faltantes a mapear (Maestro)

- [ ] Rate limits de cada API (calls/min, calls/dia)
- [ ] Latência média de cada source (para timeout sensato)
- [ ] Custo por chamada de API (para projeção de COGS)
- [ ] Disponibilidade de sandbox/staging de cada fonte
- [ ] Política de cache mínimo exigida por cada fonte (algumas proíbem re-servir dados sem TTL)
