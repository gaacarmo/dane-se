import { describe, expect, it } from 'vitest';
import { MAPS, drawMap, validateMap, type MapDef } from '../../src/cs/map.js';
import { CANTINA } from '../../src/cs/maps/cantina.js';

const clone = (): MapDef => structuredClone(CANTINA);

describe('Cantina', () => {
  it('passes validation', () => {
    expect(validateMap(CANTINA)).toEqual([]);
  });

  it('is registered in the draw list', () => {
    expect(MAPS).toContain(CANTINA);
  });
});

describe('validateMap', () => {
  it('reports a spawn inside a solid', () => {
    const map = clone();
    const solid = map.solids[map.solids.length - 1]!;
    map.spawns.attack[0] = { x: (solid.min.x + solid.max.x) / 2, y: 0, z: (solid.min.z + solid.max.z) / 2 };
    expect(validateMap(map).join('|')).toMatch(/spawn/);
  });

  it('reports a site outside the bounds', () => {
    const map = clone();
    map.sites.A = { min: { x: 100, y: 0, z: 100 }, max: { x: 104, y: 3, z: 104 } };
    expect(validateMap(map).join('|')).toMatch(/site/);
  });

  it('reports an invalid link index', () => {
    const map = clone();
    map.links.push([0, 999]);
    expect(validateMap(map).join('|')).toMatch(/link/);
  });

  it('reports a disconnected waypoint graph', () => {
    const map = clone();
    map.links = map.links.filter(([a, b]) => !(a === 2 && b === 3));
    expect(validateMap(map).join('|')).toMatch(/connected|disconnected|desconexo/);
  });

  it('reports a spawn inside the preparation gate', () => {
    const map = clone();
    const gate = map.barrier!;
    map.spawns.attack[0] = { x: (gate.min.x + gate.max.x) / 2, y: 0, z: 5 };
    expect(validateMap(map).join('|')).toMatch(/portão|barrier/);
  });

  it('reports a staging point that is not near any waypoint', () => {
    const map = clone();
    map.stage = { x: 39, y: 0, z: 1 };
    expect(validateMap(map).join('|')).toMatch(/stage|espera/);
  });

  it('reports fewer than 3 spawns on a side', () => {
    const map = clone();
    map.spawns.defense = map.spawns.defense.slice(0, 2);
    expect(validateMap(map).join('|')).toMatch(/spawns/);
  });
});

describe('drawMap', () => {
  it('returns a registered map and advances the rng', () => {
    const drawn = drawMap(1);
    expect(MAPS).toContain(drawn.map);
    expect(drawn.rng).not.toBe(1);
  });
});
