import type { Box, MapDef } from '../map.js';
import type { Vec3 } from '../types.js';

const box = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): Box => ({
  min: { x: x1, y: y1, z: z1 },
  max: { x: x2, y: y2, z: z2 },
});

const at = (x: number, z: number): Vec3 => ({ x, y: 0, z });

/** Banco de espera (0,6 m). */
const bench = (x: number, z: number): Box => box(x, 0, z, x + 3, 0.6, z + 0.7);
/** Bloqueio (catraca) de 1,1 m. */
const gate = (x: number, z: number): Box => box(x, 0, z, x + 1.2, 1.1, z + 1.2);
const pillar = (x: number, z: number): Box => box(x - 0.4, 0, z - 0.4, x + 0.4, 4, z + 0.4);

const NODES = {
  // praça de acesso dos atacantes
  ysp: at(7.5, 35), yn: at(12, 18), ys: at(12, 52), yc: at(33.5, 35), yne: at(27, 8.5), yse: at(27, 61.5),
  // antes da fachada
  p0n: at(38.5, 5.5), p1: at(38.5, 23), p2: at(38.5, 47), p0s: at(38.5, 64.5),
  // portas da fachada e saguão
  f0n: at(43, 5.5), f1: at(43, 23), f2: at(43, 47), f0s: at(43, 64.5),
  h0n: at(48, 5.5), h1: at(48, 23), h2: at(48, 47), h0s: at(48, 64.5),
  // plataforma norte (ponto A) e corredor norte entre o tubo e o bloco administrativo
  pa1: at(60, 7), pa2: at(72, 7), pa3: at(85.5, 7), ln1: at(60, 22.5), ln2: at(72, 22.5), ln3: at(87, 22.5),
  // plataforma sul (ponto B) e corredor sul
  pb1: at(60, 63), pb2: at(72, 63), pb3: at(85.5, 63), ls1: at(60, 47.5), ls2: at(72, 47.5), ls3: at(87, 47.5),
  // corredor leste, portão dos fundos e garagem da defesa
  ce: at(88.5, 35), dw: at(93.8, 35), g1: at(99, 35), gm: at(106, 35), gs: at(113, 35),
  // fundos norte e sul, com porta para a garagem
  rn1: at(93.8, 7), rn2: at(106.5, 7), rn3: at(114, 8.5), rn4: at(114, 21), rdn: at(114, 26), gdn: at(114, 30.8),
  rs1: at(93.8, 63), rs2: at(106.5, 63), rs3: at(114, 61.5), rs4: at(114, 49), rds: at(114, 44), gds: at(114, 39.2),
} as const;

type NodeName = keyof typeof NODES;
const NAMES = Object.keys(NODES) as NodeName[];

const LINKS: [NodeName, NodeName][] = [
  ['ysp', 'yn'], ['ysp', 'ys'], ['ysp', 'yc'], ['yn', 'yne'], ['ys', 'yse'], ['yc', 'yne'], ['yc', 'yse'], ['yn', 'p1'], ['ys', 'p2'],
  ['yne', 'p0n'], ['yse', 'p0s'], ['yc', 'p1'], ['yc', 'p2'],
  ['p0n', 'f0n'], ['p1', 'f1'], ['p2', 'f2'], ['p0s', 'f0s'],
  ['f0n', 'h0n'], ['f1', 'h1'], ['f2', 'h2'], ['f0s', 'h0s'],
  ['h0n', 'h1'], ['h2', 'h0s'],
  ['h0n', 'pa1'], ['pa1', 'pa2'], ['pa2', 'pa3'], ['h1', 'ln1'], ['ln1', 'ln2'], ['ln2', 'ln3'], ['pa2', 'ln2'],
  ['h0s', 'pb1'], ['pb1', 'pb2'], ['pb2', 'pb3'], ['h2', 'ls1'], ['ls1', 'ls2'], ['ls2', 'ls3'], ['pb2', 'ls2'],
  ['ce', 'dw'], ['dw', 'g1'], ['g1', 'gm'], ['gm', 'gs'],
  ['pa3', 'rn1'], ['rn1', 'rn2'], ['rn2', 'rn3'], ['rn3', 'rn4'], ['rn4', 'rdn'], ['rdn', 'gdn'], ['gdn', 'gs'],
  ['pb3', 'rs1'], ['rs1', 'rs2'], ['rs2', 'rs3'], ['rs3', 'rs4'], ['rs4', 'rds'], ['rds', 'gds'], ['gds', 'gs'],
];

/**
 * Terminal Boqueirão 120 × 70 m: praça de acesso a oeste, fachada com bloqueios, saguão, duas plataformas longas com
 * tubos de embarque (norte e sul), o prédio administrativo no meio e a garagem da defesa a leste. Ponto A na
 * plataforma norte, ponto B na sul; os tubos têm porta no meio e as plataformas abrem para os fundos.
 */
export const TERMINAL_BOQUEIRAO: MapDef = {
  id: 'terminal_boqueirao',
  name: 'Terminal Boqueirão',
  bounds: box(0, 0, 0, 120, 6, 70),
  solids: [
    // limites
    box(0, 0, 0, 120, 4, 0.5),
    box(0, 0, 69.5, 120, 4, 70),
    box(0, 0, 0, 0.5, 4, 70),
    box(119.5, 0, 0, 120, 4, 70),
    // fachada, com portas em z 2,5-8,5, 19,5-26,5, 43,5-50,5 e 61,5-67,5
    box(42.5, 0, 0.5, 43.5, 4, 2.5),
    box(42.5, 0, 8.5, 43.5, 4, 19.5),
    // bilheteria: bloco maciço entre as portas centrais, separa o saguão norte do sul
    box(42.5, 0, 26.5, 49, 4, 43.5),
    box(42.5, 0, 50.5, 43.5, 4, 61.5),
    box(42.5, 0, 67.5, 43.5, 4, 69.5),
    // prédio administrativo
    box(60, 0, 28, 84, 4, 42),
    // tubos de embarque, com porta em x 69-75
    box(54, 0, 11, 69, 3.2, 16),
    box(75, 0, 11, 90, 3.2, 16),
    box(54, 0, 54, 69, 3.2, 59),
    box(75, 0, 54, 90, 3.2, 59),
    // muro dos fundos, com passagens em z 2,5-11, 29,5-40,5 e 59-67,5
    box(93.5, 0, 0.5, 94.5, 4, 2.5),
    box(93.5, 0, 11, 94.5, 4, 29.5),
    box(93.5, 0, 40.5, 94.5, 4, 59),
    box(93.5, 0, 67.5, 94.5, 4, 69.5),
    // garagem da defesa: paredes norte e sul com porta em x 111-117,5
    box(94.5, 0, 25.5, 111, 4, 26.5),
    box(117.5, 0, 25.5, 119.5, 4, 26.5),
    box(94.5, 0, 43.5, 111, 4, 44.5),
    box(117.5, 0, 43.5, 119.5, 4, 44.5),
    // pilares das plataformas
    pillar(57, 9.5), pillar(81, 9.5), pillar(57, 60.5), pillar(81, 60.5),
    // bancos
    bench(61.5, 3), bench(71, 2.5), bench(79, 3), bench(61.5, 66.3), bench(71, 66.8), bench(79, 66.3),
    bench(63, 18.5), bench(78, 18.5), bench(63, 51), bench(78, 51),
    // bloqueios do saguão e dos corredores
    gate(50, 15.5), gate(50, 53),
    gate(66.5, 25.5), gate(70, 25.5), gate(74, 25.5), gate(66.5, 43), gate(70, 43), gate(74, 43),
    // ônibus parados nos fundos e caixas da garagem
    box(96, 0, 14, 109.5, 3, 16.5),
    box(96, 0, 53, 109.5, 3, 56.5),
    box(98, 0, 40.5, 100, 1.2, 42.5),
    box(105.5, 0, 30.5, 107.5, 1.2, 33),
    box(105.5, 0, 37, 107.5, 1.2, 39.5),
  ],
  sites: {
    A: box(64, 0, 2, 82, 3, 10),
    B: box(64, 0, 60, 82, 3, 68),
  },
  spawns: {
    attack: [at(6.5, 33), at(9, 34), at(6.5, 37), at(9, 36.5)],
    defense: [at(111, 33), at(114, 32.5), at(115, 36), at(112, 37.5)],
  },
  barrier: box(35, 0, 0.5, 36, 4, 69.5),
  stage: at(33, 36.5),
  waypoints: NAMES.map((name) => NODES[name]),
  links: LINKS.map(([a, b]) => [NAMES.indexOf(a), NAMES.indexOf(b)]),
};
