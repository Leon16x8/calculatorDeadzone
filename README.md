# Warzone Deadzone Calculator

Aplicativo desktop offline para calcular e recomendar configurações de deadzone para Call of Duty: Warzone com base na sensibilidade, controle, estilo de jogo e prioridade de aim assist do usuário.

> **Aviso:** Os valores gerados são estimativas práticas baseadas em heurísticas comunitárias e princípios de comportamento do aim assist. Não representam dados oficiais da Activision ou Raven Software.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Desktop runtime | Electron |
| UI framework | React 18 |
| Linguagem | TypeScript |
| Bundler | Vite |
| Persistência | localStorage |
| Input de controle | Gamepad API |
| Estilos | CSS puro com custom properties |

## Instalação

```bash
npm install
```

## Desenvolvimento

O projeto usa `vite-plugin-electron` — um único comando inicia o Vite dev server e abre a janela Electron automaticamente:

```bash
npm run dev
```

Isso abre o app como janela desktop com hot reload.

Para apenas o frontend no navegador (sem Electron), use `npx vite` diretamente.

## Build de produção

```bash
npm run electron:build
```

O instalador será gerado na pasta `release/`.

---

## Arquitetura

```
electron/          → Processo principal do Electron
src/
  components/
    InputForm.tsx      → Formulário de parâmetros
    ResultsPanel.tsx   → Painel de resultados, comparação triádica e tutorial
    DriftSimulator.tsx → Simulador visual, leitura ao vivo e calibração automática
    PresetsPanel.tsx   → Lista e gerenciamento de presets salvos
    SaveModal.tsx      → Modal de salvamento de preset
  lib/
    calculator.ts  → Motor de cálculo de deadzone (aim-assist-aware, per-stick drift)
    storage.ts     → Persistência local (localStorage)
    sanitize.ts    → Validação, sanitização e migração de dados persistidos
  types/           → Tipos TypeScript compartilhados
  styles/          → CSS global e variáveis de tema
  App.tsx          → Componente raiz e gerenciamento de estado
  main.tsx         → Entrypoint React
```

---

## Heurísticas de Cálculo

O motor de cálculo aplica heurísticas separadas para cada stick, com consciência do comportamento do aim assist do Warzone.

### Princípios de Design

1. **Left stick (movimento)** tolera deadzone mais ampla — drift no movimento é menos prejudicial que drift na mira.
2. **Right stick (mira)** prioriza preservação de micro-inputs para interação com aim assist: entrada na aim assist bubble, tracking, e correções finas.
3. **Sensibilidade alta não justifica deadzone alta no right stick** — ela amplifica tanto micro-inputs intencionais (bons para aim assist) quanto ruído.
4. **Só drift real deve aumentar significativamente o right stick min** — especialmente drift médio ou forte.

### Drift Per-Stick

O modelo suporta drift independente para cada stick (`leftDrift` e `rightDrift`). Cada stick usa sua própria intensidade de drift no cálculo — calibrar o stick esquerdo não afeta o stick direito e vice-versa.

Dados persistidos em formato antigo (drift global) são migrados automaticamente: ambos os sticks recebem o valor global anterior.

### Left Stick (Movimento)

| Fator | Efeito |
|-------|--------|
| Base | 6 |
| Drift (do stick esquerdo) | +5 (leve), +14 (médio), +28 (forte) |
| Desgaste do controle | +3 para PS4/Xbox One |
| Perfil | −3 (agressivo), +4 (precisão) |
| Sensibilidade | −2 (baixa) a +5 (muito alta) |

### Right Stick (Mira — Aim-Assist-Aware)

| Fator | Efeito |
|-------|--------|
| Base (por modo AA) | 0 (microajuste), 2 (equilibrado), 4 (aderência) |
| Drift (do stick direito) | +2 (leve), +8 (médio), +20 (forte) — curva mais suave que o left stick |
| Desgaste do controle | +1.5 (metade do left stick) |
| Perfil | −1 (agressivo), +2 (precisão) — impacto menor que no left stick |
| Sensibilidade | −1 (baixa) a +1 (muito alta) — impacto mínimo |

### Aim Assist e Deadzone

O campo "Prioridade de Aim Assist" controla o comportamento do right stick:

- **Mais Aderência:** base ligeiramente maior para filtrar ruído e manter o aim assist "grudado" no alvo
- **Equilibrado:** compromisso entre estabilidade e responsividade
- **Mais Microajuste:** base mínima para máxima liberdade de correção manual — o jogador aceita mais ruído em troca de resposta instantânea

### Curva de Resposta

| Condição | Curva | Motivo |
|----------|-------|--------|
| Perfil agressivo | Dynamic | Suaviza micro-inputs e acelera flicks — ideal para aim assist em curta/média distância |
| Balanced + sens ≥ 10 | Dynamic | Controla a amplificação de micro-inputs em sensibilidade alta |
| Balanced + sens < 10 | Standard | Melhor equilíbrio entre controle fino e aim assist rotacional |
| Precision + sens ≤ 4 | Linear | Resposta 1:1 para previsibilidade total — pode dificultar tracking |
| Precision + sens > 4 | Standard | Standard preserva melhor a interação com aim assist |

### Ajuste ADS

O multiplicador ADS é avaliado considerando tracking sustentado e conforto dentro da aim assist bubble:

| Faixa | Ajuste | Motivo |
|-------|--------|--------|
| > 1.3 | −0.10 | Tracking difícil de sustentar |
| 1.1–1.3 | −0.05 | Leve redução para consistência |
| 0.9–1.1 | 0 | Faixa ideal |
| 0.75–0.9 | +0.05 | Correções podem ficar lentas |
| < 0.75 | +0.10 | Reatividade comprometida |

### Simulador de Drift

O simulador usa a configuração real do formulário como base — mesma sensibilidade, perfil, plataforma e modo de aim assist. O usuário pode sobrescrever o nível de drift para ver como a recomendação muda. Com controle conectado, mostra a posição do stick em tempo real sobre a deadzone recomendada.

### Calibração Automática

O simulador inclui calibração automática de drift por stick:

1. O usuário seleciona o stick e clica em "Calibrar automaticamente"
2. Contagem regressiva de 3 segundos — o stick alvo é congelado neste momento
3. Coleta de ~3 segundos de amostras da magnitude do stick em repouso via Gamepad API
4. Análise baseada no percentil 95 (robusto contra outliers pontuais)
5. Classificação do drift detectado:

| P95 da magnitude | Classificação |
|-------------------|---------------|
| < 0.02 | Nenhum (ruído normal de ADC) |
| 0.02–0.06 | Leve |
| 0.06–0.15 | Médio |
| >= 0.15 | Forte |

6. O resultado pode ser aplicado diretamente ao stick calibrado, atualizando apenas `leftDrift` ou `rightDrift`

Durante a calibração, os controles de seleção de stick e simulação manual ficam desabilitados para evitar inconsistências.

---

## Funcionalidades

- Formulário com sensibilidade, ADS, plataforma, drift per-stick, perfil e prioridade de aim assist
- Cálculo aim-assist-aware com drift independente por stick e explicações por recomendação
- Valores na escala 0–99 do Warzone, prontos para copiar no jogo
- Simulador visual de drift com leitura de controle em tempo real via Gamepad API
- Calibração automática de drift por stick com análise estatística
- Modo comparação triádica: configuração atual vs recomendação vs preset salvo
- Guia de ajuste fino dinâmico com até 5 passos priorizados por relevância
- Sistema de presets com salvamento e recuperação local
- Migração automática de dados persistidos entre versões do modelo
- Interface premium com tema escuro e efeitos visuais
- 100% offline, sem dependências externas em runtime
