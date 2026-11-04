# Modo CS — Etapa 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cantina jogável, 1 jogador (desktop) contra bots, com movimento, tiro, mercado, bomba, rodadas e placar, aberta por um clique escondido no hub.

**Architecture:** Motor puro em `shared/src/cs/` (mapa, física, armas, economia, simulação, bots, partida), testado com Vitest. Na etapa 1 o cliente roda o motor localmente num loop fixo de 60 Hz (sem socket); a etapa 2 move o mesmo motor para o servidor. Cliente em three.js/@react-three/fiber, primeira pessoa, pointer lock.

**Tech Stack:** TypeScript, Vitest, React 19, three.js 0.186, @react-three/fiber 9, Tailwind (já no projeto).

**Spec:** `docs/superpowers/specs/2026-10-28-cs-mode-design.md`

## Global Constraints

- Mapa da etapa 1: só **Cantina**. Estacionamento e Terminal Boqueirão são da etapa 3, mas `drawMap` já sorteia de uma lista (`MAPS`).
- Placar: o vencedor precisa de **4 rodadas de diferença** ou de **7 rodadas ganhas**, o que vier primeiro (4-0, 5-1, 6-2, 7-x).
- Rodada: **15 s** de compra, **5 min** de jogo, bomba explode **40 s** após plantada. Lados trocam **a cada 3 rodadas**.
- Fogo amigo desligado. Sem skills, sem granadas. Servidor/motor decide todo acerto e dano.
- Headshot mata com tudo exceto a pistola inicial; sniper mata com um tiro no corpo.
- Sem entrada, sem pote, sem R$ da carteira, sem ranking. Não entra em `GAME_CATALOG`.
- Nomes de armas inventados (tema boteco/futebol), sem marca. UI em pt-BR; identificadores, tipos e funções em inglês; comentários em pt-BR curtos; sem bloco longo de comentário explicativo.
- Motor não usa `Math.random`: sempre RNG semeado (`nextRandom`/`randomInt` de `shared/src/rng.ts`).
- Commits semânticos, pequenos, mensagem curta, **sem Co-Authored-By**.
- Trabalhar só no worktree `dane-se-cs` (branch `feat/cs-mode`). Antes dos testes: `npm ci --legacy-peer-deps` neste worktree se `node_modules` não existir (não linkar o do repo principal).

## Review Focus

- Bomba explode no mesmo tick em que o desarme termina: o desarme ganha só se completar antes (testado na Task 6).
- Todos os defensores morrem depois da planta: ataque vence na hora; todos os atacantes morrem depois da planta: a rodada continua até desarmar ou explodir (Task 6).
- Tempo da rodada acaba sem planta: defesa vence (Task 6).
- Placar 6-6: a rodada seguinte decide (7-6), nunca passa de 7 (Task 1).
- Jogador sem dinheiro suficiente tenta comprar: compra recusada, dinheiro intacto; compra fora da fase de compra recusada (Task 8).
- Bot sozinho de um lado e humano morto no outro: a partida termina em tempo finito, sem bot parado (Task 10).
- Navegador sem WebGL ou sem pointer lock: tela explica em vez de quebrar (Task 12).

## File Structure

`shared/src/cs/` (cada arquivo uma responsabilidade; exportados por `shared/src/cs/index.ts` e reexportados em `shared/src/index.ts`):
`types.ts`, `match.ts`, `economy.ts`, `weapons.ts`, `map.ts`, `maps/cantina.ts`, `physics.ts`, `sim.ts`, `buy.ts`, `bot.ts`, `runner.ts`.
Testes em `shared/test/cs/*.test.ts`.

Cliente em `client/src/components/cs/`: `CsScreen.tsx` (rota + loop), `CsScene.tsx` (three), `useCsInput.ts`, `CsHud.tsx`, `CsBuyMenu.tsx`, `CsMapDraw.tsx`; estado de "CS aberto" em `client/src/lib/csMode.ts`.

---

### Task 1: Regras de placar e lados

**Files:**
- Create: `shared/src/cs/types.ts`, `shared/src/cs/match.ts`, `shared/src/cs/index.ts`
- Modify: `shared/src/index.ts` (adicionar `export * from './cs/index.js';`)
- Test: `shared/test/cs/match.test.ts`

**Interfaces:**
- Produces: `type TeamId = 'A' | 'B'`; `type Side = 'attack' | 'defense'`; `interface Vec3 { x: number; y: number; z: number }`; `sideOf(team: TeamId, roundIndex: number): Side`; `matchWinner(a: number, b: number): TeamId | null`; `SWAP_EVERY = 3`; `MAX_ROUNDS_WON = 7`; `LEAD_TO_WIN = 4`.

- [ ] **Step 1: Write the failing test** — `matchWinner`: `(4,0)→'A'`, `(0,4)→'B'`, `(4,1)→null`, `(5,1)→'A'`, `(6,2)→'A'`, `(4,3)→null`, `(7,3)→'A'`, `(7,6)→'A'`, `(6,6)→null`, `(3,3)→null`. `sideOf`: `('A',0..2)→'attack'`, `('A',3..5)→'defense'`, `('A',6)→'attack'`, `('B',0)→'defense'`.
- [ ] **Step 2: Run** `npm run test -w shared -- cs/match` — Expected: FAIL (módulo inexistente).
- [ ] **Step 3: Implement** as funções acima.
- [ ] **Step 4: Run** o mesmo comando — Expected: PASS.
- [ ] **Step 5: Commit** `feat(cs): regras de placar e troca de lado`

### Task 2: Economia

**Files:** Create `shared/src/cs/economy.ts`; Test `shared/test/cs/economy.test.ts`

**Interfaces:**
- Produces: `START_MONEY = 800`, `MAX_MONEY = 9000`, `KILL_REWARD = 300`, `PLANT_REWARD = 300`, `DEFUSE_REWARD = 300`; `roundReward(a: { won: boolean; lossStreak: number; side: Side; planted: boolean }): number`; `nextLossStreak(prev: number, won: boolean): number`; `addMoney(current: number, amount: number): number` (limita em `MAX_MONEY`).

Regras: vitória = 3250. Derrota = 1400 + 500 × min(lossStreak, 4) (lossStreak = derrotas seguidas **antes** desta). Ataque que perde com bomba plantada ganha +800.

- [ ] **Step 1: Failing test** — `roundReward({won:true,...})===3250`; derrota com streak 0 → 1400, 1 → 1900, 4 → 3400, 9 → 3400; ataque derrotado com `planted:true` e streak 0 → 2200; defesa derrotada com `planted:true` → 1400; `nextLossStreak(3,true)===0`, `(3,false)===4`; `addMoney(8800,500)===9000`.
- [ ] **Step 2: Run** `npm run test -w shared -- cs/economy` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(cs): economia da partida`

### Task 3: Armas e dano

**Files:** Create `shared/src/cs/weapons.ts`; Test `shared/test/cs/weapons.test.ts`

**Interfaces:**
- Produces: `type WeaponId`; `type WeaponCategory = 'pistol' | 'smg' | 'rifle' | 'sniper'`; `type HitZone = 'head' | 'body' | 'legs'`; `interface WeaponDef { id; name; category; price; damage; fireIntervalMs; magSize; reloadMs; spreadBase; spreadMove; spreadPerShot; spreadMax; moveSpeedMult }` (spread em graus); `WEAPONS: Record<WeaponId, WeaponDef>`; `damageFor(weapon: WeaponDef, zone: HitZone): number` com multiplicadores head ×4, body ×1, legs ×0.75 (arredonda para baixo); `STARTER_WEAPON: WeaponId`; `BUYABLE: readonly WeaponId[]`.

Tabela (preço / dano / intervalo ms / pente / recarga ms):
`chinelo` pistol 0 / 22 / 150 / 12 / 1800 (inicial); `tamanco` pistol 500 / 34 / 220 / 8 / 2000; `garcom` smg 1200 / 25 / 70 / 30 / 2200; `tabelinha` rifle 2700 / 30 / 100 / 30 / 2500; `cartao_vermelho` rifle 3100 / 33 / 90 / 30 / 2500; `escanteio` sniper 4750 / 115 / 1400 / 5 / 3200 (`moveSpeedMult` 0.8; os demais 1.0, pistolas 1.0, fuzis 0.9). Os valores de espalhamento são do implementador, com `spreadBase` da sniper maior ao se mover (`spreadMove` alto) e menor parada.

- [ ] **Step 1: Failing test** — `damageFor(chinelo,'head')===88` (não mata 100 de vida); para toda arma exceto `chinelo`: `damageFor(w,'head')>=100`; `damageFor(escanteio,'body')>=100`; `damageFor(tabelinha,'legs')===22`; todo `WEAPONS[id].id===id`; `STARTER_WEAPON` tem preço 0; `BUYABLE` não contém o inicial.
- [ ] **Step 2: Run** `npm run test -w shared -- cs/weapons` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(cs): armas e dano por zona`

### Task 4: Mapa e Cantina

**Files:** Create `shared/src/cs/map.ts`, `shared/src/cs/maps/cantina.ts`; Test `shared/test/cs/map.test.ts`

**Interfaces:**
- Consumes: `Vec3`, `Side` (Task 1).
- Produces: `interface Box { min: Vec3; max: Vec3 }`; `interface MapDef { id: string; name: string; bounds: Box; solids: Box[]; sites: Record<'A' | 'B', Box>; spawns: Record<Side, Vec3[]>; waypoints: Vec3[]; links: [number, number][] }`; `MAPS: readonly MapDef[]` (só Cantina por ora); `CANTINA: MapDef`; `validateMap(map: MapDef): string[]` (lista de problemas, vazia = ok); `drawMap(rng: number): { map: MapDef; rng: number }`.

Cantina em blocos (unidades em metros, ~40 × 30): salão central com mesas e balcão como cobertura, spawn de defesa perto do balcão/cozinha, spawn de ataque na entrada, bomba A no salão e B na área de fundo; pelo menos 3 spawns por lado e waypoints cobrindo spawns, sites e os corredores.

- [ ] **Step 1: Failing test** — `validateMap(CANTINA)` retorna `[]`. `validateMap` reporta: spawn dentro de sólido, site fora de `bounds`, `links` com índice inválido, grafo de waypoints desconexo, menos de 3 spawns por lado. Teste cada erro com um mapa adulterado. `drawMap(1)` devolve um mapa de `MAPS` e `rng` diferente de 1.
- [ ] **Step 2: Run** `npm run test -w shared -- cs/map` — FAIL.
- [ ] **Step 3: Implement** `validateMap` (conectividade por busca em largura sobre `links`; spawn e site alcançáveis: cada um dentro de 3 m de algum waypoint) e `CANTINA`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(cs): mapa Cantina e sorteio de mapa`

### Task 5: Física (movimento, colisão, raycast)

**Files:** Create `shared/src/cs/physics.ts`; Test `shared/test/cs/physics.test.ts`

**Interfaces:**
- Consumes: `MapDef`, `Box`, `Vec3`.
- Produces: `PLAYER_RADIUS = 0.35`, `PLAYER_HEIGHT = 1.8`, `CROUCH_HEIGHT = 1.3`, `EYE_OFFSET = 0.15` (olho = topo − offset), `RUN_SPEED = 5.5`, `CROUCH_SPEED = 2.5`, `GRAVITY = 20`, `JUMP_SPEED = 6.5`; `interface Body { pos: Vec3; vel: Vec3; onGround: boolean; crouch: boolean }`; `moveBody(map: MapDef, body: Body, wish: { x: number; z: number }, jump: boolean, crouch: boolean, speedMult: number, dt: number): Body` (wish em coordenadas do mundo, já rotacionada pelo yaw, norma ≤ 1); `raycast(map: MapDef, origin: Vec3, dir: Vec3, maxDist: number): number | null` (distância ao primeiro sólido ou null); `eyePos(body: Body): Vec3`.

- [ ] **Step 1: Failing test** — andar contra uma parede não atravessa (`pos.x` nunca entra no sólido); andar na diagonal contra parede desliza ao longo dela; cair de y=3 pousa em y=0 com `onGround`; pular só com `onGround`; agachar reduz velocidade para `CROUCH_SPEED`; `raycast` bate no sólido na distância esperada (±0.01) e devolve `null` se `maxDist` é menor ou se nada está no caminho; nunca sai de `map.bounds`.
- [ ] **Step 2: Run** `npm run test -w shared -- cs/physics` — FAIL.
- [ ] **Step 3: Implement** AABB vs AABB por eixo (resolve X, Z, depois Y) e slab method para o raio.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(cs): física de movimento e raycast`

### Task 6: Simulação da rodada e bomba

**Files:** Modify `shared/src/cs/types.ts`; Create `shared/src/cs/sim.ts`; Test `shared/test/cs/sim-round.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: `type Phase = 'buy' | 'live' | 'over'`; `interface PlayerInput { moveX: number; moveZ: number; yaw: number; pitch: number; jump: boolean; crouch: boolean; fire: boolean; reload: boolean; use: boolean }` (`moveX` direita, `moveZ` frente, locais ao yaw); `interface SimPlayer { id: string; name: string; team: TeamId; side: Side; bot: boolean; alive: boolean; hp: number; body: Body; yaw: number; pitch: number; weapon: WeaponId; ammo: number; reserve: number; reloadLeftMs: number; cooldownMs: number; shots: number; money: number; hasBomb: boolean }` (campos de tiro entram na Task 7); `interface BombState { status: 'carried' | 'planted' | 'defused' | 'exploded'; pos: Vec3 | null; site: 'A' | 'B' | null; explodeInMs: number; planterId: string | null; progress: { who: string; ms: number } | null }`; `type RoundEnd = { winner: TeamId; reason: 'elimination' | 'explosion' | 'defuse' | 'time' }`; `type WorldEvent = { type: 'kill'; killer: string; victim: string; headshot: boolean } | { type: 'plant'; by: string; site: 'A' | 'B' } | { type: 'defuse'; by: string } | { type: 'explode' } | { type: 'roundEnd'; end: RoundEnd }`; `interface World { map: MapDef; roundIndex: number; phase: Phase; phaseLeftMs: number; players: SimPlayer[]; bomb: BombState; end: RoundEnd | null; rng: number; events: WorldEvent[] }`; `BUY_MS = 15_000`, `LIVE_MS = 300_000`, `BOMB_MS = 40_000`, `PLANT_MS = 3_200`, `DEFUSE_MS = 7_000`; `createWorld(map: MapDef, roundIndex: number, roster: RosterEntry[], rng: number): World` onde `RosterEntry = { id; name; team: TeamId; bot: boolean; money: number; weapon: WeaponId }`; `stepWorld(world: World, inputs: Record<string, PlayerInput>, dtMs: number): World`.

Regras: na fase `buy` ninguém se move; ao zerar vira `live`. O portador da bomba (um atacante aleatório por `rng`) planta segurando `use` por `PLANT_MS` dentro de um site e parado; defensor desarma segurando `use` por `DEFUSE_MS` a menos de 1.5 m da bomba, parado; soltar `use` zera o progresso. Fim: todos de um time mortos (sem bomba plantada → o outro vence; ataque morto com bomba plantada → continua), defensores mortos com bomba plantada → ataque vence, `time` sem planta → defesa vence, explosão → ataque, desarme → defesa. `end` e o evento `roundEnd` são emitidos uma vez só.

- [ ] **Step 1: Failing tests** (helper `makeWorld()` com 2v2 na Cantina e `idleInputs`):
  - `createWorld` põe cada jogador num spawn do seu lado, vivo, `hp===100`, e exatamente um atacante com `hasBomb`.
  - fase `buy` não move jogador mesmo com `moveZ=1`; após `BUY_MS` a fase é `live`.
  - plantar: atacante em site com `use` por `PLANT_MS` → `bomb.status==='planted'`, evento `plant`; fora de site não planta; soltar `use` antes zera o progresso.
  - desarmar: defensor perto com `use` por `DEFUSE_MS` → `defused`, `end.winner` = time da defesa, `reason 'defuse'`.
  - **Review Focus:** `explodeInMs` restando menos que o desarme faltante → explosão vence; desarme que completa no tick anterior à explosão vence a defesa.
  - explosão após `BOMB_MS` → ataque vence (`explosion`).
  - todos os defensores mortos após planta → ataque vence na hora; todos os atacantes mortos após planta → `end===null` até desarmar/explodir.
  - tempo `LIVE_MS` sem planta → defesa vence (`time`).
  - `roundEnd` aparece uma única vez em `events` ao longo de vários ticks após o fim.
- [ ] **Step 2: Run** `npm run test -w shared -- cs/sim-round` — FAIL.
- [ ] **Step 3: Implement** `createWorld` e `stepWorld` (movimento via `moveBody`, `speedMult` da arma atual; `events` zerado a cada passo e preenchido só com o que ocorreu nele).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(cs): simulação da rodada e bomba`

### Task 7: Tiro, recarga e mortes

**Files:** Modify `shared/src/cs/sim.ts`; Test `shared/test/cs/sim-combat.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 5, 6.
- Produces: `HITBOX` (por zona, frações da altura: legs 0–0.45, body 0.45–0.82, head 0.82–1); `spreadFor(player: SimPlayer, weapon: WeaponDef): number` (graus: base + movimento + rajada, limitado por `spreadMax`, decai quando parado e sem atirar); `stepWorld` passa a tratar `fire`/`reload`.

Regras: tiro hitscan na direção (yaw, pitch) mais desvio aleatório dentro do espalhamento usando `world.rng`; acerta o primeiro jogador vivo do **time inimigo** ao longo do raio antes de qualquer sólido (aliados não bloqueiam nem recebem dano); zona pelo ponto de impacto; `damageFor` aplica dano; `hp<=0` mata, emite `kill` com `headshot`, dá `KILL_REWARD` ao autor; `cooldownMs` impõe `fireIntervalMs`; `ammo===0` ou `reload` inicia `reloadLeftMs`; sem tiro durante recarga; fase `buy` não atira.

- [ ] **Step 1: Failing tests** — com RNG fixo e espalhamento zerado por posição parada: tiro de `tabelinha` na cabeça de inimigo parado a 10 m mata em 1 tiro com `headshot:true`; no corpo, mata em 4 tiros (30×4=120≥100; 3 tiros = 90 não); `escanteio` mata no corpo com 1 tiro; tiro em aliado não causa dano; parede entre os dois bloqueia; cadência respeita `fireIntervalMs` (segurar `fire` por 1 s com `tabelinha` dá ≤ 11 disparos); pente vazio recarrega sozinho e volta a `magSize` após `reloadMs`; `spreadFor` parado < `spreadFor` correndo; matar dá `+KILL_REWARD`.
- [ ] **Step 2: Run** `npm run test -w shared -- cs/sim-combat` — FAIL.
- [ ] **Step 3: Implement** em `sim.ts`.
- [ ] **Step 4: Run** — PASS (e `cs/sim-round` continua PASS).
- [ ] **Step 5: Commit** `feat(cs): tiro, recarga e mortes`

### Task 8: Mercado

**Files:** Create `shared/src/cs/buy.ts`; Test `shared/test/cs/buy.test.ts`

**Interfaces:**
- Consumes: `World`, `WEAPONS`, `BUYABLE`.
- Produces: `buyWeapon(world: World, playerId: string, weapon: WeaponId): World` (devolve o mesmo `world` se recusar); `canBuy(world: World, playerId: string, weapon: WeaponId): boolean`.

Regras: só na fase `buy`, jogador vivo, `money >= price`; trocar de arma substitui a atual (sem reembolso) e enche o pente e a reserva (reserva = 2 × `magSize`).

- [ ] **Step 1: Failing tests** — compra válida desconta o preço e troca a arma; **Review Focus:** `money` insuficiente recusa e não muda nada; compra na fase `live` recusa; jogador morto recusa; arma desconhecida (`'xyz' as WeaponId`) recusa; comprar `chinelo` (preço 0) é permitido.
- [ ] **Step 2: Run** `npm run test -w shared -- cs/buy` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(cs): mercado`

### Task 9: Bots

**Files:** Create `shared/src/cs/bot.ts`; Test `shared/test/cs/bot.test.ts`

**Interfaces:**
- Consumes: `World`, `PlayerInput`, `MapDef.waypoints/links`.
- Produces: `interface BotMemory { path: number[]; goal: Vec3 | null; reactionMs: number; strafeMs: number; strafeDir: 1 | -1 }`; `createBotMemory(): BotMemory`; `findPath(map: MapDef, from: Vec3, to: Vec3): number[]` (índices de waypoints, A* ou BFS); `botBuy(world: World, playerId: string): WeaponId`; `botInput(world: World, playerId: string, memory: BotMemory, dtMs: number): { input: PlayerInput; memory: BotMemory }`.

Comportamento (decisão do builder, sem IA pesada): atacante com a bomba vai ao site mais próximo e planta; demais atacantes escoltam e seguem para o mesmo site; defensores guardam um site cada (por índice do bot) e, se a bomba foi plantada, correm para ela e desarmam quando não há inimigo à vista; inimigo à vista (raio livre, FOV 110°): vira em direção ao alvo após `reactionMs` (150–300 ms), para de andar ao atirar com arma longa, faz strafe curto com pistola/SMG e mira a cabeça com erro angular pequeno que cai com a distância parada; compra a arma mais cara que o dinheiro permite, guardando a atual se for fuzil/sniper e sobreviveu. Não atira em aliado e não fica parado: se não há objetivo, patrulha waypoints.

- [ ] **Step 1: Failing tests** — `findPath` liga dois waypoints conectados e devolve `[]` para destino inalcançável; `botBuy` com 800 compra `chinelo`/`tamanco` (nunca acima do dinheiro), com 9000 compra `escanteio` ou fuzil; bot atacante com a bomba, após simular até 60 s virtuais em loop (`stepWorld` + `botInput`), planta; defensor bot com atacante à vista no corredor acerta o tiro em ≤ 2 s virtuais em pelo menos 7 de 10 seeds; nenhum `botInput` tem `NaN` em `moveX/moveZ/yaw/pitch`.
- [ ] **Step 2: Run** `npm run test -w shared -- cs/bot` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(cs): bots com navegação por waypoints`

### Task 10: Partida (rodadas, lados, bots de equilíbrio, forfeit)

**Files:** Create `shared/src/cs/runner.ts`; Test `shared/test/cs/runner.test.ts`

**Interfaces:**
- Consumes: Tasks 1–9.
- Produces: `interface Match { world: World; score: Record<TeamId, number>; lossStreak: Record<TeamId, number>; roundIndex: number; winner: TeamId | null; forfeitedBy: TeamId | null; memories: Record<string, BotMemory>; roster: RosterEntry[]; mapId: string; rng: number }`; `createMatch(humans: { id: string; name: string }[], seed: number): Match` (1–6 humanos; humanos no time A em ordem; completa os dois times com bots até 3 jogadores cada; sorteia o mapa com `drawMap`); `stepMatch(match: Match, humanInputs: Record<string, PlayerInput>, dtMs: number): Match` (roda bots, chama `stepWorld`, ao fim da rodada aplica `roundReward`, `nextLossStreak`, atualiza placar, e após 3 s de pausa cria a próxima rodada com troca de lado a cada `SWAP_EVERY`, dinheiro persistente e arma mantida só por sobreviventes; trocar de lado reseta dinheiro para `START_MONEY` e armas para `STARTER_WEAPON`); `forfeit(match: Match, team: TeamId): Match` (vitória do outro time, `winner` setado).

- [ ] **Step 1: Failing tests** — `createMatch([h1], seed)` gera A = humano + 2 bots, B = 3 bots; `createMatch` com 2 humanos → A 2 humanos + 1 bot, B 3 bots; com 6 humanos → nenhum bot (humanos entram em A até 3, o resto em B); placar nunca passa de 7 e `matchWinner` termina a partida; após 3 rodadas os lados trocam (`sideOf`); simulação completa de partida só com bots (todos os 6 como bots via `createMatch([], seed)`) com dt de 50 ms termina em ≤ 40 min virtuais para 10 seeds, nenhum `NaN`, e as duas equipes vencem pelo menos 1 das 10 partidas (nenhum lado é imbatível); **Review Focus:** 1 humano morto sem entrada alguma contra bots: a partida ainda termina; `forfeit(match,'A')` dá `winner==='B'` e `forfeitedBy==='A'`.
- [ ] **Step 2: Run** `npm run test -w shared -- cs/runner` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS; depois `npm run test -w shared` completo — PASS.
- [ ] **Step 5: Commit** `feat(cs): partida com rodadas, lados e forfeit`

### Task 11: Cliente — cena em primeira pessoa e entrada

**Files:** Create `client/src/components/cs/CsScene.tsx`, `client/src/components/cs/useCsInput.ts`

**Interfaces:**
- Consumes: `Match`, `PlayerInput`, `MapDef`, `eyePos`.
- Produces: `useCsInput(canvas: RefObject<HTMLElement>): { read(): PlayerInput; locked: boolean; requestLock(): void }` — WASD, mouse via pointer lock (sensibilidade 0.0022 rad/px), Espaço pula, Ctrl/C agacha, clique atira, R recarrega, E usa; `read()` devolve yaw/pitch acumulados e limpa só o que é evento; `CsScene({ match, meId, input }: { match: Match; meId: string; input: ... })` — Canvas do @react-three/fiber: sólidos do mapa como caixas com materiais lisos, sites A/B marcados no chão, jogadores inimigos e aliados como cápsulas coloridas por time, bomba plantada com luz piscando, câmera na posição do olho do jogador local (`pitch` limitado a ±1.5 rad), arma em primeira pessoa como caixa simples.

- [ ] **Step 1: Implement** `useCsInput` e `CsScene`.
- [ ] **Step 2: Verify** `npm run typecheck -w client` — Expected: sem erros.
- [ ] **Step 3: Commit** `feat(cs): cena em primeira pessoa e entrada desktop`

### Task 12: Cliente — HUD, mercado, sorteio de mapa e tela do jogo

**Files:** Create `client/src/components/cs/CsHud.tsx`, `CsBuyMenu.tsx`, `CsMapDraw.tsx`, `CsScreen.tsx`

**Interfaces:**
- Consumes: Task 10 (`createMatch`, `stepMatch`, `forfeit`), Task 8 (`buyWeapon`, `canBuy`), Task 11.
- Produces: `CsScreen({ onExit }: { onExit: () => void })`: usa o nome do perfil (`useClient().profile`), cria `createMatch([{ id: profile.id, name: profile.nickname }], seed)`, mostra `CsMapDraw` (animação curta de sorteio, 2 s, nome do mapa sorteado) e então roda o loop com passo fixo de 1000/60 ms (acumulador em `requestAnimationFrame`, no máximo 5 passos por quadro); `CsHud`: vida, munição/recarga, dinheiro, placar (A × B), tempo da rodada, indicador de bomba e barra de plantar/desarmar, killfeed dos últimos eventos `kill`, mira; `CsBuyMenu`: abre sozinho na fase `buy`, lista por categoria com preço, desabilita o que `canBuy` nega; fim de rodada e fim de partida (vencedor + botão de sair); ESC ou botão abre menu com "Desistir" (chama `forfeit`) e "Sair".
- **Review Focus:** sem WebGL (`webglSupported` de `client/src/lib/webgl.ts`) ou sem `requestPointerLock`, mostrar mensagem em pt-BR e botão de voltar, sem montar a cena.

- [ ] **Step 1: Implement** os componentes e o loop.
- [ ] **Step 2: Verify** `npm run typecheck -w client` — sem erros.
- [ ] **Step 3: Commit** `feat(cs): HUD, mercado, sorteio de mapa e tela do jogo`

### Task 13: Entrada escondida no hub, rota e docs

**Files:** Create `client/src/lib/csMode.ts`; Modify `client/src/components/hub/Hub.tsx` (os dois `<h1>` do título, linhas ~253 e ~294), `client/src/App.tsx`; Create `docs/cs-mode.md`

**Interfaces:**
- Produces: `csMode: { open(): void; close(): void }` e `useCsOpen(): boolean` (via `useSyncExternalStore`, mesmo padrão de `client/src/lib/prefs.ts`, sem persistir).

Entrada: 5 cliques seguidos em até 2 s sobre o título "Dane-se" do hub chamam `csMode.open()` (sem dica visual; resetar a contagem fora da janela). `App` renderiza `<CsScreen onExit={csMode.close} />` quando `useCsOpen()` for verdadeiro, antes de qualquer outra tela.

- [ ] **Step 1: Implement** `csMode.ts`, o gatilho de cliques no título (extrair um hook `useSecretTap(onTrigger)` no próprio `Hub.tsx` se os dois títulos precisarem) e a rota em `App.tsx`.
- [ ] **Step 2: Docs** — `docs/cs-mode.md` curto: como entrar, controles desktop, regras de placar/economia, e o que fica para as etapas 2 e 3.
- [ ] **Step 3: Verify** `npm run typecheck && npm test` — Expected: tudo PASS. Depois `npm run dev`, abrir `http://localhost:5173`, dar 5 cliques no título e jogar uma rodada: andar, atirar, comprar, plantar.
- [ ] **Step 4: Commit** `feat(cs): entrada escondida no hub e docs`

---

## Self-review

- **Cobertura da etapa 1 do spec:** entrada (T13), placar/lados (T1, T10), economia (T2), armas/tiro (T3, T7), mapa+sorteio (T4, T12), bomba (T6), mercado (T8), bots (T9), forfeit (T10, T12), desktop (T11). Fora desta etapa e com plano próprio depois: multiplayer/servidor, mapa e ping, voz, celular e assistência de mira, Estacionamento e Terminal Boqueirão.
- **Consistência de tipos:** `World`, `SimPlayer`, `PlayerInput`, `RosterEntry`, `Match` definidos nas Tasks 6 e 10 e usados igual nas 8, 9, 11 e 12.
- **Ressalva:** os números de espalhamento, o comportamento fino dos bots e o desenho da Cantina são decisões do implementador, validadas por testes de propriedade (T4, T9, T10) e não por valores exatos.
