# Modo CS — fluxo do mouse, mercado e sensação de FPS real

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox syntax.

**Goal:** Consertar o fluxo mouse/mercado e deixar o tiro e o movimento com cara de FPS de verdade (CS/Valorant), em cima do motor da etapa 1.

**Architecture:** Motor puro em `shared/src/cs/` ganha slots de arma, recuo, eventos de tiro e aceleração, tudo com TDD. O fluxo de mouse e menus vira uma máquina de estados pura (`flow.ts`, testada), e o cliente só executa os efeitos que ela devolve. Efeitos visuais e sonoros leem os eventos do motor.

**Spec:** `docs/superpowers/specs/2026-10-28-cs-mode-design.md` (as regras de partida não mudam).

## Causa do bug do mouse (lida no código, não reproduzida: o navegador de teste recusa pointer lock)

Na virada de rodada o cliente solta o mouse; o `pointerlockchange` chega antes do `hud` (atualizado a cada 100 ms) e o efeito `wasLocked` lê a fase antiga (`over`), abrindo o menu de pausa por cima do mercado. "Continuar" trava o mouse com o mercado aberto. A máquina de estados decide pela fase atual, de forma síncrona, e a transição de lock causada por nós mesmos nunca abre a pausa.

## Global Constraints

- Mesmas regras de partida, placar, economia e valores da etapa 1; só entram os itens abaixo.
- Motor sem `Math.random`/`Date.now`; RNG semeado. Identificadores em inglês, UI e comentários em pt-BR, sem bloco longo de comentário.
- Sem fogo amigo, sem granadas, sem skills. Sem armadura nesta rodada.
- Commits semânticos, pequenos, **sem Co-Authored-By**. Só no worktree `dane-se-cs`.
- Teclas: WASD, Shift anda devagar e em silêncio, Espaço pula, C/Ctrl agacha, botão esquerdo atira, roda do mouse alterna arma, 1 principal, 2 secundária, R recarrega, E planta/desarma, B mercado, Tab mapa, Q ping, Esc pausa.
- Mercado: dígitos 1 a 6 compram a arma na ordem da lista.
- Sensibilidade padrão 0.0016 rad/px, ajustável na pausa e guardada em `prefs`.

## Review Focus

- Virada de rodada com o mouse travado: mercado abre, mouse solto, sem pausa (Task 5).
- Comprar um fuzil mantém a pistola; comprar pistola com fuzil na mão troca só a reserva (Task 1).
- Trocar de arma no meio da recarga cancela a recarga; trocar não permite atirar até acabar o equip (Task 1).
- Recuo sobe em rajada, recupera ao parar e o bot compensa (Task 3).
- Tiro no chão, no teto e no céu aberto sempre devolve um ponto final (Task 2).
- Parar o movimento tem inércia curta; plantar continua exigindo ficar parado pelo input (Task 4).
- `requestPointerLock` falhar não pode deixar o jogo pausado sem explicação (Task 6).

## File Structure

`shared/src/cs/`: `weapons.ts`, `sim.ts`, `physics.ts`, `buy.ts`, `bot.ts`, `runner.ts` (alterados), `flow.ts` (novo). Testes em `shared/test/cs/`.
Cliente em `client/src/components/cs/`: `CsScreen.tsx`, `CsHud.tsx`, `CsBuyMenu.tsx`, `CsScene.tsx`, `useCsInput.ts` (reescritos), `CsEffects.tsx`, `CsViewModel.tsx`, `weaponModels.tsx` (novos); `client/src/lib/csAudio.ts` (novo); `client/src/lib/prefs.ts` (+`csSensitivity`).

---

### Task 1: Slots de arma, troca e mercado

**Files:** Modify `weapons.ts`, `sim.ts`, `buy.ts`, `bot.ts`, `runner.ts`; Test `sim-combat.test.ts`, `buy.test.ts`, `runner.test.ts`, `bot.test.ts`.

**Interfaces — Produces:**
- `weapons.ts`: `WeaponDef.equipMs: number` (pistola 300, SMG 400, fuzil 500, sniper 750); `slotOf(id: WeaponId): 1 | 2` (pistola = 2, o resto = 1).
- `sim.ts`: `PlayerInput.slot: 0 | 1 | 2 | 3` (0 nada, 1 principal, 2 secundária, 3 alternar) e `walk: boolean`; `interface Holstered { weapon: WeaponId; ammo: number; reserve: number }`; `SimPlayer.holstered: Holstered | null` e `equipLeftMs: number`; `RosterEntry.holstered?: WeaponId`.
- `buy.ts`: `canBuy` recusa também arma que o jogador já tem; `buyWeapon` coloca a arma no slot dela (principal vira a arma na mão, a pistola fica guardada; pistola nova substitui a pistola do slot 2 sem tirar a principal da mão).
- `bot.ts`: `botBuy(world, id): WeaponId | null` (null = não comprar nada); bot troca para a arma guardada quando a atual está sem munição e sem reserva.
- `runner.ts`: sobrevivente leva as duas armas para a rodada seguinte; morto volta à pistola inicial.

- [ ] **Step 1: Failing tests.** `sim-combat`: `slot:1` com principal guardada troca (arma e munição preservadas), cancela recarga, impede tiro até `equipMs`; `slot:3` alterna; troca sem arma guardada não faz nada. `buy`: comprar fuzil com pistola na mão deixa `holstered.weapon === 'chinelo'` e `weapon === 'tabelinha'`; comprar `tamanco` com fuzil na mão mantém o fuzil ativo e troca só a pistola guardada; recusar arma já possuída; dinheiro e refusos antigos continuam valendo. `runner`: sobrevivente com fuzil começa a rodada seguinte com fuzil e pistola. `bot`: `botBuy` devolve `null` com fuzil na mão; nunca acima do dinheiro.
- [ ] **Step 2:** `npm run test -w shared -- cs/` — Expected: FAIL nos testes novos.
- [ ] **Step 3: Implement** os tipos e regras acima; `IDLE_INPUT` ganha `walk: false, slot: 0`; `createWorld` preenche `holstered`/`equipLeftMs`; `stepCombat` trata `slot` antes de recarga/tiro e desconta `equipLeftMs`; ajustar chamadas que liam `botBuy` (runner) e os helpers de teste.
- [ ] **Step 4:** `npm run test -w shared` e `npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(cs): slots de arma, troca e mercado com pistola guardada`

### Task 2: Eventos de tiro e acerto, raio contra o mundo

**Files:** Modify `physics.ts`, `sim.ts`; Test `physics.test.ts`, `sim-combat.test.ts`.

**Interfaces — Produces:**
- `physics.ts`: `interface RayHit { dist: number; normal: Vec3 }`; `raycastHit(map, origin, dir, maxDist): RayHit | null` (sólidos, com normal da face atingida); `raycast` passa a usá-lo; `worldRay(map, origin, dir, maxDist): RayHit` (sólidos, chão em `bounds.min.y`, teto em `bounds.max.y` e paredes de `bounds`; sempre devolve um ponto, no máximo em `maxDist`).
- `sim.ts`: `WorldEvent` ganha `{ type: 'shot'; shooter: string; weapon: WeaponId; from: Vec3; to: Vec3; hit: 'none' | 'wall' | 'player'; normal?: Vec3 }` e `{ type: 'hit'; attacker: string; victim: string; zone: HitZone; damage: number; killed: boolean }`. Todo disparo emite `shot`; todo dano emite `hit`; a morte continua emitindo `kill`. O raio de acerto usa `worldRay` como parede.

- [ ] **Step 1: Failing tests.** `raycastHit` devolve normal `(-1,0,0)` ao bater na face oeste de uma caixa; `worldRay` aponta para o chão devolve `normal (0,1,0)` e `dist` correto; para o céu aberto devolve ponto no teto; tiro em jogador emite `shot` com `hit:'player'` e `to` perto do corpo, mais um `hit` com `zone` e `damage`; tiro na parede emite `hit:'wall'` com `normal`; tiro no chão idem; nenhum `hit` quando erra.
- [ ] **Step 2:** `npm run test -w shared -- cs/physics cs/sim-combat` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm run test -w shared` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(cs): eventos de tiro e acerto e raio contra o mundo`

### Task 3: Recuo (view punch)

**Files:** Modify `weapons.ts`, `sim.ts`, `bot.ts`; Test `sim-combat.test.ts`, `bot.test.ts`, `helpers.ts`.

**Interfaces — Produces:**
- `WeaponDef.recoilPitch`, `recoilYaw`, `recoilMax` (graus). Valores: chinelo 1.6/0.4/6, tamanco 2.4/0.5/7, garcom 0.55/0.35/6, tabelinha 0.95/0.5/12, cartao_vermelho 0.85/0.45/11, escanteio 5/0/5.
- `SimPlayer.punchPitch`, `punchYaw` (radianos), `burst: number`, `sinceShotMs: number`. Constantes `RECOIL_HOLD_MS = 180`, `RECOIL_RECOVERY_DEG_S = 22`.
- Regra: o disparo usa `yaw + punchYaw` e `pitch + punchPitch` (pitch efetivo limitado a 1.55 rad) e só depois soma o recuo do disparo. `punchPitch` sobe por disparo até `recoilMax`; `punchYaw` soma `recoilYaw · sin(burst · 1.7)`; sem disparo há mais de `max(RECOIL_HOLD_MS, 2 · fireIntervalMs)` o recuo volta a zero linearmente e `burst` zera.
- Bot compensa: mira desejada menos o recuo atual, e o "alinhado" compara a mira efetiva.
- Helper de teste `run` aceita função por jogador (`(w: World) => PlayerInput`), com `aimer(...)` que subtrai o recuo.

- [ ] **Step 1: Failing tests.** Rajada de `tabelinha` aumenta `punchPitch` até o teto; o primeiro tiro sai sem recuo; parar por 1 s zera; sem compensação o 6º tiro de uma rajada mirada no corpo sobe e acerta mais alto que o 1º (comparar `to.y` dos eventos `shot`); com `aimer` compensando, a rajada de 4 tiros no corpo mantém `hp` 10 como antes; bot ainda acerta em ≥ 7 de 10 seeds.
- [ ] **Step 2:** `npm run test -w shared -- cs/` — Expected: FAIL.
- [ ] **Step 3: Implement** (migrar os testes de mira fixa para `aimer`).
- [ ] **Step 4:** `npm run test -w shared` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(cs): recuo de arma com compensação dos bots`

### Task 4: Movimento com inércia e andar em silêncio

**Files:** Modify `physics.ts`, `sim.ts`; Test `physics.test.ts`.

**Interfaces — Produces:** `GROUND_ACCEL = 60`, `GROUND_FRICTION = 50`, `AIR_ACCEL = 8`, `WALK_SPEED = 2.9` (m/s²/m/s); `moveBody(map, body, wish, jump, crouch, speedMult, dt, walk = false)`. A velocidade horizontal se aproxima da alvo com esses limites (no ar só `AIR_ACCEL`, e sem atrito quando não há input); `walk` usa `WALK_SPEED`; agachar continua `CROUCH_SPEED`. `stepWorld` repassa `input.walk`.

- [ ] **Step 1: Failing tests.** Em 50 ms a velocidade ainda é menor que `RUN_SPEED`; em 300 ms chega nela; soltar as teclas para em < 0,25 s (não instantâneo: após 20 ms ainda > 0); no ar sem input mantém a velocidade; no ar não inverte a direção de imediato; `walk` anda a `WALK_SPEED`; testes antigos de velocidade seguem passando.
- [ ] **Step 2:** `npm run test -w shared -- cs/physics` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm run test -w shared` (inclui partidas completas de bots) — Expected: PASS.
- [ ] **Step 5: Commit** `feat(cs): inércia no movimento e andar em silêncio`

### Task 5: Máquina de estados do mouse e dos menus

**Files:** Create `shared/src/cs/flow.ts`; Test `shared/test/cs/flow.test.ts`; Modify `shared/src/cs/index.ts`.

**Interfaces — Produces:** `type Overlay = 'none' | 'buy' | 'pause'`; `interface FlowState { overlay: Overlay; map: boolean; locked: boolean; phase: RoundPhase; ended: boolean; lockFailed: boolean }`; `type FlowEvent = { type: 'phase'; phase: RoundPhase; ended: boolean } | { type: 'lock'; locked: boolean } | { type: 'lockError' } | { type: 'key'; key: 'buy' | 'map' | 'escape' } | { type: 'click'; target: 'resume' | 'close-buy' | 'close-map' | 'play' }`; `type FlowEffect = 'requestLock' | 'releaseLock'`; `initialFlow(): FlowState` (fase `buy`, `overlay: 'buy'`); `reduceFlow(state, event): { state: FlowState; effects: FlowEffect[] }`; `cursorFree(s)`, `needsLockClick(s)`, `simPaused(s, solo = true)`.

Regras: nova fase `buy` abre o mercado e solta o mouse; `live` fecha o mercado sem pedir lock; fim da partida solta o mouse e fecha tudo; perda de lock com tudo fechado em jogo vira `pause`; perda de lock causada por menu aberto não muda nada; `key buy` alterna o mercado só na fase `buy` (abrir solta, fechar pede lock); `key map` alterna o mapa; `escape` fecha mapa, depois mercado, depois pausa, e sem nada aberto abre a pausa; `click resume|close-buy|close-map|play` pedem lock quando o cursor não precisa estar livre; `lockError` marca `lockFailed` e `lock true` limpa; `simPaused` é verdadeiro na pausa ou em jogo ao vivo à espera do clique (só no solo).

- [ ] **Step 1: Failing tests** para cada regra acima, incluindo o cenário do bug: estado ao vivo travado → `phase buy` devolve `overlay 'buy'` + `releaseLock` → `lock false` mantém `overlay 'buy'` (nunca `pause`); e `phase live` com mercado aberto → `needsLockClick` e `simPaused`.
- [ ] **Step 2:** `npm run test -w shared -- cs/flow` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm run test -w shared -- cs/flow` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(cs): máquina de estados do mouse e dos menus`

### Task 6: Cliente — entrada, fluxo do mouse, mercado e pausa

**Files:** Rewrite `useCsInput.ts`, `CsBuyMenu.tsx`; Modify `CsScreen.tsx`, `client/src/lib/prefs.ts`.

**Interfaces — Produces:** `useCsInput(target, handlers: { onLock(locked: boolean): void; onLockError(): void }): CsInput` com objeto **estável** (`read()`, `look()`, `setLook()`, `isLocked()`, `requestLock()`, `releaseLock()`); `requestLock` tenta `unadjustedMovement` e cai para o pedido simples, captura rejeição e dispara `onLockError`; teclas funcionam sem lock só para o jogo (movimento) e a roda do mouse alterna arma; `read()` devolve `walk`, `slot` (1, 2 ou 3 uma vez por toque) além do resto. `Prefs.csSensitivity` (padrão 0.0016). `CsScreen` mantém o `FlowState` em `ref` + estado e executa `effects` de forma síncrona no handler do gesto. Mercado: lista as 6 armas com preço, dano e cadência, mostra seu equipamento atual (principal e secundária), dígitos 1 a 6 compram, B/Esc/Pronto fecham, nunca cobre a tela inteira (painel lateral translúcido). Pausa tem slider de sensibilidade.

- [ ] **Step 1:** Implementar sem teste unitário de cliente (cliente não tem runner); a lógica de decisão já está testada na Task 5.
- [ ] **Step 2:** `npm run typecheck` — Expected: sem erros.
- [ ] **Step 3: Verificação no navegador** (Playwright): mercado abre com cursor livre, dígito compra, "Pronto" fecha e mostra "clique para jogar", virada de rodada não abre pausa (verificar pelo estado do `FlowState` exposto só em DEV).
- [ ] **Step 4: Commit** `feat(cs): fluxo do mouse, mercado e pausa sem corrida de estado`

### Task 7: Cliente — arma na mão, câmera e efeitos de tiro

**Files:** Create `weaponModels.tsx`, `CsViewModel.tsx`, `CsEffects.tsx`; Modify `CsScene.tsx`, `CsScreen.tsx`.

**Interfaces — Produces:** `WeaponModel({ category })` (pistola, SMG, fuzil e sniper em caixas, com `muzzle` e mãos na cor do personagem); `CsViewModel` (arma presa à câmera com coice por tiro, balanço do mouse, bob ao andar, recarga e equip animados, flash do cano com luz curta); câmera usa `yaw + punchYaw`/`pitch + punchPitch`, balanço ao andar, suavização ao agachar e mergulho ao pousar; `CsEffects` consome `WorldEvent` de uma fila: traçante que **viaja** (≈ 220 m/s, rastro de 2,5 m, fade), faísca e poeira na parede, furo de bala persistente (até 80, limpos a cada rodada), sangue no jogador, flash do cano de quem atira. Em DEV, `window.__csDebug` expõe `{ setInput, flow }` para o teste visual.

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** `npm run typecheck` — Expected: sem erros.
- [ ] **Step 3: Verificação no navegador:** forçar disparos pelo `__csDebug` e conferir captura de tela com traçante, flash, impacto e arma; bots atirando também geram traçantes.
- [ ] **Step 4: Commit** `feat(cs): arma na mão, câmera e efeitos de tiro`

### Task 8: Cliente — HUD de FPS e áudio

**Files:** Create `client/src/lib/csAudio.ts`; Rewrite `CsHud.tsx`; Modify `CsScreen.tsx`.

**Interfaces — Produces:** `csAudio` (WebAudio sintetizado, respeita `prefs.muted`, espacial por pan e distância): `shot(category, from, own)`, `reload`, `empty`, `hit(zone, killed)`, `hurt`, `step(from, own)`, `bombBeep`, `plant`, `defuse`, `explode`, `roundStart`, `setListener(pos, yaw)`. HUD: mira dinâmica (abre com espalhamento e recuo, atualizada por quadro via ref), hit marker (X branco, vermelho no headshot e na morte), vinheta vermelha e arco de direção ao levar dano, lista de armas com slots 1/2 e munição de cada, bomba com contagem, dinheiro com ganhos (+$), aviso de rodada. Passos soam só andando em pé (acima de 3,2 m/s); bip da bomba acelera até explodir.

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** `npm run typecheck` — Expected: sem erros.
- [ ] **Step 3: Verificação no navegador:** captura do HUD em jogo; sem erros no console.
- [ ] **Step 4: Commit** `feat(cs): HUD de FPS e áudio sintetizado`

### Task 9: Acabamento visual do mapa, docs e revisão

**Files:** Modify `CsScene.tsx`, `docs/cs-mode.md`.

- [ ] **Step 1:** Texturas procedurais (piso e paredes), sombras direcionais, teto e luz do ambiente da Cantina; tela de fim de partida.
- [ ] **Step 2:** Atualizar `docs/cs-mode.md` com teclas, slots e mercado.
- [ ] **Step 3:** `npm run typecheck && npm test` — Expected: tudo PASS; captura final no navegador.
- [ ] **Step 4:** Revisão final da branch por um revisor com contexto novo; corrigir críticos e importantes.
- [ ] **Step 5: Commit** `feat(cs): acabamento visual e docs`

---

## Self-review

- Cobre o pedido: mouse/mercado (T5, T6), tiro visível (T2, T7), "FPS de verdade" (T1 slots, T3 recuo, T4 inércia, T7 arma e câmera, T8 mira, HUD e áudio, T9 acabamento).
- Fora desta rodada, de propósito: armadura e kit de desarme, granadas, rádio de voz, multiplayer (etapa 2), celular (etapa 3).
- Consistência: `RoundPhase` vem de `sim.ts`; `slot`/`walk` nascem na T1 e a T4/T6 só os consomem; os eventos `shot`/`hit` nascem na T2 e a T3 os usa nos testes.

---

## Adendo (pedido do usuário depois da Task 8): bots roubados e começo de rodada estilo R6

Pedido: "balancea os bots, tá muito roubado" e "a gente não pode se encontrar logo de cara, tem que ser momentos A, B e C, igual R6".
Leitura (minha, a confirmar): os momentos são as fases da rodada: **A preparação** (times separados), **B ação** (o portão cai e os atacantes entram) e **C bomba plantada** (já existe).

### Task 9: Habilidade dos bots

**Files:** Modify `bot.ts`, `runner.ts`; Test `bot.test.ts`, `runner.test.ts`, `helpers.ts`.

**Interfaces — Produces:** `interface BotSkill { reactionMs: [number, number]; aimErrorDeg: number; moveErrorDeg: number; distanceErrorDeg: number; turnRateDegS: number; headChance: number; recoilControl: number; fovDeg: number }`; `type Difficulty = 'easy' | 'normal' | 'hard'`; `BOT_SKILLS: Record<Difficulty, BotSkill>`; `createBotMemory(seed, skill = BOT_SKILLS.normal)`; `createMatch(humans, seed, difficulty = 'normal')`; cada bot recebe a habilidade da dificuldade com variação de ±15% por bot (semeada).
Regras: o bot mira no peito e só mira a cabeça com probabilidade `headChance` por rajada; o erro de mira é persistente (renovado a cada 120–220 ms) e cresce com distância, movimento do bot e velocidade do alvo; compensa só `recoilControl` do recuo; só adquire alvo dentro de `fovDeg` e perde o alvo que sai de 150° de campo; reação e giro vêm da habilidade.

- [ ] **Step 1: Failing tests.** Tempo mediano para o bot `normal` matar um alvo parado a 10 m com fuzil fica entre 1,0 s e 3,5 s em 20 seeds; `easy` é mais lento que `normal` e `normal` mais lento que `hard` (medianas); no `normal` a minoria dos abates é headshot (≤ 40% em 30 duelos); `createBotMemory` sem skill usa o `normal`; bot não atira em quem está fora do campo de visão.
- [ ] **Step 2:** `npm run test -w shared -- cs/bot` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm run test -w shared` — Expected: PASS (ajustar o limiar do teste antigo "acerta em 2 s" para a habilidade normal).
- [ ] **Step 5: Commit** `feat(cs): habilidade e dificuldade dos bots`

### Task 10: Fases da rodada (preparação, ação, bomba plantada)

**Files:** Modify `map.ts`, `maps/cantina.ts`, `sim.ts`, `bot.ts`, `flow.ts`, `runner.ts`, `CsScene.tsx`, `CsMap.tsx`, `CsHud.tsx`, `audioDirector.ts`; Test `sim-round.test.ts`, `bot.test.ts`, `flow.test.ts`, `helpers.ts`.

**Interfaces — Produces:** `RoundPhase = 'buy' | 'prep' | 'live' | 'over'`; `PREP_MS = 25_000`; `MapDef.barrier: Box` (portão que separa os times) e `MapDef.stage: Vec3` (ponto de espera dos atacantes); `World.baseMap: MapDef` e `World.map` passa a ser o mapa efetivo (com o portão como sólido durante `buy` e `prep`); `ATTACK_EXECUTE_MS = 14_000`.
Regras: `buy` (15 s, parado) → `prep` (25 s, anda dentro do próprio lado, sem atirar, sem plantar) → `live` (5 min, o portão cai); o fim de rodada só vale em `live`. Atacantes bots esperam no `stage` durante `prep` e nos primeiros `ATTACK_EXECUTE_MS` de `live`, depois entram juntos; defensores seguram os pontos. O cliente mostra "Preparação" e "Ação", desenha o portão translúcido e o remove na ação.

- [ ] **Step 1: Failing tests.** Portão existe em `buy` e `prep` e some em `live`; jogador não cruza o portão em 20 s empurrando; sem tiro e sem planta em `prep`; `prep` dura `PREP_MS` e `live` começa com `LIVE_MS`; fluxo trata `prep` como jogo (sem mercado, pausa à espera do clique); bots atacantes ficam do lado deles durante `prep` e só cruzam depois de `ATTACK_EXECUTE_MS`; partidas completas de bots ainda terminam e as duas equipes ganham.
- [ ] **Step 2:** `npm run test -w shared` — Expected: FAIL nos novos.
- [ ] **Step 3: Implement** motor, bots e fluxo; depois cliente (HUD, cena, mapa, áudio).
- [ ] **Step 4:** `npm run typecheck && npm test` — Expected: PASS; captura de tela do portão e da fase no navegador.
- [ ] **Step 5: Commit** `feat(cs): fase de preparação com portão e entrada dos atacantes`
