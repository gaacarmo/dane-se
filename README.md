# Game Hub (Dane-se · Poker)

A real-time multiplayer **game hub** with a shared server-side wallet, built from the classic Brazilian card game **Dane-se** (a.k.a. Fodinha). You take a seat in a college cafeteria, see everyone around you, and play. The interface is in Brazilian Portuguese.

- 🕹️ **Game Hub**: one home screen with your balance and the catalog — **Dane-se** is live now, **Poker Texas Hold'em** is coming next
- 💰 **Shared wallet**: everyone starts with R$ 10.000 of play money on the server. Entry is charged when a money game starts, the pot is paid to the winner at the end, and nobody can touch your balance from the client
- 2 to 6 players for Dane-se, phone-first, also fine on desktop (portrait and landscape)
- Rooms with a short code and share link
- Two ways to play, picked on the home screen: **Mobile** (the classic top-down table) or **Desktop** (first-person view from your seat). If a browser has no WebGL (3D graphics), the Desktop mode is unavailable
- Pick a character in the lobby: the group's six friends, drawn as cartoon portraits
- Emoji reactions and a text chat
- Reconnects to your seat after a refresh or a network drop; a bot plays for you while you're away
- Host can add bots to fill seats — a room with a bot becomes **treino** (practice): nobody pays
- Runs entirely on free tiers: one Node process, no paid services

## Playing

**The hub.** The home screen shows your nickname and balance on top, the catalog below (Dane-se, and poker coming soon) and a join-by-code box. Pick a game, choose the entry, and create the room — or type a 4-letter code to jump into a friend's room.

**Money.** Everyone starts with R$ 10.000 of play money, held server-side (the client never knows how to move it). The entry is chosen by the host at creation (Dane-se: R$ 100 upward) and charged from each player when the game **starts**. The pot is paid to the winner (and runner-up in bigger games) at the end; the results screen shows who got what and your new balance. If everyone leaves before the game ends, entries are refunded. Run low? The wallet refills to R$ 10.000 once an hour when your balance is under R$ 100. A room with a host-added bot is **treino**: no money moves at all.

**Lobby.** Create a room, share the link, and pick your character. The host can add bots, change the entry, the word (it's "DANE-SE" by default) and start the game.

**Choosing a mode.** On the home screen, pick **Mobile** or **Desktop** before creating or joining a room. The choice is remembered on that device and can be changed in the table menu (☰).

**The table.** You sit at the bottom of a round cafeteria table; the others are seated around it in play order (counter-clockwise). Each player shows their name, the letters they've lost, their bet (🎯) and the tricks they've made (✋). The one dealing, the **Pé**, is tagged and always bets and plays last. In the Desktop mode, your own numbers sit in the **"Você"** panel at the top left: your letters, your bet, the tricks you've made and how many you still need. On the right, a scoreboard lists everyone's bet and tricks made, and under it a **Vira** panel always shows the vira and the manilha it makes (it appears when the vira is turned over).

**Looking around.** Move the mouse up to raise your head (handy to see the cards on other players' foreheads in the blind round) and sideways to glance around. On a phone, drag your finger. The other players look at whoever's turn it is, and now and then at each other.

**Betting.** At the start of each round, when it's your turn, tap how many tricks you think you'll make. The Pé can't pick the number that would make everyone's bets add up to the number of cards, so someone always misses. The bar shows the running total.

**Playing a card.** Your hand is fanned at the bottom of the screen. Tap a card to raise it, tap it again (or drag it up) to play it. Cards played by everyone land on the table, face up and facing you, and the trick goes to the winner. The strongest cards are the *manilhas*, shown next to the deck and the vira.

**Blind round.** In the one-card rounds, the card sits on your forehead: you see everybody's card but yours. Wait for your turn and tap **"Jogar a carta da testa"**.

**Losing.** Whoever doesn't make their bet gets the next letter of the word. Whoever completes the word is out; the last one standing wins.

**Talking.** The 💬 button opens the room chat (a speech bubble pops up over whoever writes). The 😀 button sends an emoji reaction that floats over your character: 😂 😱 😡 😭 😎 🙏 👏 🔥 🤡 💩 😏 🦐.

## Quick start (local)

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open http://localhost:5173. To play from phones on the same Wi-Fi, use `http://<your-computer-ip>:5173` (Vite prints the network address).

Alone? Create a room and tap **🤖 Adicionar bot** in the lobby.

## Want to help?

See **[CONTRIBUTING.md](CONTRIBUTING.md)**: setup, a map of the code, the golden rules (like never leaking other players' cards), recipes for common changes, and ideas to pick up.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Server (`:3001`) + client dev server (`:5173`) with hot reload |
| `npm test` | Engine unit tests + server integration tests (Vitest) |
| `npm run typecheck` | Type-checks all packages |
| `npm run build` | Builds the client and bundles the server into `server/dist/index.js` |
| `npm start` | Runs the production build (server + built client on one port, default `3001`) |
| `npm run simulate -- --players 5 --games 3 [--disconnect]` | Plays full games with bots over real sockets and checks no hidden information leaks |
| `npm run bots -- ABCD 3` | Adds 3 bot players to room `ABCD` (local dev helper) |
| `npm run tunnel` | Exposes `localhost:3001` with a Cloudflare quick tunnel (see below) |

Dev tip: add `?instant` to the URL to skip animations.

## Deploy for free on Render

The repo includes a [Blueprint](https://render.com/docs/blueprint-spec) (`render.yaml`).

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, pick the repo, **Apply**.
3. Wait for the build (~2 min). Your game is at `https://dane-se.onrender.com` (or similar).

Render's free web services, as of October 2026:

- **Sleeps after 15 minutes** without traffic; the next visit takes **about 1 minute** to wake it up. The app shows "Acordando o servidor…" meanwhile. Tip: open the link a minute before game night.
- **Rooms live in memory**, so they're lost when the service sleeps, restarts or redeploys. Players who come back to a room that's gone see a friendly message and are sent to the lobby to create a new one.
- **Wallets live in a JSON file** (`.data/`) by default, which is also wiped on redeploy/restart. Set `DATABASE_URL` to a hosted store (e.g. Turso/libSQL) when you want balances to survive; see "How it's built".
- **750 free instance hours per month** per workspace: enough for one service running all month. If they run out, free services are suspended until the next month.
- Render "might restart a Free web service at any time".
- Regions: Oregon, Ohio, Virginia, Frankfurt, Singapore. There is no South America region; the Blueprint uses **Virginia** (closest to Brazil).
- WebSockets are supported.

Check [render.com/docs/free](https://render.com/docs/free) for current numbers; they change.

### Docker

There's also a `Dockerfile` (for Render's Docker runtime, Fly.io, Koyeb, a home server…). The final image contains only the server bundle and the built client, with no `node_modules`.

```bash
docker build -t dane-se .
docker run -p 3001:3001 dane-se
```

## Alternative: play from your own computer with Cloudflare Tunnel (free, no cold start)

For game nights when you don't want to wait for the free server to wake up, run the game on your computer and share it through a free [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/). No Cloudflare account or domain needed.

```bash
brew install cloudflared        # macOS; see Cloudflare's docs for Windows/Linux
npm run build && npm start      # game on http://localhost:3001
npm run tunnel                  # in another terminal
```

`cloudflared` prints a `https://<random-words>.trycloudflare.com` URL: send it to your friends. Notes:

- Your computer has to stay on and awake during the game.
- The URL changes every time you start the tunnel.
- Quick tunnels are meant for testing: no uptime guarantee and a limit of 200 in-flight requests (plenty for one table). For a fixed URL, set up a named tunnel with a free Cloudflare account and your own domain.

## How it's built

```
shared/   Pure game engines + the hub contracts (no framework). Fully unit tested.
server/   Express + Socket.IO. Rooms, sessions, timers, bots, wallets, escrow.
client/   React + Vite + Tailwind + Framer Motion. Hub + tables.
```

- **Server-authoritative.** Clients send intentions ("bet 2", "play 7♣", "join this room"); the server validates turn, phase, card ownership, balances and the Pé restriction against the engine.
- **Money is server-side.** The wallet lives in `server/src/hub/` (`WalletService` over a `WalletStore`: file- or memory-backed), with an append-only ledger, a refill cooldown, and idempotent settlements so a restart can't double-pay. Entering a room checks your balance; the entry is charged at the start and returned if the room empties before the game ends.
- **No hidden-information leaks.** The only game data a client ever receives comes from `getPlayerView(state, playerId)` in `shared/src/games/danese/view.ts`: your own hand only, and in the blind round everyone's forehead card except yours. The simulation script and tests audit every state sent.
- **Deterministic engines.** `shared/src/games/danese/game.ts` is a pure reducer with a seedable RNG (`shared/src/rng.ts`), so games can be replayed and tested.
- **Sessions + profiles.** A seat token in `localStorage` lets you reclaim your seat after a refresh; a wallet token keeps your balance across visits. If you're disconnected on your turn, the table waits 30 s (the host can skip), then a bot plays for you until you return. If everyone leaves, the room closes after 90 s; idle rooms close after 2 h.
- **Sounds** are synthesized with WebAudio (no audio files). Cards and table are SVG/CSS made for this project.

## Rules implemented

See the in-game **Como jogar** for the player-facing summary. Decisions worth knowing:

| Situation | Behavior | Where to change it |
| --- | --- | --- |
| Every trick of a round tied | Cannot happen anymore (a trick always has a winner); the rule is kept in the code. The Pé would get one letter (never two in a round) | `DEALER_PENALTY_WHEN_ALL_TRICKS_TIED`, `applyRoundTiePenalty` in `shared/src/rules.ts` |
| Everyone left would be eliminated in the same round | Nobody gets that round's letter; the round is replayed with the same card count | `REPLAY_ROUND_ON_SIMULTANEOUS_ELIMINATION` |
| Cards of the same rank in a trick | The higher suit wins (Ouros < Espadas < Copas < Paus), so a trick always has a winner and nothing is canceled | `resolveTrick` in `shared/src/trick.ts` |
| Card count | 1 → max → 1, each end played once (`1,2,…,6,5,…,1,2,…`); "back to 1" mode in settings | `nextCardCount` |
| Deal cap | `min(6, floor(39 / players))`; never actually limits a 2–6 player game | `maxCardsPerPlayer` |
| Following suit | Not required: any card can be played | — |
| First Pé | Random; then it moves to the right (next in play order) | `createGame`, `startNextRound` |
| Disconnected player | Bot plays for them; host can skip the wait; if everyone disconnects the game ends | `server/src/rooms.ts` |
| Eliminated players | Stay as spectators (no hands shown) | — |
| Entry | Chosen by the host at creation (Dane-se: integer ≥ 100). Charged from each player when the game starts; verified against the balance at join | `DANESE_MIN_ENTRY`, `rooms.ts` (`collectEntries`) |
| Payouts | 2–3 players: winner takes all; 4–6: 70/30; odd remainders go to 1st. Practice rooms pay nothing | `danesePayoutWeights`, `splitByWeights` in shared |
| Leaving mid-game | Keeps playing for you with a bot (host can skip); your entry is **not** refunded | `rooms.ts` |
| Leaving/emptying before the end | If everyone leaves before the game ends, entries are refunded and the room closes | `rooms.ts` (`refundRoom`) |
| Bot / practice | Host adds a bot in the lobby → the room becomes "treino": no money moves; blocked once someone paid | `rooms.ts` (`PRACTICE_LOCKED`) |
| Refill | Below R$ 100, reset to R$ 10.000, once per hour | `REFILL_*` in `shared/src/hub/money.ts` |
