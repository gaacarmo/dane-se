import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isDaneseRoom, type RoomView } from '@dane-se/shared';
import { BotClient } from '../scripts/botClient.js';
import { auditView, simulateGame } from '../scripts/simulate.js';
import { createApp } from '../src/app.js';

let server: ReturnType<typeof createApp>;
let url: string;
let clients: BotClient[];

beforeEach(async () => {
  server = createApp({
    timings: {
      trickPauseMs: 5,
      roundSummaryMs: 5,
      botDelayMs: 5,
      reconnectGraceMs: 400,
      hostGraceMs: 50,
      emptyRoomTtlMs: 100,
    },
    clientDist: '/nonexistent',
  });
  url = `http://localhost:${await server.listen(0)}`;
  clients = [];
});

afterEach(async () => {
  for (const c of clients) c.close();
  await server.close();
});

function client(name: string): BotClient {
  const c = new BotClient(url, name);
  clients.push(c);
  return c;
}

async function lobby(n: number) {
  const players = Array.from({ length: n }, (_, i) => client(`P${i + 1}`));
  const { code } = await players[0]!.create();
  for (const p of players.slice(1)) expect((await p.join(code)).ok).toBe(true);
  await players[0]!.waitFor((v) => v.members.length === n);
  return { players, code };
}

/** Narrows a room view to the Dane-se branch (this file's default game). */
function danese(view: RoomView | null | undefined): Extract<RoomView, { gameType: 'danese' }> {
  if (!view || !isDaneseRoom(view)) throw new Error('expected a Dane-se room');
  return view;
}

/** The client whose turn it is right now. */
function current(players: BotClient[]): BotClient {
  const turn = danese(players[0]!.view!).game!.turnPlayerId;
  return players.find((p) => p.view?.youId === turn)!;
}

describe('http', () => {
  it('serves /health', async () => {
    const res = await fetch(`${url}/health`);
    expect(await res.json()).toMatchObject({ ok: true, rooms: 0 });
  });
});

describe('rooms', () => {
  it('creates a room with a 4-letter code and lets others join', async () => {
    const { players, code } = await lobby(3);
    expect(code).toMatch(/^[A-Z]{4}$/);
    const view = players[0]!.view!;
    expect(view.status).toBe('lobby');
    expect(view.members.map((m) => m.name)).toEqual(['P1', 'P2', 'P3']);
    expect(view.hostId).toBe(view.youId);
  });

  it('accepts lowercase codes', async () => {
    const host = client('Ana');
    const { code } = await host.create();
    expect((await client('Bia').join(code.toLowerCase())).ok).toBe(true);
  });

  it('rejects bad joins', async () => {
    const { code } = await lobby(2);
    expect(await client('X').join('ZZZZ')).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
    expect(await client('p1').join(code)).toEqual({ ok: false, error: 'NAME_TAKEN' });
    expect(await client('   ').join(code)).toEqual({ ok: false, error: 'INVALID_NAME' });
    expect(await client('x'.repeat(17)).join(code)).toEqual({ ok: false, error: 'INVALID_NAME' });
  });

  it('caps the room at 6 players', async () => {
    const { code } = await lobby(6);
    expect(await client('P7').join(code)).toEqual({ ok: false, error: 'ROOM_FULL' });
  });

  it('only the host can start, configure or kick; needs 2 players', async () => {
    const solo = client('Solo');
    await solo.create();
    expect(await solo.start()).toEqual({ ok: false, error: 'NOT_ENOUGH_PLAYERS' });

    const { players } = await lobby(2);
    const [host, guest] = players as [BotClient, BotClient];
    expect(await guest.start()).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(await guest.settings({ word: 'PATO' })).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(await guest.kick(host.view!.youId)).toEqual({ ok: false, error: 'NOT_HOST' });
  });

  it('host can change settings; invalid values are rejected', async () => {
    const { players } = await lobby(2);
    const host = players[0]!;
    expect(danese(host.view).settings.word).toBe('DANE-SE');
    expect((await host.settings({ word: 'pato' })).ok).toBe(true);
    expect(danese(await players[1]!.waitFor((v) => isDaneseRoom(v) && v.settings.word === 'PATO')).settings.word).toBe('PATO');
    expect(await host.settings({ maxCards: 9 })).toEqual({ ok: false, error: 'INVALID_SETTINGS' });
    expect(await host.settings({ word: '---' })).toEqual({ ok: false, error: 'INVALID_SETTINGS' });
    expect(await host.settings({ cardCountMode: 'chaos' })).toEqual({ ok: false, error: 'INVALID_SETTINGS' });
  });

  it('host can kick in the lobby', async () => {
    const { players } = await lobby(3);
    const [host, , victim] = players as [BotClient, BotClient, BotClient];
    expect((await host.kick(victim.view!.youId)).ok).toBe(true);
    await host.waitFor((v) => v.members.length === 2);
    await new Promise((r) => setTimeout(r, 20));
    expect(victim.kicked).toBe(true);
  });

  it('host can add bots that play a whole game and stay for the rematch', async () => {
    const host = client('Ana');
    await host.create();
    expect((await host.addBot()).ok).toBe(true);
    expect((await host.addBot()).ok).toBe(true);
    const view = await host.waitFor((v) => v.members.length === 3);
    expect(view.members.filter((m) => m.isBot).map((m) => m.name)).toEqual(['Zé Robô', 'Tia Bot']);
    expect(view.members.every((m) => m.connected)).toBe(true);

    host.enableAutoPlay();
    expect((await host.start()).ok).toBe(true);
    await host.waitFor((v) => v.status === 'finished', 20_000);
    expect((await host.rematch()).ok).toBe(true);
    const lobbyView = await host.waitFor((v) => v.status === 'lobby');
    expect(lobbyView.members.filter((m) => m.isBot)).toHaveLength(2);
  });

  it('only the host adds bots, in the lobby, up to 6 players', async () => {
    const { players } = await lobby(5);
    expect(await players[1]!.addBot()).toEqual({ ok: false, error: 'NOT_HOST' });
    expect((await players[0]!.addBot()).ok).toBe(true);
    expect(await players[0]!.addBot()).toEqual({ ok: false, error: 'ROOM_FULL' });
  });

  it('a room with only bots left is closed', async () => {
    const host = client('Ana');
    await host.create();
    await host.addBot();
    await host.leave();
    expect(server.rooms.roomCount).toBe(0);
  });

  it('nobody can join after the game started', async () => {
    const { players, code } = await lobby(2);
    expect((await players[0]!.start()).ok).toBe(true);
    expect(await client('Late').join(code)).toEqual({ ok: false, error: 'GAME_IN_PROGRESS' });
  });

  it('host role moves to a connected player when the host drops', async () => {
    const { players } = await lobby(2);
    players[0]!.close();
    const view = await players[1]!.waitFor((v) => v.hostId === v.youId, 2000);
    expect(view.members.find((m) => m.isHost)?.name).toBe('P2');
  });

  it('closes a room once everyone is gone', async () => {
    const { players } = await lobby(2);
    for (const p of players) p.close();
    await new Promise((r) => setTimeout(r, 250));
    expect(server.rooms.roomCount).toBe(0);
  });

  it('resuming a room that no longer exists says so', async () => {
    expect(await client('A').resume('QQQQ', 'whatever')).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
    const { code } = await lobby(2);
    expect(await client('B').resume(code, 'bad-token')).toEqual({ ok: false, error: 'SESSION_NOT_FOUND' });
  });
});

describe('reactions', () => {
  it('relays emoji reactions to everyone in the room, with a cooldown', async () => {
    const { players } = await lobby(3);
    const [a, b, c] = players as [BotClient, BotClient, BotClient];
    expect((await a.react('🦐')).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    for (const p of [a, b, c]) {
      expect(p.reactions).toEqual([expect.objectContaining({ playerId: a.view!.youId, emoji: '🦐' })]);
    }
    expect(await a.react('😂')).toEqual({ ok: false, error: 'TOO_FAST' });
    expect((await b.react('😂')).ok).toBe(true);
  });

  it('rejects emojis outside the palette and players outside a room', async () => {
    const { players } = await lobby(2);
    expect(await players[0]!.react('<script>')).toEqual({ ok: false, error: 'INVALID_PAYLOAD' });
    expect(await client('Lost').react('😂')).toEqual({ ok: false, error: 'NOT_IN_ROOM' });
  });
});

describe('game validation', () => {
  it('rejects out-of-turn, illegal and malformed actions', async () => {
    const { players } = await lobby(3);
    await players[0]!.start();
    await players[0]!.waitFor((v) => v.game?.phase === 'betting');

    const turn = current(players);
    const notTurn = players.find((p) => p !== turn)!;
    expect(await notTurn.bet(0)).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(await turn.bet(5)).toEqual({ ok: false, error: 'ILLEGAL_BET' });
    expect(await turn.bet('1' as unknown as number)).toEqual({ ok: false, error: 'INVALID_PAYLOAD' });
    expect(await turn.play()).toEqual({ ok: false, error: 'WRONG_PHASE' });

    // Bet 0 twice, so the Pé may not bet 1.
    expect((await turn.bet(0)).ok).toBe(true);
    await players[0]!.waitFor((v) => isDaneseRoom(v) && !!v.game && v.game.turnPlayerId !== turn.view!.youId);
    expect((await current(players).bet(0)).ok).toBe(true);
    await players[0]!.waitFor((v) => isDaneseRoom(v) && !!v.game && Object.values(v.game.players).filter((p) => p.bet !== null).length === 2);

    const pe = current(players);
    await pe.waitFor((v) => isDaneseRoom(v) && !!v.game && v.game.turnPlayerId === v.youId);
    const peView = danese(pe.view!).game!;
    expect(peView.dealerId).toBe(pe.view!.youId);
    expect(peView.legalBets).toEqual([0]);
    expect(peView.dealerForbiddenBet).toBe(1);
    expect(await pe.bet(1)).toEqual({ ok: false, error: 'ILLEGAL_BET' });
  });

  it('blind round: each client sees the others’ cards but not their own', async () => {
    const { players } = await lobby(4);
    await players[0]!.start();
    const views = await Promise.all(players.map((p) => p.waitFor((v) => v.game?.phase === 'betting')));
    for (const view of views) {
      const g = danese(view).game!;
      expect(g.blindRound).toBe(true);
      expect(g.hand).toEqual([]);
      for (const p of g.players) {
        if (p.id === view.youId) expect(p.foreheadCard).toBeNull();
        else expect(p.foreheadCard).not.toBeNull();
      }
    }
    // Everyone's forehead card, as seen by the others, is consistent.
    const seenBy = (target: string) => views.filter((v) => v.youId !== target).map((v) => danese(v).game!.players.find((p) => p.id === target)!.foreheadCard);
    for (const v of views) expect(new Set(seenBy(v.youId).map((c) => JSON.stringify(c))).size).toBe(1);
  });

  it('rejects a non-string card id', async () => {
    const { players } = await lobby(2);
    await players[0]!.start();
    await players[0]!.waitFor((v) => v.game?.phase === 'betting');
    expect(await current(players).play(42 as unknown as string)).toEqual({ ok: false, error: 'INVALID_PAYLOAD' });
  });
});

describe('disconnects', () => {
  it('waits for a player on their turn, host can skip, and they get their seat back', async () => {
    const { players, code } = await lobby(3);
    await players[0]!.start();
    await players[0]!.waitFor((v) => v.game?.phase === 'betting');

    let dropper = current(players);
    if (dropper === players[0]) {
      // Keep the host connected: let the host bet so someone else is next.
      expect((await dropper.bet(danese(dropper.view).game!.legalBets[0]!)).ok).toBe(true);
      await players[0]!.waitFor((v) => isDaneseRoom(v) && !!v.game && v.game.turnPlayerId !== v.youId);
      dropper = current(players);
    }
    const host = players[0]!;
    const seat = dropper.view!.youId;
    const token = dropper.session!.token;
    dropper.close();

    const waiting = await host.waitFor((v) => v.waitingFor?.playerId === seat);
    expect(waiting.waitingFor!.deadline).toBeGreaterThan(Date.now());
    expect(waiting.members.find((m) => m.id === seat)?.connected).toBe(false);

    expect((await host.skipWaiting()).ok).toBe(true);
    await host.waitFor((v) => isDaneseRoom(v) && !!v.game && v.game.players.find((p) => p.id === seat)!.bet !== null);
    expect(host.view!.members.find((m) => m.id === seat)?.autoPlay).toBe(true);

    const back = client(dropper.name);
    const resumed = await back.resume(code, token);
    expect(resumed).toMatchObject({ ok: true, playerId: seat });
    const view = await back.waitFor(() => true);
    expect(view.youId).toBe(seat);
    expect(view.members.find((m) => m.id === seat)).toMatchObject({ connected: true, autoPlay: false });
  });

  it('the bot takes over by itself after the grace period', async () => {
    const { players } = await lobby(2);
    await players[0]!.start();
    await players[0]!.waitFor((v) => v.game?.phase === 'betting');
    const [host, guest] = players as [BotClient, BotClient];
    host.enableAutoPlay();
    guest.close();
    const view = await host.waitFor((v) => v.members.some((m) => m.autoPlay), 3000);
    expect(view.members.find((m) => m.id !== view.youId)?.autoPlay).toBe(true);
  });

  it('a second tab with the same session takes over the seat', async () => {
    const { players, code } = await lobby(2);
    const [, guest] = players as [BotClient, BotClient];
    const tab2 = client('P2');
    expect((await tab2.resume(code, guest.session!.token)).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(guest.socket.connected).toBe(false);
    expect(tab2.view!.members).toHaveLength(2);
  });
});

describe('full games', () => {
  it.each([2, 4, 6])('%i bots play to the end without leaking hidden info', async (n) => {
    const result = await simulateGame({ url, players: n });
    expect(result.rounds).toBeGreaterThan(1);
  });

  it('survives a disconnect and reconnect mid-game', async () => {
    const result = await simulateGame({ url, players: 3, disconnect: true });
    expect(result.winner).toMatch(/^Bot/);
  });

  it('eliminated players keep watching as spectators, then host can rematch', async () => {
    const { players } = await lobby(3);
    for (const p of players) p.enableAutoPlay();
    await players[0]!.start();
    const finalViews = await Promise.all(players.map((p) => p.waitFor((v) => v.status === 'finished', 20_000)));
    for (const p of players) for (const v of p.views) auditView(v);

    const losers = finalViews.filter((v) => danese(v).game!.winnerId !== v.youId);
    expect(losers).toHaveLength(2);
    for (const v of losers) {
      const g = danese(v).game!;
      expect(g.isSpectator).toBe(true);
      expect(g.hand).toEqual([]);
    }

    expect((await players[0]!.rematch()).ok).toBe(true);
    const lobbyView = await players[1]!.waitFor((v) => v.status === 'lobby');
    expect(lobbyView.members).toHaveLength(3);
    expect(lobbyView.game).toBeNull();
  });
});
