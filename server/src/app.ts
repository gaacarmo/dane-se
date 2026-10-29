import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import type { Ack, AckFn } from '@dane-se/shared';
import { CsRoomManager, type CsOptions } from './cs/csRooms.js';
import { MemoryWalletStore } from './hub/memoryStore.js';
import { SocialService } from './hub/socialService.js';
import type { WalletStore } from './hub/store.js';
import { WalletService } from './hub/walletService.js';
import { DEFAULT_TIMINGS, type GameSocket, type IO, RoomManager, type Timings } from './rooms.js';

const DEFAULT_CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

export interface AppOptions {
  timings?: Partial<Timings>;
  /** Built client to serve as static files (defaults to client/dist when it exists). */
  clientDist?: string;
  /**
   * Where profiles/wallets live. Defaults to an in-memory store (tests,
   * simulations); production passes a `FileWalletStore` (see index.ts).
   */
  walletStore?: WalletStore;
  /** Ajustes das salas do modo CS (testes). */
  cs?: CsOptions;
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const httpServer = createServer(app);
  const io: IO = new Server(httpServer, { pingInterval: 10_000, pingTimeout: 8_000 });
  const store = options.walletStore ?? new MemoryWalletStore();
  const wallets = new WalletService(store);
  const social = new SocialService(store);
  const rooms = new RoomManager(io, wallets, { ...DEFAULT_TIMINGS, ...options.timings }, social);
  const cs = new CsRoomManager(io, rooms, options.cs);

  app.get('/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.roomCount, csRooms: cs.roomCount, uptime: Math.round(process.uptime()) });
  });

  const clientDist = options.clientDist ?? DEFAULT_CLIENT_DIST;
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    // SPA fallback so shared links like /sala/ABCD load the app.
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  io.on('connection', (socket: GameSocket) => registerHandlers(socket, rooms, cs));

  return {
    app,
    httpServer,
    io,
    rooms,
    cs,
    listen(port: number): Promise<number> {
      return new Promise((resolve) => {
        httpServer.listen(port, () => resolve((httpServer.address() as AddressInfo).port));
      });
    },
    async close(): Promise<void> {
      cs.dispose();
      rooms.dispose();
      await io.close();
    },
  };
}

/**
 * Payloads come from untrusted clients: acks may be missing and payloads may be
 * any shape, so every handler goes through `handle`, and RoomManager validates
 * the values themselves.
 */
function registerHandlers(socket: GameSocket, rooms: RoomManager, cs: CsRoomManager): void {
  const handle =
    <P>(run: (payload: P) => Ack<object>) =>
    (payload: unknown, maybeAck?: unknown) => {
      // Handlers without a payload receive the ack as their first argument.
      const ack = (typeof maybeAck === 'function' ? maybeAck : typeof payload === 'function' ? payload : null) as AckFn<object> | null;
      const body = (typeof payload === 'object' && payload !== null ? payload : {}) as P;
      let result: Ack<object>;
      try {
        result = run(body);
      } catch (err) {
        console.error('handler error', err);
        result = { ok: false, error: 'INVALID_PAYLOAD' };
      }
      ack?.(result);
    };

  type Body = Record<string, unknown>;
  socket.on('profile:hello', handle<Body>((p) => rooms.recommendHello(socket, p.token, p.nickname)));
  socket.on('profile:rename', handle<Body>((p) => rooms.renameProfile(socket, p.nickname)));
  socket.on('profile:refill', handle(() => rooms.refill(socket)));
  socket.on('friend:add', handle<Body>((p) => rooms.addFriend(socket, p.code)));
  socket.on('friend:respond', handle<Body>((p) => rooms.respondFriend(socket, p.id, p.accept)));
  socket.on('friend:remove', handle<Body>((p) => rooms.removeFriend(socket, p.id)));
  socket.on('friend:invite', handle<Body>((p) => (cs.owns(socket) ? cs.inviteFriend(socket, p.id) : rooms.inviteFriend(socket, p.id))));
  socket.on('room:create', handle<Body>((p) => rooms.create(socket, p)));
  socket.on('room:join', handle<Body>((p) => rooms.join(socket, p.code, p.name)));
  socket.on('room:resume', handle<Body>((p) => rooms.resume(socket, p.code, p.token)));
  socket.on('room:leave', handle(() => rooms.leave(socket)));
  socket.on('room:settings', handle<Body>((p) => rooms.updateSettings(socket, p)));
  socket.on('room:arcade', handle<Body>((p) => rooms.setArcade(socket, p.arcade)));
  socket.on('room:talent', handle<Body>((p) => rooms.setTalents(socket, p.talents)));
  socket.on('room:start', handle(() => rooms.start(socket)));
  socket.on('room:character', handle<Body>((p) => rooms.setCharacter(socket, p.character)));
  socket.on('chat:send', handle<Body>((p) => rooms.chat(socket, p.text)));
  socket.on('room:kick', handle<Body>((p) => rooms.kick(socket, p.playerId)));
  socket.on('room:addBot', handle(() => rooms.addBot(socket)));
  socket.on('room:skipWaiting', handle(() => rooms.skipWaiting(socket)));
  socket.on('room:rematch', handle(() => rooms.rematch(socket)));
  socket.on('room:react', handle<Body>((p) => rooms.react(socket, p.emoji)));
  socket.on('game:bet', handle<Body>((p) => rooms.bet(socket, p.bet)));
  socket.on('game:play', handle<Body>((p) => rooms.play(socket, p.cardId)));
  socket.on('game:action', handle<Body>((p) => rooms.action(socket, p)));
  socket.on('look:update', (p) => rooms.look(socket, p));
  socket.on('voice:join', handle(() => (cs.owns(socket) ? cs.voiceJoin(socket) : rooms.voiceJoin(socket))));
  socket.on('voice:leave', handle(() => (cs.owns(socket) ? cs.voiceLeave(socket) : rooms.voiceLeave(socket))));
  socket.on('voice:signal', (p) => (cs.owns(socket) ? cs.voiceSignal(socket, p) : rooms.voiceSignal(socket, p)));
  socket.on('cs:create', handle<Body>((p) => cs.create(socket, p)));
  socket.on('cs:join', handle<Body>((p) => cs.join(socket, p.code, p.name)));
  socket.on('cs:resume', handle<Body>((p) => cs.resume(socket, p.code, p.token)));
  socket.on('cs:leave', handle(() => cs.leave(socket)));
  socket.on('cs:team', handle<Body>((p) => cs.setTeam(socket, p.team)));
  socket.on('cs:difficulty', handle<Body>((p) => cs.setDifficulty(socket, p.difficulty)));
  socket.on('cs:character', handle<Body>((p) => cs.setCharacter(socket, p.character)));
  socket.on('cs:kick', handle<Body>((p) => cs.kick(socket, p.playerId)));
  socket.on('cs:start', handle(() => cs.start(socket)));
  socket.on('cs:rematch', handle(() => cs.rematch(socket)));
  socket.on('cs:input', (p) => cs.input(socket, p));
  socket.on('cs:buy', handle<Body>((p) => cs.buy(socket, p.weapon)));
  socket.on('cs:ping', (p) => cs.ping(socket, p));
  socket.on('cs:forfeit', handle(() => cs.forfeit(socket)));
  socket.on('disconnect', () => {
    rooms.disconnect(socket);
    cs.disconnect(socket);
  });
}
