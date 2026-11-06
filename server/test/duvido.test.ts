import { afterEach, describe, expect, it } from 'vitest';
import { STARTING_BALANCE, chooseDuvidoAction, isDuvidoRoom, type RoomView } from '@dane-se/shared';
import { BotClient } from '../scripts/botClient.js';
import { createApp } from '../src/app.js';
import type { Timings } from '../src/rooms.js';

/** Fiação do Duvido no servidor: entrada, jogadas por `game:action`, pote no fim. */
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

afterEach(async () => {
  for (const c of clients) c.close();
  clients.length = 0;
  for (const s of servers) await s.close();
  servers.length = 0;
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function duvido(view: RoomView | null | undefined) {
  if (!view || !isDuvidoRoom(view)) throw new Error('expected a duvido room');
  return view;
}

async function duvidoRoom(names: string[], entry = 200) {
  const server = createApp({ timings: FAST, clientDist: '/nonexistent' });
  servers.push(server);
  const url = `http://localhost:${await server.listen(0)}`;
  const players = names.map((n) => {
    const c = new BotClient(url, n);
    clients.push(c);
    return c;
  });
  for (const p of players) await p.hello();
  await players[0]!.create({ gameType: 'duvido', settings: { entry } });
  for (const p of players.slice(1)) expect((await p.join(players[0]!.view!.code)).ok).toBe(true);
  await players[0]!.waitFor((v) => v.members.length === names.length);
  return players;
}

describe('duvido rooms', () => {
  it('partida com dinheiro: o último que sobra leva o pote', async () => {
    const players = await duvidoRoom(['Ana', 'Bia', 'Caio']);
    expect((await players[0]!.start()).ok).toBe(true);
    await players[0]!.waitFor((v) => v.status === 'playing');

    let rng = 5;
    for (let i = 0; i < 20_000 && players[0]!.view!.status !== 'finished'; i++) {
      const actorId = duvido(players[0]!.view).game?.actorId;
      const who = actorId ? players.find((p) => p.view?.youId === actorId) : undefined;
      const game = who ? duvido(who.view).game : null;
      if (!who || !game || game.actorId !== who.view!.youId) {
        await sleep(1);
        continue;
      }
      const step = chooseDuvidoAction(game, who.view!.youId, rng);
      rng = step.rng;
      const a = step.action;
      const r = a.type === 'play' ? await who.playCards(a.cardIds) : await who.action('doubt');
      if (!r.ok && r.error !== 'NOT_YOUR_TURN' && r.error !== 'WRONG_PHASE') throw new Error(`${a.type}: ${r.error}`);
    }
    const final = duvido(await players[0]!.waitFor((v) => v.status === 'finished' && v.money.settled));
    const winnerId = final.game!.winnerId!;
    await sleep(30);
    final.members.forEach((m, i) => {
      // 3 jogadores: o vencedor leva tudo (600), os outros perdem a entrada.
      expect(players[i]!.profile!.balance).toBe(m.id === winnerId ? STARTING_BALANCE + 400 : STARTING_BALANCE - 200);
    });
  }, 30_000);

  it('jogada malformada vira INVALID_PAYLOAD e fora da vez é recusada', async () => {
    const players = await duvidoRoom(['Ana', 'Bia']);
    await players[0]!.start();
    const view = duvido(await players[0]!.waitFor((v) => v.status === 'playing' && !!v.game));
    const actor = players.find((p) => p.view!.youId === view.game!.actorId)!;
    const other = players.find((p) => p !== actor)!;
    expect(await actor.playCards([])).toEqual({ ok: false, error: 'INVALID_PAYLOAD' });
    const card = duvido(other.view).game!.hand[0]!;
    expect(await other.playCards([`${card.rank}${card.suit}`])).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
  });
});
