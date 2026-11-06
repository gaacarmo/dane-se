import { describe, expect, it } from 'vitest';
import {
  type Card,
  type TrucoAction,
  type TrucoGameState,
  applyTrucoAction,
  createTrucoGame,
  getTrucoView,
  trucoHandWinner,
  trucoModule,
  trucoStrength,
} from '../../src/index.js';

const players2 = [
  { id: 'a', name: 'Ana' },
  { id: 'b', name: 'Beto' },
];
const players4 = [...players2, { id: 'c', name: 'Caio' }, { id: 'd', name: 'Duda' }];

function start(players = players2, seed = 7): TrucoGameState {
  const r = createTrucoGame(players, seed, { entry: 100 });
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function apply(state: TrucoGameState, action: TrucoAction): TrucoGameState {
  const r = applyTrucoAction(state, action);
  if (!r.ok) throw new Error(`${action.type}: ${r.error}`);
  return r.state;
}

const c = (id: string): Card => ({ rank: id.slice(0, -1) as Card['rank'], suit: id.slice(-1) as Card['suit'] });

/** Mesa montada à mão: vira 7 (manilha Q), mãos fixas, `a` começa. */
function rigged(hands: Record<string, string[]>, players = players2): TrucoGameState {
  const base = start(players);
  return {
    ...base,
    vira: c('7D'),
    manilha: 'Q',
    hands: Object.fromEntries(Object.entries(hands).map(([id, cards]) => [id, cards.map(c)])),
    roundLeaderId: 'a',
    turnPlayerId: 'a',
    phase: 'playing',
  };
}

/** Joga uma vaza inteira (na ordem dos assentos a partir da vez) e recolhe. */
function playRound(state: TrucoGameState, cards: string[]): TrucoGameState {
  let s = state;
  for (const card of cards) s = apply(s, { type: 'play', playerId: s.turnPlayerId, cardId: card });
  return apply(s, { type: 'collectRound' });
}

describe('regras do Truco Paulista', () => {
  it('manilhas por naipe ficam acima de tudo, e o resto empata pelo valor', () => {
    expect(trucoStrength(c('QC'), 'Q')).toBeGreaterThan(trucoStrength(c('QH'), 'Q'));
    expect(trucoStrength(c('QD'), 'Q')).toBeGreaterThan(trucoStrength(c('3C'), 'Q'));
    expect(trucoStrength(c('3C'), 'Q')).toBe(trucoStrength(c('3D'), 'Q'));
  });

  it('decide quem leva a mão a partir das vazas', () => {
    expect(trucoHandWinner([0, 0])).toBe(0);
    expect(trucoHandWinner([0, 1])).toBeUndefined();
    expect(trucoHandWinner([0, 1, 1])).toBe(1);
    expect(trucoHandWinner(['tie', 1])).toBe(1);
    expect(trucoHandWinner([1, 'tie'])).toBe(1);
    expect(trucoHandWinner([0, 1, 'tie'])).toBe(0);
    expect(trucoHandWinner(['tie', 'tie', 0])).toBe(0);
    expect(trucoHandWinner(['tie', 'tie', 'tie'])).toBeNull();
  });

  it('só aceita 2 ou 4 jogadores e reparte 3 cartas para cada', () => {
    expect(createTrucoGame(players4.slice(0, 3), 1, { entry: 100 }).ok).toBe(false);
    const s = start(players4);
    for (const p of players4) expect(s.hands[p.id]).toHaveLength(3);
    expect(s.players.map((p) => p.team)).toEqual([0, 1, 0, 1]);
    expect(s.turnPlayerId).toBe('a');
  });
});

describe('vazas e pontos', () => {
  it('quem ganha duas vazas leva 1 ponto', () => {
    let s = rigged({ a: ['3C', '2C', '4C'], b: ['4D', '5D', '6D'] });
    s = playRound(s, ['3C', '4D']);
    expect(s.rounds[0]!.result).toBe(0);
    s = playRound(s, ['2C', '5D']);
    expect(s.phase).toBe('handEnd');
    expect(s.scores).toEqual([1, 0]);
    expect(s.lastHand).toMatchObject({ team: 0, points: 1, reason: 'rounds' });
  });

  it('carta de mesmo valor canga, e a próxima vaza decide', () => {
    let s = rigged({ a: ['3C', '4C', '5C'], b: ['3D', 'QC', '6D'] });
    s = playRound(s, ['3C', '3D']);
    expect(s.rounds[0]!.result).toBe('tie');
    s = playRound(s, [s.turnPlayerId === 'a' ? '4C' : 'QC', s.turnPlayerId === 'a' ? 'QC' : '4C']);
    expect(s.scores).toEqual([0, 1]);
  });

  it('na dupla, o parceiro também ganha a vaza', () => {
    let s = rigged(
      { a: ['4C', '5C', '6C'], b: ['3D', '5D', '6D'], c: ['QC', '5H', '6H'], d: ['4D', '5S', '6S'] },
      players4,
    );
    s = playRound(s, ['4C', '3D', 'QC', '4D']);
    expect(s.rounds[0]!.result).toBe(0);
    // Quem jogou a maior carta (c) começa a próxima.
    expect(s.turnPlayerId).toBe('c');
  });
});

describe('pedidos de truco', () => {
  it('correr do truco dá 1 ponto pra quem pediu', () => {
    let s = rigged({ a: ['3C', '2C', '4C'], b: ['4D', '5D', '6D'] });
    s = apply(s, { type: 'truco', playerId: 'a' });
    expect(s.phase).toBe('truco');
    expect(s.request).toMatchObject({ value: 3, responderId: 'b' });
    s = apply(s, { type: 'run', playerId: 'b' });
    expect(s.scores).toEqual([1, 0]);
  });

  it('aceitar faz a mão valer 3, e a mesma dupla não pode pedir de novo', () => {
    let s = rigged({ a: ['3C', '2C', '4C'], b: ['4D', '5D', '6D'] });
    s = apply(s, { type: 'truco', playerId: 'a' });
    s = apply(s, { type: 'accept', playerId: 'b' });
    expect(s.value).toBe(3);
    expect(s.turnPlayerId).toBe('a');
    expect(applyTrucoAction(s, { type: 'truco', playerId: 'a' })).toEqual({ ok: false, error: 'ILLEGAL_RAISE' });
    s = playRound(s, ['3C', '4D']);
    s = playRound(s, ['2C', '5D']);
    expect(s.scores).toEqual([3, 0]);
  });

  it('aumentar pra seis devolve a decisão pra quem pediu; correr dá 3 ao outro', () => {
    let s = rigged({ a: ['3C', '2C', '4C'], b: ['4D', '5D', '6D'] });
    s = apply(s, { type: 'truco', playerId: 'a' });
    s = apply(s, { type: 'truco', playerId: 'b' });
    expect(s.value).toBe(3);
    expect(s.request).toMatchObject({ value: 6, byPlayerId: 'b', responderId: 'a' });
    s = apply(s, { type: 'run', playerId: 'a' });
    expect(s.scores).toEqual([0, 3]);
  });

  it('não deixa pedir fora da vez nem responder pelo outro', () => {
    const s = rigged({ a: ['3C', '2C', '4C'], b: ['4D', '5D', '6D'] });
    expect(applyTrucoAction(s, { type: 'truco', playerId: 'b' })).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    const asked = apply(s, { type: 'truco', playerId: 'a' });
    expect(applyTrucoAction(asked, { type: 'accept', playerId: 'a' })).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(applyTrucoAction(asked, { type: 'play', playerId: 'a', cardId: '3C' })).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });
});

describe('mão de onze e mão de ferro', () => {
  it('a dupla com 11 decide; correr dá 1 ponto ao adversário', () => {
    let s = rigged({ a: ['3C', '2C', '4C'], b: ['4D', '5D', '6D'] });
    s = { ...s, scores: [11, 4] };
    s = playRound(s, ['3C', '4D']);
    s = playRound(s, ['2C', '5D']);
    expect(s.phase).toBe('gameOver');
    expect(s.winnerTeam).toBe(0);

    let t = start(players4);
    t = { ...t, scores: [10, 11], phase: 'handEnd' };
    t = apply(t, { type: 'nextHand' });
    expect(t.phase).toBe('maoDeOnze');
    expect(t.special).toBe('onze');
    const decider = t.onzeDeciderId!;
    expect(t.players.find((p) => p.id === decider)!.team).toBe(1);
    // O parceiro mostra as cartas pra dupla com 11.
    expect(getTrucoView(t, decider).partnerHand?.cards).toHaveLength(3);
    expect(getTrucoView(t, 'a').partnerHand).toBeNull();
    const ran = apply(t, { type: 'run', playerId: decider });
    expect(ran.scores).toEqual([11, 11]);
    const played = apply(t, { type: 'accept', playerId: decider });
    expect(played.value).toBe(3);
    expect(played.phase).toBe('playing');
    expect(applyTrucoAction(played, { type: 'truco', playerId: played.turnPlayerId }).ok).toBe(false);
  });

  it('na mão de onze os dois parceiros podem decidir; a outra dupla não', () => {
    let t = start(players4);
    t = { ...t, scores: [11, 5], phase: 'handEnd' };
    t = apply(t, { type: 'nextHand' });
    expect(t.phase).toBe('maoDeOnze');
    const team0 = t.players.filter((p) => p.team === 0).map((p) => p.id);
    const team1 = t.players.filter((p) => p.team === 1).map((p) => p.id);
    const partner = team0.find((id) => id !== t.onzeDeciderId)!;
    // O parceiro (que não é quem a mesa espera) também pode responder e vê as cartas do outro.
    expect(getTrucoView(t, partner).legal.canAccept).toBe(true);
    expect(getTrucoView(t, partner).partnerHand?.playerId).toBe(t.onzeDeciderId);
    const ran = apply(t, { type: 'run', playerId: partner });
    expect(ran.scores).toEqual([11, 6]);
    expect(ran.lastHand).toMatchObject({ team: 1, points: 1, reason: 'onzeRun', ranPlayerId: partner });
    // A outra dupla não decide nem vê nada.
    for (const id of team1) {
      expect(applyTrucoAction(t, { type: 'accept', playerId: id })).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
      expect(getTrucoView(t, id).partnerHand).toBeNull();
      expect(getTrucoView(t, id).legal.canAccept).toBe(false);
    }
  });

  it('na mão de onze a mesa espera um humano da dupla, não o bot', () => {
    const withBot = [
      { id: 'a', name: 'Ana', isBot: true },
      { id: 'b', name: 'Beto' },
      { id: 'c', name: 'Caio' },
      { id: 'd', name: 'Duda' },
    ];
    for (let seed = 1; seed <= 8; seed++) {
      const r = createTrucoGame(withBot, seed, { entry: 100 });
      if (!r.ok) throw new Error(r.error);
      let t: TrucoGameState = { ...r.state, scores: [11, 3], phase: 'handEnd' };
      t = apply(t, { type: 'nextHand' });
      // Dupla 0 = Ana (bot) e Caio: quem decide é sempre o Caio.
      expect(t.onzeDeciderId).toBe('c');
    }
  });

  it('na mão de ferro ninguém vê as próprias cartas', () => {
    let s = start(players2);
    s = { ...s, scores: [11, 11], phase: 'handEnd' };
    s = apply(s, { type: 'nextHand' });
    expect(s.special).toBe('ferro');
    const view = getTrucoView(s, s.turnPlayerId);
    expect(view.hand.every((h) => h.card === null)).toBe(true);
    const after = apply(s, { type: 'play', playerId: s.turnPlayerId, cardId: 'X0' });
    expect(after.table).toHaveLength(1);
  });
});

describe('módulo do hub', () => {
  function runWithBots(players: { id: string; name: string }[], seed: number): TrucoGameState {
    const created = trucoModule.create(players, { entry: 100 }, seed);
    if (!created.ok) throw new Error(created.error);
    let s = created.state;
    let rng = seed;
    for (let i = 0; i < 5000 && !trucoModule.isFinished(s); i++) {
      const auto = trucoModule.auto(s);
      const actor = trucoModule.actorId(s);
      let action: TrucoAction;
      if (auto) action = auto.action;
      else {
        const step = trucoModule.botAction(s, actor!, rng)!;
        rng = step.rng;
        action = step.action;
      }
      const r = trucoModule.apply(s, action);
      if (!r.ok) throw new Error(`${JSON.stringify(action)} -> ${r.error}`);
      s = r.state;
    }
    return s;
  }

  it('bots terminam partidas 1x1 e 2x2 sem jogada ilegal', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = runWithBots(seed % 2 ? players2 : players4, seed);
      expect(trucoModule.isFinished(s)).toBe(true);
      expect(Math.max(...s.scores)).toBe(12);
    }
  });

  it('a dupla vencedora divide o pote e nada some', () => {
    const s = runWithBots(players4, 3);
    const entries = players4.map((p) => ({ playerId: p.id, amount: 250 }));
    const payouts = trucoModule.settle(s, entries);
    expect(payouts.reduce((sum, p) => sum + p.amount, 0)).toBe(1000);
    const winners = payouts.filter((p) => p.place === 1);
    expect(winners).toHaveLength(2);
    expect(winners.every((p) => p.amount === 500)).toBe(true);
  });

  it('a visão não entrega as cartas dos outros', () => {
    const s = start(players4);
    const view = getTrucoView(s, 'a');
    expect(view.hand.map((h) => h.id).sort()).toEqual(s.hands.a!.map((x) => `${x.rank}${x.suit}`).sort());
    expect(JSON.stringify(view)).not.toContain(JSON.stringify(s.hands.b));
    expect(getTrucoView(s, null).hand).toEqual([]);
  });

  it('rejeita comandos malformados', () => {
    const s = start();
    expect(trucoModule.commandAction!(s, 'a', { type: 'fold' }).ok).toBe(false);
    expect(trucoModule.playAction(s, 'a', 42).ok).toBe(false);
    expect(trucoModule.betAction(s, 'a', 1).ok).toBe(false);
  });
});
