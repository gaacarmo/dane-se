import { describe, expect, it } from 'vitest';
import {
  type BingoAction,
  type BingoGameState,
  BINGO_BALLS,
  CENTER,
  FREE,
  applyBingoAction,
  ballLabel,
  bingoModule,
  completedLines,
  createBingoGame,
  getBingoView,
  isFull,
  makeCard,
} from '../../src/index.js';

const people = (n: number, bots: number[] = []) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, ...(bots.includes(i) ? { isBot: true } : {}) }));

function start(n = 3, seed = 9, bots: number[] = []): BingoGameState {
  const r = createBingoGame(people(n, bots), seed, { entry: 100 });
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function apply(s: BingoGameState, a: BingoAction): BingoGameState {
  const r = applyBingoAction(s, a);
  if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
  return r.state;
}

/** Força as próximas bolas a serem estas (o resto continua embaralhado). */
function rig(s: BingoGameState, balls: number[]): BingoGameState {
  return { ...s, pool: [...balls, ...s.pool.filter((b) => !balls.includes(b))] };
}

describe('Bingo: cartela e bolas', () => {
  it('cartela 5×5 com B 1–15, I 16–30, N 31–45, G 46–60, O 61–75 e o centro livre', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { card } = makeCard(seed);
      expect(card).toHaveLength(25);
      expect(card[CENTER]).toBe(FREE);
      for (let i = 0; i < 25; i++) {
        if (i === CENTER) continue;
        const col = i % 5;
        expect(card[i]!).toBeGreaterThanOrEqual(col * 15 + 1);
        expect(card[i]!).toBeLessThanOrEqual(col * 15 + 15);
      }
      expect(new Set(card).size).toBe(25);
    }
    expect(ballLabel(42)).toBe('N 42');
    expect(ballLabel(1)).toBe('B 1');
    expect(ballLabel(75)).toBe('O 75');
  });

  it('sorteia as 75 bolas sem repetir', () => {
    let s = start();
    for (let i = 0; i < BINGO_BALLS; i++) s = apply(s, { type: 'draw' });
    expect(new Set(s.drawn).size).toBe(BINGO_BALLS);
    expect(s.pool).toHaveLength(0);
  });
});

describe('Bingo: Linha e cartela cheia', () => {
  it('Linha só vale com linha completa, e só pra um', () => {
    let s = start(2);
    const row = s.cards.p0!.slice(0, 5);
    expect(applyBingoAction(s, { type: 'claim', playerId: 'p0', prize: 'line' })).toEqual({ ok: false, error: 'INVALID_ACTION' });
    s = rig(s, row);
    for (let i = 0; i < 5; i++) s = apply(s, { type: 'draw' });
    expect(completedLines(s.cards.p0!, new Set(s.drawn)).length).toBeGreaterThan(0);
    expect(getBingoView(s, 'p0').legal.canClaimLine).toBe(true);
    s = apply(s, { type: 'claim', playerId: 'p0', prize: 'line' });
    expect(s.lineWinnerId).toBe('p0');
    expect(getBingoView(s, 'p0').legal.canClaimLine).toBe(false);
  });

  it('a linha do meio usa o centro livre (4 bolas bastam)', () => {
    let s = start(2);
    const middle = s.cards.p0!.slice(10, 15).filter((n) => n !== FREE);
    expect(middle).toHaveLength(4);
    s = rig(s, middle);
    for (let i = 0; i < 4; i++) s = apply(s, { type: 'draw' });
    expect(getBingoView(s, 'p0').legal.canClaimLine).toBe(true);
  });

  it('cartela cheia leva o Bingo e acaba o jogo (e a Linha, se estava em aberto)', () => {
    let s = start(2);
    const all = s.cards.p0!.filter((n) => n !== FREE);
    s = rig(s, all);
    for (let i = 0; i < all.length; i++) s = apply(s, { type: 'draw' });
    expect(isFull(s.cards.p0!, new Set(s.drawn))).toBe(true);
    s = apply(s, { type: 'claim', playerId: 'p0', prize: 'bingo' });
    expect(s.phase).toBe('gameOver');
    expect(s.bingoWinnerId).toBe('p0');
    expect(s.lineWinnerId).toBe('p0');
    expect(applyBingoAction(s, { type: 'draw' }).ok).toBe(false);
  });

  it('bots cantam sozinhos uma bola depois; humanos têm que apertar', () => {
    let s = start(2, 4, [1]);
    const botRow = s.cards.p1!.slice(0, 5);
    s = rig(s, botRow);
    for (let i = 0; i < 5; i++) s = apply(s, { type: 'draw' });
    // A bola que completou acabou de sair: o bot ainda não cantou.
    expect(s.lineWinnerId).toBeNull();
    s = apply(s, { type: 'draw' });
    expect(s.lineWinnerId).toBe('p1');
  });

  it('acabaram as bolas sem ninguém cantar: o juiz confere', () => {
    let s = start(2);
    for (let i = 0; i < BINGO_BALLS; i++) s = apply(s, { type: 'draw' });
    s = apply(s, { type: 'draw' });
    expect(s.phase).toBe('gameOver');
    expect(s.bingoWinnerId).toBe('p0');
  });
});

describe('Bingo: módulo do hub', () => {
  it('pote: Bingo 70%, Linha 30%, sem sobrar nem faltar', () => {
    let s = start(4);
    s = { ...s, lineWinnerId: 'p2', bingoWinnerId: 'p1', phase: 'gameOver' };
    const entries = people(4).map((p) => ({ playerId: p.id, amount: 250 }));
    const payouts = bingoModule.settle(s, entries);
    const of = (id: string) => payouts.find((p) => p.playerId === id)!;
    expect(of('p1')).toMatchObject({ amount: 700, place: 1 });
    expect(of('p2')).toMatchObject({ amount: 300, place: 2 });
    expect(payouts.reduce((sum, p) => sum + p.amount, 0)).toBe(1000);
    // Quem leva os dois fica com tudo.
    const both = bingoModule.settle({ ...s, lineWinnerId: 'p1' }, entries);
    expect(both.find((p) => p.playerId === 'p1')!.amount).toBe(1000);
  });

  it('partidas só com bots terminam sozinhas pelo sorteio', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const created = bingoModule.create(people(2 + (seed % 7), [0, 1, 2, 3, 4, 5, 6, 7]), { entry: 100 }, seed);
      if (!created.ok) throw new Error(created.error);
      let s = created.state;
      for (let i = 0; i < 200 && !bingoModule.isFinished(s); i++) {
        const step = bingoModule.auto(s)!;
        expect(step.delay).toBe('ballDraw');
        const r = bingoModule.apply(s, step.action);
        if (!r.ok) throw new Error(r.error);
        s = r.state;
      }
      expect(bingoModule.isFinished(s)).toBe(true);
      expect(s.bingoWinnerId).not.toBeNull();
      expect(s.lineWinnerId).not.toBeNull();
    }
  });

  it('a visão não mostra a cartela dos outros (só quantos faltam)', () => {
    const s = start(3);
    const view = getBingoView(s, 'p0');
    expect(view.card).toEqual(s.cards.p0);
    const others = JSON.stringify(view.seats);
    expect(others).not.toContain(JSON.stringify(s.cards.p1));
    expect(view.seats.every((x) => x.missing === 24)).toBe(true);
    expect(getBingoView(s, null).card).toEqual([]);
    expect(view.winnerCard).toBeNull();
  });

  it('comandos malformados viram INVALID_ACTION', () => {
    const s = start();
    expect(bingoModule.commandAction!(s, 'p0', { type: 'claim', prize: 'tudo' }).ok).toBe(false);
    expect(bingoModule.commandAction!(s, 'p0', { type: 'draw' }).ok).toBe(false);
    expect(bingoModule.commandAction!(s, 'p0', { type: 'claim', prize: 'bingo' })).toEqual({
      ok: true,
      action: { type: 'claim', playerId: 'p0', prize: 'bingo' },
    });
  });
});
