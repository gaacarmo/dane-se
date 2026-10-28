import type { Box, MapDef } from '../map.js';

const box = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): Box => ({
  min: { x: x1, y: y1, z: z1 },
  max: { x: x2, y: y2, z: z2 },
});

const at = (x: number, z: number) => ({ x, y: 0, z });

/** Cantina 40 × 30 m: salão central com mesas, balcão no meio, cozinha ao norte-leste e fundos ao sul-leste. */
export const CANTINA: MapDef = {
  id: 'cantina',
  name: 'Cantina',
  bounds: box(0, 0, 0, 40, 6, 30),
  solids: [
    box(0, 0, 0, 40, 4, 0.5),
    box(0, 0, 29.5, 40, 4, 30),
    box(0, 0, 0, 0.5, 4, 30),
    box(39.5, 0, 0, 40, 4, 30),
    box(10, 0, 14, 11, 4, 29.5),
    box(28, 0, 0.5, 29, 4, 9),
    box(22, 0, 14, 34, 1.2, 15.5),
    box(14, 0, 5, 15.6, 0.9, 6.6),
    box(20, 0, 5, 21.6, 0.9, 6.6),
    box(24, 0, 8, 25.6, 0.9, 9.6),
    box(14, 0, 17, 15.6, 0.9, 18.6),
    box(19, 0, 19, 20.6, 0.9, 20.6),
    box(24, 0, 20, 25.6, 0.9, 21.6),
  ],
  sites: {
    A: box(15, 0, 8, 21, 3, 14),
    B: box(31, 0, 19, 37, 3, 26),
  },
  spawns: {
    attack: [at(3, 24), at(5, 26), at(7, 23), at(4, 22)],
    defense: [at(33, 3), at(35, 5), at(36, 3), at(33, 7)],
  },
  waypoints: [
    at(5, 24),
    at(5, 16),
    at(5, 10),
    at(12, 10),
    at(18, 11),
    at(12.5, 16),
    at(12.5, 24),
    at(18, 24),
    at(27, 18),
    at(34, 22.5),
    at(26, 12),
    at(31, 11),
    at(34, 5),
    at(31, 5),
    at(36, 12),
    at(36, 17),
  ],
  links: [
    [0, 1], [1, 2], [2, 3], [3, 4], [3, 5], [5, 6], [6, 7], [7, 8], [8, 9],
    [4, 10], [10, 11], [11, 13], [13, 12], [11, 14], [14, 15], [15, 9], [8, 5],
  ],
};
