import { describe, expect, it } from 'vitest';
import { BUYABLE, STARTER_WEAPON, WEAPONS, damageFor, type WeaponId } from '../../src/cs/weapons.js';

describe('damageFor', () => {
  it('does not one-shot the starter pistol to the head', () => {
    expect(damageFor(WEAPONS.chinelo, 'head')).toBe(88);
  });

  it('kills with a headshot from every other weapon', () => {
    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      if (id === 'chinelo') continue;
      expect(damageFor(WEAPONS[id], 'head'), id).toBeGreaterThanOrEqual(100);
    }
  });

  it('kills with one sniper body shot', () => {
    expect(damageFor(WEAPONS.escanteio, 'body')).toBeGreaterThanOrEqual(100);
  });

  it('reduces leg damage to 75%, rounded down', () => {
    expect(damageFor(WEAPONS.tabelinha, 'legs')).toBe(22);
  });
});

describe('catalog', () => {
  it('keys match ids', () => {
    for (const [key, w] of Object.entries(WEAPONS)) expect(w.id).toBe(key);
  });

  it('has a free starter that is not buyable', () => {
    expect(WEAPONS[STARTER_WEAPON].price).toBe(0);
    expect(BUYABLE).not.toContain(STARTER_WEAPON);
  });

  it('covers the four categories', () => {
    const categories = new Set(Object.values(WEAPONS).map((w) => w.category));
    expect(categories).toEqual(new Set(['pistol', 'smg', 'rifle', 'sniper']));
  });
});
