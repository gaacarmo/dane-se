import { describe, expect, it } from 'vitest';
import { buyWeapon, canBuy } from '../../src/cs/buy.js';
import { WEAPONS, type WeaponId } from '../../src/cs/weapons.js';
import { kill, makeWorld, patchPlayer, player, skipBuy } from './helpers.js';

describe('buyWeapon', () => {
  it('charges the price and swaps the weapon with a full magazine', () => {
    const world = patchPlayer(makeWorld(), 'a1', { money: 3000 });
    const bought = buyWeapon(world, 'a1', 'tabelinha');
    const p = player(bought, 'a1');
    expect(p.weapon).toBe('tabelinha');
    expect(p.money).toBe(300);
    expect(p.ammo).toBe(WEAPONS.tabelinha.magSize);
    expect(p.reserve).toBe(WEAPONS.tabelinha.magSize * 2);
  });

  it('refuses when the player cannot afford it, leaving everything intact', () => {
    const world = patchPlayer(makeWorld(), 'a1', { money: 2699 });
    expect(canBuy(world, 'a1', 'tabelinha')).toBe(false);
    expect(buyWeapon(world, 'a1', 'tabelinha')).toBe(world);
  });

  it('refuses outside the buy phase', () => {
    const world = patchPlayer(skipBuy(makeWorld()), 'a1', { money: 9000 });
    expect(canBuy(world, 'a1', 'tabelinha')).toBe(false);
    expect(buyWeapon(world, 'a1', 'tabelinha')).toBe(world);
  });

  it('refuses for a dead player', () => {
    const world = kill(patchPlayer(makeWorld(), 'a1', { money: 9000 }), 'a1');
    expect(canBuy(world, 'a1', 'tabelinha')).toBe(false);
  });

  it('refuses an unknown weapon or player', () => {
    const world = patchPlayer(makeWorld(), 'a1', { money: 9000 });
    expect(canBuy(world, 'a1', 'xyz' as WeaponId)).toBe(false);
    expect(canBuy(world, 'ghost', 'tabelinha')).toBe(false);
    expect(buyWeapon(world, 'ghost', 'tabelinha')).toBe(world);
  });

  it('lets a player take the free starter again', () => {
    const world = patchPlayer(makeWorld(), 'a1', { money: 0, weapon: 'tamanco' });
    const bought = buyWeapon(world, 'a1', 'chinelo');
    expect(player(bought, 'a1').weapon).toBe('chinelo');
    expect(player(bought, 'a1').money).toBe(0);
  });
});
