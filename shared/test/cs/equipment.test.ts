import { describe, expect, it } from 'vitest';
import { buyEquipment, canBuyEquipment } from '../../src/cs/buy.js';
import { absorbDamage, equipmentPrice, EQUIPMENT, MAX_ARMOR } from '../../src/cs/equipment.js';
import { DEFUSE_KIT_MS, DEFUSE_MS } from '../../src/cs/sim.js';
import { aimInput, duel, input, makeWorld, patchPlayer, plantedWorld, player, run, teleport } from './helpers.js';

const STEP = 10;

describe('equipment prices', () => {
  it('charges only the helmet when the vest is already full', () => {
    const bare = { armor: 0, helmet: false };
    expect(equipmentPrice(bare, 'kevlar')).toBe(EQUIPMENT.kevlar.price);
    expect(equipmentPrice(bare, 'kevlar_helmet')).toBe(EQUIPMENT.kevlar_helmet.price);
    expect(equipmentPrice({ armor: MAX_ARMOR, helmet: false }, 'kevlar_helmet')).toBe(EQUIPMENT.kevlar_helmet.price - EQUIPMENT.kevlar.price);
  });
});

describe('buyEquipment', () => {
  const rich = (patch = {}) => patchPlayer(makeWorld(), 'a1', { money: 3000, ...patch });

  it('puts on a vest and charges for it, keeping a helmet already worn', () => {
    const p = player(buyEquipment(rich({ armor: 40, helmet: true }), 'a1', 'kevlar'), 'a1');
    expect(p.armor).toBe(MAX_ARMOR);
    expect(p.helmet).toBe(true);
    expect(p.money).toBe(3000 - EQUIPMENT.kevlar.price);
  });

  it('puts on vest and helmet together', () => {
    const p = player(buyEquipment(rich(), 'a1', 'kevlar_helmet'), 'a1');
    expect(p).toMatchObject({ armor: MAX_ARMOR, helmet: true, money: 3000 - EQUIPMENT.kevlar_helmet.price });
  });

  it('sells the helmet alone for the difference', () => {
    const p = player(buyEquipment(rich({ armor: MAX_ARMOR }), 'a1', 'kevlar_helmet'), 'a1');
    expect(p.helmet).toBe(true);
    expect(p.money).toBe(3000 - (EQUIPMENT.kevlar_helmet.price - EQUIPMENT.kevlar.price));
  });

  it('refuses what is already worn, what costs too much and anything outside the buy phase', () => {
    const full = rich({ armor: MAX_ARMOR, helmet: true });
    expect(canBuyEquipment(full, 'a1', 'kevlar')).toBe(false);
    expect(canBuyEquipment(full, 'a1', 'kevlar_helmet')).toBe(false);
    expect(buyEquipment(full, 'a1', 'kevlar')).toBe(full);
    const poor = patchPlayer(makeWorld(), 'a1', { money: EQUIPMENT.kevlar.price - 1 });
    expect(canBuyEquipment(poor, 'a1', 'kevlar')).toBe(false);
    expect(canBuyEquipment({ ...rich(), phase: 'live' }, 'a1', 'kevlar')).toBe(false);
  });

  it('sells the defuse kit to defenders only, once', () => {
    const defender = patchPlayer(makeWorld(), 'b1', { money: 1000 });
    expect(player(defender, 'b1').side).toBe('defense');
    const bought = buyEquipment(defender, 'b1', 'kit');
    expect(player(bought, 'b1')).toMatchObject({ kit: true, money: 1000 - EQUIPMENT.kit.price });
    expect(canBuyEquipment(bought, 'b1', 'kit')).toBe(false);
    expect(canBuyEquipment(patchPlayer(makeWorld(), 'a1', { money: 1000 }), 'a1', 'kit')).toBe(false);
  });
});

describe('absorbDamage', () => {
  const worn = (armor: number, helmet: boolean) => ({ armor, helmet });

  it('halves a body hit and wears the vest down', () => {
    expect(absorbDamage(30, 'body', worn(100, false))).toEqual({ hp: 15, armor: 92 });
  });

  it('does not protect the head without a helmet, nor the legs ever', () => {
    expect(absorbDamage(120, 'head', worn(100, false))).toEqual({ hp: 120, armor: 100 });
    expect(absorbDamage(22, 'legs', worn(100, true))).toEqual({ hp: 22, armor: 100 });
  });

  it('halves a headshot with a helmet', () => {
    expect(absorbDamage(120, 'head', worn(100, true))).toEqual({ hp: 60, armor: 70 });
  });

  it('lets the rest through once the vest runs out, and does nothing with no vest', () => {
    expect(absorbDamage(30, 'body', worn(3, false))).toEqual({ hp: 24, armor: 0 });
    expect(absorbDamage(30, 'body', worn(0, true))).toEqual({ hp: 30, armor: 0 });
  });
});

describe('armor in combat', () => {
  it('takes half of a rifle body shot off the health and the rest off the vest', () => {
    const world = patchPlayer(duel(), 'b1', { armor: 100, helmet: true });
    const result = run(world, { a1: aimInput(world, 'a1', 'b1', 'body', { fire: true }) }, STEP, STEP);
    expect(player(result.world, 'b1')).toMatchObject({ hp: 85, armor: 92 });
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'hit', victim: 'b1', zone: 'body', damage: 15 }));
  });

  it('survives a rifle headshot with a helmet but not without', () => {
    const geared = patchPlayer(duel(), 'b1', { armor: 100, helmet: true });
    const withHelmet = run(geared, { a1: aimInput(geared, 'a1', 'b1', 'head', { fire: true }) }, STEP, STEP);
    expect(player(withHelmet.world, 'b1')).toMatchObject({ alive: true, hp: 40 });
    const vestOnly = patchPlayer(duel(), 'b1', { armor: 100, helmet: false });
    const without = run(vestOnly, { a1: aimInput(vestOnly, 'a1', 'b1', 'head', { fire: true }) }, STEP, STEP);
    expect(player(without.world, 'b1').alive).toBe(false);
  });
});

describe('defuse kit', () => {
  it('defuses in half the time', () => {
    let world = plantedWorld();
    world = teleport(patchPlayer(world, 'b1', { kit: true }), 'b1', world.bomb.pos!.x + 0.5, world.bomb.pos!.z);
    expect(run(world, { b1: input({ use: true }) }, DEFUSE_KIT_MS + 100).world.bomb.status).toBe('defused');
    expect(DEFUSE_KIT_MS).toBeLessThan(DEFUSE_MS);
  });

  it('does not help a defender without it', () => {
    let world = plantedWorld();
    world = teleport(world, 'b1', world.bomb.pos!.x + 0.5, world.bomb.pos!.z);
    expect(run(world, { b1: input({ use: true }) }, DEFUSE_KIT_MS + 100).world.bomb.status).toBe('planted');
  });
});
