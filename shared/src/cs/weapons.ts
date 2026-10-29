export type WeaponCategory = 'pistol' | 'smg' | 'rifle' | 'sniper';
export type HitZone = 'head' | 'body' | 'legs';
export type WeaponId = 'chinelo' | 'tamanco' | 'garcom' | 'tabelinha' | 'cartao_vermelho' | 'escanteio';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  category: WeaponCategory;
  price: number;
  damage: number;
  fireIntervalMs: number;
  /** Tempo sem poder atirar depois de sacar a arma. */
  equipMs: number;
  magSize: number;
  reloadMs: number;
  /** Espalhamento em graus: parado, somado ao andar, somado por tiro em rajada e teto. */
  spreadBase: number;
  spreadMove: number;
  spreadPerShot: number;
  spreadMax: number;
  moveSpeedMult: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  chinelo: {
    id: 'chinelo', name: 'Chinelo', category: 'pistol', price: 0, damage: 22, fireIntervalMs: 150, equipMs: 300,
    magSize: 12, reloadMs: 1800, spreadBase: 0.4, spreadMove: 2.5, spreadPerShot: 0.5, spreadMax: 4, moveSpeedMult: 1,
  },
  tamanco: {
    id: 'tamanco', name: 'Tamanco', category: 'pistol', price: 500, damage: 34, fireIntervalMs: 220, equipMs: 300,
    magSize: 8, reloadMs: 2000, spreadBase: 0.3, spreadMove: 2.8, spreadPerShot: 0.7, spreadMax: 4, moveSpeedMult: 1,
  },
  garcom: {
    id: 'garcom', name: 'Garçom', category: 'smg', price: 1200, damage: 25, fireIntervalMs: 70, equipMs: 400,
    magSize: 30, reloadMs: 2200, spreadBase: 0.8, spreadMove: 1.8, spreadPerShot: 0.35, spreadMax: 5, moveSpeedMult: 1,
  },
  tabelinha: {
    id: 'tabelinha', name: 'Tabelinha', category: 'rifle', price: 2700, damage: 30, fireIntervalMs: 100, equipMs: 500,
    magSize: 30, reloadMs: 2500, spreadBase: 0.3, spreadMove: 3.5, spreadPerShot: 0.4, spreadMax: 5, moveSpeedMult: 0.9,
  },
  cartao_vermelho: {
    id: 'cartao_vermelho', name: 'Cartão Vermelho', category: 'rifle', price: 3100, damage: 33, fireIntervalMs: 90, equipMs: 500,
    magSize: 30, reloadMs: 2500, spreadBase: 0.25, spreadMove: 3.5, spreadPerShot: 0.4, spreadMax: 5, moveSpeedMult: 0.9,
  },
  escanteio: {
    id: 'escanteio', name: 'Escanteio', category: 'sniper', price: 4750, damage: 115, fireIntervalMs: 1400, equipMs: 750,
    magSize: 5, reloadMs: 3200, spreadBase: 0.02, spreadMove: 8, spreadPerShot: 0, spreadMax: 8, moveSpeedMult: 0.8,
  },
};

/** Slot 1 é a arma principal; slot 2 é a pistola. */
export function slotOf(id: WeaponId): 1 | 2 {
  return WEAPONS[id].category === 'pistol' ? 2 : 1;
}

export const STARTER_WEAPON: WeaponId = 'chinelo';

export const BUYABLE: readonly WeaponId[] = (Object.keys(WEAPONS) as WeaponId[]).filter((id) => id !== STARTER_WEAPON);

const ZONE_MULTIPLIER: Record<HitZone, number> = { head: 4, body: 1, legs: 0.75 };

export function damageFor(weapon: WeaponDef, zone: HitZone): number {
  return Math.floor(weapon.damage * ZONE_MULTIPLIER[zone]);
}
