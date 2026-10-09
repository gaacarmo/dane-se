/**
 * Números balanceáveis do modo arcade. Tudo que é "sente-se" (chance, bônus,
 * limite) mora aqui pra facilitar ajuste sem caçar no meio da lógica.
 */
export const ARCADE_TUNING = {
  /** Chance de uma habilidade mirada no Babin voltar no autor ("Gol Contra"). */
  encrencaBackfire: 0.2,
  /** Letras extras antes da eliminação ("Zagueirão" do Sarney). */
  esquentaLetterBuffer: 2,
  /** Bônus de fichas iniciais no poker pra quem tem o "Zagueirão". */
  esquentaChipBonus: 0.25,
  /** Talentos comuns extras concedidos pelo "Camarote". */
  bonzaoTalentBonus: 1,
} as const;

export type ArcadeTuning = typeof ARCADE_TUNING;
