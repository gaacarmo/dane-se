import { afterEach, describe, expect, it } from 'vitest';
import { STARTING_BALANCE } from '@dane-se/shared';
import { BotClient } from '../scripts/botClient.js';
import { createApp } from '../src/app.js';
import type { Timings } from '../src/rooms.js';

const FAST: Partial<Timings> = {
  trickPauseMs: 5,
  roundSummaryMs: 5,
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

describe('wallet', () => {
  it('starts a new profile with the starting balance', async () => {
    const url = await boot();
    const ana = client(url, 'Ana');
    const profile = await ana.hello();
    expect(profile.balance).toBe(STARTING_BALANCE);
    expect(profile.nickname).toBe('Ana');
  });

  it('refuses to seat a player who cannot afford the entry', async () => {
    const url = await boot();
    const host = client(url, 'Ana');
    const guest = client(url, 'Bia');
    await host.hello();
    await guest.hello();
    await host.create({ settings: { entry: STARTING_BALANCE + 1 } });
    expect(await guest.join(host.view!.code)).toEqual({ ok: false, error: 'INSUFFICIENT_BALANCE' });
  });

  it('only lets a profile be in one room at a time', async () => {
    const url = await boot();
    const host = client(url, 'Ana');
    await host.hello();
    await host.create({ settings: { entry: 100 } });
    await expect(host.create({ settings: { entry: 100 } })).rejects.toThrow('ALREADY_IN_ROOM');
  });
});

describe('money rooms', () => {
  it('charges the pot at the start and pays the winner (money is conserved)', async () => {
    const url = await boot();
    const host = client(url, 'Ana');
    const guest = client(url, 'Bia');
    await host.hello();
    await guest.hello();
    await host.create({ settings: { entry: 100 } });
    expect((await guest.join(host.view!.code)).ok).toBe(true);
    await host.waitFor((v) => v.members.length === 2);
    expect(host.view!.money.pot).toBe(0);

    host.enableAutoPlay();
    guest.enableAutoPlay();
    expect((await host.start()).ok).toBe(true);
    await host.waitFor((v) => v.status === 'finished', 20_000);
    await sleep(30);

    const balances = [host.profile!.balance, guest.profile!.balance].sort((a, b) => a - b);
    expect(balances[0]).toBe(STARTING_BALANCE - 100);
    expect(balances[1]).toBe(STARTING_BALANCE + 100);
    expect(host.profile!.balance + guest.profile!.balance).toBe(2 * STARTING_BALANCE);
    expect(host.view!.money.settled).toBe(true);
    expect(host.view!.results?.[0]?.amount).toBe(200);
  });

  it('a room with a bot is \"treino\": nobody pays and the pot stays zero', async () => {
    const url = await boot();
    const host = client(url, 'Ana');
    await host.hello();
    await host.create({ settings: { entry: 100 } });
    expect((await host.addBot()).ok).toBe(true);
    expect(host.view!.money.practice).toBe(true);

    host.enableAutoPlay();
    expect((await host.start()).ok).toBe(true);
    await host.waitFor((v) => v.status === 'finished', 20_000);
    await sleep(30);
    expect(host.profile!.balance).toBe(STARTING_BALANCE);
    expect(host.view!.money.pot).toBe(0);
  });

  it('refunds the entries when the room empties before the game ends', async () => {
    const url = await boot({ ...FAST, botDelayMs: 200, trickPauseMs: 200, roundSummaryMs: 200 });
    const host = client(url, 'Ana');
    const guest = client(url, 'Bia');
    await host.hello();
    await guest.hello();
    await host.create({ settings: { entry: 100 } });
    await guest.join(host.view!.code);
    await host.waitFor((v) => v.members.length === 2);

    expect((await host.start()).ok).toBe(true);
    await host.waitFor((v) => v.status === 'playing');
    // Both drop right away: the room is empty, so it closes and refunds.
    await host.leave();
    await guest.leave();
    await sleep(200);

    // The refund is credited even though the room (and their sockets) are gone,
    // so re-fetch the balances from the wallet.
    expect((await host.hello()).balance).toBe(STARTING_BALANCE);
    expect((await guest.hello()).balance).toBe(STARTING_BALANCE);
  });

  it('charges nothing when someone leaves the lobby before the start', async () => {
    const url = await boot();
    const host = client(url, 'Ana');
    const guest = client(url, 'Bia');
    await host.hello();
    await guest.hello();
    await host.create({ settings: { entry: 100 } });
    await guest.join(host.view!.code);
    await guest.leave();
    await sleep(20);
    expect(host.profile!.balance).toBe(STARTING_BALANCE);
    expect(guest.profile!.balance).toBe(STARTING_BALANCE);
  });
});
