import type { Box, MapDef } from '../map.js';
import type { Vec3 } from '../types.js';

const box = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): Box => ({
  min: { x: x1, y: y1, z: z1 },
  max: { x: x2, y: y2, z: z2 },
});

const at = (x: number, z: number): Vec3 => ({ x, y: 0, z });

/** Carro (1,5 m de altura) com o comprimento ao longo de x. */
const car = (x: number, z: number): Box => box(x, 0, z, x + 4.4, 1.5, z + 1.9);
/** Carro com o comprimento ao longo de z. */
const carZ = (x: number, z: number): Box => box(x, 0, z, x + 1.9, 1.5, z + 4.4);
/** Van (2,3 m): bloqueia a linha de visão. */
const van = (x: number, z: number): Box => box(x, 0, z, x + 5, 2.3, z + 2.1);
const pillar = (x: number, z: number): Box => box(x - 0.4, 0, z - 0.4, x + 0.4, 4, z + 0.4);

const NODES = {
  // pátio de entrada dos atacantes
  ysp: at(5, 25), yn: at(8, 13), ys: at(8, 37), yc: at(19, 25), yne: at(18, 7), yse: at(18, 43),
  // calçada antes do muro da garagem
  pn: at(26, 7), pc: at(26, 25), ps: at(26, 43),
  // passagens do muro da garagem
  dn: at(30.5, 7), dc: at(30.5, 25), ds: at(30.5, 43),
  // corredor entre o muro e o bloco da rampa
  c1: at(34, 25),
  // fileiras do norte
  n1: at(34, 7), n2: at(42, 7), n3: at(50, 8), n4: at(57, 7), n5: at(34, 17), n6: at(42, 17), n7: at(57, 17),
  // fileiras do sul
  s1: at(34, 43), s2: at(42, 43), s3: at(50, 42), s4: at(57, 43), s5: at(34, 33), s6: at(42, 33), s7: at(57, 33),
  // pátio central e passagem para a guarita
  cy: at(57, 25), dw: at(62.5, 25), g1: at(66, 25), gs: at(70.5, 25),
  // fundos: rampa norte e sul, com porta para a guarita
  rn1: at(62.5, 7), rn2: at(71, 7), rn3: at(71, 15), rdn: at(71, 18.5), gdn: at(71, 21.5),
  rs1: at(62.5, 43), rs2: at(71, 43), rs3: at(71, 35), rds: at(71, 31.5), gds: at(71, 28.5),
} as const;

type NodeName = keyof typeof NODES;
const NAMES = Object.keys(NODES) as NodeName[];

const LINKS: [NodeName, NodeName][] = [
  ['ysp', 'yn'], ['ysp', 'ys'], ['ysp', 'yc'], ['yn', 'yne'], ['ys', 'yse'], ['yc', 'yne'], ['yc', 'yse'],
  ['yne', 'pn'], ['yse', 'ps'], ['yc', 'pc'], ['pn', 'pc'], ['pc', 'ps'], ['pn', 'dn'], ['pc', 'dc'], ['ps', 'ds'],
  ['dn', 'n1'], ['dc', 'c1'], ['ds', 's1'],
  ['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4'], ['n1', 'n5'], ['n2', 'n6'], ['n4', 'n7'], ['n5', 'n6'], ['n6', 'n7'], ['c1', 'n5'],
  ['s1', 's2'], ['s2', 's3'], ['s3', 's4'], ['s1', 's5'], ['s2', 's6'], ['s4', 's7'], ['s5', 's6'], ['s6', 's7'], ['c1', 's5'],
  ['n7', 'cy'], ['s7', 'cy'], ['cy', 'dw'], ['dw', 'g1'], ['g1', 'gs'],
  ['n4', 'rn1'], ['rn1', 'rn2'], ['rn2', 'rn3'], ['rn3', 'rdn'], ['rdn', 'gdn'], ['gdn', 'gs'],
  ['s4', 'rs1'], ['rs1', 'rs2'], ['rs2', 'rs3'], ['rs3', 'rds'], ['rds', 'gds'], ['gds', 'gs'],
];

/**
 * Estacionamento 80 × 50 m: entrada de pedestres a oeste, o muro da garagem, um bloco da rampa no meio que corta a
 * visão entre os times, duas alas de fileiras de carros (norte e sul), o pátio central e a guarita da defesa a leste.
 * Ponto A na ala norte, ponto B na ala sul; a defesa sai da guarita pela frente ou pelas rampas dos fundos.
 */
export const ESTACIONAMENTO: MapDef = {
  id: 'estacionamento',
  name: 'Estacionamento',
  bounds: box(0, 0, 0, 80, 6, 50),
  solids: [
    // limites
    box(0, 0, 0, 80, 4, 0.5),
    box(0, 0, 49.5, 80, 4, 50),
    box(0, 0, 0, 0.5, 4, 50),
    box(79.5, 0, 0, 80, 4, 50),
    // muro da garagem, com passagens em z 5-9, 22-28 e 41-45
    box(30, 0, 0.5, 31, 4, 5),
    box(30, 0, 9, 31, 4, 22),
    box(30, 0, 28, 31, 4, 41),
    box(30, 0, 45, 31, 4, 49.5),
    // bloco da rampa
    box(38, 0, 19, 50, 4, 31),
    // muro dos fundos, com passagens em z 5-9, 22-28 e 41-45
    box(62, 0, 0.5, 63, 4, 5),
    box(62, 0, 9, 63, 4, 22),
    box(62, 0, 28, 63, 4, 41),
    box(62, 0, 45, 63, 4, 49.5),
    // guarita: paredes norte e sul com porta em x 69-73
    box(63, 0, 18, 69, 4, 19),
    box(73, 0, 18, 79.5, 4, 19),
    box(63, 0, 31, 69, 4, 32),
    box(73, 0, 31, 79.5, 4, 32),
    // carros do pátio de entrada
    carZ(12, 3),
    carZ(12, 42.6),
    carZ(3, 40),
    carZ(3, 5.6),
    // ala norte: fileira junto ao muro, carros do meio, vans e pilares
    car(33, 1), car(40, 1), car(47, 1), car(54, 1),
    car(35, 9), carZ(59, 10),
    van(35, 13), van(47, 13),
    pillar(46, 5), pillar(54, 5), pillar(38, 11), pillar(52, 15.2),
    // ala sul
    car(33, 47.1), car(41, 47.1), car(47, 47.1), car(54, 47.1),
    car(35, 39.1), carZ(59, 35.6),
    van(36, 34.9), van(48, 34.9),
    pillar(46, 45), pillar(54, 45), pillar(40, 39), pillar(52, 34.8),
    // pátio central
    car(52, 22), car(52, 26.1),
    // rampas dos fundos e guarita
    box(66, 0, 1, 79, 0.9, 3),
    box(66, 0, 47, 79, 0.9, 49),
    box(64, 0, 10, 68, 1.4, 12),
    box(64, 0, 38, 68, 1.4, 40),
    box(64.5, 0, 28.5, 66.5, 1.1, 30.5),
    box(76, 0, 20, 78.5, 1.1, 22),
    box(76, 0, 28, 78.5, 1.1, 30),
  ],
  sites: {
    A: box(44, 0, 4, 56, 3, 12),
    B: box(44, 0, 38, 56, 3, 46),
  },
  spawns: {
    attack: [at(4, 23), at(6, 24), at(4, 27), at(6, 27)],
    defense: [at(68.5, 24), at(70.5, 22.8), at(72.5, 25), at(70, 27.2)],
  },
  barrier: box(22, 0, 0.5, 23, 4, 49.5),
  stage: at(19, 26),
  waypoints: NAMES.map((name) => NODES[name]),
  links: LINKS.map(([a, b]) => [NAMES.indexOf(a), NAMES.indexOf(b)]),
};
