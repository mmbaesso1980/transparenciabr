# Escritório HQ — Documentação Técnica

Escritório virtual 2D top-down estilo Habbo Hotel para visualização em tempo real dos agentes da Legião Forense AURORA.

Stack: **Phaser 3.80** + React 19 + Vite 8 + Firebase Firestore listener.

---

## Arquitetura da cena

```
EscritorioHQPage.jsx      ← React container + Firestore listener
└── Phaser.Game
    └── AuroraOfficeScene.js   ← Cena principal
        ├── SpriteFactory.js   ← Geração procedural de tiles e sprites
        ├── AgentStateMachine.js ← Controladores de estado por agente
        └── Whiteboard.js      ← Lousa central KPIs
```

### Mapa

- **32 × 24 tiles** de 16 px base, **escala 2×** → canvas 1024 × 768 px renderizado
- Câmera com pan (arrastar) e zoom (scroll/pinch)
- Tiles desenhados via `ctx.fillRect` em `Phaser.Textures.CanvasTexture` — zero assets binários

### Zonas

| Zona | Tiles (col:row) | Ocupantes |
|------|-----------------|-----------|
| Sala do Maestro | x:8-24, y:0-7 | Maestro + lousa |
| Sala Forense | x:8-24, y:8-16 | 16-20 agentes forenses |
| Sala de Revisão | x:0-7, y:4-12 | 6 revisores |
| Copa/Café | x:25-31, y:16-23 | Área de descanso |
| Torre Vertex | x:27-29, y:9-11 | Tile especial IA |

---

## Mapping Firestore state → sprite animation

### Agentes forenses

| Firestore `state` | Frame | Efeito |
|-------------------|-------|--------|
| `idle` | 0 (parado) | — |
| `working` | 3 (digitando) | Balão "..." teal |
| `calling_vertex` | 1 (andando) | Anda até torre Vertex, pulso dourado |
| `done` | 1 (andando) | Anda até Maestro, entrega, volta |
| `error` | 0 (parado) | Balão ⚠ vermelho piscando |

### Revisores

| Firestore `state` | Mapeado para |
|-------------------|--------------|
| `idle` | `idle` |
| `reviewing` | `reviewing` |
| `approved` | `done` |
| `warnings` | `working` |
| `rejected` | `error` |

---

## Como adicionar novos agentes

1. Adicione o `agent_id` em `mockData.js` → `AGENT_IDS`
2. Defina a paleta em `AGENT_PALETTE` (`'forense'` | `'revisor'` | `'maestro'`)
3. Em `AuroraOfficeScene.js` → `_spawnAgents()`, adicione spawn com `forenseAgentHomePos(n)`
4. O listener Firestore detecta automaticamente o novo ID via `onSnapshot`

### Adicionar nova zona

1. Defina tiles em `buildMapData()` com o ID de tile adequado
2. Adicione furniture em `_addFurniture()` via `_placeTile()`
3. Adicione rótulo em `_addZoneLabels()`
4. Crie a posição home correspondente em `AgentStateMachine.js`

---

## Performance

| Parâmetro | Valor |
|-----------|-------|
| Max sprites simultâneos | 30 (22 + 6 revisores + 2 extra) |
| FPS alvo | 30 fps (forçado via `fps.target`) |
| Render mode | CANVAS (não WebGL — compatibilidade mobile) |
| Atlas de tiles | 1 CanvasTexture 112×32 px |
| Atlas de agentes | 4 CanvasTextures 64×24 px (1 por paleta) |
| Pixel art | `pixelArt: true`, `antialias: false`, `roundPixels: true` |

---

## Modo mock (desenvolvimento)

Ativo quando: `!import.meta.env.PROD && (!db || !slug)`

O `startMockListener()` de `mockData.js` simula 20 agentes + 6 revisores ciclando estados em 60 segundos. Marcado `__DEV_ONLY__` — o código é tree-shakeable em produção via `import.meta.env.PROD`.

---

## Paletas

| Paleta | Cor primária | Uso |
|--------|-------------|-----|
| `forense` | `#01696F` | Agentes Legião Forense |
| `revisor` | `#7B2D8E` | Revisores automatizados |
| `maestro` | `#C9A227` | Maestro síntese |
| `copa` | `#6B6B6B` | Área de copa (não usado em sprites) |

---

## Variáveis de ambiente relevantes

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
```

Sem elas, o Firestore fica indisponível e o modo mock é ativado automaticamente em dev.
