import { afterEach, describe, expect, it } from 'vitest';
import { STARTING_BALANCE, chooseTrucoAction, isTrucoRoom, type RoomView } from '@dane-se/shared';
import { BotClient } from '../scripts/botClient.js';
import { createApp } from '../src/app.js';
import { MemoryWalletStore } from '../src/hub/memoryStore.js';
import { SocialService } from '../src/hub/socialService.js';
import type { Timings } from '../src/rooms.js';

/** Fiação do truco no servidor: entrada, comandos por `game:action`, pote da dupla. */
const FAST: Partial<Timings> = {
  trickPauseMs: 2,
  roundSummaryMs: 2,
  betweenHandsMs: 2,
  turnTimeoutMs: 100_000,
  botDelayMs: 2,
  reconnectGraceMs: 500,
  hostGraceMs: 50,
  emptyRoomTtlMs: 60,
  sweepIntervalMs: 100_000,
};

const servers: ReturnType<typeof createApp>[] = [];
const clients: BotClient[] = [];

async function boot(): Promise<string> {
  const server = createApp({ timings: FAST, clientDist: '/nonexistent' });
  servers.push(server);
  return `http://localhost:${await server.listen(0)}`;
}

afterEach(async () => {
  for (const c of clients) c.close();
  clients.length = 0;
  for (const s of servers) await s.close();
  servers.length = 0;
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function truco(view: RoomView | null | undefined) {
  if (!view || !isTrucoRoom(view)) throw new Error('expected a truco room');
  return view;
}

async function trucoRoom(url: string, names: string[], entry = 250) {
  const players = names.map((n) => {
    const c = new BotClient(url, n);
    clients.push(c);
    return c;
  });
  for (const p of players) await p.hello();
  await players[0]!.create({ gameType: 'truco', settings: { entry } });
  for (const p of players.slice(1)) expect((await p.join(players[0]!.view!.code)).ok).toBe(true);
  await players[0]!.waitFor((v) => v.members.length === names.length);
  return players;
}

describe('truco rooms', () => {
  it('2x2 com dinheiro: a dupla vencedora divide o pote', async () => {
    const url = await boot();
    const players = await trucoRoom(url, ['Ana', 'Bia', 'Caio', 'Duda']);
    expect((await players[0]!.start()).ok).toBe(true);
    await players[0]!.waitFor((v) => v.status === 'playing');

    let rng = 1;
    for (let i = 0; i < 20_000 && players[0]!.view!.status !== 'finished'; i++) {
      const actorId = truco(players[0]!.view).game?.actorId;
      const who = actorId ? players.find((p) => p.view?.youId === actorId) : undefined;
      const game = who ? truco(who.view).game : null;
      if (!who || !game || game.actorId !== who.view!.youId) {
        await sleep(1);
        continue;
      }
      const step = chooseTrucoAction(game, who.view!.youId, rng);
      rng = step.rng;
      const a = step.action;
      const r = a.type === 'play' ? await who.play(a.cardId) : await who.action(a.type);
      if (!r.ok && r.error !== 'NOT_YOUR_TURN' && r.error !== 'WRONG_PHASE') throw new Error(`${a.type}: ${r.error}`);
    }
    const final = truco(await players[0]!.waitFor((v) => v.status === 'finished' && v.money.settled));
    const winnerTeam = final.game!.winnerTeam!;
    await sleep(30);
    final.game!.seats.forEach((seat, i) => {
      const expected = seat.team === winnerTeam ? STARTING_BALANCE + 250 : STARTING_BALANCE - 250;
      expect(players[i]!.profile!.balance).toBe(expected);
    });
  }, 30_000);

  it('não começa com 3 jogadores e não cobra ninguém', async () => {
    const url = await boot();
    const players = await trucoRoom(url, ['Ana', 'Bia', 'Caio']);
    const r = await players[0]!.start();
    expect(r).toEqual({ ok: false, error: 'INVALID_PLAYER_COUNT' });
    await sleep(20);
    for (const p of players) expect(p.profile!.balance).toBe(STARTING_BALANCE);
    expect(players[0]!.view!.status).toBe('lobby');
  });

  it('comandos desconhecidos viram INVALID_PAYLOAD', async () => {
    const url = await boot();
    const players = await trucoRoom(url, ['Ana', 'Bia']);
    await players[0]!.start();
    await players[0]!.waitFor((v) => v.status === 'playing');
    expect(await players[0]!.action('fold')).toEqual({ ok: false, error: 'INVALID_PAYLOAD' });
  });
});

describe('truco no ranking', () => {
  it('conta jogos e vitórias de truco separados do Dane-se e do poker', () => {
    const store = new MemoryWalletStore();
    const social = new SocialService(store);
    social.record([
      { profileId: 'a', gameType: 'truco', won: true, profit: 250 },
      { profileId: 'b', gameType: 'truco', won: false, profit: -250 },
    ]);
    expect(store.getStats('a')).toMatchObject({ trucoGames: 1, trucoWins: 1, daneseGames: 0, pokerGames: 0 });
    expect(store.getStats('b')).toMatchObject({ trucoGames: 1, trucoWins: 0 });
  });
});
