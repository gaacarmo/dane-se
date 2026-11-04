import { EQUIPMENT, MAX_ARMOR, equipmentPrice, isEquipment, type EquipmentId } from './equipment.js';
import { RESERVE_MAGS, type Holstered, type SimPlayer, type World } from './sim.js';
import { WEAPONS, slotOf, type WeaponId } from './weapons.js';

/** Tudo o que o mercado vende. */
export type BuyItem = WeaponId | EquipmentId;

export function isBuyItem(id: string): id is BuyItem {
  return isEquipment(id) || Object.hasOwn(WEAPONS, id);
}

function owns(player: SimPlayer, weaponId: WeaponId): boolean {
  return player.weapon === weaponId || player.holstered?.weapon === weaponId;
}

/** Trocar por uma arma do mesmo slot que não seja mais cara é rebaixar: a compra é recusada. */
function isDowngrade(player: SimPlayer, weaponId: WeaponId): boolean {
  const held = [player.weapon, player.holstered?.weapon].find((w): w is WeaponId => !!w && slotOf(w) === slotOf(weaponId));
  return !!held && WEAPONS[held].price >= WEAPONS[weaponId].price;
}

export function canBuy(world: World, playerId: string, weaponId: WeaponId): boolean {
  if (world.phase !== 'buy') return false;
  const weapon = WEAPONS[weaponId];
  const player = world.players.find((p) => p.id === playerId);
  return !!weapon && !!player && player.alive && player.money >= weapon.price && !owns(player, weaponId) && !isDowngrade(player, weaponId);
}

/** Devolve o mesmo `world` quando a compra é recusada. */
export function buyWeapon(world: World, playerId: string, weaponId: WeaponId): World {
  if (!canBuy(world, playerId, weaponId)) return world;
  const weapon = WEAPONS[weaponId];
  const fresh: Holstered = { weapon: weaponId, ammo: weapon.magSize, reserve: weapon.magSize * RESERVE_MAGS };
  return {
    ...world,
    players: world.players.map((p) => (p.id === playerId ? equipBought(p, fresh, weapon.price) : p)),
  };
}

/** A principal vai para o slot 1 e fica na mão; a pistola vai para o slot 2 e só fica na mão se já era a da mão. */
function equipBought(p: SimPlayer, fresh: Holstered, price: number): SimPlayer {
  const slots: Record<1 | 2, Holstered | null> = { 1: null, 2: null };
  slots[slotOf(p.weapon)] = { weapon: p.weapon, ammo: p.ammo, reserve: p.reserve };
  if (p.holstered) slots[slotOf(p.holstered.weapon)] = p.holstered;

  const boughtSlot = slotOf(fresh.weapon);
  const activeSlot = boughtSlot === 1 ? 1 : slotOf(p.weapon);
  slots[boughtSlot] = fresh;
  const active = slots[activeSlot]!;

  return {
    ...p,
    money: p.money - price,
    weapon: active.weapon,
    ammo: active.ammo,
    reserve: active.reserve,
    holstered: slots[activeSlot === 1 ? 2 : 1],
    reloadLeftMs: 0,
    cooldownMs: 0,
    equipLeftMs: 0,
    shots: 0,
  };
}

function missing(player: SimPlayer, id: EquipmentId): boolean {
  switch (id) {
    case 'kevlar':
      return player.armor < MAX_ARMOR;
    case 'kevlar_helmet':
      return player.armor < MAX_ARMOR || !player.helmet;
    case 'kit':
      return !player.kit;
  }
}

export function canBuyEquipment(world: World, playerId: string, id: EquipmentId): boolean {
  if (world.phase !== 'buy') return false;
  const item = EQUIPMENT[id];
  const player = world.players.find((p) => p.id === playerId);
  if (!item || !player?.alive) return false;
  if (item.side && player.side !== item.side) return false;
  return player.money >= equipmentPrice(player, id) && missing(player, id);
}

/** Devolve o mesmo `world` quando a compra é recusada. */
export function buyEquipment(world: World, playerId: string, id: EquipmentId): World {
  if (!canBuyEquipment(world, playerId, id)) return world;
  return {
    ...world,
    players: world.players.map((p) => {
      if (p.id !== playerId) return p;
      const paid = { money: p.money - equipmentPrice(p, id) };
      if (id === 'kit') return { ...p, ...paid, kit: true };
      return { ...p, ...paid, armor: MAX_ARMOR, helmet: id === 'kevlar_helmet' ? true : p.helmet };
    }),
  };
}
