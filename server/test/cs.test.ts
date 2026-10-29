import { io, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  IDLE_INPUT,
  type Ack,
  type ClientToServerEvents,
  type CsLobbyView,
  type CsSnapshot,
  type CsStartInfo,
  type PlayerInput,
  type ServerToClientEvents,
  type Session,
} from '@dane-se/shared';
import { createApp } from '../src/app.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Um navegador do modo CS: guarda tudo o que o servidor manda. */
class CsClient {
  readonly socket: ClientSocket;
  lobby: CsLobbyView | null = null;
  started: CsStartInfo | null = null;
  readonly snapshots: CsSnapshot[] = [];
  readonly pings: { from: string; x: number; z: number }[] = [];
  forfeit: { votes: number; needed: number } | null = null;
  closed: string | null = null;
  kicked = false;
  session: Session | null = null;

  constructor(
    url: string,
    readonly name: string,
  ) {
    this.socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    this.socket.on('cs:lobby', (v) => (this.lobby = v));
    this.socket.on('cs:started', (i) => (this.started = i));
    this.socket.on('cs:snapshot', (s) => this.snapshots.push(s));
    this.socket.on('cs:ping', (p) => this.pings.push(p));
    this.socket.on('cs:forfeit', (v) => (this.forfeit = v));
    this.socket.on('cs:closed', (r) => (this.closed = r));
    this.socket.on('room:kicked', () => (this.kicked = true));
  }

  call<T = object>(event: keyof ClientToServerEvents, ...args: unknown[]): Promise<Ack<T>> {
    return new Promise((resolve) => (this.socket.emit as (...a: unknown[]) => void)(event, ...args, resolve));
  }

  async create(): Promise<Ack<Session>> {
    const r = await this.call<Session>('cs:create', { name: this.name });
    if (r.ok) this.session = r;
    return r;
  }

  async join(code: string): Promise<Ack<Session>> {
    const r = await this.call<Session>('cs:join', { code, name: this.name });
    if (r.ok) this.session = r;
    return r;
  }

  input(seq: number, patch: Partial<PlayerInput> = {}, round?: number): void {
    (this.socket.emit as (...a: unknown[]) => void)('cs:input', { seq, input: { ...IDLE_INPUT, ...patch }, round });
  }

  me(): CsLobbyView['members'][number] {
    return this.lobby!.members.find((m) => m.id === this.session!.playerId)!;
  }

  async until<T>(read: () => T | null | undefined | false, timeoutMs = 3000): Promise<T> {
    const start = Date.now();
    for (;;) {
      const value = read();
      if (value) return value;
      if (Date.now() - start > timeoutMs) throw new Error(`${this.name}: timed out waiting`);
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  lastSnapshot(): CsSnapshot | undefined {
    return this.snapshots[this.snapshots.length - 1];
  }

  self(): CsSnapshot['players'][number] | undefined {
    return this.lastSnapshot()?.players.find((p) => p.id === this.session!.playerId);
  }

  close(): void {
    this.socket.close();
  }
}

let server: ReturnType<typeof createApp>;
let url: string;
let clients: CsClient[];

beforeEach(async () => {
  server = createApp({ clientDist: '/nonexistent' });
  url = `http://localhost:${await server.listen(0)}`;
  clients = [];
});

afterEach(async () => {
  for (const c of clients) c.close();
  await server.close();
});

function client(name: string): CsClient {
  const c = new CsClient(url, name);
  clients.push(c);
  return c;
}

async function room(n: number): Promise<{ players: CsClient[]; code: string }> {
  const players = Array.from({ length: n }, (_, i) => client(`P${i + 1}`));
  const created = await players[0]!.create();
  if (!created.ok) throw new Error('create failed');
  for (const p of players.slice(1)) expect((await p.join(created.code)).ok).toBe(true);
  await players[0]!.until(() => players[0]!.lobby?.members.length === n);
  return { players, code: created.code };
}

describe('lobby', () => {
  it('creates a room with a 4 letter code that no Dane-se or poker room uses', async () => {
    const host = client('Host');
    const r = await host.create();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    expect(server.cs.has(r.code)).toBe(true);
    expect(server.rooms.hasCode(r.code)).toBe(false);
    await host.until(() => host.lobby);
    expect(host.lobby).toMatchObject({ status: 'lobby', hostId: r.playerId, teamSize: 3 });
    expect(host.me()).toMatchObject({ team: 'A', isHost: true });
  });

  it('seats the next player in the team with fewer humans, and shows both to everyone', async () => {
    const { players } = await room(2);
    await players[1]!.until(() => players[1]!.lobby?.members.length === 2);
    expect(players[1]!.me().team).toBe('B');
    expect(players[0]!.lobby!.members.map((m) => m.team).sort()).toEqual(['A', 'B']);
  });

  it('lets players switch teams until the team is full', async () => {
    const { players } = await room(4);
    for (const p of players) await p.until(() => p.lobby?.members.length === 4);
    const toA = async (p: CsClient) => p.call('cs:team', { team: 'A' });
    for (const p of players) if (p.me().team === 'B') await toA(p);
    await players[0]!.until(() => players[0]!.lobby!.members.filter((m) => m.team === 'A').length === 3);
    const loser = players.find((p) => p.lobby!.members.find((m) => m.id === p.session!.playerId)!.team === 'B')!;
    expect(await toA(loser)).toEqual({ ok: false, error: 'TEAM_FULL' });
  });

  it('lets only the host change the difficulty and start', async () => {
    const { players } = await room(2);
    const [host, guest] = players as [CsClient, CsClient];
    expect(await guest.call('cs:difficulty', { difficulty: 'hard' })).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(await guest.call('cs:start')).toEqual({ ok: false, error: 'NOT_HOST' });
    expect((await host.call('cs:difficulty', { difficulty: 'hard' })).ok).toBe(true);
    await guest.until(() => guest.lobby?.difficulty === 'hard');
    expect(await host.call('cs:difficulty', { difficulty: 'impossible' })).toMatchObject({ ok: false });
  });

  it('lets the host pick a character and gives it to nobody else', async () => {
    const { players } = await room(2);
    const [host, guest] = players as [CsClient, CsClient];
    expect((await host.call('cs:character', { character: 'sarney' })).ok).toBe(true);
    await guest.until(() => guest.lobby?.members.find((m) => m.isHost)?.character === 'sarney');
    expect(await guest.call('cs:character', { character: 'nobody' })).toMatchObject({ ok: false });
  });

  it('passes the host to someone else when the host leaves, and removes an empty room', async () => {
    const { players, code } = await room(2);
    const [host, guest] = players as [CsClient, CsClient];
    expect((await host.call('cs:leave')).ok).toBe(true);
    await guest.until(() => guest.lobby?.members.length === 1);
    expect(guest.lobby!.hostId).toBe(guest.session!.playerId);
    await guest.call('cs:leave');
    await guest.until(() => !server.cs.has(code));
  });

  it('kicks a player, only by the host', async () => {
    const { players } = await room(2);
    const [host, guest] = players as [CsClient, CsClient];
    expect(await guest.call('cs:kick', { playerId: host.session!.playerId })).toEqual({ ok: false, error: 'NOT_HOST' });
    expect((await host.call('cs:kick', { playerId: guest.session!.playerId })).ok).toBe(true);
    await guest.until(() => guest.kicked);
    await host.until(() => host.lobby?.members.length === 1);
  });

  it('refuses a second room for the same player and an unknown code', async () => {
    const host = client('Host');
    await host.create();
    expect(await host.call('cs:create', { name: 'Host' })).toEqual({ ok: false, error: 'ALREADY_IN_ROOM' });
    expect(await client('Other').join('ZZZZ')).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
  });

  it('keeps the two room kinds apart: room:join does not find a CS code', async () => {
    const host = client('Host');
    const r = await host.create();
    if (!r.ok) throw new Error('create failed');
    const other = client('Other');
    expect(await other.call('room:join', { code: r.code, name: 'Other' })).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
  });

  it('refuses a second player with the same nickname', async () => {
    const host = client('Same');
    const r = await host.create();
    if (!r.ok) throw new Error('create failed');
    const twin = client('Same');
    expect(await twin.join(r.code)).toEqual({ ok: false, error: 'NAME_TAKEN' });
  });
});

describe('match', () => {
  async function started(n = 2): Promise<{ players: CsClient[]; code: string }> {
    const r = await room(n);
    expect((await r.players[0]!.call('cs:start')).ok).toBe(true);
    for (const p of r.players) await p.until(() => p.started && p.snapshots.length > 0);
    return r;
  }

  it('starts the match: everyone gets the roster and a stream of snapshots', async () => {
    const { players } = await started();
    const info = players[0]!.started!;
    expect(info.mapId).toBe('cantina');
    expect(info.roster).toHaveLength(6);
    expect(info.roster.filter((r) => !r.bot)).toHaveLength(2);
    await players[0]!.until(() => players[0]!.snapshots.length > 5);
    expect(players[0]!.lobby!.status).toBe('playing');
    expect(players[0]!.lastSnapshot()!.phase).toBe('buy');
  });

  it('sends the roster without anyone private money, weapons or equipment', async () => {
    const { players } = await started();
    const p = players[0]!;
    await p.call('cs:buy', { item: 'kevlar' });
    await p.until(() => p.self()?.armor === 100);
    for (const client of players) {
      for (const entry of client.started!.roster) {
        expect(entry).toMatchObject({ money: 0, weapon: 'chinelo' });
        expect(entry).not.toHaveProperty('armor');
        expect(entry).not.toHaveProperty('holstered');
      }
    }
  });

  it('refuses to start twice and to join a match in progress', async () => {
    const { players, code } = await started();
    expect(await players[0]!.call('cs:start')).toMatchObject({ ok: false });
    expect(await client('Late').join(code)).toEqual({ ok: false, error: 'GAME_IN_PROGRESS' });
  });

  it('moves a player with the inputs and acknowledges them', async () => {
    const { players, code } = await started();
    server.cs.advance(code, 41_000);
    const p = players[0]!;
    await p.until(() => p.lastSnapshot()?.phase === 'live');
    const before = await p.until(() => p.self());
    let seq = 0;
    const timer = setInterval(() => p.input(++seq, { moveZ: 1, yaw: -Math.PI / 2 }), 16);
    try {
      await p.until(() => (p.self()?.x ?? 0) > before.x + 0.5);
    } finally {
      clearInterval(timer);
    }
    expect(p.lastSnapshot()!.ack).toBeGreaterThan(0);
  });

  it('spawns the player looking at the middle of the map, not north', async () => {
    const { players } = await started(1);
    const p = players[0]!;
    await p.until(() => p.snapshots.length > 5);
    expect(p.self()!.yaw).toBeCloseTo(-Math.PI / 2, 0);
  });

  it('keeps the spawn look in a new round until the client confirms the round', async () => {
    const { players, code } = await started(1);
    const p = players[0]!;
    const roundOf = () => server.cs.match(code)!.roundIndex;
    while (roundOf() === 0) server.cs.advance(code, 10_000);
    await p.until(() => p.lastSnapshot()?.roundIndex === 1);
    const spawnYaw = server.cs.match(code)!.world.players.find((x) => x.id === p.session!.playerId)!.yaw;

    let seq = 0;
    p.input(++seq, { yaw: 1 }, 0);
    await p.until(() => p.lastSnapshot()!.ack >= seq);
    expect(p.self()!.yaw).toBeCloseTo(spawnYaw, 2);

    p.input(++seq, { yaw: 1 }, 1);
    await p.until(() => p.self()?.yaw === 1);
  });

  it('swaps the sides on round 3: the human respawns at the other end, facing the other way', async () => {
    const { players, code } = await started(1);
    const p = players[0]!;
    const me = () => server.cs.match(code)!.world.players.find((x) => x.id === p.session!.playerId)!;
    expect(me().side).toBe('attack');
    while (server.cs.match(code)!.roundIndex < 3) server.cs.advance(code, 10_000);
    await p.until(() => p.lastSnapshot()?.roundIndex === 3);
    expect(me().side).toBe('defense');
    await p.until(() => (p.self()?.x ?? 0) > 60);
    expect(p.self()!.yaw).toBeCloseTo(Math.PI / 2, 0);
  });

  it('stops a player whose client went silent while holding a key', async () => {
    const { players, code } = await started(1);
    const p = players[0]!;
    server.cs.advance(code, 41_000);
    await p.until(() => p.lastSnapshot()?.phase === 'live');
    const start = (await p.until(() => p.self()))!.x;
    p.input(1, { moveZ: 1, yaw: -Math.PI / 2 });
    await p.until(() => p.lastSnapshot()!.ack >= 1);
    server.cs.advance(code, 4000);
    const x = server.cs.match(code)!.world.players.find((q) => q.id === p.session!.playerId)!.body.pos.x;
    expect(x - start).toBeGreaterThan(0.5);
    expect(x - start).toBeLessThan(4);
  });

  it('survives garbage input and keeps ticking', async () => {
    const { players } = await started();
    const p = players[0]!;
    const emit = (...a: unknown[]) => (p.socket.emit as (...x: unknown[]) => void).apply(p.socket, a);
    for (const junk of [null, 5, 'x', {}, { seq: 'a' }, { seq: 1 }, { seq: 1, input: null }, { seq: 1, input: { moveX: NaN } }, { seq: -1, input: IDLE_INPUT }]) {
      emit('cs:input', junk);
    }
    const count = p.snapshots.length;
    await p.until(() => p.snapshots.length > count + 3);
    expect(p.lobby!.status).toBe('playing');
  });

  it('does not send an enemy behind walls', async () => {
    const { players, code } = await started();
    server.cs.advance(code, 41_000);
    const p = players[0]!;
    await p.until(() => p.lastSnapshot()?.phase === 'live' && p.lastSnapshot()!.players.length > 0);
    const ids = new Set(p.lastSnapshot()!.players.map((x) => x.id));
    const roster = p.started!.roster;
    const enemies = roster.filter((r) => r.team !== roster.find((x) => x.id === p.session!.playerId)!.team);
    expect(enemies.some((e) => ids.has(e.id))).toBe(false);
    expect(roster.filter((r) => !enemies.includes(r)).every((r) => ids.has(r.id))).toBe(true);
  });

  it('only lets a player buy in the buy phase, charging the money', async () => {
    const { players, code } = await started();
    const p = players[0]!;
    expect((await p.call('cs:buy', { item: 'tamanco' })).ok).toBe(true);
    await p.until(() => p.self()?.money === 300);
    expect(p.self()!.weapon).toBe('tamanco');
    expect(await p.call('cs:buy', { item: 'nada' })).toMatchObject({ ok: false });
    server.cs.advance(code, 41_000);
    await p.until(() => p.lastSnapshot()?.phase === 'live');
    expect(await p.call('cs:buy', { item: 'garcom' })).toMatchObject({ ok: false });
  });

  it('sells the vest and shows it in the snapshot, refusing what is worn, unaffordable or for the other side', async () => {
    const { players } = await started(1);
    const p = players[0]!;
    expect((await p.call('cs:buy', { item: 'kevlar' })).ok).toBe(true);
    await p.until(() => p.self()?.armor === 100);
    expect(p.self()).toMatchObject({ helmet: false, money: 150 });
    expect(await p.call('cs:buy', { item: 'kevlar' })).toMatchObject({ ok: false });
    expect(await p.call('cs:buy', { item: 'kevlar_helmet' })).toMatchObject({ ok: false });
    expect(await p.call('cs:buy', { item: 'kit' })).toMatchObject({ ok: false });
  });

  it('relays pings to the team only', async () => {
    const { players } = await room(3);
    const [a, b, c] = players as [CsClient, CsClient, CsClient];
    for (const p of players) await p.until(() => p.lobby?.members.length === 3);
    await b.call('cs:team', { team: 'A' });
    await c.call('cs:team', { team: 'B' });
    await a.until(() => a.lobby!.members.filter((m) => m.team === 'A').length === 2);
    await a.call('cs:start');
    for (const p of players) await p.until(() => p.started);
    (a.socket.emit as (...x: unknown[]) => void)('cs:ping', { kind: 'enemy', x: 20, z: 25 });
    await b.until(() => b.pings.length === 1);
    expect(b.pings[0]).toMatchObject({ from: a.session!.playerId, x: 20, z: 25 });
    await new Promise((r) => setTimeout(r, 100));
    expect(c.pings).toHaveLength(0);
    (a.socket.emit as (...x: unknown[]) => void)('cs:ping', { kind: 'enemy', x: NaN, z: 1 });
    await new Promise((r) => setTimeout(r, 100));
    expect(b.pings).toHaveLength(1);
  });

  it('puts a bot in the place of someone who disconnects, and gives control back on resume', async () => {
    const { players, code } = await started();
    const [host, guest] = players as [CsClient, CsClient];
    const id = guest.session!.playerId;
    const token = guest.session!.token;
    guest.close();
    await host.until(() => server.cs.match(code)?.roster.find((r) => r.id === id)?.bot === true);
    const back = client('P2');
    expect((await back.call('cs:resume', { code, token })).ok).toBe(true);
    await host.until(() => server.cs.match(code)?.roster.find((r) => r.id === id)?.bot === false);
    await back.until(() => back.started && back.snapshots.length > 0);
  });

  it('lets a player who comes back with the token move again even though the new socket numbers its inputs from 1', async () => {
    const { players, code } = await started();
    const [host, guest] = players as [CsClient, CsClient];
    const token = guest.session!.token;
    server.cs.advance(code, 41_000);
    await guest.until(() => guest.lastSnapshot()?.phase === 'live');
    for (let seq = 1; seq <= 300; seq++) guest.input(seq, { yaw: -Math.PI / 2 });
    await guest.until(() => guest.lastSnapshot()!.ack >= 300);
    guest.close();
    await host.until(() => server.cs.match(code)?.roster.find((r) => r.id === guest.session!.playerId)?.bot === true);

    const back = client('P2');
    const resumed = await back.call<Session>('cs:resume', { code, token });
    expect(resumed.ok).toBe(true);
    if (resumed.ok) back.session = resumed;
    await back.until(() => back.self());
    const before = back.self()!;
    let seq = 0;
    const timer = setInterval(() => back.input(++seq, { moveZ: 1, yaw: -Math.PI / 2 }), 16);
    try {
      await back.until(() => (back.self()?.x ?? 0) > before.x + 0.5);
    } finally {
      clearInterval(timer);
    }
    expect(back.lastSnapshot()!.ack).toBeGreaterThan(0);
    expect(back.lastSnapshot()!.ack).toBeLessThan(300);
  });

  it('ends the match for the other team when a whole team forfeits', async () => {
    const { players } = await room(3);
    const [a, b, c] = players as [CsClient, CsClient, CsClient];
    for (const p of players) await p.until(() => p.lobby?.members.length === 3);
    await b.call('cs:team', { team: 'A' });
    await c.call('cs:team', { team: 'B' });
    await a.until(() => a.lobby!.members.filter((m) => m.team === 'A').length === 2);
    await a.call('cs:start');
    for (const p of players) await p.until(() => p.started && p.snapshots.length > 0);
    expect(await a.call('cs:forfeit')).toEqual({ ok: true, votes: 1, needed: 2 });
    await b.until(() => b.forfeit?.votes === 1);
    expect(await b.call('cs:forfeit')).toEqual({ ok: true, votes: 2, needed: 2 });
    await c.until(() => c.lastSnapshot()?.winner === 'B');
    expect(c.lastSnapshot()!.forfeitedBy).toBe('A');
    await c.until(() => c.lobby?.status === 'finished');
  });

  it('lets a lone human forfeit with one vote, and the host start a rematch in the lobby', async () => {
    const { players } = await started(1);
    const host = players[0]!;
    expect(await host.call('cs:forfeit')).toEqual({ ok: true, votes: 1, needed: 1 });
    await host.until(() => host.lobby?.status === 'finished');
    expect((await host.call('cs:rematch')).ok).toBe(true);
    await host.until(() => host.lobby?.status === 'lobby');
    expect((await host.call('cs:start')).ok).toBe(true);
    await host.until(() => host.lastSnapshot()?.winner === null && host.lobby?.status === 'playing');
  });
});

describe('friends and voice', () => {
  it('keeps voice inside the team', async () => {
    const { players } = await room(3);
    const [a, b, c] = players as [CsClient, CsClient, CsClient];
    for (const p of players) await p.until(() => p.lobby?.members.length === 3);
    await b.call('cs:team', { team: 'A' });
    await c.call('cs:team', { team: 'B' });
    await a.until(() => a.lobby!.members.filter((m) => m.team === 'A').length === 2);
    const joined: string[] = [];
    c.socket.on('voice:joined', (p) => joined.push(p.playerId));
    const got: string[] = [];
    b.socket.on('voice:joined', (p) => got.push(p.playerId));
    const r = await a.call<{ peers: string[] }>('voice:join');
    expect(r).toEqual({ ok: true, peers: [] });
    await b.until(() => got.length === 1);
    expect(got[0]).toBe(a.session!.playerId);
    await new Promise((res) => setTimeout(res, 100));
    expect(joined).toEqual([]);
    const second = await b.call<{ peers: string[] }>('voice:join');
    expect(second).toEqual({ ok: true, peers: [a.session!.playerId] });
  });
});
