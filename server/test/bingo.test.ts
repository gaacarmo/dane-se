import { afterEach, describe, expect, it } from 'vitest';
import { STARTING_BALANCE, isBingoRoom, type RoomView } from '@dane-se/shared';
import { BotClient } from '../scripts/botClient.js';
import { createApp } from '../src/app.js';
import type { Timings } from '../src/rooms.js';

/** Fiação do Bingo no servidor: sorteio por tempo, "Linha!"/"Bingo!" por game:action e o pote 70/30. */
const FAST: Partial<Timings> = {
  ballDrawMs: 3,
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

function bingo(view: RoomView | null | undefined) {
  if (!view || !isBingoRoom(view)) throw new Error('expected a bingo room');
  return view;
}

async function bingoRoom(names: string[], entry = 500) {
  const server = createApp({ timings: FAST, clientDist: '/nonexistent' });
  servers.push(server);
  const url = `http://localhost:${await server.listen(0)}`;
  const players = names.map((n) => {
    const c = new BotClient(url, n);
    clients.push(c);
    return c;
  });
  for (const p of players) await p.hello();
  await players[0]!.create({ gameType: 'bingo', settings: { entry } });
  for (const p of players.slice(1)) expect((await p.join(players[0]!.view!.code)).ok).toBe(true);
  await players[0]!.waitFor((v) => v.members.length === names.length);
  return players;
}

describe('bingo rooms', () => {
  it('humanos cantam Linha e Bingo; o pote vai 30% e 70%', async () => {
    const players = await bingoRoom(['Ana', 'Bia']);
    expect((await players[0]!.start()).ok).toBe(true);

    // Cada um canta assim que a própria cartela permitir.
    const claimer = (p: BotClient) =>
      p.socket.on('room:state', (view: RoomView) => {
        const g = isBingoRoom(view) ? view.game : null;
        if (!g || view.status !== 'playing') return;
        if (g.legal.canClaimBingo) void p.claim('bingo');
        else if (g.legal.canClaimLine) void p.claim('line');
      });
    players.forEach(claimer);

    const final = bingo(await players[0]!.waitFor((v) => v.status === 'finished' && v.money.settled, 20_000));
    const g = final.game!;
    expect(g.bingoWinnerId).not.toBeNull();
    expect(g.lineWinnerId).not.toBeNull();
    await new Promise((r) => setTimeout(r, 30));
    final.members.forEach((m, i) => {
      const won = (m.id === g.bingoWinnerId ? 700 : 0) + (m.id === g.lineWinnerId ? 300 : 0);
      expect(players[i]!.profile!.balance).toBe(STARTING_BALANCE - 500 + won);
    });
  }, 30_000);

  it('cantar sem ter a cartela é recusado', async () => {
    const players = await bingoRoom(['Ana', 'Bia']);
    await players[0]!.start();
    await players[0]!.waitFor((v) => v.status === 'playing');
    expect(await players[0]!.claim('bingo')).toEqual({ ok: false, error: 'INVALID_ACTION' });
    expect(await players[0]!.action('fold')).toEqual({ ok: false, error: 'INVALID_PAYLOAD' });
  });
});
