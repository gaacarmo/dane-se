import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FriendInvite, SocialView } from '@dane-se/shared';
import { BotClient } from '../scripts/botClient.js';
import { createApp } from '../src/app.js';
import { FileWalletStore } from '../src/hub/fileStore.js';
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

async function boot(): Promise<string> {
  const server = createApp({ timings: FAST, clientDist: '/nonexistent' });
  servers.push(server);
  return `http://localhost:${await server.listen(0)}`;
}

/** A connected client that keeps the latest social state and the invites it got. */
async function player(url: string, name: string) {
  const c = new BotClient(url, name);
  clients.push(c);
  const state: { social: SocialView | null; invites: FriendInvite[] } = { social: null, invites: [] };
  c.socket.on('social:state', (s) => (state.social = s));
  c.socket.on('friend:invite', (i) => state.invites.push(i));
  await c.hello();
  await sleep(30);
  const raw = c.socket as unknown as { emit: (...args: unknown[]) => void };
  const emit = <T>(event: string, payload?: object) =>
    new Promise<T>((resolve) => (payload ? raw.emit(event, payload, resolve) : raw.emit(event, resolve)));
  return { c, state, emit };
}

afterEach(async () => {
  for (const c of clients) c.close();
  clients.length = 0;
  for (const s of servers) await s.close();
  servers.length = 0;
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('friends', () => {
  it('adds a friend by code, after they accept; shows who is online', async () => {
    const url = await boot();
    const ana = await player(url, 'Ana');
    const bia = await player(url, 'Bia');
    const biaCode = bia.state.social!.friendCode;
    expect(biaCode).toMatch(/^[A-Z2-9]{6}$/);

    expect(await ana.emit('friend:add', { code: biaCode.toLowerCase() })).toEqual({ ok: true });
    await sleep(30);
    expect(ana.state.social!.outgoing).toEqual([{ id: expect.any(String), nickname: 'Bia' }]);
    expect(bia.state.social!.incoming).toEqual([{ id: expect.any(String), nickname: 'Ana' }]);
    expect(ana.state.social!.friends).toEqual([]);

    const anaId = bia.state.social!.incoming[0]!.id;
    expect(await bia.emit('friend:respond', { id: anaId, accept: true })).toEqual({ ok: true });
    await sleep(30);
    expect(ana.state.social!.friends).toEqual([expect.objectContaining({ nickname: 'Bia', online: true, inRoom: false })]);
    expect(bia.state.social!.friends).toEqual([expect.objectContaining({ nickname: 'Ana', online: true })]);

    bia.c.close();
    await sleep(60);
    expect(ana.state.social!.friends[0]!.online).toBe(false);
  });

  it('asking someone who already asked you makes you friends at once; rejects bad codes', async () => {
    const url = await boot();
    const ana = await player(url, 'Ana');
    const bia = await player(url, 'Bia');
    expect(await ana.emit('friend:add', { code: 'ZZZZZZ' })).toEqual({ ok: false, error: 'FRIEND_NOT_FOUND' });
    expect(await ana.emit('friend:add', { code: ana.state.social!.friendCode })).toEqual({ ok: false, error: 'FRIEND_SELF' });

    await ana.emit('friend:add', { code: bia.state.social!.friendCode });
    await bia.emit('friend:add', { code: ana.state.social!.friendCode });
    await sleep(30);
    expect(ana.state.social!.friends.map((f) => f.nickname)).toEqual(['Bia']);
    expect(await ana.emit('friend:add', { code: bia.state.social!.friendCode })).toEqual({ ok: false, error: 'ALREADY_FRIENDS' });

    const biaId = ana.state.social!.friends[0]!.id;
    expect(await ana.emit('friend:remove', { id: biaId })).toEqual({ ok: true });
    await sleep(30);
    expect(bia.state.social!.friends).toEqual([]);
  });

  it('invites an online friend to your table, and only friends', async () => {
    const url = await boot();
    const ana = await player(url, 'Ana');
    const bia = await player(url, 'Bia');
    const caio = await player(url, 'Caio');
    await ana.emit('friend:add', { code: bia.state.social!.friendCode });
    await sleep(30);
    await bia.emit('friend:respond', { id: bia.state.social!.incoming[0]!.id, accept: true });
    await sleep(30);
    const biaId = ana.state.social!.friends[0]!.id;
    const caioId = caio.c.profile!.id;

    expect(await ana.emit('friend:invite', { id: biaId })).toEqual({ ok: false, error: 'NOT_IN_ROOM' });
    const { code } = await ana.c.create({ settings: { entry: 100 } });
    expect(await ana.emit('friend:invite', { id: caioId })).toEqual({ ok: false, error: 'NOT_FRIENDS' });
    expect(await ana.emit('friend:invite', { id: biaId })).toEqual({ ok: true });
    expect(await ana.emit('friend:invite', { id: biaId })).toEqual({ ok: false, error: 'TOO_FAST' });
    await sleep(30);
    expect(bia.state.invites).toEqual([expect.objectContaining({ fromName: 'Ana', code, gameType: 'danese' })]);
    expect(caio.state.invites).toEqual([]);
    expect(bia.state.social!.friends[0]!.inRoom).toBe(true);
  });
});

describe('ranking', () => {
  it('counts money games between friends: Dane-se wins', async () => {
    const url = await boot();
    const ana = await player(url, 'Ana');
    const bia = await player(url, 'Bia');
    await ana.emit('friend:add', { code: bia.state.social!.friendCode });
    await sleep(30);
    await bia.emit('friend:respond', { id: bia.state.social!.incoming[0]!.id, accept: true });

    const { code } = await ana.c.create({ settings: { entry: 100 } });
    expect((await bia.c.join(code)).ok).toBe(true);
    await ana.c.waitFor((v) => v.members.length === 2);
    ana.c.enableAutoPlay();
    bia.c.enableAutoPlay();
    expect((await ana.c.start()).ok).toBe(true);
    await ana.c.waitFor((v) => v.status === 'finished', 20_000);
    await sleep(60);

    const rows = ana.state.social!.ranking;
    expect(rows.map((r) => r.nickname).sort()).toEqual(['Ana', 'Bia']);
    expect(rows.every((r) => r.daneseGames === 1)).toBe(true);
    expect(rows.reduce((sum, r) => sum + r.daneseWins, 0)).toBe(1);
    expect(rows.find((r) => r.isYou)?.nickname).toBe('Ana');
  });
});

describe('persistence', () => {
  it('keeps friendships and stats in the saved snapshot', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'dane-se-'));
    const file = path.join(dir, 'hub.json');
    try {
      const store = await FileWalletStore.open(file);
      store.saveProfile({ id: 'a', token: 't1', nickname: 'Ana', createdAt: 1, friendCode: 'AAAAAA' });
      store.saveFriendship({ a: 'a', b: 'b', requestedBy: 'a', status: 'accepted', at: 2 });
      store.setStats('a', { daneseGames: 3, daneseWins: 2, pokerGames: 1, pokerProfit: -50 });
      await store.close();

      const reopened = await FileWalletStore.open(file);
      expect(reopened.findProfileByFriendCode('AAAAAA')?.nickname).toBe('Ana');
      expect(reopened.friendships('b')).toEqual([{ a: 'a', b: 'b', requestedBy: 'a', status: 'accepted', at: 2 }]);
      expect(reopened.getStats('a')).toEqual({ daneseGames: 3, daneseWins: 2, pokerGames: 1, pokerProfit: -50 });
      expect(reopened.getStats('nobody')).toEqual({ daneseGames: 0, daneseWins: 0, pokerGames: 0, pokerProfit: 0 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
