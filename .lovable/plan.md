## Objetivo

Fazer os rótulos das estacas no mapa baterem com a numeração real da planta do Retiro São Joaquim (ex.: esquina da Rua Ângelo Burches = E-1127), em vez de começarem sempre em E-0.

## O que já existe

Cada rua já tem `startStake` e `spacing` no `Street` (src/data/defaultStreets.ts). Hoje o valor padrão é `startStake: 0` e a UI de Calibrar não deixa editar isso de forma clara, então todas as ruas aparecem como E-0, E-1, E-2… O cálculo de posição (`pointAtChainage`) já está correto — só falta amarrar a numeração à planta.

## Mudanças

1. **Modelo (src/data/defaultStreets.ts)**
   - Manter `startStake` (número da estaca no início da polyline) e `spacing` (20 m por padrão, conforme convenção topográfica da planta).
   - Adicionar campo opcional `anchor?: { stake: number; chainageM: number }` para casos em que a estaca conhecida não está no vértice inicial (ex.: E-1127 fica no meio ou no fim da polyline). Quando presente, `startStake` é derivado: `startStake = anchor.stake - anchor.chainageM / spacing`.

2. **Cálculo (src/lib/geo.ts / consumidores)**
   - Nova função `stakeNumberAt(street, chainageM)` que devolve o número inteiro da estaca (ex.: 1127) e o offset em metros. Usa `startStake` (ou o `anchor`) + `chainageM / spacing`.
   - Usada tanto na renderização dos marcadores quanto no card "Estaca atual".

3. **UI de Calibrar (src/routes/calibrar.tsx)**
   - Para cada rua, além de `spacing` e `reversed`, expor dois campos claros:
     - "Estaca inicial" (número na planta correspondente ao 1º vértice).
     - Botão "Definir estaca conhecida aqui" — o usuário clica num ponto do traçado, informa o número (ex.: 1127) e o app grava o `anchor` com a chainage projetada. Ideal para esquinas que aparecem cotadas na planta.
   - Pré-preencher, para cada rua da planta, o valor conhecido quando o usuário souber (ex.: Ângelo Burches → estaca 1127 na esquina X).

4. **Renderização (src/routes/index.tsx)**
   - Trocar o label `E-${i}` (índice) por `E-${stakeNumberAt(street, i*spacing)}`.
   - O destaque da estaca atual e o texto do card passam a mostrar o número real (ex.: "E-1127 +3,5 m").

## Detalhes técnicos

- `spacing` continua 20 m por padrão (padrão da planta topográfica). Se alguma rua usar outro passo, é editável por rua.
- `startStake` passa a aceitar valores altos (ex.: 1120) e negativos (para casos em que a origem do traçado fica antes da E-0).
- Migração: `loadStreets()` normaliza registros antigos preenchendo `anchor: undefined` — sem quebra de dados.
- Sem mudanças de backend; tudo continua em `localStorage`.

## Fora de escopo

- Extrair automaticamente as coordenadas das estacas do PDF (a planta não é georreferenciada com precisão suficiente para isso sem um passo manual). A calibração continua sendo feita pelo usuário no mapa.