# First-person view: what changed and how it works

Context for whoever (or whichever Claude Code) works on this next. This describes the `first-person-view` branch (PR #1): a first-person 3D table, character selection, text chat and a few UI changes. The server and the game rules (`shared/src/game.ts`, `view.ts`) are untouched, apart from the room protocol additions below.

## Summary

- A new **first-person table** (`client/src/components/table3d/`) built with three.js through `@react-three/fiber`, called "Realistic" in the UI. The old top-down table is still there and is called "Simplified". The player picks one on the home screen (`ViewModePicker` in `components/Home.tsx`) and can switch in the table menu. Both write `prefs.view3d`; when nothing is saved, the default comes from the device (`recommendedView3d()` in `lib/prefs.ts`: touch screens and widths under 768 px get Simplified).
- **Character selection** in the lobby: six portraits, chosen per player, stored on the server and shown on the 3D table.
- **Text chat** in the lobby and in the game, with speech bubbles over the speaker in the 3D view.
- A **right-side stack** in the realistic mode (`GameScreen.tsx`): `Scoreboard` (everyone's bet and tricks made, hidden on narrow and short-landscape screens) and `ViraPanel` (the vira card and the manilha, always visible; it animates in after the deal, when the vira is turned). Name tags on the table also show larger "Palpite / Fez" numbers.
- A **"Você" status panel** (letters, bet, tricks made, how many are left) and a bigger bet bar in the first-person view.
- The **emoji reactions** that were added on `main` also float over the 3D characters.
- README has a new player-facing "Playing" section.

## Dependencies added (client)

`three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, `postprocessing`, and `@types/three` (dev). The client bundle is now ~1.8 MB (~540 KB gzipped). Nothing else changed in the build; `npm ci`, `typecheck`, `test` and `build` pass as in CI.

## Protocol and server (small, additive)

`shared/src/protocol.ts`:
- `RoomMember.character: CharacterId` (always present).
- `RoomView.chat: ChatMessage[]` (always present, last `CHAT_HISTORY = 50`). Chat lives in the room state on purpose: it is rebroadcast with every `room:state` and survives reconnects, with no extra socket event.
- New client event `'room:character': { character }` and `'chat:send': { text }`.
- New error code `CHAT_TOO_FAST` (the reactions' `TOO_FAST` from `main` is untouched). `MAX_CHAT_LENGTH = 200`.

`shared/src/characters.ts`: `CHARACTER_IDS = ['carmelo','martelo','babin','dezin','sarney','colombo']`, `CharacterId`, `isCharacterId()`.

`server/src/rooms.ts`:
- `Member.character`. A new member (and a bot) gets a character nobody in the room has yet (`pickCharacter`); repeats are allowed once all six are taken.
- `setCharacter()`: validates with `isCharacterId`, allowed at any time.
- `chat()`: trims and collapses whitespace, cuts at 200 chars, rejects empty text, at least 600 ms between messages of the same player, keeps the last 50.
- `newMember(name, taken)` now takes the characters already in the room.

`server/src/app.ts`: wires the two events.

## Client: where things are

Outside the 3D folder:
- `lib/characters.ts`: display names (`Carmelo`, `Martelo`, `Babin Tom Sahur`, `Dezin du Couto`, `Sarney`, `Colombo`) and `portraitUrl(id)` (`/characters/<id>.png`).
- `lib/cardTextures.ts`: renders the existing SVG `PlayingCard`/`CardBack` once to a texture (`renderToStaticMarkup`, `var(--color-*)` resolved from the document) and caches it. The 3D cards therefore look exactly like the 2D ones.
- `lib/prefs.ts`: new `view3d` (default `true`). `table/TableMenu.tsx` has the switch.
- `lib/store.ts`: `actions.chat(text)` and `actions.setCharacter(id)`.
- `components/ChatPanel.tsx`: floating button with unread badge and a panel; used in the lobby and in the game (`opensDown` when the button is at the top).
- `components/WaitingRoom.tsx`: `CharacterPicker`.
- `components/table/GameScreen.tsx`: renders `Table3DView` instead of the 2D table when `view3d` is on; the 2D `ReactionBubbles` render only in 2D; `MyStatus` only in 3D. In 3D the bottom panel (status line, bet bar, hand) is an overlay on the bottom of the scene (`overlay` prop on `BottomPanel`).
- `components/table/Hand.tsx`: `peek` prop. In first person the hand sinks below the screen edge so the table stays visible; cards rise on hover and selection. Behaviour (tap to select, tap again or drag up to play) is unchanged.
- `components/table/BetBar.tsx`: shows the running total of bets and larger buttons.
- `components/table/MyStatus.tsx`: the "Você" panel (`compact` for short landscape screens).
- `index.css`: `reaction-float` keyframes for the emojis in 3D.
- `App.tsx`: in dev only, `?preview3d` renders the scene with no server (`&you=0..5` picks the seat you look from, `&n=2..6` the number of players).

`components/table3d/`:
- `Scene3D.tsx`: the `<Canvas>`, camera, post-processing, table, chairs, seat placement and the head turns. Seat `k` positions after you go counter-clockwise (`k = 1` is to your right); you are at +Z. Table radius 1.0, seats at 1.5. `LookControls` handles the camera (below). `useGaze` decides who each player looks at, re-rolled every 3.2 s: mostly the player with the turn, sometimes a random seat or you.
- `Table3DView.tsx`: connects the room state to the scene: name tags (`Html` from drei), forehead cards in the blind round, speech bubbles, reactions, the deck and vira (`Pile`) and the cards of the current trick (`TableCard`, `useShownCards`). Cards stay visible about 650 ms after a trick ends so they can slide to the winner.
- `Player2D.tsx`: one player: a drawn body plane, the head, and two hands lying on the table. The body and head are planes that always face the camera (rotation around Y only).
- `PortraitHead.tsx`: the head is a crop of the portrait PNG (`CROPS` holds the pixel rectangle, chin and top of head per character). It "turns" by squashing `scale.x` through zero and flipping, for characters whose portrait already looks to a side (`faces` in `characterSpecs.ts`) the flip decides left or right.
- `bodyTextures.ts`: draws the body (shirt pattern, collar, badge) and the hands on a canvas, per character.
- `characterSpecs.ts`: per-character skin, shirt (`base`, `accent`, `pattern`: `solid | hoops | band | sash`, optional `hood`), `badge` and `faces`.
- `Card3D.tsx`: a thin box with the face texture on +Z and the back on -Z. Played cards lie flat, all upright for the viewer, and are scaled by `CARD_SCALE` in `Table3DView.tsx`.
- `Environment.tsx`: the procedural cafeteria (tiles, windows, vending machines, other tables and chairs, lights). Nothing is a loaded model.

### Camera (`Scene3D.tsx`)

- Fixed position `[0, 1.85, 2.0]`, looking at the middle of the table, vertical field of view 56°. On narrow screens (aspect below 1.2) the field of view is widened so the table's width still fits.
- Mouse look: neutral in the middle of the screen (`ramp()` dead zones), the edges turn your head; yaw is limited to ±0.35 rad and pitch to -0.08 / +0.36 rad, on purpose, so you can raise your head to see the forehead cards in the blind round but never lose the table. Touch: dragging moves it with the same limits. The motion is damped.
- The seat info (names, letters, bets) is DOM positioned with drei's `Html`, so it is crisp and uses the existing Tailwind styles and `Letters` component.

## Assets

`client/public/characters/<id>.png` (six portraits with transparent background). They are portraits of real people, in their own commit (`chore: add character portraits`). The PNG paths are referenced by `portraitUrl()`; the crop rectangles in `PortraitHead.tsx` are in pixels of these exact files, so a different image needs new numbers there. Adding a character means: add the id to `CHARACTER_IDS`, a name in `lib/characters.ts`, a PNG, a `CROPS` entry and a `CHARACTER_SPECS` entry (TypeScript will point out what's missing).

## Decisions worth knowing

- **Flat layers instead of 3D character models.** Procedural 3D characters (primitives) looked bad, and generating or downloading models was not an option, so the body is drawn on a canvas and the head is the portrait. It reads well from the first-person angle; it won't hold up from other angles, and the heads can't truly rotate.
- **Hand and betting stay DOM.** The existing `Hand`, `BetBar` and `Overlays` are reused over the canvas, so the touch and drag behaviour didn't have to be rebuilt.
- **Cards on the table are flat and upright for you,** not oriented to each player. Leaning them toward the camera hid the far ones behind players.
- **The game state is untouched.** The 3D view only reads `RoomView`/`PlayerView` through the same store as the 2D table. Hidden information still comes only from `getPlayerView()`.

## Known gaps

- Not tested: several real players at once, reconnecting or spectating in the 3D view, a real phone or a weak device (only a desktop browser at phone-sized viewports).
- No dealing animation in 3D (the 2D table has one).
- With 6 players the two seats at the sides sit close to the camera and look large.
- No automated tests for the new server behaviour (chat, character selection).
- The `?preview3d` page is dev only.
- Eliminated players stay seated with a "FORA" tag; they aren't removed from the scene.
