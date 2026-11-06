import { describe, expect, it } from 'vitest';
import {
  type Card,
  type DuvidoAction,
  type DuvidoGameState,
  DUVIDO_CANDIES,
  DUVIDO_HAND_SIZE,
  applyDuvidoAction,
  cardId,
  claimLabel,
  createDuvidoGame,
  duvidoModule,
  getDuvidoView,
} from '../../src/index.js';

const players = (n: number) => ['Ana', 'Beto', 'Caio', 'Duda', 'Edu', 'Fê'].slice(0, n).map((name, i) => ({ id: `p${i}`, name }));

function start(n = 3, seed = 11): DuvidoGameState {
  const r = createDuvidoGame(players(n), seed, { entry: 100 });
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function apply(state: DuvidoGameState, action: DuvidoAction): DuvidoGameState {
  const r = applyDuvidoAction(state, action);
  if (!r.ok) throw new Error(`${action.type}: ${r.error}`);
  return r.state;
}

const c = (id: string): Card => ({ rank: id.slice(0, -1) as Card['rank'], suit: id.slice(-1) as Card['suit'] });

/** Rodada montada: vale "Reis", manilha 7 (vira 6), mãos fixas, p0 começa. */
function rigged(hands: Record<string, string[]>, n = 3): DuvidoGameState {
  const base = start(n);
  return {
    ...base,
    vira: c('6D'),
    manilha: '7',
    value: 'K',
    hands: Object.fromEntries(Object.entries(hands).map(([id, cards]) => [id, cards.map(c)])),
    pile: [],
    turnPlayerId: 'p0',
  };
}

describe('Duvido: regras', () => {
  it('dá 5 cartas pra cada um e sorteia um valor diferente da manilha', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = start(6, seed);
      for (const p of s.players) expect(s.hands[p.id]).toHaveLength(DUVIDO_HAND_SIZE);
      expect(s.value).not.toBe(s.manilha);
      expect(s.players.every((p) => p.candies === DUVIDO_CANDIES)).toBe(true);
    }
    expect(createDuvidoGame(players(1), 1, { entry: 100 }).ok).toBe(false);
    expect(claimLabel(2, 'K')).toBe('2 Reis');
    expect(claimLabel(1, 'A')).toBe('1 Ás');
  });

  it('jogar de 1 a 3 cartas da mão e passar a vez', () => {
    let s = rigged({ p0: ['KH', '4C', '5C'], p1: ['KC', '6C'], p2: ['QH', 'JH'] });
    expect(applyDuvidoAction(s, { type: 'play', playerId: 'p0', cardIds: [] }).ok).toBe(false);
    expect(applyDuvidoAction(s, { type: 'play', playerId: 'p0', cardIds: ['KH', '4C', '5C', '6C'] }).ok).toBe(false);
    expect(applyDuvidoAction(s, { type: 'play', playerId: 'p0', cardIds: ['3S'] })).toEqual({ ok: false, error: 'CARD_NOT_IN_HAND' });
    expect(applyDuvidoAction(s, { type: 'play', playerId: 'p1', cardIds: ['KC'] })).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    // Quem começa a rodada não tem o que duvidar.
    expect(applyDuvidoAction(s, { type: 'doubt', playerId: 'p0' })).toEqual({ ok: false, error: 'INVALID_ACTION' });
    s = apply(s, { type: 'play', playerId: 'p0', cardIds: ['KH', '4C'] });
    expect(s.hands.p0!.map(cardId)).toEqual(['5C']);
    expect(s.turnPlayerId).toBe('p1');
    expect(getDuvidoView(s, 'p1').lastPlay).toEqual({ playerId: 'p0', count: 2 });
  });

  it('pego na mentira: quem jogou tira uma bala', () => {
    let s = rigged({ p0: ['KH', '4C'], p1: ['KC'], p2: ['QH'] });
    s = apply(s, { type: 'play', playerId: 'p0', cardIds: ['KH', '4C'] });
    s = apply(s, { type: 'doubt', playerId: 'p1' });
    expect(s.reveal).toMatchObject({ doubterId: 'p1', playerId: 'p0', truthful: false, punishedId: 'p0' });
    const p0 = s.players.find((p) => p.id === 'p0')!;
    expect(p0.out ? p0.candies : p0.candies + 1).toBe(DUVIDO_CANDIES);
  });

  it('duvidou de quem falou a verdade (manilha é curinga): quem duvidou tira a bala', () => {
    let s = rigged({ p0: ['KH', '7S'], p1: ['KC'], p2: ['QH'] });
    s = apply(s, { type: 'play', playerId: 'p0', cardIds: ['KH', '7S'] });
    s = apply(s, { type: 'doubt', playerId: 'p1' });
    expect(s.reveal).toMatchObject({ truthful: true, punishedId: 'p1' });
  });

  it('quem fica sem cartas só pode duvidar', () => {
    let s = rigged({ p0: ['QH'], p1: [], p2: ['JH'] });
    s = apply(s, { type: 'play', playerId: 'p0', cardIds: ['QH'] });
    const view = getDuvidoView(s, 'p1');
    expect(view.legal).toEqual({ canPlay: false, maxCards: 0, canDoubt: true });
  });

  it('o risco da apimentada sobe a cada castigo, até sair', () => {
    let s = start(2, 3);
    let draws = 0;
    // p1 duvida sempre de jogadas verdadeiras montadas: o castigo cai sempre nele.
    while (s.phase !== 'gameOver' && draws < 10) {
      s = { ...s, phase: 'playing', reveal: null, value: 'K', manilha: '7', hands: { p0: [c('KH')], p1: [c('4C')] }, pile: [], turnPlayerId: 'p0' };
      s = apply(s, { type: 'play', playerId: 'p0', cardIds: ['KH'] });
      s = apply(s, { type: 'doubt', playerId: 'p1' });
      draws++;
      const p1 = s.players.find((p) => p.id === 'p1')!;
      if (!p1.out) expect(p1.candies).toBe(DUVIDO_CANDIES - draws);
    }
    // Com 6 balas e uma apimentada, no máximo 6 castigos.
    expect(draws).toBeLessThanOrEqual(DUVIDO_CANDIES);
    expect(s.phase).toBe('gameOver');
    expect(s.winnerId).toBe('p0');
  });

  it('a próxima rodada começa com quem levou o castigo, ou o seguinte se ele saiu', () => {
    let s = rigged({ p0: ['KH', '4C'], p1: ['KC'], p2: ['QH'] });
    s = apply(s, { type: 'play', playerId: 'p0', cardIds: ['KH', '4C'] });
    s = apply(s, { type: 'doubt', playerId: 'p1' });
    const punished = s.players.find((p) => p.id === 'p0')!;
    s = apply(s, { type: 'nextRound' });
    expect(s.turnPlayerId).toBe(punished.out ? 'p1' : 'p0');
    expect(s.round).toBe(2);
    expect(s.pile).toEqual([]);
  });
});

describe('Duvido: módulo do hub', () => {
  function runWithBots(n: number, seed: number): DuvidoGameState {
    const created = duvidoModule.create(players(n), { entry: 100 }, seed);
    if (!created.ok) throw new Error(created.error);
    let s = created.state;
    let rng = seed;
    for (let i = 0; i < 5000 && !duvidoModule.isFinished(s); i++) {
      const auto = duvidoModule.auto(s);
      let action: DuvidoAction;
      if (auto) action = auto.action;
      else {
        const step = duvidoModule.botAction(s, duvidoModule.actorId(s)!, rng)!;
        rng = step.rng;
        action = step.action;
      }
      const r = duvidoModule.apply(s, action);
      if (!r.ok) throw new Error(`${JSON.stringify(action)} -> ${r.error}`);
      s = r.state;
    }
    return s;
  }

  it('bots terminam partidas de 2 a 6 sem jogada ilegal', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = runWithBots(2 + (seed % 5), seed);
      expect(duvidoModule.isFinished(s)).toBe(true);
      expect(s.players.filter((p) => !p.out)).toHaveLength(1);
    }
  });

  it('o pote fecha certinho e o último que sobrou ganha', () => {
    const s = runWithBots(5, 7);
    const entries = players(5).map((p) => ({ playerId: p.id, amount: 200 }));
    const payouts = duvidoModule.settle(s, entries);
    expect(payouts.reduce((sum, p) => sum + p.amount, 0)).toBe(1000);
    expect(payouts.find((p) => p.place === 1)!.playerId).toBe(s.winnerId);
  });

  it('a visão não entrega as cartas dos outros nem as da mesa', () => {
    let s = start(3);
    const first = s.hands.p0!.slice(0, 2).map(cardId);
    s = apply(s, { type: 'play', playerId: 'p0', cardIds: first });
    const view = getDuvidoView(s, 'p1');
    expect(view.hand.map(cardId).sort()).toEqual(s.hands.p1!.map(cardId).sort());
    const json = JSON.stringify(view);
    for (const id of first) expect(json).not.toContain(`"${id}"`);
    expect(JSON.stringify(view.pile)).toBe(JSON.stringify([{ playerId: 'p0', count: 2 }]));
    expect(getDuvidoView(s, null).hand).toEqual([]);
  });

  it('comandos malformados viram INVALID_ACTION', () => {
    const s = start();
    expect(duvidoModule.commandAction!(s, 'p0', { type: 'playCards', cardIds: [] }).ok).toBe(false);
    expect(duvidoModule.commandAction!(s, 'p0', { type: 'playCards', cardIds: ['a', 'b', 'c', 'd'] }).ok).toBe(false);
    expect(duvidoModule.commandAction!(s, 'p0', { type: 'fold' }).ok).toBe(false);
    expect(duvidoModule.commandAction!(s, 'p0', { type: 'doubt' })).toEqual({ ok: true, action: { type: 'doubt', playerId: 'p0' } });
  });
});
