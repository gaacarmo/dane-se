import { describe, expect, it } from 'vitest';
import {
  ARCADE_TUNING,
  CHARACTER_IDS,
  CHARACTER_KITS,
  COMMON_TALENT_IDS,
  COMMON_TALENTS,
  type PlayerRoundResult,
  absorbHit,
  applyArcadeLetters,
  arcadeSeat,
  backfireChance,
  canRevive,
  createArcadeMatchState,
  createGame,
  eliminationThreshold,
  getPlayerView,
  isCommonTalentId,
  isSpecialCharged,
  parseLoadout,
  spendRevive,
  spendSpecial,
  talentsFor,
} from '../src/index.js';
import { act, autoPlayRound } from './helpers.js';

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
    expect(parseLoadout('martelo', 'radar')).toEqual({ character: 'martelo', talent: 'radar' });
    expect(parseLoadout('martelo', 'invisivel')).toBeNull();
    expect(parseLoadout('ninguem', 'radar')).toBeNull();
    expect(parseLoadout(null, 'radar')).toBeNull();
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
    { id: 'p1', loadout: { character: 'sarney', talent: 'escudo' } as const },
    { id: 'p2', loadout: { character: 'dezin', talent: 'radar' } as const },
  ];

  it('monta as cadeiras a partir dos loadouts', () => {
    const match = createArcadeMatchState(seats);
    expect(match.enabled).toBe(true);
    expect(match.seats.map((s) => s.id)).toEqual(['p1', 'p2']);
    expect(arcadeSeat(match, 'p1')?.character).toBe('sarney');
    expect(arcadeSeat(match, 'p2')?.talent).toBe('radar');
    expect(arcadeSeat(match, 'p3')).toBeUndefined();
  });

  it('aplica os defaults de talento e passiva', () => {
    const match = createArcadeMatchState(seats);
    // Escudo começa carregado; Sarney tem +2 letras de fôlego.
    expect(arcadeSeat(match, 'p1')?.shields).toBe(1);
    expect(arcadeSeat(match, 'p1')?.eliminationBuffer).toBe(ARCADE_TUNING.esquentaLetterBuffer);
    // Radar começa com 1 carga; Dezin volta da morte 1 vez.
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
    { id: 'esc', loadout: { character: 'colombo', talent: 'escudo' } },
    { id: 'rad', loadout: { character: 'colombo', talent: 'radar' } },
    { id: 'babin', loadout: { character: 'babin', talent: 'curinga' } },
    { id: 'sarney', loadout: { character: 'sarney', talent: 'radar' } },
    { id: 'dezin', loadout: { character: 'dezin', talent: 'radar' } },
    { id: 'martelo', loadout: { character: 'martelo', talent: 'radar' } },
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

  it('o Esquenta soma +2 ao limiar de eliminação', () => {
    expect(eliminationThreshold(match, 'sarney', 6)).toBe(6 + ARCADE_TUNING.esquentaLetterBuffer);
    expect(eliminationThreshold(match, 'martelo', 6)).toBe(6);
  });

  it('o Zumbi ressuscita uma vez', () => {
    expect(canRevive(match, 'dezin')).toBe(true);
    const used = spendRevive(match, 'dezin');
    expect(canRevive(used, 'dezin')).toBe(false);
    expect(spendRevive(used, 'dezin')).toBe(used);
    expect(canRevive(match, 'martelo')).toBe(false);
  });

  it('a Encrenca dá chance de backfire só pro Babin', () => {
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

  it('o Escudo anula a letra e some', () => {
    const seat = { id: 'a', loadout: { character: 'colombo', talent: 'escudo' } as const };
    const out = applyArcadeLetters(createArcadeMatchState([seat]), 6, [r('a', 1)]);
    expect(out.results[0]).toMatchObject({ gainedLetter: false, lettersAfter: 0, eliminated: false });
    expect(arcadeSeat(out.arcade, 'a')?.shields).toBe(0);
    // Na letra seguinte o escudo já foi: cai normalmente.
    const again = applyArcadeLetters(out.arcade, 6, [r('a', 1)]);
    expect(again.results[0]).toMatchObject({ gainedLetter: true, lettersAfter: 1 });
  });

  it('o Esquenta só cai na 8ª letra', () => {
    const seat = { id: 's', loadout: { character: 'sarney', talent: 'radar' } as const };
    const match = createArcadeMatchState([seat]);
    expect(applyArcadeLetters(match, 6, [r('s', 7)]).results[0]).toMatchObject({ lettersAfter: 7, eliminated: false });
    const on8 = applyArcadeLetters(match, 6, [r('s', 8)]);
    expect(on8.results[0]).toMatchObject({ lettersAfter: 8, eliminated: true });
    expect(on8.eliminatedIds).toEqual(['s']);
  });

  it('o Zumbi salva da primeira morte e volta 1 letra abaixo do letal', () => {
    const seat = { id: 'z', loadout: { character: 'dezin', talent: 'radar' } as const };
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
        { id: 'a', name: 'A', arcade: { character: 'sarney', talent: 'escudo' } },
        { id: 'b', name: 'B', arcade: { character: 'dezin', talent: 'radar' } },
      ],
      1,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.arcade.enabled).toBe(true);
    expect(result.state.arcade.seats).toHaveLength(2);

    const viewA = getPlayerView(result.state, 'a');
    expect(viewA.arcade).toEqual({ enabled: true, loadout: { character: 'sarney', talent: 'escudo' } });
    expect(viewA.players.every((p) => p.specialCharged)).toBe(true);

    // Espectador não recebe kit nenhum, mas continua vendo a aura.
    const spec = getPlayerView(result.state, null);
    expect(spec.arcade.loadout).toBeNull();
    expect(spec.players.every((p) => p.specialCharged)).toBe(true);
  });

  it('jogo arcade completo termina sem travar', () => {
    const result = createGame(
      [
        { id: 'a', name: 'A', arcade: { character: 'sarney', talent: 'escudo' } },
        { id: 'b', name: 'B', arcade: { character: 'dezin', talent: 'radar' } },
        { id: 'c', name: 'C', arcade: { character: 'babin', talent: 'curinga' } },
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
