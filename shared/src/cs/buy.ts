import { RESERVE_MAGS, type World } from './sim.js';
import { WEAPONS, type WeaponId } from './weapons.js';

export function canBuy(world: World, playerId: string, weaponId: WeaponId): boolean {
  if (world.phase !== 'buy') return false;
  const weapon = WEAPONS[weaponId];
  const player = world.players.find((p) => p.id === playerId);
  return !!weapon && !!player && player.alive && player.money >= weapon.price;
}

/** Devolve o mesmo `world` quando a compra é recusada. */
export function buyWeapon(world: World, playerId: string, weaponId: WeaponId): World {
  if (!canBuy(world, playerId, weaponId)) return world;
  const weapon = WEAPONS[weaponId];
  return {
    ...world,
    players: world.players.map((p) =>
      p.id === playerId
        ? {
            ...p,
            weapon: weaponId,
            money: p.money - weapon.price,
            ammo: weapon.magSize,
            reserve: weapon.magSize * RESERVE_MAGS,
            reloadLeftMs: 0,
            cooldownMs: 0,
            shots: 0,
          }
        : p,
    ),
  };
}
