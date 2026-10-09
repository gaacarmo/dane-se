# Contributing to Dane-se

Thanks for helping! This guide gets you from zero to your first pull request, and explains where things live so you can find your way around.

## 1. Get it running

You need [Node.js](https://nodejs.org) 20 or newer and git.

```bash
git clone https://github.com/gaacarmo/dane-se.git
cd dane-se
npm install
npm run dev
```

Open http://localhost:5173. The game server runs on `:3001` and the page talks to it through Vite's proxy.

**Testing alone:** create a room and tap **🤖 Adicionar bot** a few times, then start. Bots play by themselves.

**Testing on your phone:** use the "Network" address Vite prints (e.g. `http://192.168.0.10:5173`) on the same Wi-Fi.

**Two players on one computer:** open a second browser profile or a private window. The seat is saved in `localStorage`, so two tabs in the same profile count as the same player (the newest tab takes the seat).

**Skip animations:** add `?instant` to the URL (dev only). Useful for screenshots or when you just want to test logic.

## 2. Project map

npm workspaces monorepo, TypeScript everywhere:

```
shared/                 Game rules, no UI, no network. Used by both server and client.
  src/rng.ts            Seedable RNG; the only randomness shared/ is allowed to use
  src/hub/              Money rules (money.ts), payout splitting (payout.ts),
                        the GameModule contract that every game implements
                        (gameModule.ts), and the public catalog (catalog.ts)
  src/games/danese/     The Dane-se engine (cards, trick, rules, game, view, bot)
  src/games/poker/      The Texas Hold'em engine (cards, hand, betting, rules, game, view, bot)
  src/protocol.ts       Socket event types + pt-BR error messages
  test/                 Vitest unit tests
  src/characters.ts     Avatar characters (shared with the 3D table)

server/
  src/hub/              Wallets: WalletService (money moves + idempotent settlement),
                        the WalletStore interface, and File/Memory implementations;
                        plus the game registry (which games exist)
  src/rooms.ts          Rooms, sessions, reconnection, timers, bots, escrow/payouts
  src/app.ts            Express + Socket.IO wiring, /health, serves the built client
  scripts/simulate.ts   Plays full games with bots and audits for hidden-info leaks
  scripts/botClient.ts  A socket client used by tests and scripts
  test/                 Integration tests over real sockets

client/
  src/lib/store.ts      Socket connection, wallet profile, session, actions
  src/lib/sound.ts      Synthesized sound effects
  src/lib/prefs.ts      Per-device preferences (mute, vibration, table color)
  src/components/       HowToPlay, WaitingRoom, chat, cards/, ui/
  src/components/hub/   The game hub: Hub, WalletHeader, GameCard (one page to pick a game)
  src/components/poker/ Texas Hold'em screen: PokerScreen, PokerSeat, PokerActions, CardFace, …
  src/components/table/ The Dane-se game screen: GameScreen, Seat, Hand, BetBar, …
```

### How a move travels

1. The player taps a card → `actions.play(cardId)` in `client/src/lib/store.ts` emits `game:play`.
2. `server/src/app.ts` passes it to `RoomManager.play()` in `server/src/rooms.ts`.
3. The room calls `applyAction(state, action)` from the game engine (`shared/src/games/danese/game.ts` for this example). The engine validates everything (turn, phase, card ownership) and returns a new state or an error code.
4. The room sends each player **their own** `getPlayerView(state, playerId)` as `room:state`.
5. React re-renders from that view; Framer Motion animates the difference.

The server is the only source of truth. The client never decides anything about the game.

## How a new game is added

Games plug into the hub through `GameModule` (`shared/src/hub/gameModule.ts`): validate settings, create a game, apply an action, and (for money games) pay out a finished game. The three registries to touch are:

1. `shared/src/games/<name>/module.ts` — the engine wrapped in a `GameModule` (see `shared/src/games/danese/module.ts` for the pattern). The engine itself stays pure and testable.
2. `server/src/hub/registry.ts` — `registerGame(<name>, module)` so the server can spawn it.
3. `shared/src/hub/catalog.ts` — one `GameCatalogEntry` for the hub card (name, players, entry options, icon). Set `available: false` while it's still in the oven: the hub shows it greyed out as "em breve".

Money games also need `rules.ts` to expose `payoutWeights`/ranking (see `danesePayoutWeights` and `rankDanesePlayers` in `shared/src/games/danese/rules.ts`) — the room charges the entry at the start, holds the pot in the room, and pays it out at the end through `WalletService.settle()` (idempotent, keyed by room + game sequence).

## 3. Golden rules

- **Never leak hidden information.** Anything game-related a client receives must come from a per-game view (`getPlayerView()` in `shared/src/games/danese/view.ts`, `getPokerView()` in `shared/src/games/poker/view.ts`). Don't add other players' hands (or your own forehead card in the blind round) to any message. `npm run simulate` and the tests check this.
- **Keep the engine pure.** `shared/` has no `Date.now()`, no `Math.random()` (use `shared/src/rng.ts`), no I/O. That keeps games deterministic and testable.
- **Rule changes come with tests.** If you touch `shared/`, add or update a test in `shared/test/`.
- **Code in English, UI in Brazilian Portuguese.** Identifiers and comments in English; everything the player reads in pt-BR. Server error messages live in `ERROR_MESSAGES_PT` in `shared/src/protocol.ts`.
- **Mobile first.** Most of us play on phones. Check portrait *and* landscape, and keep touch targets at least 44px.
- **Free tier only.** No paid services, no database, no auth providers.

## 4. Recipes

**Change a game rule.** Look in `shared/src/games/<game>/rules.ts` first: the debatable rules are named constants (e.g. `DEALER_PENALTY_WHEN_ALL_TRICKS_TIED`). Update the tests in `shared/test/`, and the "Como jogar" text in `client/src/components/HowToPlay.tsx` if players would notice.

**Add a new player action** (e.g. an emote):
1. Add the event to `ClientToServerEvents` (and `ServerToClientEvents` if needed) in `shared/src/protocol.ts`.
2. Handle it in `RoomManager` (`server/src/rooms.ts`) and register it in `registerHandlers` (`server/src/app.ts`). Validate the payload, since clients can send anything.
3. Add an action in `client/src/lib/store.ts` and call it from a component.
4. Add a server test in `server/test/server.test.ts` (the `BotClient` helper makes this easy).

**Change the table layout.** Seat, trick and card positions are computed in `client/src/components/table/geometry.ts`. Short landscape phones use a "compact" layout (see `useMediaQuery` in `GameScreen.tsx`).

**Add a sound.** Add a function to `sfx` in `client/src/lib/sound.ts` (tones and noise bursts, no audio files) and trigger it from `client/src/lib/useGameEffects.ts`.

**Change card art.** `client/src/components/cards/PlayingCard.tsx` (faces and back) and `suits.tsx` (suit shapes). Everything is SVG drawn in code: please don't add copyrighted artwork.

## 5. Before opening a pull request

```bash
npm run typecheck
npm test
npm run simulate -- --players 4 --games 5
```

Then play at least one round in the browser, ideally on a phone, in portrait and landscape.

Workflow:

1. Create a branch from `main`: `git checkout -b feature/emotes`.
2. Keep pull requests small and focused; describe what changed and how you tested it (the PR template asks).
3. GitHub Actions runs typecheck, tests and the build on every PR. It must be green.
4. Someone else reviews and merges. `main` deploys automatically if Render is connected.

## 6. Good to know

- **Rooms live in memory.** In dev, saving a server file restarts the server and wipes the rooms; the page shows "Essa sala não existe mais…" and goes back to the lobby. That's expected.
- **Animations pause in background tabs** (browsers stop `requestAnimationFrame`). If something looks frozen, make sure the tab is visible.
- **Timings** (trick pause, round summary, reconnect grace, room cleanup) are in `DEFAULT_TIMINGS` in `server/src/rooms.ts`.
- **Deploying:** see the README (Render free tier, Docker, Cloudflare Tunnel).

## 7. Ideas to pick up

Open an issue or comment on one before starting something big, so two people don't build the same thing.

- Multi-table / tournament poker
- Game log panel (who played what, who lost a letter)
- Bot difficulty levels
- Let the host remove a player for good in the middle of a game
- Spectators joining by link without playing
- Animation and sound polish after real games with friends
- Accessibility pass with a screen reader
