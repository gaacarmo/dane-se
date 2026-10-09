/**
 * Números balanceáveis do modo arcade. Tudo que é "sente-se" (chance, bônus,
 * limite) mora aqui pra facilitar ajuste sem caçar no meio da lógica.
 */
export const ARCADE_TUNING = {
  /** Chance de a habilidade do Babin voltar nele ("Encrenca"). */
  encrencaBackfire: 0.4,
  /** Letras extras antes da eliminação ("Esquenta" do Sarney). */
  esquentaLetterBuffer: 2,
  /** Bônus de fichas iniciais no poker pra quem tem o "Esquenta". */
  esquentaChipBonus: 0.25,
  /** Talentos comuns extras concedidos pelo "Sou o Bonzão". */
  bonzaoTalentBonus: 1,
} as const;

export type ArcadeTuning = typeof ARCADE_TUNING;
