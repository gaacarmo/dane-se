/**
 * Plays full games over real sockets with bot clients and checks that no
 * client ever receives hidden information.
 *
 *   npm run simulate -w server -- --players 5 --games 3 --disconnect --verbose
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { Card, RoomView } from '@dane-se/shared';
import { createApp } from '../src/app.js';
import { BotClient } from './botClient.js';

const SUIT_SYMBOL = { D: '♦', S: '♠', H: '♥', C: '♣' } as const;
const show = (c: Card) => `${c.rank}${SUIT_SYMBOL[c.suit]}`;

/** Throws if a view contains anything this player shouldn't know. */
export function auditView(view: RoomView): void {
  const g = view.game;
  if (!g) return;
  const me = g.players.find((p) => p.id === view.youId);
  if (g.blindRound) {
    if (g.hand.length > 0) throw new Error(`${view.youId} can see their own card in the blind round`);
    if (me?.foreheadCard) throw new Error(`${view.youId} received their own forehead card`);
  } else {
    if (g.players.some((p) => p.foreheadCard)) throw new Error('forehead card sent outside the blind round');
    if (me && !me.eliminated && g.hand.length !== me.cardCount) throw new Error('hand size mismatch');
  }
  if (g.isSpectator && g.hand.length > 0) throw new Error('spectator received a hand');
}

export async function simulateGame(opts: {
  url: string;
  players: number;
  disconnect?: boolean;
  log?: (line: string) => void;
}): Promise<{ winner: string; rounds: number; views: number }> {
  const log = opts.log ?? (() => {});
  const clients = Array.from({ length: opts.players }, (_, i) => new BotClient(opts.url, `Bot${i + 1}`));
  const [host] = clients as [BotClient];
  const { code } = await host.create();
  for (const c of clients.slice(1)) {
    const r = await c.join(code);
    if (!r.ok) throw new Error(`join failed: ${r.error}`);
  }
  const started = await host.start();
  if (!started.ok) throw new Error(`start failed: ${started.error}`);
  for (const c of clients) c.enableAutoPlay();

  // Log each round summary as the host sees it.
  let lastLogged = 0;
  host.socket.on('room:state', (view) => {
    const g = view.game;
    const r = g?.lastRound;
    if (!g || !r || r.roundNumber === lastLogged) return;
    lastLogged = r.roundNumber;
    const name = (id: string) => g.players.find((p) => p.id === id)?.name ?? id;
    const parts = r.results.map(
      (x) => `${name(x.playerId)} ${x.tricksWon}/${x.bet}${x.gainedLetter ? ' +letra' : ''}${x.eliminated ? ' ELIMINADO' : ''}`,
    );
    const flags = [r.dealerTiePenalty && 'empate geral: Pé leva letra', r.voided && 'todos cairiam: rodada anulada']
      .filter(Boolean)
      .join(', ');
    log(`Rodada ${r.roundNumber} (${r.cardsPerPlayer} carta${r.cardsPerPlayer > 1 ? 's' : ''}, vira ${show(r.vira)}, Pé ${name(r.dealerId)}): ${parts.join(' | ')}${flags ? ` [${flags}]` : ''}`);
  });

  let rejoined: BotClient | null = null;
  if (opts.disconnect) {
    const dropper = clients[1]!;
    const token = dropper.session!.token;
    await host.waitFor((v) => (v.game?.roundNumber ?? 0) >= 3, 30_000);
    log(`>> ${dropper.name} caiu`);
    dropper.close();
    await host.waitFor((v) => v.members.some((m) => m.name === dropper.name && m.autoPlay) || v.status === 'finished', 30_000);
    log(`>> bot assumiu o lugar de ${dropper.name}`);
    await host.waitFor((v) => (v.game?.roundNumber ?? 0) >= 6 || v.status === 'finished', 30_000);
    rejoined = new BotClient(opts.url, dropper.name);
    const r = await rejoined.resume(code, token);
    if (!r.ok) throw new Error(`resume failed: ${r.error}`);
    rejoined.enableAutoPlay();
    log(`>> ${dropper.name} voltou para o mesmo lugar`);
  }

  const final = await host.waitFor((v) => v.status === 'finished', 120_000);
  const all = [...clients, ...(rejoined ? [rejoined] : [])];
  let views = 0;
  for (const c of all) {
    for (const v of c.views) auditView(v);
    views += c.views.length;
    c.close();
  }

  const g = final.game!;
  const winner = g.players.find((p) => p.id === g.winnerId)?.name ?? '(ninguém)';
  return { winner, rounds: g.roundNumber, views };
}

async function main() {
  const { values } = parseArgs({
    options: {
      players: { type: 'string', default: '4' },
      games: { type: 'string', default: '1' },
      disconnect: { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
    },
  });
  const players = Number(values.players);
  const games = Number(values.games);

  const server = createApp({
    timings: { trickPauseMs: 2, roundSummaryMs: 2, botDelayMs: 2, reconnectGraceMs: 100, hostGraceMs: 100 },
  });
  const port = await server.listen(0);
  const url = `http://localhost:${port}`;

  try {
    for (let i = 1; i <= games; i++) {
      const start = Date.now();
      const result = await simulateGame({
        url,
        players,
        disconnect: values.disconnect,
        log: values.verbose || games === 1 ? (line) => console.log(`  ${line}`) : undefined,
      });
      console.log(
        `Jogo ${i}: ${players} jogadores, ${result.rounds} rodadas, vencedor ${result.winner} ` +
          `(${result.views} estados auditados, ${Date.now() - start}ms)`,
      );
    }
    console.log('OK: nenhuma informação oculta vazou.');
  } finally {
    await server.close();
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
