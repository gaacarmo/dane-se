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
  ysp: at(5, 25), yn: at(8, 13), ys: at(8, 37), yc: at(19, 25), yne: at(18, 6), yse: at(18, 44),
  // antes da fachada
  p0n: at(25.5, 4), p1: at(25.5, 16.5), p2: at(25.5, 33.5), p0s: at(25.5, 46),
  // portas da fachada e saguão
  f0n: at(28.5, 4), f1: at(28.5, 16.5), f2: at(28.5, 33.5), f0s: at(28.5, 46),
  h0n: at(32, 4), h1: at(32, 16.5), h2: at(32, 33.5), h0s: at(32, 46),
  // plataforma norte (ponto A) e corredor norte entre o tubo e o bloco administrativo
  pa1: at(40, 5), pa2: at(48, 5), pa3: at(57, 5), ln1: at(40, 16), ln2: at(48, 16), ln3: at(58, 16),
  // plataforma sul (ponto B) e corredor sul
  pb1: at(40, 45), pb2: at(48, 45), pb3: at(57, 45), ls1: at(40, 34), ls2: at(48, 34), ls3: at(58, 34),
  // corredor leste, portão dos fundos e garagem da defesa
  ce: at(59, 25), dw: at(62.5, 25), g1: at(66, 25), gs: at(70.5, 25),
  // fundos norte e sul, com porta para a garagem
  rn1: at(62.5, 5), rn2: at(71, 5), rn3: at(76, 6), rn4: at(76, 15), rdn: at(76, 18.5), gdn: at(76, 22),
  rs1: at(62.5, 45), rs2: at(71, 45), rs3: at(76, 44), rs4: at(76, 35), rds: at(76, 31.5), gds: at(76, 28),
} as const;

type NodeName = keyof typeof NODES;
const NAMES = Object.keys(NODES) as NodeName[];

const LINKS: [NodeName, NodeName][] = [
  ['ysp', 'yn'], ['ysp', 'ys'], ['ysp', 'yc'], ['yn', 'yne'], ['ys', 'yse'], ['yc', 'yne'], ['yc', 'yse'], ['yn', 'p1'], ['ys', 'p2'],
  ['yne', 'p0n'], ['yse', 'p0s'], ['yc', 'p1'], ['yc', 'p2'],
  ['p0n', 'f0n'], ['p1', 'f1'], ['p2', 'f2'], ['p0s', 'f0s'],
  ['f0n', 'h0n'], ['f1', 'h1'], ['f2', 'h2'], ['f0s', 'h0s'],
  ['h0n', 'h1'], ['h1', 'h2'], ['h2', 'h0s'],
  ['h0n', 'pa1'], ['pa1', 'pa2'], ['pa2', 'pa3'], ['h1', 'ln1'], ['ln1', 'ln2'], ['ln2', 'ln3'], ['pa2', 'ln2'],
  ['h0s', 'pb1'], ['pb1', 'pb2'], ['pb2', 'pb3'], ['h2', 'ls1'], ['ls1', 'ls2'], ['ls2', 'ls3'], ['pb2', 'ls2'],
  ['ln3', 'ce'], ['ls3', 'ce'], ['ce', 'dw'], ['dw', 'g1'], ['g1', 'gs'],
  ['pa3', 'rn1'], ['rn1', 'rn2'], ['rn2', 'rn3'], ['rn3', 'rn4'], ['rn4', 'rdn'], ['rdn', 'gdn'], ['gdn', 'gs'],
  ['pb3', 'rs1'], ['rs1', 'rs2'], ['rs2', 'rs3'], ['rs3', 'rs4'], ['rs4', 'rds'], ['rds', 'gds'], ['gds', 'gs'],
];

/**
 * Terminal Boqueirão 80 × 50 m: praça de acesso a oeste, fachada com bloqueios, saguão, duas plataformas longas com
 * tubos de embarque (norte e sul), o prédio administrativo no meio e a garagem da defesa a leste. Ponto A na
 * plataforma norte, ponto B na sul; os tubos têm porta no meio e as plataformas abrem para os fundos.
 */
export const TERMINAL_BOQUEIRAO: MapDef = {
  id: 'terminal_boqueirao',
  name: 'Terminal Boqueirão',
  bounds: box(0, 0, 0, 80, 6, 50),
  solids: [
    // limites
    box(0, 0, 0, 80, 4, 0.5),
    box(0, 0, 49.5, 80, 4, 50),
    box(0, 0, 0, 0.5, 4, 50),
    box(79.5, 0, 0, 80, 4, 50),
    // fachada, com portas em z 2-6, 14-19, 31-36 e 44-48
    box(28, 0, 0.5, 29, 4, 2),
    box(28, 0, 6, 29, 4, 14),
    box(28, 0, 19, 29, 4, 31),
    box(28, 0, 36, 29, 4, 44),
    box(28, 0, 48, 29, 4, 49.5),
    // prédio administrativo
    box(40, 0, 20, 56, 4, 30),
    // tubos de embarque, com porta em x 46-50
    box(36, 0, 8, 46, 3.2, 11.5),
    box(50, 0, 8, 60, 3.2, 11.5),
    box(36, 0, 38.5, 46, 3.2, 42),
    box(50, 0, 38.5, 60, 3.2, 42),
    // muro dos fundos, com passagens em z 2-8, 21-29 e 42-48
    box(62, 0, 0.5, 63, 4, 2),
    box(62, 0, 8, 63, 4, 21),
    box(62, 0, 29, 63, 4, 42),
    box(62, 0, 48, 63, 4, 49.5),
    // garagem da defesa: paredes norte e sul com porta em x 74-78
    box(63, 0, 18, 74, 4, 19),
    box(78, 0, 18, 79.5, 4, 19),
    box(63, 0, 31, 74, 4, 32),
    box(78, 0, 31, 79.5, 4, 32),
    // pilares das plataformas
    pillar(38, 6.8), pillar(54, 6.8), pillar(38, 43.2), pillar(54, 43.2),
    // bancos
    bench(41, 2.2), bench(52, 2.2), bench(41, 47.1), bench(52, 47.1),
    bench(42, 13), bench(52, 13), bench(42, 36.3), bench(52, 36.3),
    // bloqueios do saguão e dos corredores
    gate(33.2, 11), gate(33.2, 21.5), gate(33.2, 27.5), gate(33.2, 37.8),
    gate(44, 18.2), gate(46.5, 18.2), gate(49, 18.2), gate(44, 30.6), gate(46.5, 30.6), gate(49, 30.6),
    // ônibus parados nos fundos e caixas da garagem
    box(64, 0, 9.5, 73, 3, 12.1),
    box(64, 0, 37.9, 73, 3, 40.5),
    box(65, 0, 28.5, 67, 1.2, 30.5),
    box(77, 0, 21.5, 79, 1.2, 24),
    box(77, 0, 26, 79, 1.2, 28.5),
  ],
  sites: {
    A: box(44, 0, 2, 56, 3, 8),
    B: box(44, 0, 42, 56, 3, 48),
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
