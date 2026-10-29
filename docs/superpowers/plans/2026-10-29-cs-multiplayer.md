# Modo CS — multiplayer em times (etapa 2)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox syntax.

**Goal:** Sala com código, escolher e trocar de time no lobby antes de começar, partida rodando no servidor (humanos e bots no mesmo jogo), inversão de lado visível, e o que mais aproxima do CS: placar com K/D, observar quem morre, desistir por votação, ping do time e voz só do time.

**Architecture:** O motor continua puro em `shared/src/cs/` e passa a rodar no servidor (`CsRoomManager`, laço de 60 Hz, entradas por tick, snapshots a 20 Hz filtrados por visibilidade). O cliente envia entradas numeradas, prevê o próprio movimento, interpola os outros e monta um `Match` a partir do snapshot, então HUD, cena e áudio continuam lendo o mesmo formato. O jogo solo (treino contra bots) segue rodando local.

**Tech Stack:** TypeScript, socket.io (já no projeto), Vitest, React 19, three.js.

**Spec:** `docs/superpowers/specs/2026-10-28-cs-mode-design.md` (as regras de partida não mudam) e `docs/superpowers/plans/2026-10-29-cs-fps-feel.md`.

## Decisões (minhas; o usuário delegou a parte técnica)

- Sala do CS em gerenciador próprio (`server/src/cs/csRooms.ts`), com eventos `cs:*`. O código de 4 letras é compartilhado com as salas de Dane-se/poker (nunca colide), então a caixa "Entrar com código" do hub serve para os dois: tenta `room:join` e, se a sala não existir, `cs:join`.
- Sem dinheiro da carteira: sala de CS não cobra entrada e não paga prêmio.
- Times de até 3 humanos; os bots completam cada time até 3 (como no solo). Lobby: cada um escolhe o time, o anfitrião escolhe a dificuldade e começa.
- Servidor autoritativo. Entradas: uma por tick de 1/60 s, numeradas (`seq`), fila de até 12 por jogador, entrada repetida quando faltar. Snapshots a 20 Hz, `volatile`.
- Visibilidade: o jogador recebe o time inteiro e só os inimigos que algum colega enxerga (linha de visão, com 250 ms de memória). Passos de inimigos fora de vista chegam como "som" (posição, sem figura).
- Cliente: previsão do próprio corpo (`moveBody` + entradas ainda não confirmadas), interpolação dos outros 100 ms atrás. Sem compensação de lag nos tiros (o servidor decide pelas posições dele).
- Quem sai ou cai no meio da partida é substituído por bot na hora e volta ao controle se reconectar.
- Troca de lados a cada 3 rodadas (regra que já existia) agora com aviso na tela e o lado de cada um no placar.

## Global Constraints

- Motor sem `Math.random`/`Date.now`. Identificadores em inglês, UI e comentários em pt-BR, sem bloco longo de comentário.
- Entrada do cliente nunca é confiável: tudo passa por `sanitizeInput` e validações de payload.
- Commits semânticos e pequenos, **sem Co-Authored-By**, só no worktree `dane-se-cs`.
- Nada de mudar o comportamento do Dane-se e do poker; os testes existentes seguem verdes.

## Review Focus

- Dois jogadores no mesmo time e no time oposto: cada um vê só o que deve ver (inimigo atrás de parede nunca vai no snapshot).
- Entrada inválida (NaN, Infinity, campos faltando, fila gigante) não derruba nem trava a sala.
- Sair, cair e voltar no meio da partida: bot assume e devolve o controle; anfitrião que sai passa o posto.
- Troca de lados na rodada 3: espawns, dinheiro, armas e rótulo de lado batem nos dois lados da rede.
- Desistir: maioria dos humanos do time; time de um humano desiste com um voto.
- Código de sala nunca colide entre Dane-se/poker e CS, e entrar por código funciona nos dois.
- Previsão: depois de uma correção do servidor o corpo local não "teletransporta" de forma visível em movimento normal.

## File Structure

`shared/src/cs/`: `match.ts`, `runner.ts` (times, stats, bot no lugar do humano), `net.ts` (protocolo, `sanitizeInput`, `buildSnapshot`, `applySnapshot`, interpolação, previsão), `lobby.ts` (regras do lobby e votação) — testes em `shared/test/cs/`.
`shared/src/protocol.ts`: eventos `cs:*`.
`server/src/cs/csRooms.ts` e ligação em `server/src/app.ts` e `server/src/rooms.ts`; testes em `server/test/cs.test.ts`.
Cliente: `client/src/lib/store.ts` (estado da sala CS), `client/src/components/cs/CsLobby.tsx`, `CsNetGame.tsx`, `netClient.ts`, `CsScoreboard.tsx`; ajustes em `CsScreen.tsx` (fonte local ou de rede), `CsHud.tsx`, `CsScene.tsx`, `Hub.tsx`, `CsCard.tsx`, `App.tsx`.

---

### Task 1: Times, estatísticas e bot no lugar do humano (motor)

**Files:** Modify `match.ts`, `runner.ts`; Test `runner.test.ts`, `match.test.ts`.

**Interfaces — Produces:**
- `match.ts`: `isSideSwapRound(roundIndex: number): boolean` (verdadeiro em 3, 6, 9...).
- `runner.ts`: `createMatch(humans: { id: string; name: string; team?: TeamId }[], seed: number, difficulty?: Difficulty): Match` (humano com `team` vai para ele; sem `team` preenche o A e depois o B; mais de 3 humanos num time lança `Error('TEAM_FULL')`); `interface PlayerStats { kills: number; deaths: number; headshots: number }`; `Match.stats: Record<string, PlayerStats>` atualizado por `stepMatch` a partir dos eventos `kill`; `setBotControl(match: Match, playerId: string, bot: boolean): Match` (liga ou desliga o bot de um jogador; ao ligar cria a memória do bot com a habilidade da dificuldade; humano que sai vira bot, quem volta retoma).

- [ ] **Step 1: Failing tests.** Humanos com `team` explícito ficam nos times pedidos e os bots completam até 3 em cada; 4 humanos em A lançam `TEAM_FULL`; sem `team` o comportamento antigo; `isSideSwapRound`; após uma rodada com abates `stats` soma kills/deaths/headshots certos e nunca perde o histórico; `setBotControl(match, 'h1', true)` faz `world.players` e `roster` marcarem `bot: true` e o bot passa a agir sozinho no `stepMatch`; `setBotControl(match, 'h1', false)` devolve o controle.
- [ ] **Step 2:** `npm run test -w shared -- cs/runner cs/match` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm run test -w shared` e `npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(cs): times escolhidos, estatísticas e bot no lugar do humano`

### Task 2: Protocolo de rede e visão por jogador (compartilhado)

**Files:** Create `shared/src/cs/net.ts`, `shared/src/cs/lobby.ts`; Modify `shared/src/cs/index.ts`, `shared/src/protocol.ts`; Test `net.test.ts`, `lobby.test.ts`.

**Interfaces — Produces:**
- `net.ts`: `CS_STEP_MS = 1000 / 60`, `CS_SNAPSHOT_EVERY = 3`, `CS_INTERP_MS = 100`, `CS_MAX_PENDING = 12`; `interface CsInputMsg { seq: number; input: PlayerInput }`; `sanitizeInput(raw: unknown): PlayerInput | null` (números finitos, `moveX/moveZ` limitados a [-1, 1], `pitch` a ±1.5, `yaw` normalizado, booleanos estritos, `slot` só 0 a 3; `null` quando o formato não serve); `interface CsPlayerSnap` (`id, x, y, z, vx, vz, vy, yaw, pitch, crouch, onGround, alive, weapon`, e só para o próprio jogador e colegas `hp, hasBomb, money`, e só para o próprio `ammo, reserve, holstered, equipLeftMs, reloadLeftMs, cooldownMs, shots, punchPitch, punchYaw, burst, sinceShotMs`); `interface CsSnapshot { tick; ack; phase; phaseLeftMs; roundIndex; score; lossStreak; winner; forfeitedBy; pauseMs; end; bomb; players: CsPlayerSnap[]; heard: Vec3[]; events: WorldEvent[]; stats }`; `class VisionTracker` (memória de 250 ms de quem cada time viu); `buildSnapshot(match: Match, viewerId: string, tracker: VisionTracker, tick: number, ack: number, now: number): CsSnapshot`; `applySnapshot(prev: Match | null, snap: CsSnapshot, base: { roster: RosterEntry[]; map: MapDef }): Match`; `interpolatePlayers(older: CsSnapshot, newer: CsSnapshot, alpha: number): Map<string, { x; y; z; yaw; pitch }>`; `predictBody(map: MapDef, server: Body, pending: CsInputMsg[], weapon: WeaponId, alive: boolean, phase: RoundPhase): Body`.
- `lobby.ts`: `interface CsMember { id: string; name: string; team: TeamId; isHost: boolean; connected: boolean; character: CharacterId }`; `interface CsLobbyView { code: string; youId: string; hostId: string; status: 'lobby' | 'playing' | 'finished'; members: CsMember[]; difficulty: Difficulty; teamSize: number }`; `canJoinTeam(members: CsMember[], memberId: string, team: TeamId): boolean` (máximo 3 por time); `autoTeam(members: CsMember[]): TeamId` (o time com menos gente); `startError(members: CsMember[]): 'NOT_ENOUGH_PLAYERS' | null`; `forfeitPassed(votes: ReadonlySet<string>, teamHumanIds: readonly string[]): boolean` (mais da metade; um voto basta com um humano só); `interface CsStartInfo { mapId: string; roster: RosterEntry[] }`.
- `protocol.ts`: eventos do cliente `cs:create`, `cs:join`, `cs:resume`, `cs:leave`, `cs:team`, `cs:difficulty`, `cs:character`, `cs:kick`, `cs:start`, `cs:rematch`, `cs:input`, `cs:buy`, `cs:ping`, `cs:forfeit`; do servidor `cs:lobby`, `cs:started`, `cs:snapshot`, `cs:ping`, `cs:forfeit`, `cs:closed`; códigos de erro `TEAM_FULL`, `NOT_IN_MATCH`.

- [ ] **Step 1: Failing tests.** `sanitizeInput`: aceita um input válido, recusa objeto sem campos numéricos, `NaN`, `Infinity`, `moveX: 9` vira 1, `slot: 7` recusado, `yaw` gigante normalizado. `buildSnapshot`: o próprio jogador recebe campos privados e os colegas só os públicos mais `hp`; inimigo atrás de parede não aparece, inimigo à vista aparece, e continua aparecendo por 250 ms depois de sumir; na preparação nenhum inimigo aparece; inimigo correndo a menos de 22 m fora de vista vira `heard`; eventos `shot` só aparecem se o atirador está no snapshot e `kill` aparece sempre. `applySnapshot`: devolve um `Match` com `world.players` na ordem do roster, `baseMap` e `map` certos (com portão na compra e na preparação), campos privados de inimigo com padrão seguro. `interpolatePlayers` no meio dá a média e o `yaw` toma o menor arco. `predictBody`: sem entradas pendentes devolve o corpo do servidor; com 10 entradas andando para a frente o corpo anda; na compra não anda; morto não anda. `lobby`: limites de time, `autoTeam`, votação de desistência.
- [ ] **Step 2:** `npm run test -w shared -- cs/net cs/lobby` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm run test -w shared` e `npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(cs): protocolo de rede, visão por jogador e regras do lobby`

### Task 3: Servidor — salas do CS (lobby e partida)

**Files:** Create `server/src/cs/csRooms.ts`; Modify `server/src/app.ts`, `server/src/rooms.ts` (ganchos públicos: `ensureProfileFor`, `codeTaken`, `presenceChanged`, `sendInvite`, presença `inRoom` externa); Test `server/test/cs.test.ts`.

**Interfaces — Produces:** `class CsRoomManager { constructor(io: IO, rooms: RoomManager, options?: { tickMs?: number }); create(socket, payload): Ack<Session>; join(socket, code, name): Ack<Session>; resume(...); leave(socket): Ack; setTeam(socket, team): Ack; setDifficulty(socket, value): Ack; setCharacter(...); kick(...); start(socket): Ack; rematch(socket): Ack; input(socket, payload): void; buy(socket, weapon): Ack; ping(socket, payload): void; forfeit(socket): Ack; owns(socket): boolean; has(code: string): boolean; voiceJoin/voiceLeave/voiceSignal (só colegas de time); inviteFriend(socket, id): Ack; disconnect(socket): void; dispose(): void }`.
Comportamento: lobby (criar, entrar, escolher time com `autoTeam` na entrada, trocar de time, dificuldade, anfitrião passa a outro quando sai, sala some quando o último humano sai); `start` cria a partida com `createMatch(humans com time)` e começa o laço de 60 Hz (acumulador, no máximo 5 passos por disparo); uma entrada por humano por tick (fila de 12, repete a última); snapshot a cada 3 ticks por jogador com `volatile`; eventos do tick vão no próximo snapshot; humano que desconecta ou sai vira bot (`setBotControl`) e volta ao reconectar com o token; `forfeit` conta votos do time (some ao desistir quem sai); ao `match.winner` manda o snapshot final e a sala vai para `finished`; `rematch` (anfitrião) volta ao lobby mantendo os times.

- [ ] **Step 1: Failing tests** (socket.io real, como `server/test/server.test.ts`): criar sala devolve código de 4 letras que não existe no `RoomManager`; segundo jogador entra pelo código e vai para o time com menos gente; trocar de time respeita o máximo 3; só o anfitrião muda a dificuldade e começa; `start` manda `cs:started` e snapshots; entrada válida move o jogador (posição muda depois de uns ticks, na fase certa); entrada inválida não derruba; inimigo atrás de parede não vai no snapshot; desconectar vira bot e reconectar devolve; sair passa o posto do anfitrião; desistir com maioria do time encerra com o outro time vencedor; entrar por código inexistente dá `ROOM_NOT_FOUND`; `room:join` com código de CS dá `ROOM_NOT_FOUND` e `cs:join` funciona; sala vazia some.
- [ ] **Step 2:** `npm run test -w server -- cs` — Expected: FAIL.
- [ ] **Step 3: Implement** (laço com `setInterval` de 8 ms e acumulador; `unref` nos timers; limpeza em `dispose`).
- [ ] **Step 4:** `npm test` — Expected: PASS (inclui Dane-se e poker).
- [ ] **Step 5: Commit** `feat(cs): salas do CS no servidor com lobby, partida e votação`

### Task 4: Cliente — rede, lobby e entrar por código

**Files:** Create `client/src/components/cs/CsLobby.tsx`, `netClient.ts`; Modify `client/src/lib/store.ts`, `client/src/App.tsx`, `client/src/components/hub/Hub.tsx`, `CsCard.tsx`, `InviteToast.tsx`.

**Interfaces — Produces:** no store: `csRoom: CsLobbyView | null`, `csSession`, ações `actions.csCreate()`, `csJoin(code)`, `csLeave()`, `csTeam(team)`, `csDifficulty(d)`, `csStart()`, `csRematch()`, `csKick(id)`; `actions.join(code)` tenta `room:join` e, em `ROOM_NOT_FOUND`, `cs:join`; link `/sala/CODIGO` entra em sala de CS também; convite de amigo para sala de CS entra com `cs:join`. Hub: card "Modo CS" ganha "Treinar contra bots" (solo, como hoje) e "Criar sala" (multiplayer). Lobby: código grande com copiar código e copiar link, dois quadros Time A e Time B com os jogadores e botão "Entrar neste time", dificuldade (anfitrião), botão Começar (anfitrião), lista de bots que vão completar, sair, chat não incluso.

- [ ] **Step 1:** Implementar (cliente sem runner de teste; a lógica pura já está no `shared`).
- [ ] **Step 2:** `npm run typecheck` — Expected: sem erros.
- [ ] **Step 3: Verificação no navegador** com duas abas: criar sala, entrar pelo código, trocar de time, começar.
- [ ] **Step 4: Commit** `feat(cs): lobby de times, código de sala e convite`

### Task 5: Cliente — partida em rede (previsão, interpolação, observar)

**Files:** Create `client/src/components/cs/CsNetGame.tsx`, `CsScoreboard.tsx`; Modify `CsScreen.tsx` (extrair a tela de jogo para aceitar uma fonte), `CsHud.tsx`, `CsScene.tsx`, `audioDirector.ts`, `useCsInput.ts`.

**Interfaces — Produces:** uma fonte de partida com a forma `{ matchRef; sendInput(seq, input); buy(weapon); ping(kind, x, z); forfeit(); onEvents }`; a fonte local usa `stepMatch`; a de rede envia `cs:input` a cada tick fixo, aplica `predictBody` no corpo local, guarda o buffer de snapshots, interpola os outros e monta o `Match` com `applySnapshot`; `simPaused(flow, false)` (sem pausa na rede); morto observa um colega vivo (clique troca), câmera sem arma; placar (segurar Tab junto do mapa) com time, lado atual, K/D, dinheiro dos colegas; aviso de troca de lados ("Troca de lados: você agora ataca/defende") e rótulo do lado no HUD; menu de pausa com "Desistir (votar)" e contagem de votos; ping do time (`cs:ping`) e voz só do time.

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** `npm run typecheck && npm test` — Expected: PASS.
- [ ] **Step 3: Verificação no navegador** com duas abas jogando a mesma partida: movimento de um aparece no outro, tiro e dano, placar, troca de lados na rodada 3 (usar a velocidade dos bots), desistir.
- [ ] **Step 4: Commit** `feat(cs): partida em rede com previsão, observação e placar`

### Task 6: Mais perto do CS (itens extras) e fechamento

**Files:** a definir depois da Task 5 (colete, kit de desarme, granadas de fumaça e de luz, armas caídas), `docs/cs-mode.md`.

- [ ] **Step 1:** Escolher com o usuário o que entra depois do multiplayer (ver lista na resposta final); implementar o que ele priorizar.
- [ ] **Step 2:** Atualizar `docs/cs-mode.md`; `npm run typecheck && npm test`.
- [ ] **Step 3:** Revisão final da branch por um revisor com contexto novo; corrigir críticos e importantes.
- [ ] **Step 4: Commit** `docs(cs): multiplayer, lobby e placar`

---

## Self-review

- Cobre o pedido: mandar código (T2/T3/T4), trocar de time antes de organizar (T2 lobby, T4 UI), inversão de lados (já no motor; T5 mostra o aviso e o lado), "o mais perto do CS": servidor autoritativo, visibilidade, observar, placar, desistir, voz do time (T3, T5) e T6 para colete/utilitários.
- Consistência: `RosterEntry`, `Match`, `WorldEvent` vêm de `sim.ts`/`runner.ts`; `CsSnapshot` nasce na T2 e a T3 e a T5 só o consomem; `setBotControl` nasce na T1 e a T3 o usa.
- Risco assumido: sem compensação de lag nos tiros e sem validação anti-trapaça além de servidor autoritativo e visibilidade por linha de visão.
