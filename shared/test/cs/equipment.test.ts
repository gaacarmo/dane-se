import { describe, expect, it } from 'vitest';
import { buyEquipment, canBuyEquipment } from '../../src/cs/buy.js';
import { absorbDamage, equipmentPrice, EQUIPMENT, MAX_ARMOR } from '../../src/cs/equipment.js';
import { DEFUSE_KIT_MS, DEFUSE_MS } from '../../src/cs/sim.js';
import { aimInput, duel, input, makeWorld, patchPlayer, plantedWorld, player, run, teleport } from './helpers.js';

const STEP = 10;

describe('equipment prices', () => {
  const helmetPrice = EQUIPMENT.kevlar_helmet.price - EQUIPMENT.kevlar.price;

  it('charges only for what is missing when buying vest and helmet', () => {
    expect(equipmentPrice({ armor: 0, helmet: false }, 'kevlar')).toBe(EQUIPMENT.kevlar.price);
    expect(equipmentPrice({ armor: 0, helmet: false }, 'kevlar_helmet')).toBe(EQUIPMENT.kevlar_helmet.price);
    expect(equipmentPrice({ armor: MAX_ARMOR, helmet: false }, 'kevlar_helmet')).toBe(helmetPrice);
    expect(equipmentPrice({ armor: 52, helmet: true }, 'kevlar_helmet')).toBe(EQUIPMENT.kevlar.price);
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

  it('does not charge for a helmet already worn when only the vest is worn down', () => {
    const p = player(buyEquipment(rich({ armor: 52, helmet: true }), 'a1', 'kevlar_helmet'), 'a1');
    expect(p).toMatchObject({ armor: MAX_ARMOR, helmet: true, money: 3000 - EQUIPMENT.kevlar.price });
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

  it('lets a rifle take about a fifth off a body hit and wears the vest down', () => {
    expect(absorbDamage(30, 'body', worn(100, false), 'rifle')).toEqual({ hp: 23, armor: 96 });
  });

  it('protects more against pistols and submachine guns than against rifles and snipers', () => {
    const hp = (category: 'pistol' | 'smg' | 'rifle' | 'sniper') => absorbDamage(100, 'body', worn(100, false), category).hp;
    expect(hp('pistol')).toBeLessThan(hp('smg'));
    expect(hp('smg')).toBeLessThan(hp('rifle'));
    expect(hp('rifle')).toBeLessThan(hp('sniper'));
  });

  it('does not protect the head without a helmet, nor the legs ever', () => {
    expect(absorbDamage(120, 'head', worn(100, false), 'rifle')).toEqual({ hp: 120, armor: 100 });
    expect(absorbDamage(22, 'legs', worn(100, true), 'rifle')).toEqual({ hp: 22, armor: 100 });
  });

  it('takes a headshot down with a helmet', () => {
    expect(absorbDamage(120, 'head', worn(100, true), 'rifle')).toEqual({ hp: 93, armor: 86 });
  });

  it('lets the rest through once the vest runs out, and does nothing with no vest', () => {
    expect(absorbDamage(30, 'body', worn(3, false), 'rifle')).toEqual({ hp: 24, armor: 0 });
    expect(absorbDamage(30, 'body', worn(0, true), 'rifle')).toEqual({ hp: 30, armor: 0 });
  });
});

describe('armor in combat', () => {
  it('takes a rifle body shot down a little and wears the vest', () => {
    const world = patchPlayer(duel(), 'b1', { armor: 100, helmet: true });
    const result = run(world, { a1: aimInput(world, 'a1', 'b1', 'body', { fire: true }) }, STEP, STEP);
    expect(player(result.world, 'b1')).toMatchObject({ hp: 77, armor: 96 });
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'hit', victim: 'b1', zone: 'body', damage: 23 }));
  });

  it('survives a rifle headshot with a helmet but not without', () => {
    const geared = patchPlayer(duel(), 'b1', { armor: 100, helmet: true });
    const withHelmet = run(geared, { a1: aimInput(geared, 'a1', 'b1', 'head', { fire: true }) }, STEP, STEP);
    expect(player(withHelmet.world, 'b1')).toMatchObject({ alive: true, hp: 7 });
    const vestOnly = patchPlayer(duel(), 'b1', { armor: 100, helmet: false });
    const without = run(vestOnly, { a1: aimInput(vestOnly, 'a1', 'b1', 'head', { fire: true }) }, STEP, STEP);
    expect(player(without.world, 'b1').alive).toBe(false);
  });

  it('still kills with one headshot of the strong rifle through a helmet', () => {
    const world = patchPlayer(duel(undefined, 'cartao_vermelho'), 'b1', { armor: 100, helmet: true });
    const result = run(world, { a1: aimInput(world, 'a1', 'b1', 'head', { fire: true }) }, STEP, STEP);
    expect(player(result.world, 'b1').alive).toBe(false);
  });

  it('still kills with one sniper body shot through a full vest', () => {
    const world = patchPlayer(duel(undefined, 'escanteio'), 'b1', { armor: 100, helmet: true });
    const result = run(world, { a1: aimInput(world, 'a1', 'b1', 'body', { fire: true }) }, STEP, STEP);
    expect(player(result.world, 'b1').alive).toBe(false);
  });

  it('loses the helmet together with the last of the vest', () => {
    const world = patchPlayer(duel(), 'b1', { armor: 3, helmet: true });
    const result = run(world, { a1: aimInput(world, 'a1', 'b1', 'body', { fire: true }) }, STEP, STEP);
    expect(player(result.world, 'b1')).toMatchObject({ armor: 0, helmet: false });
  });
});

describe('defuse kit', () => {
  const nearBomb = (world: ReturnType<typeof plantedWorld>, id: string, dx: number) =>
    teleport(world, id, world.bomb.pos!.x + dx, world.bomb.pos!.z);

  it('defuses in half the time', () => {
    const world = patchPlayer(nearBomb(plantedWorld(), 'b1', 0.5), 'b1', { kit: true });
    expect(run(world, { b1: input({ use: true }) }, DEFUSE_KIT_MS + 100).world.bomb.status).toBe('defused');
  });

  it('does not help a defender without it', () => {
    const world = nearBomb(plantedWorld(), 'b1', 0.5);
    expect(DEFUSE_KIT_MS).toBeLessThan(DEFUSE_MS);
    expect(run(world, { b1: input({ use: true }) }, DEFUSE_KIT_MS + 100).world.bomb.status).toBe('planted');
  });

  it('keeps the progress of the defender already at the bomb when a teammate joins', () => {
    let world = nearBomb(nearBomb(plantedWorld(), 'b1', 0.5), 'b2', -0.5);
    world = run(world, { b2: input({ use: true }) }, 2000).world;
    expect(world.bomb.progress?.who).toBe('b2');
    const both = run(world, { b1: input({ use: true }), b2: input({ use: true }) }, DEFUSE_MS - 2000 + 100).world;
    expect(both.bomb.status).toBe('defused');
  });

  it('lets the defender with the kit take it when two start together', () => {
    const world = patchPlayer(nearBomb(nearBomb(plantedWorld(), 'b1', 0.5), 'b2', -0.5), 'b2', { kit: true });
    const result = run(world, { b1: input({ use: true }), b2: input({ use: true }) }, DEFUSE_KIT_MS + 100).world;
    expect(result.bomb.status).toBe('defused');
  });
});
