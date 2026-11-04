import { describe, expect, it } from 'vitest';
import {
  ARCADE_TUNING,
  CHARACTER_IDS,
  CHARACTER_KITS,
  COMMON_TALENT_IDS,
  COMMON_TALENTS,
  type CharacterId,
  type CommonTalentId,
  type GameState,
  type PlayerRoundResult,
  absorbHit,
  applyAction,
  applyArcadeLetters,
  arcadeSeat,
  backfireChance,
  canRevive,
  cardId,
  createArcadeMatchState,
  createGame,
  daneseModule,
  eliminationThreshold,
  gatoAlerts,
  getPlayerView,
  isCommonTalentId,
  isSpecialCharged,
  isValidTalentSet,
  parseLoadout,
  spendRevive,
  spendSpecial,
  talentsFor,
} from '../src/index.js';
import { act, autoPlayRound, betAll } from './helpers.js';

/** A Dane-se game where every seat carries an arcade loadout. */
function arcadeGame(loadouts: readonly { character: CharacterId; talents: CommonTalentId[] }[]): GameState {
  const players = loadouts.map((arcade, i) => ({ id: `p${i}`, name: `P${i}`, arcade }));
  const result = createGame(players, 1);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const seat = (state: GameState, id: string) => state.arcade.seats.find((s) => s.id === id);

describe('arcade catalog', () => {
  it('gives every character a kit with a passive and a special', () => {
    for (const character of CHARACTER_IDS) {
      const kit = CHARACTER_KITS[character];
      expect(kit.character).toBe(character);
      expect(kit.passive.id).toBeTruthy();
      expect(kit.special.id).toBeTruthy();
      expect(kit.passive.danese.length).toBeGreaterThan(0);
      expect(kit.special.poker.length).toBeGreaterThan(0);
    }
  });

  it('uses a unique passive and special per character', () => {
    const passives = CHARACTER_IDS.map((c) => CHARACTER_KITS[c].passive.id);
    const specials = CHARACTER_IDS.map((c) => CHARACTER_KITS[c].special.id);
    expect(new Set(passives).size).toBe(passives.length);
    expect(new Set(specials).size).toBe(specials.length);
  });

  it('offers the standard trio of common talents', () => {
    expect(COMMON_TALENT_IDS).toEqual(['escudo', 'radar', 'curinga']);
    for (const id of COMMON_TALENT_IDS) {
      expect(COMMON_TALENTS[id].id).toBe(id);
      expect(COMMON_TALENTS[id].name.length).toBeGreaterThan(0);
    }
  });

  it('guardas de tipo', () => {
    expect(isCommonTalentId('escudo')).toBe(true);
    expect(isCommonTalentId('radar')).toBe(true);
    expect(isCommonTalentId('invisivel')).toBe(false);
    expect(isCommonTalentId(42)).toBe(false);
  });

  it('valida o loadout contra personagem e talento', () => {
    expect(parseLoadout('martelo', ['radar'])).toEqual({ character: 'martelo', talents: ['radar'] });
    expect(parseLoadout('carmelo', ['radar', 'escudo'])).toEqual({ character: 'carmelo', talents: ['radar', 'escudo'] });
    expect(parseLoadout('martelo', ['invisivel'])).toBeNull();
    expect(parseLoadout('martelo', ['radar', 'escudo'])).toBeNull();
    expect(parseLoadout('carmelo', ['radar'])).toBeNull();
    expect(parseLoadout('ninguem', ['radar'])).toBeNull();
    expect(parseLoadout(null, ['radar'])).toBeNull();
  });

  it('valida conjuntos parciais de talentos (Camarote escolhe 2)', () => {
    expect(isValidTalentSet('martelo', [])).toBe(true);
    expect(isValidTalentSet('martelo', ['radar'])).toBe(true);
    expect(isValidTalentSet('martelo', ['radar', 'escudo'])).toBe(false);
    expect(isValidTalentSet('martelo', ['radar', 'radar'])).toBe(false);
    expect(isValidTalentSet('carmelo', ['radar', 'escudo'])).toBe(true);
    expect(isValidTalentSet('carmelo', ['radar'])).toBe(true);
    expect(isValidTalentSet('carmelo', ['radar', 'escudo', 'curinga'])).toBe(false);
    expect(isValidTalentSet('martelo', ['invisivel' as CommonTalentId])).toBe(false);
  });

  it('só o Carmelo escolhe dois talentos', () => {
    expect(talentsFor('carmelo')).toBe(2);
    for (const character of CHARACTER_IDS.filter((c) => c !== 'carmelo')) {
      expect(talentsFor(character)).toBe(1);
    }
  });
});

describe('arcade match state', () => {
  const seats = [
    { id: 'p1', loadout: { character: 'sarney', talents: ['escudo'] } as const },
    { id: 'p2', loadout: { character: 'dezin', talents: ['radar'] } as const },
  ];

  it('monta as cadeiras a partir dos loadouts', () => {
    const match = createArcadeMatchState(seats);
    expect(match.enabled).toBe(true);
    expect(match.seats.map((s) => s.id)).toEqual(['p1', 'p2']);
    expect(arcadeSeat(match, 'p1')?.character).toBe('sarney');
    expect(arcadeSeat(match, 'p2')?.talents).toEqual(['radar']);
    expect(arcadeSeat(match, 'p3')).toBeUndefined();
  });

  it('aplica os defaults de talento e passiva', () => {
    const match = createArcadeMatchState(seats);
    // Trave começa carregada; Sarney tem +2 letras de fôlego.
    expect(arcadeSeat(match, 'p1')?.shields).toBe(1);
    expect(arcadeSeat(match, 'p1')?.eliminationBuffer).toBe(ARCADE_TUNING.esquentaLetterBuffer);
    // Rádio Corredor começa com 1 carga; Dezin volta da morte 1 vez.
    expect(arcadeSeat(match, 'p2')?.charges).toBe(1);
    expect(arcadeSeat(match, 'p2')?.revives).toBe(1);
  });

  it('lista vazia = partida normal, helpers no-op', () => {
    const normal = createArcadeMatchState([]);
    expect(normal.enabled).toBe(false);
    expect(arcadeSeat(normal, 'p1')).toBeUndefined();
    expect(isSpecialCharged(normal, 'p1')).toBe(false);
    expect(eliminationThreshold(normal, 'p1', 6)).toBe(6);
    expect(backfireChance(normal, 'p1')).toBe(0);
    expect(spendSpecial(normal, 'p1')).toBe(normal);
  });
});

describe('arcade helpers', () => {
  const match = createArcadeMatchState([
    { id: 'esc', loadout: { character: 'colombo', talents: ['escudo'] } },
    { id: 'rad', loadout: { character: 'colombo', talents: ['radar'] } },
    { id: 'babin', loadout: { character: 'babin', talents: ['curinga'] } },
    { id: 'sarney', loadout: { character: 'sarney', talents: ['radar'] } },
    { id: 'dezin', loadout: { character: 'dezin', talents: ['radar'] } },
    { id: 'martelo', loadout: { character: 'martelo', talents: ['radar'] } },
  ]);

  it('o especial gasta uma vez e não volta', () => {
    expect(isSpecialCharged(match, 'esc')).toBe(true);
    const spent = spendSpecial(match, 'esc');
    expect(isSpecialCharged(spent, 'esc')).toBe(false);
    // O estado original não muda (puro).
    expect(isSpecialCharged(match, 'esc')).toBe(true);
    expect(spendSpecial(spent, 'esc')).toBe(spent);
  });

  it('o escudo anula um golpe e some', () => {
    const first = absorbHit(match, 'esc');
    expect(first.absorbed).toBe(true);
    expect(arcadeSeat(first.state, 'esc')?.shields).toBe(0);
    const second = absorbHit(first.state, 'esc');
    expect(second.absorbed).toBe(false);
    expect(second.state).toBe(first.state);
    // Quem não tem escudo não absorve nada.
    expect(absorbHit(match, 'rad').absorbed).toBe(false);
  });

  it('o Zagueirão soma +2 ao limiar de eliminação', () => {
    expect(eliminationThreshold(match, 'sarney', 6)).toBe(6 + ARCADE_TUNING.esquentaLetterBuffer);
    expect(eliminationThreshold(match, 'martelo', 6)).toBe(6);
  });

  it('a Prorrogação ressuscita uma vez', () => {
    expect(canRevive(match, 'dezin')).toBe(true);
    const used = spendRevive(match, 'dezin');
    expect(canRevive(used, 'dezin')).toBe(false);
    expect(spendRevive(used, 'dezin')).toBe(used);
    expect(canRevive(match, 'martelo')).toBe(false);
  });

  it('o Gol Contra dá chance de backfire só pro Babin', () => {
    expect(backfireChance(match, 'babin')).toBe(ARCADE_TUNING.encrencaBackfire);
    expect(backfireChance(match, 'martelo')).toBe(0);
  });
});

describe('dane-se arcade', () => {
  const r = (playerId: string, lettersAfter: number): PlayerRoundResult => ({
    playerId,
    bet: 1,
    tricksWon: 0,
    hitBet: false,
    gainedLetter: true,
    lettersAfter,
    eliminated: false,
  });

  it('sem arcade, as letras passam direto', () => {
    const out = applyArcadeLetters(createArcadeMatchState([]), 6, [r('a', 1)]);
    expect(out.results).toEqual([r('a', 1)]);
    expect(out.eliminatedIds).toEqual([]);
  });

  it('a Trave anula a letra e some', () => {
    const seat = { id: 'a', loadout: { character: 'colombo', talents: ['escudo'] } as const };
    const out = applyArcadeLetters(createArcadeMatchState([seat]), 6, [r('a', 1)]);
    expect(out.results[0]).toMatchObject({ gainedLetter: false, lettersAfter: 0, eliminated: false });
    expect(arcadeSeat(out.arcade, 'a')?.shields).toBe(0);
    // Na letra seguinte o escudo já foi: cai normalmente.
    const again = applyArcadeLetters(out.arcade, 6, [r('a', 1)]);
    expect(again.results[0]).toMatchObject({ gainedLetter: true, lettersAfter: 1 });
  });

  it('o Zagueirão só cai na 8ª letra', () => {
    const seat = { id: 's', loadout: { character: 'sarney', talents: ['radar'] } as const };
    const match = createArcadeMatchState([seat]);
    expect(applyArcadeLetters(match, 6, [r('s', 7)]).results[0]).toMatchObject({ lettersAfter: 7, eliminated: false });
    const on8 = applyArcadeLetters(match, 6, [r('s', 8)]);
    expect(on8.results[0]).toMatchObject({ lettersAfter: 8, eliminated: true });
    expect(on8.eliminatedIds).toEqual(['s']);
  });

  it('a Prorrogação salva da primeira morte e volta 1 letra abaixo do letal', () => {
    const seat = { id: 'z', loadout: { character: 'dezin', talents: ['radar'] } as const };
    const match = createArcadeMatchState([seat]);
    const first = applyArcadeLetters(match, 6, [r('z', 6)]);
    expect(first.results[0]).toMatchObject({ lettersAfter: 5, eliminated: false });
    expect(arcadeSeat(first.arcade, 'z')?.revives).toBe(0);
    const second = applyArcadeLetters(first.arcade, 6, [r('z', 6)]);
    expect(second.results[0]).toMatchObject({ lettersAfter: 6, eliminated: true });
  });

  it('pluga no jogo: aura pública e kit privado', () => {
    const result = createGame(
      [
        { id: 'a', name: 'A', arcade: { character: 'sarney', talents: ['escudo'] } },
        { id: 'b', name: 'B', arcade: { character: 'dezin', talents: ['radar'] } },
      ],
      1,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.arcade.enabled).toBe(true);
    expect(result.state.arcade.seats).toHaveLength(2);

    const viewA = getPlayerView(result.state, 'a');
    expect(viewA.arcade).toMatchObject({
      enabled: true,
      loadout: { character: 'sarney', talents: ['escudo'] },
      specialCharged: true,
    });
    expect(viewA.players.every((p) => p.specialCharged)).toBe(true);

    // Espectador não recebe kit nenhum, mas continua vendo a aura.
    const spec = getPlayerView(result.state, null);
    expect(spec.arcade.loadout).toBeNull();
    expect(spec.players.every((p) => p.specialCharged)).toBe(true);
  });

  it('jogo arcade completo termina sem travar', () => {
    const result = createGame(
      [
        { id: 'a', name: 'A', arcade: { character: 'sarney', talents: ['escudo'] } },
        { id: 'b', name: 'B', arcade: { character: 'dezin', talents: ['radar'] } },
        { id: 'c', name: 'C', arcade: { character: 'babin', talents: ['curinga'] } },
      ],
      7,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    let s = result.state;
    let guard = 0;
    while (s.phase !== 'gameOver' && guard++ < 500) {
      s = s.phase === 'roundSummary' ? act(s, { type: 'nextRound' }) : autoPlayRound(s);
    }
    expect(s.phase).toBe('gameOver');
    expect(s.winnerId).not.toBeNull();
  });
});

describe('dane-se arcade abilities', () => {
  it('o commandAction monta a ação arcade e rejeita habilidade inválida', () => {
    const s = arcadeGame([{ character: 'colombo', talents: ['radar'] }, { character: 'martelo', talents: ['escudo'] }]);
    const built = daneseModule.commandAction!(s, 'p0', { type: 'arcade', ability: 'radar', targetId: 'p1' });
    expect(built).toEqual({ ok: true, action: { type: 'arcade', playerId: 'p0', ability: 'radar', targetId: 'p1' } });
    expect(daneseModule.commandAction!(s, 'p0', { type: 'arcade', ability: 'hackear' })).toEqual({
      ok: false,
      error: 'INVALID_ACTION',
    });
    expect(daneseModule.commandAction!(s, 'p0', { type: 'arcade', ability: 'radar', targetId: 7 })).toEqual({
      ok: false,
      error: 'INVALID_ACTION',
    });
  });

  it('sem arcade, habilidade é indisponível', () => {
    const result = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(applyAction(result.state, { type: 'arcade', playerId: 'a', ability: 'radar' })).toEqual({
      ok: false,
      error: 'ABILITY_UNAVAILABLE',
    });
  });

  it('Rádio Corredor revela 1 carta de um oponente só pro dono e gasta a carga', () => {
    const s = arcadeGame([{ character: 'colombo', talents: ['radar'] }, { character: 'sarney', talents: ['escudo'] }]);
    const res = applyAction(s, { type: 'arcade', playerId: 'p0', ability: 'radar', targetId: 'p1' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const mine = getPlayerView(res.state, 'p0').arcade;
    expect(mine.reveals).toHaveLength(1);
    expect(mine.reveals[0]!.targetId).toBe('p1');
    expect(mine.charges).toBe(0);
    // O oponente não recebe nada.
    expect(getPlayerView(res.state, 'p1').arcade.reveals).toHaveLength(0);
    // Sem saldo, a segunda tentativa falha.
    expect(applyAction(res.state, { type: 'arcade', playerId: 'p0', ability: 'radar', targetId: 'p1' })).toEqual({
      ok: false,
      error: 'ABILITY_UNAVAILABLE',
    });
  });

  it('Rádio Corredor rejeita alvo inválido', () => {
    const s = arcadeGame([{ character: 'colombo', talents: ['radar'] }, { character: 'martelo', talents: ['escudo'] }]);
    expect(applyAction(s, { type: 'arcade', playerId: 'p0', ability: 'radar', targetId: 'p0' })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    expect(applyAction(s, { type: 'arcade', playerId: 'p0', ability: 'radar', targetId: 'p9' })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
  });

  it('Rádio Corredor sem o talento não funciona', () => {
    const s = arcadeGame([{ character: 'colombo', talents: ['escudo'] }, { character: 'martelo', talents: ['escudo'] }]);
    expect(applyAction(s, { type: 'arcade', playerId: 'p0', ability: 'radar', targetId: 'p1' })).toEqual({
      ok: false,
      error: 'ABILITY_UNAVAILABLE',
    });
  });

  it('Substituição troca uma carta da mão e compra do baralho', () => {
    const s = arcadeGame([{ character: 'colombo', talents: ['curinga'] }, { character: 'martelo', talents: ['escudo'] }]);
    const before = s.hands['p0']!.map(cardId);
    expect(s.deck.length).toBeGreaterThan(0);
    const res = applyAction(s, { type: 'arcade', playerId: 'p0', ability: 'curinga' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.hands['p0']!.map(cardId)).not.toEqual(before);
    expect(res.state.deck).toHaveLength(s.deck.length - 1);
    expect(seat(res.state, 'p0')?.charges).toBe(0);
  });

  it('Leitura de Jogo (Dezin) revela a mão inteira de um oponente, 1×', () => {
    const s = arcadeGame([{ character: 'dezin', talents: ['escudo'] }, { character: 'sarney', talents: ['escudo'] }]);
    const targetHand = s.hands['p1']!.length;
    const res = applyAction(s, { type: 'arcade', playerId: 'p0', ability: 'visao', targetId: 'p1' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(getPlayerView(res.state, 'p0').arcade.reveals).toHaveLength(targetHand);
    expect(getPlayerView(res.state, 'p1').arcade.reveals).toHaveLength(0);
    expect(seat(res.state, 'p0')?.specialCharged).toBe(false);
    expect(applyAction(res.state, { type: 'arcade', playerId: 'p0', ability: 'visao', targetId: 'p1' })).toEqual({
      ok: false,
      error: 'ABILITY_UNAVAILABLE',
    });
  });

  it('Catimba (Carmelo) muda a própria aposta depois das apostas', () => {
    const s = arcadeGame([{ character: 'carmelo', talents: ['escudo'] }, { character: 'martelo', talents: ['escudo'] }]);
    const betting: GameState = betAll(s, { p0: 1, p1: 1 });
    expect(betting.phase).toBe('playing');
    // Antes: só muda em "playing".
    expect(applyAction(s, { type: 'arcade', playerId: 'p0', ability: 'nuossa', bet: 0 })).toEqual({
      ok: false,
      error: 'WRONG_PHASE',
    });
    const res = applyAction(betting, { type: 'arcade', playerId: 'p0', ability: 'nuossa', bet: 0 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.bets['p0']).toBe(0);
    expect(seat(res.state, 'p0')?.specialCharged).toBe(false);
    expect(applyAction(res.state, { type: 'arcade', playerId: 'p0', ability: 'nuossa', bet: 1 })).toEqual({
      ok: false,
      error: 'ABILITY_UNAVAILABLE',
    });
  });

  it('Olheiro (Martelo) espia 1 carta por rodada automaticamente', () => {
    const s = arcadeGame([{ character: 'martelo', talents: ['escudo'] }, { character: 'colombo', talents: ['escudo'] }]);
    const mine = getPlayerView(s, 'p0').arcade;
    expect(mine.reveals).toHaveLength(1);
    expect(mine.reveals[0]!.targetId).toBe('p1');
    expect(getPlayerView(s, 'p1').arcade.reveals).toHaveLength(0);
  });

  it('VAR marca quem não consegue mais bater a aposta (só pro dono)', () => {
    const s = arcadeGame([{ character: 'colombo', talents: ['escudo'] }, { character: 'martelo', talents: ['escudo'] }]);
    const rigged: GameState = {
      ...s,
      phase: 'playing',
      cardsPerPlayer: 3,
      roundOrder: ['p0', 'p1'],
      completedTricks: [s.trick],
      bets: { p0: 1, p1: 2 },
      tricksWon: { p0: 0, p1: 3 },
    };
    expect(gatoAlerts(rigged, 'p0')).toEqual(['p1']);
    // Quem não tem a passiva não vê alerta; o alvo também não.
    expect(gatoAlerts(rigged, 'p1')).toEqual([]);
  });
});

describe('dane-se arcade sabotage', () => {
  const plain = (playerId: string, lettersAfter: number): PlayerRoundResult => ({
    playerId,
    bet: 0,
    tricksWon: 0,
    hitBet: false,
    gainedLetter: false,
    lettersAfter,
    eliminated: false,
  });

  it('Tabelinha (Martelo) troca uma carta com o alvo, só em "playing" e 1×', () => {
    const s = arcadeGame([{ character: 'martelo', talents: ['escudo'] }, { character: 'sarney', talents: ['escudo'] }]);
    const playing = betAll(s, { p0: 1, p1: 1 });
    const before0 = playing.hands['p0']!.map(cardId);
    const before1 = playing.hands['p1']!.map(cardId);

    expect(applyAction(s, { type: 'arcade', playerId: 'p0', ability: 'safadeza', targetId: 'p1' })).toEqual({
      ok: false,
      error: 'WRONG_PHASE',
    });

    const res = applyAction(playing, { type: 'arcade', playerId: 'p0', ability: 'safadeza', targetId: 'p1' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.hands['p0']!.map(cardId)).toEqual(before1);
    expect(res.state.hands['p1']!.map(cardId)).toEqual(before0);
    expect(seat(res.state, 'p0')?.specialCharged).toBe(false);
    expect(applyAction(res.state, { type: 'arcade', playerId: 'p0', ability: 'safadeza', targetId: 'p1' })).toEqual({
      ok: false,
      error: 'ABILITY_UNAVAILABLE',
    });
  });

  it('Invasão de Campo (Babin) zera as apostas e volta pra aposta, 1×', () => {
    const s = arcadeGame([{ character: 'babin', talents: ['escudo'] }, { character: 'sarney', talents: ['escudo'] }]);
    const playing = betAll(s, { p0: 1, p1: 1 });
    expect(playing.phase).toBe('playing');

    const res = applyAction(playing, { type: 'arcade', playerId: 'p0', ability: 'bomba' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.phase).toBe('betting');
    expect(res.state.bets).toEqual({});
    expect(seat(res.state, 'p0')?.specialCharged).toBe(false);
    expect(applyAction(res.state, { type: 'arcade', playerId: 'p0', ability: 'bomba' })).toEqual({
      ok: false,
      error: 'ABILITY_UNAVAILABLE',
    });
  });

  it('Pênalti! (Colombo) pune o alvo se for gato e o acusador se errar', () => {
    const s = arcadeGame([{ character: 'colombo', talents: ['escudo'] }, { character: 'sarney', talents: ['escudo'] }]);
    const playing = betAll(s, { p0: 1, p1: 1 });

    // p1 apostou 2 e já fez 3 vãos: impossível bater → é gato.
    const gato: GameState = {
      ...playing,
      cardsPerPlayer: 3,
      completedTricks: [playing.trick],
      bets: { p0: 1, p1: 2 },
      tricksWon: { p0: 0, p1: 3 },
    };
    const hit = applyAction(gato, { type: 'arcade', playerId: 'p0', ability: 'pegaGato', targetId: 'p1' });
    expect(hit.ok).toBe(true);
    if (!hit.ok) return;
    expect(hit.state.pendingLetters).toEqual({ p1: 1 });

    // Aposta normal ainda dá pra bater → o Colombo leva a letra.
    const wrong = applyAction(playing, { type: 'arcade', playerId: 'p0', ability: 'pegaGato', targetId: 'p1' });
    expect(wrong.ok).toBe(true);
    if (!wrong.ok) return;
    expect(wrong.state.pendingLetters).toEqual({ p0: 1 });
  });

  it('Gol Contra (Babin) reflete o Pênalti! no acusador quando dispara', () => {
    const s = arcadeGame([{ character: 'colombo', talents: ['escudo'] }, { character: 'babin', talents: ['escudo'] }]);
    const playing = betAll(s, { p0: 1, p1: 1 });
    const gato: GameState = {
      ...playing,
      cardsPerPlayer: 3,
      completedTricks: [playing.trick],
      bets: { p0: 1, p1: 2 },
      tricksWon: { p0: 0, p1: 3 },
    };

    let reflected = 0;
    let landed = 0;
    for (let rng = 0; rng < 64; rng++) {
      const res = applyAction({ ...gato, rng }, { type: 'arcade', playerId: 'p0', ability: 'pegaGato', targetId: 'p1' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      if (res.state.pendingLetters['p0'] === 1) reflected++;
      else if (res.state.pendingLetters['p1'] === 1) landed++;
    }
    expect(reflected).toBeGreaterThan(0);
    expect(landed).toBeGreaterThan(0);
  });

  it('Gol Contra (Babin) pode anular a espiada mirada nele', () => {
    const s = arcadeGame([{ character: 'martelo', talents: ['radar'] }, { character: 'babin', talents: ['escudo'] }]);
    const playing = betAll(s, { p0: 1, p1: 1 });
    const baseline = playing.arcadePrivate['p0']?.length ?? 0;

    let wasted = 0;
    let revealed = 0;
    for (let rng = 0; rng < 64; rng++) {
      const res = applyAction({ ...playing, rng }, { type: 'arcade', playerId: 'p0', ability: 'radar', targetId: 'p1' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      // A carga some nos dois casos; quando reflete, nenhuma carta nova é revelada.
      expect(seat(res.state, 'p0')?.charges).toBe(0);
      const gained = (res.state.arcadePrivate['p0']?.length ?? 0) - baseline;
      if (gained === 0) wasted++;
      else revealed++;
    }
    expect(wasted).toBeGreaterThan(0);
    expect(revealed).toBeGreaterThan(0);
  });

  /** Babin perde a 1ª vaza de uma rodada de 3 cartas apostando 1 (não vira gato). */
  function manilhaScenario(deck: GameState['deck']): GameState {
    const s = arcadeGame([{ character: 'babin', talents: ['escudo'] }, { character: 'sarney', talents: ['escudo'] }]);
    return {
      ...s,
      phase: 'playing',
      cardsPerPlayer: 3,
      manilhaRank: 'K',
      vira: { rank: 'Q', suit: 'D' },
      roundOrder: ['p0', 'p1'],
      bets: { p0: 1, p1: 0 },
      tricksWon: { p0: 0, p1: 0 },
      completedTricks: [],
      // O 4D do Babin já foi jogado e perdido; restam 5H e 7C.
      hands: { p0: [{ rank: '5', suit: 'H' }, { rank: '7', suit: 'C' }], p1: [{ rank: 'A', suit: 'D' }] },
      deck,
      trick: { leaderId: 'p0', plays: [{ playerId: 'p0', card: { rank: '4', suit: 'D' } }], result: null },
      turnPlayerId: 'p1',
      manilhaMagicUsed: {},
    };
  }

  it('manilha mágica (Babin) sobe a 2ª maior carta quando ele perde precisando vencer', () => {
    const base = manilhaScenario([{ rank: 'K', suit: 'H' }, { rank: 'K', suit: 'C' }, { rank: '2', suit: 'S' }]);

    let upgraded = 0;
    let normal = 0;
    for (let rng = 0; rng < 64; rng++) {
      const res = applyAction({ ...base, rng }, { type: 'play', playerId: 'p1', cardId: 'AD' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const hand = res.state.hands['p0']!.map(cardId);
      if (hand.includes('KH')) {
        // 5H (2ª maior) virou a manilha de Copas; a 7C continua.
        expect(hand).toEqual(['KH', '7C']);
        expect(res.state.manilhaMagicUsed['p0']).toBe(true);
        upgraded++;
      } else {
        expect(hand).toEqual(['5H', '7C']);
        normal++;
      }
    }
    expect(upgraded).toBeGreaterThan(0);
    expect(normal).toBeGreaterThan(0);
  });

  it('manilha mágica (Babin) não faz nada se a manilha do naipe não está no baralho', () => {
    const base = manilhaScenario([{ rank: 'K', suit: 'C' }, { rank: '2', suit: 'S' }]);

    for (let rng = 0; rng < 64; rng++) {
      const res = applyAction({ ...base, rng }, { type: 'play', playerId: 'p1', cardId: 'AD' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.state.hands['p0']!.map(cardId)).toEqual(['5H', '7C']);
      expect(res.state.manilhaMagicUsed['p0']).toBeUndefined();
    }
  });

  it('Carrinho (Sarney) dá um escudo, 1×', () => {
    const s = arcadeGame([{ character: 'sarney', talents: ['escudo'] }, { character: 'colombo', talents: ['escudo'] }]);
    const res = applyAction(s, { type: 'arcade', playerId: 'p0', ability: 'esquentar' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Já tinha o escudo do talento; agora são dois.
    expect(seat(res.state, 'p0')?.shields).toBe(2);
    expect(seat(res.state, 'p0')?.specialCharged).toBe(false);
    expect(applyAction(res.state, { type: 'arcade', playerId: 'p0', ability: 'esquentar' })).toEqual({
      ok: false,
      error: 'ABILITY_UNAVAILABLE',
    });
  });

  it('letras de acusação entram no fim da rodada, passando por escudo e fôlego', () => {
    const match = createArcadeMatchState([
      { id: 'a', loadout: { character: 'colombo', talents: ['escudo'] } },
      { id: 'b', loadout: { character: 'sarney', talents: ['radar'] } },
    ]);
    const out = applyArcadeLetters(match, 6, [plain('a', 0), plain('b', 0)], { a: 1, b: 1 });
    const byId = (id: string) => out.results.find((r) => r.playerId === id)!;
    // O escudo do 'a' anula a letra; o 'b' leva a dele.
    expect(byId('a').lettersAfter).toBe(0);
    expect(byId('a').eliminated).toBe(false);
    expect(byId('b').lettersAfter).toBe(1);
  });
});
