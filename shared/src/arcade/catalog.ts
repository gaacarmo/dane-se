import type { CharacterId } from '../characters.js';
import type { CommonTalentId, PassiveId, SpecialId } from './types.js';

/** Passiva de um personagem (sempre ligada). Texto em pt-BR, por jogo. */
export interface PassiveDef {
  id: PassiveId;
  name: string;
  blurb: string;
  /** Efeito no Dane-se. */
  danese: string;
  /** Efeito no poker. */
  poker: string;
}

/** Especial de um personagem (1× por partida). */
export interface SpecialDef {
  id: SpecialId;
  name: string;
  blurb: string;
  danese: string;
  poker: string;
}

/** Talento comum, igual pra todos os personagens. */
export interface CommonTalentDef {
  id: CommonTalentId;
  name: string;
  blurb: string;
  danese: string;
  poker: string;
}

export interface CharacterKit {
  character: CharacterId;
  passive: PassiveDef;
  special: SpecialDef;
}

/** Trio padrão oferecido no começo de cada partida arcade. */
export const COMMON_TALENT_IDS = ['escudo', 'radar', 'curinga'] as const satisfies readonly CommonTalentId[];

/** Todos os especiais de personagem (um por personagem). */
export const SPECIAL_IDS = [
  'nuossa',
  'safadeza',
  'bomba',
  'visao',
  'esquentar',
  'pegaGato',
] as const satisfies readonly SpecialId[];

export const COMMON_TALENTS: Record<CommonTalentId, CommonTalentDef> = {
  escudo: {
    id: 'escudo',
    name: 'Trave',
    blurb: 'Segura o primeiro golpe.',
    danese: 'Anula 1 letra.',
    poker: 'Devolve as fichas apostadas em 1 mão perdida.',
  },
  radar: {
    id: 'radar',
    name: 'Rádio Corredor',
    blurb: 'Dá uma espiada.',
    danese: '1× vê 1 carta oculta de um oponente.',
    poker: '1× vê 1 hole card de um oponente.',
  },
  curinga: {
    id: 'curinga',
    name: 'Substituição',
    blurb: 'Reescreve a própria sorte.',
    danese: '1× troca/refaz uma carta sua.',
    poker: '1× troca as 2 hole cards antes do flop.',
  },
};

export const CHARACTER_KITS: Record<CharacterId, CharacterKit> = {
  carmelo: {
    character: 'carmelo',
    passive: {
      id: 'bonzao',
      name: 'Camarote',
      blurb: 'Confia demais, mas entrega.',
      danese: 'Escolhe 2 talentos comuns em vez de 1.',
      poker: 'Escolhe 2 talentos comuns em vez de 1.',
    },
    special: {
      id: 'nuossa',
      name: 'Catimba',
      blurb: 'Lê a mesa depois de já ter a vantagem.',
      danese: 'Depois das apostas, troca a própria aposta.',
      poker: 'Vê 1 hole card de um oponente escolhido.',
    },
  },
  martelo: {
    character: 'martelo',
    passive: {
      id: 'xereta',
      name: 'Olheiro',
      blurb: 'Adora um espião.',
      danese: 'A cada rodada, espia 1 carta aleatória de um adversário.',
      poker: 'No início da mão, vê 1 hole card de um oponente.',
    },
    special: {
      id: 'safadeza',
      name: 'Tabelinha',
      blurb: 'Toma a carta boa e devolve o lixo.',
      danese: 'Troca 1 carta da mão com um adversário.',
      poker: 'Troca 1 hole card com um oponente escolhido.',
    },
  },
  babin: {
    character: 'babin',
    passive: {
      id: 'encrenca',
      name: 'Gol Contra',
      blurb: 'Mexeu com ele, se deu mal.',
      danese: 'Habilidades miradas nele têm 20% de voltar no autor.',
      poker: 'Habilidades miradas nele têm 20% de voltar no autor.',
    },
    special: {
      id: 'bomba',
      name: 'Invasão de Campo',
      blurb: 'Explode a rodada (e às vezes a si mesmo).',
      danese: 'Embaralha as apostas: todos re-apostam.',
      poker: 'Bomb pot: todos entram com um ante e a mão começa gorda.',
    },
  },
  dezin: {
    character: 'dezin',
    passive: {
      id: 'zumbi',
      name: 'Prorrogação',
      blurb: 'Cai, mas levanta.',
      danese: 'A 1ª vez que seria eliminado, sobrevive com 1 letra abaixo do letal.',
      poker: 'A 1ª vez que quebraria, sobrevive com 1 ficha.',
    },
    special: {
      id: 'visao',
      name: 'Leitura de Jogo',
      blurb: 'Enxerga antes.',
      danese: 'Vê a próxima carta do baralho e 1 carta de um oponente.',
      poker: 'Vê o board adiantado (flop/turn/river) antes de decidir.',
    },
  },
  sarney: {
    character: 'sarney',
    passive: {
      id: 'esquenta',
      name: 'Zagueirão',
      blurb: 'Toma letra cedo, aguenta até o fim.',
      danese: 'Precisa de +2 letras pra ser eliminado (cai só na 8ª).',
      poker: 'Começa com +25% de fichas.',
    },
    special: {
      id: 'esquentar',
      name: 'Carrinho',
      blurb: 'Cancela um dano quando aperta.',
      danese: 'Cancela uma letra que você ganharia.',
      poker: 'Recupera as fichas apostadas na última mão perdida.',
    },
  },
  colombo: {
    character: 'colombo',
    passive: {
      id: 'farejador',
      name: 'VAR',
      blurb: 'Sente quem tá de gato.',
      danese: 'Avisa quando alguém que apostou ≥1 já não consegue bater a aposta.',
      poker: 'Indicador de blefe provável (aposta inconsistente).',
    },
    special: {
      id: 'pegaGato',
      name: 'Pênalti!',
      blurb: 'Acusa e cobra o gato.',
      danese: 'Acusa alguém: se for gato, +1 letra; se errar, a letra é sua.',
      poker: 'Acusa um blefe: se acertar, o alvo paga multa; se errar, você paga.',
    },
  },
};
