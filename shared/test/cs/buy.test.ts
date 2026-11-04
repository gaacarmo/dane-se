import { describe, expect, it } from 'vitest';
import { buyWeapon, canBuy } from '../../src/cs/buy.js';
import { WEAPONS, type WeaponId } from '../../src/cs/weapons.js';
import { kill, makeWorld, patchPlayer, player, skipBuy } from './helpers.js';

describe('buyWeapon', () => {
  it('charges the price and keeps the pistol holstered when a primary is bought', () => {
    const world = patchPlayer(makeWorld(), 'a1', { money: 3000 });
    const bought = buyWeapon(world, 'a1', 'tabelinha');
    const p = player(bought, 'a1');
    expect(p.weapon).toBe('tabelinha');
    expect(p.holstered?.weapon).toBe('chinelo');
    expect(p.money).toBe(300);
    expect(p.ammo).toBe(WEAPONS.tabelinha.magSize);
    expect(p.reserve).toBe(WEAPONS.tabelinha.magSize * 2);
  });

  it('replaces only the holstered pistol when a pistol is bought with a primary in hand', () => {
    let world = patchPlayer(makeWorld(), 'a1', { money: 1000 });
    world = buyWeapon(patchPlayer(world, 'a1', { money: 3000 }), 'a1', 'tabelinha');
    const bought = buyWeapon(patchPlayer(world, 'a1', { money: 1000 }), 'a1', 'tamanco');
    const p = player(bought, 'a1');
    expect(p.weapon).toBe('tabelinha');
    expect(p.holstered).toEqual({ weapon: 'tamanco', ammo: WEAPONS.tamanco.magSize, reserve: WEAPONS.tamanco.magSize * 2 });
    expect(p.money).toBe(500);
  });

  it('replaces the primary wherever it is, and equips it', () => {
    const world = patchPlayer(makeWorld(), 'a1', {
      money: 3100,
      weapon: 'chinelo',
      holstered: { weapon: 'tabelinha', ammo: 3, reserve: 3 },
    });
    const p = player(buyWeapon(world, 'a1', 'cartao_vermelho'), 'a1');
    expect(p.weapon).toBe('cartao_vermelho');
    expect(p.holstered?.weapon).toBe('chinelo');
  });

  it('replaces the active pistol when no primary is held', () => {
    const p = player(buyWeapon(patchPlayer(makeWorld(), 'a1', { money: 800 }), 'a1', 'tamanco'), 'a1');
    expect(p.weapon).toBe('tamanco');
    expect(p.holstered).toBeNull();
    expect(p.money).toBe(300);
  });

  it('refuses a weapon the player already has, in hand or holstered', () => {
    const world = patchPlayer(makeWorld(), 'a1', {
      money: 9000,
      weapon: 'tabelinha',
      holstered: { weapon: 'chinelo', ammo: 12, reserve: 24 },
    });
    expect(canBuy(world, 'a1', 'tabelinha')).toBe(false);
    expect(canBuy(world, 'a1', 'chinelo')).toBe(false);
    expect(buyWeapon(world, 'a1', 'tabelinha')).toBe(world);
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

  it('refuses a downgrade in the same slot, so the free starter never overwrites a bought pistol', () => {
    const world = patchPlayer(makeWorld(), 'a1', { money: 0, weapon: 'tamanco' });
    expect(canBuy(world, 'a1', 'chinelo')).toBe(false);
    expect(buyWeapon(world, 'a1', 'chinelo')).toBe(world);
  });

  it('refuses a cheaper primary over a better one, wherever the better one is', () => {
    const inHand = patchPlayer(makeWorld(), 'a1', { money: 9000, weapon: 'cartao_vermelho' });
    expect(canBuy(inHand, 'a1', 'tabelinha')).toBe(false);
    expect(canBuy(inHand, 'a1', 'garcom')).toBe(false);
    const holstered = patchPlayer(makeWorld(), 'a1', {
      money: 9000,
      weapon: 'chinelo',
      holstered: { weapon: 'cartao_vermelho', ammo: 30, reserve: 60 },
    });
    expect(canBuy(holstered, 'a1', 'tabelinha')).toBe(false);
  });

  it('still allows an upgrade in the same slot', () => {
    const world = patchPlayer(makeWorld(), 'a1', { money: 9000, weapon: 'tabelinha' });
    expect(canBuy(world, 'a1', 'cartao_vermelho')).toBe(true);
    expect(canBuy(patchPlayer(makeWorld(), 'a1', { money: 9000 }), 'a1', 'tamanco')).toBe(true);
  });
});
