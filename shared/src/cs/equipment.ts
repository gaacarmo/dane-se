import type { Side } from './types.js';
import type { HitZone } from './weapons.js';

export type EquipmentId = 'kevlar' | 'kevlar_helmet' | 'kit';

export interface EquipmentDef {
  id: EquipmentId;
  name: string;
  price: number;
  /** Só este lado compra. */
  side?: Side;
}

export const MAX_ARMOR = 100;
/** Parte do dano que ainda chega à vida quando o colete protege a região. */
const ARMOR_RATIO = 0.5;
/** Quanto do dano absorvido o colete perde. */
const ARMOR_WEAR = 0.5;

export const EQUIPMENT: Record<EquipmentId, EquipmentDef> = {
  kevlar: { id: 'kevlar', name: 'Colete', price: 650 },
  kevlar_helmet: { id: 'kevlar_helmet', name: 'Colete e capacete', price: 1000 },
  kit: { id: 'kit', name: 'Kit de desarme', price: 400, side: 'defense' },
};

export const EQUIPMENT_IDS = Object.keys(EQUIPMENT) as EquipmentId[];

export function isEquipment(id: string): id is EquipmentId {
  return Object.hasOwn(EQUIPMENT, id);
}

interface Worn {
  armor: number;
  helmet: boolean;
}

/** Quem já tem o colete cheio paga só a diferença pelo capacete. */
export function equipmentPrice(worn: Worn, id: EquipmentId): number {
  if (id === 'kevlar_helmet' && worn.armor >= MAX_ARMOR && !worn.helmet) return EQUIPMENT.kevlar_helmet.price - EQUIPMENT.kevlar.price;
  return EQUIPMENT[id].price;
}

/** Dano que chega à vida e colete que sobra. O colete cobre o corpo; a cabeça só com capacete; as pernas nunca. */
export function absorbDamage(raw: number, zone: HitZone, worn: Worn): { hp: number; armor: number } {
  const covered = worn.armor > 0 && (zone === 'body' || (zone === 'head' && worn.helmet));
  if (!covered) return { hp: raw, armor: worn.armor };
  let hp = Math.max(1, Math.round(raw * ARMOR_RATIO));
  let wear = Math.max(1, Math.round((raw - hp) * ARMOR_WEAR));
  if (wear > worn.armor) {
    wear = worn.armor;
    hp = raw - Math.round(wear / ARMOR_WEAR);
  }
  return { hp, armor: worn.armor - wear };
}
