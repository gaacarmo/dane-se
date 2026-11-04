import type { Box, MapDef } from '../map.js';
import type { Vec3 } from '../types.js';

const box = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): Box => ({
  min: { x: x1, y: y1, z: z1 },
  max: { x: x2, y: y2, z: z2 },
});

const at = (x: number, z: number): Vec3 => ({ x, y: 0, z });

/** Pontos de navegação dos bots. O nome só existe aqui, para escrever os trajetos sem errar índices. */
const NODES = {
  // pátio dos atacantes
  ysp: at(5, 25), yn: at(8, 12), ys: at(8, 38), yc: at(20, 25), yne: at(20, 9), yse: at(20, 41),
  // varanda, antes da fachada
  pn: at(27, 9), pc: at(27, 25), ps: at(27, 41),
  // portas da fachada e vestíbulo (corredor entre a fachada e a parede interna)
  dn: at(30.5, 9), dc: at(30.5, 25), ds: at(30.5, 41),
  vn: at(33.5, 9), vc: at(33.5, 25), vs: at(33.5, 41), vg1: at(33.5, 17), vg2: at(33.5, 33),
  // passagens da parede interna para o salão
  g1: at(36.5, 17), g2: at(36.5, 33),
  // salão
  ha: at(40, 17), hb: at(40, 33), hc: at(40, 25), hn: at(40, 10), hs: at(40, 40),
  sa: at(47, 10), m1: at(47, 21), m2: at(53, 21), m3: at(47, 28), m4: at(53, 28),
  en: at(57, 10), e1: at(59, 21), e2: at(59, 28), ss1: at(47, 40), ss2: at(57, 40),
  // saídas do salão para o fundo e corredor dos fundos
  hgn: at(62.5, 12), hgc: at(62.5, 25), hgs: at(62.5, 38), k1: at(64.5, 12), k2: at(64.5, 25), k3: at(64.5, 38),
  // cozinha, escritório (spawn da defesa) e depósito (ponto B)
  kit: at(71, 10), off: at(71, 25), sb: at(72, 41),
} as const;

type NodeName = keyof typeof NODES;
const NAMES = Object.keys(NODES) as NodeName[];

const LINKS: [NodeName, NodeName][] = [
  ['ysp', 'yn'], ['ysp', 'ys'], ['ysp', 'yc'], ['yn', 'yne'], ['ys', 'yse'], ['yc', 'yne'], ['yc', 'yse'],
  ['yc', 'pc'], ['yne', 'pn'], ['yse', 'ps'], ['pn', 'pc'], ['pc', 'ps'], ['pn', 'dn'], ['pc', 'dc'], ['ps', 'ds'],
  ['dn', 'vn'], ['dc', 'vc'], ['ds', 'vs'], ['vn', 'vg1'], ['vg1', 'vc'], ['vc', 'vg2'], ['vg2', 'vs'],
  ['vg1', 'g1'], ['vg2', 'g2'],
  ['g1', 'ha'], ['g2', 'hb'], ['ha', 'hc'], ['hc', 'hb'], ['ha', 'hn'], ['hn', 'sa'], ['sa', 'm1'], ['sa', 'en'],
  ['hc', 'm1'], ['hc', 'm3'], ['m1', 'm2'], ['m3', 'm4'], ['m2', 'e1'], ['e1', 'e2'], ['e2', 'm4'], ['en', 'e1'],
  ['hb', 'hs'], ['hs', 'ss1'], ['ss1', 'ss2'], ['m3', 'ss1'],
  ['en', 'hgn'], ['e1', 'hgc'], ['e2', 'hgc'], ['ss2', 'hgs'],
  ['hgn', 'k1'], ['hgc', 'k2'], ['hgs', 'k3'], ['k1', 'k2'], ['k2', 'k3'],
  ['k1', 'kit'], ['k2', 'off'], ['k3', 'sb'],
];

/**
 * Cantina 80 × 50 m, pensada para os times só se encontrarem depois de uma caminhada: pátio dos atacantes a oeste, o
 * prédio com fachada e vestíbulo (sem linha de visão do pátio para o salão), salão com pilares e balcão, e os fundos
 * (cozinha, escritório da defesa e depósito) a leste. Ponto A no salão, ponto B no depósito.
 */
export const CANTINA: MapDef = {
  id: 'cantina',
  name: 'Cantina',
  bounds: box(0, 0, 0, 80, 6, 50),
  solids: [
    // limites
    box(0, 0, 0, 80, 4, 0.5),
    box(0, 0, 49.5, 80, 4, 50),
    box(0, 0, 0, 0.5, 4, 50),
    box(79.5, 0, 0, 80, 4, 50),
    // fachada, com portas em z 7-11, 23-27 e 39-43
    box(30, 0, 0.5, 31, 4, 7),
    box(30, 0, 11, 31, 4, 23),
    box(30, 0, 27, 31, 4, 39),
    box(30, 0, 43, 31, 4, 49.5),
    // parede interna, com passagens em z 15-19 e 31-35 (deslocadas das portas)
    box(36, 0, 0.5, 37, 4, 15),
    box(36, 0, 19, 37, 4, 31),
    box(36, 0, 35, 37, 4, 49.5),
    // parede dos fundos, com passagens em z 10-14, 22-28 e 36-40
    box(62, 0, 0.5, 63, 4, 10),
    box(62, 0, 14, 63, 4, 22),
    box(62, 0, 28, 63, 4, 36),
    box(62, 0, 40, 63, 4, 49.5),
    // divisórias da cozinha, do escritório e do depósito
    box(66, 0, 18, 79.5, 4, 19),
    box(66, 0, 31, 79.5, 4, 32),
    // pilares e balcão do salão
    box(44, 0, 11, 45.5, 4, 12.5),
    box(54, 0, 11, 55.5, 4, 12.5),
    box(44, 0, 37, 45.5, 4, 38.5),
    box(54, 0, 37, 55.5, 4, 38.5),
    box(44, 0, 23.5, 56, 1.2, 25.5),
    // caixotes do pátio e jardineiras da varanda
    box(12, 0, 5, 14.5, 1.3, 7.5),
    box(12, 0, 42.5, 14.5, 1.3, 45),
    box(16, 0, 20, 18.5, 1.3, 22.5),
    box(24, 0, 15, 26, 1.2, 17),
    box(24, 0, 33, 26, 1.2, 35),
    // bancadas da cozinha e caixas do depósito
    box(68, 0, 3, 76, 1.2, 4.5),
    box(68, 0, 15, 76, 1.2, 16.5),
    box(68, 0, 43, 70, 1.3, 45),
    box(75, 0, 33, 77, 1.3, 35),
    // mesas
    box(40, 0, 6, 41.6, 0.9, 7.6),
    box(58, 0, 6, 59.6, 0.9, 7.6),
    box(40, 0, 42, 41.6, 0.9, 43.6),
    box(58, 0, 42, 59.6, 0.9, 43.6),
    box(48.5, 0, 18, 50.1, 0.9, 19.6),
    box(52, 0, 18, 53.6, 0.9, 19.6),
    box(48.5, 0, 30, 50.1, 0.9, 31.6),
    box(52, 0, 30, 53.6, 0.9, 31.6),
  ],
  sites: {
    A: box(42, 0, 5, 52, 3, 15),
    B: box(67, 0, 36, 77, 3, 46),
  },
  spawns: {
    attack: [at(4, 23), at(6, 24), at(4, 27), at(6, 27)],
    defense: [at(69, 24), at(71.5, 22.5), at(73.5, 25), at(71, 27.5)],
  },
  barrier: box(22, 0, 0.5, 23, 4, 49.5),
  stage: at(19, 26),
  waypoints: NAMES.map((name) => NODES[name]),
  links: LINKS.map(([a, b]) => [NAMES.indexOf(a), NAMES.indexOf(b)]),
};
