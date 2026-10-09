import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import type { Ack, AckFn } from '@dane-se/shared';
import { MemoryWalletStore } from './hub/memoryStore.js';
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
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const httpServer = createServer(app);
  const io: IO = new Server(httpServer, { pingInterval: 10_000, pingTimeout: 8_000 });
  const wallets = new WalletService(options.walletStore ?? new MemoryWalletStore());
  const rooms = new RoomManager(io, wallets, { ...DEFAULT_TIMINGS, ...options.timings });

  app.get('/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.roomCount, uptime: Math.round(process.uptime()) });
  });

  const clientDist = options.clientDist ?? DEFAULT_CLIENT_DIST;
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    // SPA fallback so shared links like /sala/ABCD load the app.
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  io.on('connection', (socket: GameSocket) => registerHandlers(socket, rooms));

  return {
    app,
    httpServer,
    io,
    rooms,
    listen(port: number): Promise<number> {
      return new Promise((resolve) => {
        httpServer.listen(port, () => resolve((httpServer.address() as AddressInfo).port));
      });
    },
    async close(): Promise<void> {
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
function registerHandlers(socket: GameSocket, rooms: RoomManager): void {
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
  socket.on('room:create', handle<Body>((p) => rooms.create(socket, p)));
  socket.on('room:join', handle<Body>((p) => rooms.join(socket, p.code, p.name)));
  socket.on('room:resume', handle<Body>((p) => rooms.resume(socket, p.code, p.token)));
  socket.on('room:leave', handle(() => rooms.leave(socket)));
  socket.on('room:settings', handle<Body>((p) => rooms.updateSettings(socket, p)));
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
  socket.on('disconnect', () => rooms.disconnect(socket));
}
