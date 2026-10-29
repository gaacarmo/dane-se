import type { Side } from './types.js';
import type { HitZone, WeaponCategory } from './weapons.js';

export type EquipmentId = 'kevlar' | 'kevlar_helmet' | 'kit';

export interface EquipmentDef {
  id: EquipmentId;
  name: string;
  price: number;
  /** Só este lado compra. */
  side?: Side;
}

export const MAX_ARMOR = 100;
/** Fração do dano que ainda chega à vida quando o colete protege a região: a pistola é a mais contida, a sniper quase atravessa. */
const ARMOR_PENETRATION: Record<WeaponCategory, number> = { pistol: 0.6, smg: 0.65, rifle: 0.775, sniper: 0.97 };
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

const HELMET_PRICE = EQUIPMENT.kevlar_helmet.price - EQUIPMENT.kevlar.price;

/** O combo cobra só o que falta: o colete (refeito) e o capacete, se ainda não tiver. */
export function equipmentPrice(worn: Worn, id: EquipmentId): number {
  if (id !== 'kevlar_helmet') return EQUIPMENT[id].price;
  return (worn.armor < MAX_ARMOR ? EQUIPMENT.kevlar.price : 0) + (worn.helmet ? 0 : HELMET_PRICE);
}

/** Dano que chega à vida e colete que sobra. O colete cobre o corpo; a cabeça só com capacete; as pernas nunca. */
export function absorbDamage(raw: number, zone: HitZone, worn: Worn, category: WeaponCategory): { hp: number; armor: number } {
  const covered = worn.armor > 0 && (zone === 'body' || (zone === 'head' && worn.helmet));
  if (!covered) return { hp: raw, armor: worn.armor };
  let hp = Math.max(1, Math.round(raw * ARMOR_PENETRATION[category]));
  let wear = Math.max(1, Math.round((raw - hp) * ARMOR_WEAR));
  if (wear > worn.armor) {
    wear = worn.armor;
    hp = raw - Math.round(wear / ARMOR_WEAR);
  }
  return { hp, armor: worn.armor - wear };
}
