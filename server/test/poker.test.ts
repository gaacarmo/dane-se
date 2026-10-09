import { afterEach, describe, expect, it } from 'vitest';
import { STARTING_BALANCE, isPokerRoom, type RoomView } from '@dane-se/shared';
import { BotClient } from '../scripts/botClient.js';
import { createApp } from '../src/app.js';
import type { Timings } from '../src/rooms.js';

/**
 * Server-side wiring of the poker engine (Phase 3): money escrow/payout,
 * between-hands rebuys, the turn clock (auto check/fold + sit-out) and the
 * generic `game:action` channel. The poker rules themselves are covered by the
 * shared engine tests.
 */
const FAST: Partial<Timings> = {
  trickPauseMs: 5,
  roundSummaryMs: 5,
  betweenHandsMs: 5,
  // Large so the driver is never preempted, except in the turn-clock test.
  turnTimeoutMs: 100_000,
  botDelayMs: 5,
  reconnectGraceMs: 500,
  hostGraceMs: 50,
  emptyRoomTtlMs: 60,
  sweepIntervalMs: 100_000,
};

const servers: ReturnType<typeof createApp>[] = [];
const clients: BotClient[] = [];

async function boot(timings: Partial<Timings> = FAST): Promise<string> {
  const server = createApp({ timings, clientDist: '/nonexistent' });
  servers.push(server);
  return `http://localhost:${await server.listen(0)}`;
}

function client(url: string, name: string): BotClient {
  const c = new BotClient(url, name);
  clients.push(c);
  return c;
}

afterEach(async () => {
  for (const c of clients) c.close();
  clients.length = 0;
  for (const s of servers) await s.close();
  servers.length = 0;
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function poker(view: RoomView | null | undefined) {
  if (!view || !isPokerRoom(view)) throw new Error('expected a poker room');
  return view;
}

/** The client whose turn it is right now, or null between hands. */
function actor(players: BotClient[]): BotClient | null {
  const id = poker(players[0]!.view).game?.actorId ?? null;
  return id ? (players.find((p) => p.view?.youId === id) ?? null) : null;
}

/** Sets up a poker room with the given players (all wallets created). */
async function pokerRoom(url: string, names: string[], entry = 1000) {
  const players = names.map((n) => client(url, n));
  for (const p of players) await p.hello();
  await players[0]!.create({ gameType: 'poker', settings: { entry } });
  for (const p of players.slice(1)) expect((await p.join(players[0]!.view!.code)).ok).toBe(true);
  await players[0]!.waitFor((v) => v.members.length === names.length);
  return players;
}

describe('poker money rooms', () => {
  it('charges the buy-in at the start and pays out the final stacks (money conserved)', async () => {
    const url = await boot();
    const players = await pokerRoom(url, ['Ana', 'Bia']);

    expect((await players[0]!.start()).ok).toBe(true);
    await players[0]!.waitFor((v) => v.status === 'playing');
    await sleep(30);
    // Charged on start, not on join.
    expect(players[0]!.profile!.balance).toBe(STARTING_BALANCE - 1000);
    expect(players[1]!.profile!.balance).toBe(STARTING_BALANCE - 1000);

    // Both shove every hand until one busts: pure engine, real sockets.
    for (let i = 0; i < 5000 && players[0]!.view!.status !== 'finished'; i++) {
      const who = actor(players);
      if (!who) {
        await sleep(2);
        continue;
      }
      expect((await who.action('allIn')).ok).toBe(true);
      await sleep(2);
    }

    await players[0]!.waitFor((v) => v.status === 'finished', 20_000);
    await sleep(30);
    const total = players.reduce((sum, p) => sum + p.profile!.balance, 0);
    expect(total).toBe(2 * STARTING_BALANCE);
    expect(players[0]!.view!.money.settled).toBe(true);
    const results = players[0]!.view!.results!;
    expect(results.reduce((sum, r) => sum + r.amount, 0)).toBe(2000);
  });

  it('rebuy adds chips from the wallet and the pot still balances at the end', async () => {
    const url = await boot({ ...FAST, betweenHandsMs: 300 });
    const players = await pokerRoom(url, ['Ana', 'Bia', 'Caio']);

    expect((await players[0]!.start()).ok).toBe(true);
    await players[0]!.waitFor((v) => v.status === 'playing');
    await sleep(30);
    for (const p of players) expect(p.profile!.balance).toBe(STARTING_BALANCE - 1000);

    let rebuys = 0;
    const rebought = new Set<string>();

    // Ana and Bia shove; Caio folds, so at most one player busts per hand and
    // the table keeps at least two stacks (the game does not end on a bust).
    for (let i = 0; i < 30_000 && players[0]!.view!.status !== 'finished'; i++) {
      const view = poker(players[0]!.view).game!;
      if (view.status === 'hand' && view.phase === 'summary') {
        for (const p of players) {
          const mine = poker(p.view).game!;
          const seat = mine.seats.find((s) => s.id === mine.viewerId);
          if (seat && seat.chips === 0 && mine.canRebuy && !rebought.has(p.view!.youId)) {
            expect((await p.rebuy()).ok).toBe(true);
            rebought.add(p.view!.youId);
            rebuys += 1;
          }
        }
        await sleep(2);
        continue;
      }
      const who = actor(players);
      if (!who) {
        await sleep(2);
        continue;
      }
      const isCaio = who.view!.youId === players[2]!.view!.youId;
      expect((await who.action(isCaio ? 'fold' : 'allIn')).ok).toBe(true);
      await sleep(2);
    }

    expect(rebuys).toBeGreaterThanOrEqual(1);
    await players[0]!.waitFor((v) => v.status === 'finished', 20_000);
    await sleep(30);
    expect(players.reduce((sum, p) => sum + p.profile!.balance, 0)).toBe(3 * STARTING_BALANCE);
    const paid = 3 * 1000 + rebuys * 1000;
    expect(players[0]!.view!.results!.reduce((sum, r) => sum + r.amount, 0)).toBe(paid);
  });

  it('a poker room with a bot is "treino": nobody pays', async () => {
    const url = await boot();
    const host = client(url, 'Ana');
    await host.hello();
    await host.create({ gameType: 'poker', settings: { entry: 1000 } });
    expect((await host.addBot()).ok).toBe(true);
    const view = poker(await host.waitFor((v) => v.members.length === 2));
    expect(view.money.practice).toBe(true);

    expect((await host.start()).ok).toBe(true);
    await sleep(30);
    expect(host.profile!.balance).toBe(STARTING_BALANCE);
    expect(poker(host.view).money.pot).toBe(0);
  });
});

describe('poker commands', () => {
  it('only the player on turn may act, and unknown commands are rejected', async () => {
    const url = await boot();
    const players = await pokerRoom(url, ['Ana', 'Bia']);
    expect((await players[0]!.start()).ok).toBe(true);
    await players[0]!.waitFor((v) => !!poker(v).game?.actorId);

    const actorId = poker(players[0]!.view).game!.actorId!;
    const wrong = players.find((p) => p.view!.youId !== actorId)!;
    const right = players.find((p) => p.view!.youId === actorId)!;

    expect(await wrong.action('check')).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(await right.action('raise')).toEqual({ ok: false, error: 'INVALID_PAYLOAD' });
    expect((await right.action('fold')).ok).toBe(true);
  });
});

describe('poker turn clock', () => {
  it('auto folds a connected player and sits them out after two timeouts', async () => {
    const url = await boot({ ...FAST, turnTimeoutMs: 40, botDelayMs: 5 });
    const players = await pokerRoom(url, ['Ana', 'Bia', 'Caio']);
    expect((await players[0]!.start()).ok).toBe(true);
    await players[0]!.waitFor((v) => v.status === 'playing');

    // Nobody acts: the server checks/folds for them and, after two misses,
    // hands the seat to a bot.
    const satOut = await players[0]!.waitFor((v) => v.members.some((m) => !m.isBot && m.autoPlay), 8000);
    expect(satOut.members.filter((m) => !m.isBot && m.autoPlay).length).toBeGreaterThanOrEqual(1);
  });
});
