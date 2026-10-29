import type { Box, MapDef } from '../map.js';
import type { Vec3 } from '../types.js';

const box = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): Box => ({
  min: { x: x1, y: y1, z: z1 },
  max: { x: x2, y: y2, z: z2 },
});

const at = (x: number, z: number): Vec3 => ({ x, y: 0, z });

/** Estante de 2,2 m (1 m de espessura) ao longo de z: bloqueia a linha de visão. */
const shelf = (x: number, z1: number, z2: number): Box => box(x, 0, z1, x + 1, 2.2, z2);
/** Mesa de estudo (0,9 m). */
const desk = (x: number, z: number): Box => box(x, 0, z, x + 3, 0.9, z + 1.4);

const NODES = {
  // pátio dos atacantes
  ysp: at(5, 25), yn: at(8, 12), ys: at(8, 38), yc: at(20, 25), yne: at(20, 9), yse: at(20, 41),
  // calçada, portas da fachada e átrio
  pn: at(27.5, 9), pc: at(27.5, 25), ps: at(27.5, 41),
  dn: at(29.5, 9), dc: at(29.5, 25), ds: at(29.5, 41),
  an: at(32, 9), aw: at(31.5, 25), as: at(32, 41), a1: at(31.5, 16), a2: at(31.5, 34),
  // faixa entre o átrio e as estantes e corredores das pontas
  sn: at(38.5, 9), sa: at(38.5, 16), cw: at(38.5, 25), sb: at(38.5, 34), ss: at(38.5, 41),
  nc1: at(38.5, 3), nc2: at(43, 3), nc3: at(48, 3), nc4: at(53, 3), nc5: at(58.5, 3),
  sc1: at(38.5, 47), sc2: at(43, 47), sc3: at(48, 47), sc4: at(53, 47), sc5: at(58.5, 47),
  // corredor central entre as mesas
  cm1: at(43, 25), cm2: at(48, 25), cm3: at(53, 25), ce: at(58.5, 25),
  // corredores entre as estantes, norte (ponto A) e sul
  an1: at(43, 12), an2: at(48, 12), an3: at(53, 12), as1: at(43, 38), as2: at(48, 38), as3: at(53, 38), es: at(59, 38),
  // passagens do muro dos fundos e corredor da defesa
  bn: at(62.5, 4), bc: at(62.5, 25), bs1: at(62.5, 38), bs2: at(62.5, 46.5),
  k1: at(64.5, 5), k1b: at(64.5, 12), k2: at(64.5, 25), k3: at(64.5, 38), k4: at(64.5, 46.5),
  // reserva técnica (norte), arquivo (spawn da defesa) e sala de computadores (ponto B)
  res: at(71, 10), rd: at(73.5, 18.5), off: at(71, 25), cd: at(73.5, 31.5), cb: at(72, 41),
} as const;

type NodeName = keyof typeof NODES;
const NAMES = Object.keys(NODES) as NodeName[];

const LINKS: [NodeName, NodeName][] = [
  ['ysp', 'yn'], ['ysp', 'ys'], ['ysp', 'yc'], ['yn', 'yne'], ['ys', 'yse'], ['yc', 'yne'], ['yc', 'yse'],
  ['yc', 'pc'], ['yne', 'pn'], ['yse', 'ps'], ['pn', 'pc'], ['pc', 'ps'], ['pn', 'dn'], ['pc', 'dc'], ['ps', 'ds'],
  ['dn', 'an'], ['dc', 'aw'], ['ds', 'as'], ['an', 'a1'], ['aw', 'a1'], ['aw', 'a2'], ['as', 'a2'],
  ['an', 'sn'], ['a1', 'sa'], ['a2', 'sb'], ['as', 'ss'],
  ['sn', 'sa'], ['sa', 'cw'], ['cw', 'sb'], ['sb', 'ss'],
  ['sn', 'nc1'], ['ss', 'sc1'],
  ['nc1', 'nc2'], ['nc2', 'nc3'], ['nc3', 'nc4'], ['nc4', 'nc5'],
  ['sc1', 'sc2'], ['sc2', 'sc3'], ['sc3', 'sc4'], ['sc4', 'sc5'],
  ['cw', 'cm1'], ['cm1', 'cm2'], ['cm2', 'cm3'], ['cm3', 'ce'],
  ['nc2', 'an1'], ['nc3', 'an2'], ['nc4', 'an3'], ['an1', 'cm1'], ['an2', 'cm2'], ['an3', 'cm3'],
  ['sc2', 'as1'], ['sc3', 'as2'], ['sc4', 'as3'], ['as1', 'cm1'], ['as2', 'cm2'], ['as3', 'cm3'],
  ['ce', 'bc'], ['as3', 'es'], ['es', 'bs1'], ['sc5', 'bs2'], ['nc5', 'bn'],
  ['bn', 'k1'], ['k1', 'k1b'], ['k1b', 'k2'], ['bc', 'k2'], ['k2', 'k3'], ['bs1', 'k3'], ['k3', 'k4'], ['bs2', 'k4'],
  ['k1b', 'res'], ['res', 'rd'], ['rd', 'off'], ['k2', 'off'], ['off', 'cd'], ['cd', 'cb'], ['k3', 'cb'],
];

/**
 * Biblioteca 80 × 50 m: pátio dos atacantes a oeste, átrio com o balcão de atendimento no meio (sem linha de visão
 * do pátio para dentro), fileiras de estantes em corredores norte-sul, mesas de estudo no corredor central e o
 * mezanino baixo no canto nordeste. Ponto A entre as estantes do norte, ponto B na sala de computadores; a defesa
 * nasce no arquivo, atrás do muro dos fundos.
 */
export const BIBLIOTECA: MapDef = {
  id: 'biblioteca',
  name: 'Biblioteca',
  bounds: box(0, 0, 0, 80, 6, 50),
  solids: [
    // limites
    box(0, 0, 0, 80, 4, 0.5),
    box(0, 0, 49.5, 80, 4, 50),
    box(0, 0, 0, 0.5, 4, 50),
    box(79.5, 0, 0, 80, 4, 50),
    // fachada, com portas em z 7-11, 23-27 e 39-43
    box(29, 0, 0.5, 30, 4, 7),
    box(29, 0, 11, 30, 4, 23),
    box(29, 0, 27, 30, 4, 39),
    box(29, 0, 43, 30, 4, 49.5),
    // balcão de atendimento do átrio
    box(33, 0, 20.5, 36, 3.2, 29.5),
    // estantes: fileiras norte (z 5-20) e sul (z 30-45), com corredores em x 41-45, 46-50 e 51-55; o sul abre para a sala de leitura
    shelf(40, 5, 20), shelf(45, 5, 20), shelf(50, 5, 20), shelf(55, 5, 20),
    shelf(40, 30, 45), shelf(45, 30, 45), shelf(50, 30, 45),
    // mezanino baixo e degraus da escada
    box(56.5, 0, 7, 62, 1.6, 20),
    box(57, 0, 20, 61, 0.5, 21.4),
    // muro dos fundos, com passagens em z 2-8, 22-28, 36-40 e 44-48
    box(62, 0, 0.5, 63, 4, 2),
    box(62, 0, 8, 63, 4, 22),
    box(62, 0, 28, 63, 4, 36),
    box(62, 0, 40, 63, 4, 44),
    box(62, 0, 48, 63, 4, 49.5),
    // divisórias do arquivo, com portas em x 72-75
    box(66, 0, 18, 72, 4, 19),
    box(75, 0, 18, 79.5, 4, 19),
    box(66, 0, 31, 72, 4, 32),
    box(75, 0, 31, 79.5, 4, 32),
    // estantes da reserva técnica e bancadas da sala de computadores
    box(68, 0, 4, 78, 2.2, 5.2),
    box(67, 0, 14.5, 70.5, 2.2, 15.7),
    box(66.5, 0, 34, 71, 0.9, 35.3),
    box(75, 0, 34, 78.5, 0.9, 35.3),
    box(68, 0, 44, 77, 0.9, 45.3),
    // mesas de estudo no corredor central
    desk(44, 21.6), desk(44, 27.1), desk(49, 21.6), desk(49, 27.1),
    // bancos e canteiros do pátio
    box(12, 0, 5, 14.5, 1.3, 7.5),
    box(12, 0, 42.5, 14.5, 1.3, 45),
    box(16, 0, 20, 18.5, 1.3, 22.5),
    box(24, 0, 15, 26, 1.2, 17),
    box(24, 0, 33, 26, 1.2, 35),
  ],
  sites: {
    A: box(41, 0, 7, 55, 3, 17),
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
