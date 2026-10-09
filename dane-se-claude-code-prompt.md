# Task: Build "Dane-se", an online multiplayer card game

Build a real-time multiplayer web version of the Brazilian card game "Dane-se". I want to play it online with friends, and it should feel as close as possible to playing with a physical deck around a real table. UI language: Brazilian Portuguese (pt-BR). Code, comments, and identifiers: English.

Before writing code, read this whole spec, then give me a short implementation plan and list any open questions (max ~5). Then build in the phases defined at the end.

**Hard constraint: everything must run and deploy on free tiers. No paid services, no database, no auth providers.**

---

## 1. Game rules (source of truth)

### Deck and card strength
- 40-card deck: ranks 4, 5, 6, 7, Q, J, K, A, 2, 3 in 4 suits (no 8, 9, 10, jokers).
- Rank strength, weakest to strongest: 4 < 5 < 6 < 7 < Q < J < K < A < 2 < 3.
- Suit strength (only used to rank manilhas), weakest to strongest: Ouros (♦) < Espadas (♠) < Copas (♥) < Paus (♣).

### Vira and manilha
- Each round, after dealing, one card is flipped face-up on the table: the "vira". It is visible to everyone.
- The manilha is the rank immediately above the vira's rank in the strength order, wrapping around (vira 3 -> manilha is 4).
- Manilhas are the strongest cards of the round, ranked among themselves by suit (Ouros < Espadas < Copas < Paus). All non-manilha cards rank by rank only.
- The vira card itself is not dealt to anyone.

### Players, seating, dealer ("Pé")
- 2 to 6 players, each playing individually (no teams).
- One player is the dealer, called "Pé". The Pé always plays and bets LAST in the round. The dealer role rotates each round to the next alive player.
- Play order is counter-clockwise (anti-horário). The player to the right of the Pé starts. Seating must visually reflect this.

### Lives = letters
- Each player starts with 0 letters. The word is **D-A-N-E-S-E** (6 letters). Each time a player loses a round they receive the next letter. When a player completes the word (6th letter) they are eliminated. The last player standing wins.
- Keep the word as a room setting with "DANE-SE" as the default (do not change the default).

### Rounds
- Round 1 deals 1 card to each player, round 2 deals 2 cards, ... up to 6 cards (cap at floor(39 / numberOfAlivePlayers) if 6 is not feasible). After reaching the max, the number goes back down to 1 and cycles ("sobe e desce"). This is the default and the only mode required; a "restart at 1" mode is optional.
- In the 1-card round ("rodada cega"): each player holds their card on their FOREHEAD. Everyone sees all other players' cards but NOT their own. In all other rounds, each player sees only their own hand.
- The number of tricks ("quedas"/"vazas") in a round equals the number of cards dealt per player.

### Betting ("palpite")
- After dealing, in play order (starting at the player right of the Pé, ending with the Pé), each player declares how many tricks they will win (0 to N, where N = cards per player).
- Pé restriction: the Pé cannot declare a number that makes the sum of all declarations equal to N. The UI must disable that option for the Pé and explain why. This guarantees at least one player misses each round.
- In the blind 1-card round, bets are made by looking at the others' cards only.

### Playing tricks
- The player right of the Pé leads the first trick. Everyone plays one card in order; the Pé plays last. The highest card wins the trick; the winner leads the next trick.
- Ties inside a trick: identical-strength non-manilha cards (same rank, different suit) CANCEL each other. If the highest strength is tied among 2+ players, those cards are canceled and the highest remaining non-canceled card wins. If every card in the trick is canceled, nobody wins that trick (the trick is "empatada"; the next trick is led by the same player who led this one). Manilhas never tie with each other (suits break ties).
- **Whole-round tie:** if a round ends with nobody having won any trick (all tricks tied), **the Pé receives a letter** as a penalty. Normal bet scoring still applies to everyone else; if the Pé would already receive a letter from missing their own bet, they still receive only ONE letter that round (no double penalty). Keep this as an isolated, clearly named function/constant so it is trivial to change.

### Scoring a round
- After all tricks: every player whose won-tricks count != their declared count receives 1 letter (over OR under). Players who matched exactly receive nothing. Then apply the whole-round-tie rule above.
- Check eliminations, rotate the dealer to the next alive player, start next round.
- Edge case: if all remaining players would be eliminated in the same round, nobody is eliminated that round and a new round with the same card count is played (keep this as a constant that is easy to change).

---

## 2. Architecture requirements

**Stack (free-tier friendly, keep it as simple as possible):**
- TypeScript everywhere. Monorepo (npm workspaces) with `/shared` (types + pure game engine), `/server`, `/client`.
- Server: Node + Express + Socket.IO. In-memory state only. No database, no auth.
- Client: React + Vite + Tailwind + Framer Motion.
- **Single deployable service:** the Node server also serves the built client as static files, so there is exactly one process, one URL, no CORS issues.
- Target host: **Render free web service** (supports WebSockets). Known limitations to design around:
  - The free instance sleeps after ~15 min of inactivity (cold start ~30-60s) and in-memory rooms are lost on restart. Handle this gracefully: if a client reconnects to a room that no longer exists, show a friendly pt-BR message and send them to the lobby. Add a lightweight `/health` endpoint.
  - Document in the README an alternative that is also free: running locally and exposing it with a Cloudflare Tunnel (`cloudflared`), for nights when we want zero cold start.
  - Before finalizing deploy instructions, double-check current free-tier limits of Render (they change) and tell me if anything is different from the above.
- Provide a `render.yaml` (or equivalent) and a simple Dockerfile so deploying is a few clicks.

**Engine and security:**
- Server-authoritative. The client NEVER receives information it shouldn't have: other players' hands must never be sent to a client; in the blind 1-card round the server sends each player everyone else's card but not their own. Validate every action server-side (turn order, legal bet for the Pé, card ownership, phase).
- Game engine = pure, deterministic, framework-free functions in `/shared`, fully unit tested with Vitest. Required tests: manilha calculation (including vira=3 -> 4), card comparison, tie cancellation, all-cards-canceled trick, Pé bet restriction, whole-round tie (Pé gets one letter, no double), elimination, dealer rotation, up-and-down card counts (including the cap for many players), simultaneous-elimination edge case.
- Use a seedable RNG for shuffling so tests are deterministic.

**Rooms and sessions:**
- Create a room -> short code (4-5 letters) + shareable link. Join with nickname only. Host can configure settings and start the game. 2-6 players.
- Reconnection: if a player refreshes or drops, they must rejoin the same seat (session token in localStorage). Handle disconnects mid-game gracefully: a "waiting for X to reconnect" state; host can kick/skip a player (skipped player auto-plays or is eliminated, your call, flag it).
- Spectators: eliminated players stay in the room as spectators and keep watching.
- Clean up empty/idle rooms from memory after a timeout.

---

## 3. Visual design and UX (very important)

Goal: it should feel like sitting at a real card table.
- A felt-green (default) oval/round table with subtle texture, vignette, soft lighting and a wooden rim. A second theme (deep wine or blue) is a nice-to-have.
- Players sit around the table in seats arranged according to the counter-clockwise order, with the local player always at the bottom. Each seat shows: nickname, avatar/initial, declared bet, tricks won so far in the round, and their letters (D A N E S E) with lost letters visibly struck/colored. Mark who is the Pé (e.g. a dealer button).
- Realistic cards: crisp SVG (or well-made CSS) card faces with proper suit symbols, rounded corners, shadows, and a card back design. No emoji-looking cards. Custom assets only, no copyrighted artwork.
- The vira is displayed on the table next to the deck, with the current manilha clearly indicated (e.g. badge "Manilha: 4").
- Animations (Framer Motion): dealing from the deck to each seat, flip of the vira, playing a card to the center, collecting the trick toward the winner, cards on the forehead in the blind round (opponents' cards shown at their seat; the local player sees only a card back on their own forehead), letter-loss animation, elimination animation.
- My hand is fanned at the bottom; tap/click a card to select, tap again (or drag to the table) to play. Only playable cards during my turn are highlighted. Clear "it's your turn" indicator, dimmed state otherwise.
- Betting UI: a row of number buttons (0..N); the forbidden number for the Pé is disabled with a tooltip/explanation of the rule.
- Round info always visible: round number, cards per player, sum of bets vs. N (useful for the Pé), current trick, who leads.
- Round-summary overlay at the end of each round: who hit/missed their bet, who got a letter, whether the Pé got the tie penalty.
- Sound effects (deal, play card, lose letter, win) with a mute toggle. Subtle haptics on mobile are optional. Use free/self-generated sounds only.
- A short "Como jogar" modal in pt-BR summarizing the rules.
- Mobile-first AND desktop-friendly (friends will mostly play on phones). Portrait and landscape both usable.
- Accessibility: good contrast, large touch targets, color is never the only indicator (suits also by symbol).

---

## 4. Nice to have (only after the core is solid)
- Bots to fill empty seats (simple heuristic: bet based on count of manilhas/high cards). Also useful to simulate full games in tests.
- Emotes/quick reactions at the table.
- Game log panel (who played what, who lost a letter).
- Rematch button that keeps the room.

---

## 5. Phases

1. Shared engine + unit tests (no UI).
2. Server with rooms, state machine, hidden-information handling, and a script that simulates a full game with bots.
3. Real client: lobby, table, hand, betting, tricks, all animations.
4. Reconnection, spectators, edge cases, polish, sounds, mobile QA.
5. Dockerfile + render.yaml + README (local dev, free deploy on Render, Cloudflare Tunnel alternative).

Stop after each phase, summarize what was done, and tell me how to run/test it before continuing. If any rule above is ambiguous or you think it breaks the game, flag it instead of silently deciding.
