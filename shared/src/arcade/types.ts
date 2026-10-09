import type { CharacterId } from '../characters.js';

/** Talentos comuns oferecidos a todos no começo de cada partida arcade. */
export type CommonTalentId = 'escudo' | 'radar' | 'curinga';

/** Passiva de um personagem (sempre ligada). */
export type PassiveId = 'bonzao' | 'xereta' | 'encrenca' | 'zumbi' | 'esquenta' | 'farejador';

/** Especial de um personagem (1× por partida). */
export type SpecialId = 'nuossa' | 'safadeza' | 'bomba' | 'visao' | 'esquentar' | 'pegaGato';

/** Qualquer habilidade acionável: um especial de personagem ou um talento comum. */
export type ArcadeAbilityId = SpecialId | CommonTalentId;

/** O que um jogador leva para uma partida arcade. */
export interface ArcadeLoadout {
  character: CharacterId;
  talent: CommonTalentId;
}

/**
 * Estado mutável de um jogador arcade. O motor copia isso junto com o próprio
 * estado; a camada de sala nunca inspeciona, só entrega no `create`.
 */
export interface ArcadeSeatState {
  id: string;
  character: CharacterId;
  talent: CommonTalentId;
  /** Vira false quando o especial (1× por partida) é gasto. */
  specialCharged: boolean;
  /** Negadores genéricos de um dano (letra no Dane-se / fichas no poker). */
  shields: number;
  /** Usos restantes de efeitos limitados (Radar, Curinga). */
  charges: number;
  /** Letras extras antes da eliminação (Esquenta). Permanente. */
  eliminationBuffer: number;
  /** Ressurreições restantes de uso único (Zumbi). */
  revives: number;
}

/** Bloco arcade que vive dentro do `GameState` de cada motor. */
export interface ArcadeMatchState {
  /** false = partida normal: todos os helpers arcade são no-op. */
  enabled: boolean;
  seats: ArcadeSeatState[];
}
