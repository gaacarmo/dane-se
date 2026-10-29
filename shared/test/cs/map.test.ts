import { describe, expect, it } from 'vitest';
import { MAPS, drawMap, validateMap, type MapDef } from '../../src/cs/map.js';
import { CANTINA } from '../../src/cs/maps/cantina.js';
import { ESTACIONAMENTO } from '../../src/cs/maps/estacionamento.js';
import { TERMINAL_BOQUEIRAO } from '../../src/cs/maps/terminal-boqueirao.js';
import { sideOf } from '../../src/cs/match.js';
import { raycast } from '../../src/cs/physics.js';
import { createMatch, stepMatch } from '../../src/cs/runner.js';
import { createWorld } from '../../src/cs/sim.js';

const clone = (): MapDef => structuredClone(CANTINA);

describe('Cantina', () => {
  it('passes validation', () => {
    expect(validateMap(CANTINA)).toEqual([]);
  });

  it('is registered in the draw list', () => {
    expect(MAPS).toContain(CANTINA);
  });
});

describe.each([CANTINA, ESTACIONAMENTO, TERMINAL_BOQUEIRAO])('map $name', (map) => {
  it('is valid and registered', () => {
    expect(validateMap(map)).toEqual([]);
    expect(MAPS).toContain(map);
    expect(map.spawns.attack.length).toBeGreaterThanOrEqual(4);
    expect(map.spawns.defense.length).toBeGreaterThanOrEqual(4);
  });

  it('blocks the line of sight from every attack spawn to every defense spawn', () => {
    for (const a of map.spawns.attack) {
      for (const d of map.spawns.defense) {
        const from = { x: a.x, y: 1.65, z: a.z };
        const length = Math.hypot(d.x - a.x, d.z - a.z);
        expect(raycast(map, from, { x: d.x - a.x, y: 0, z: d.z - a.z }, length)).not.toBeNull();
      }
    }
  });

  it('lets bots play a whole match where both sides win rounds', () => {
    let attackWins = 0;
    let defenseWins = 0;
    for (const seed of [1, 2]) {
      let match = createMatch([], seed);
      match = { ...match, mapId: map.id, world: createWorld(map, 0, match.roster, match.rng) };
      let ms = 0;
      let counted = 0;
      while (!match.winner && ms < 40 * 60_000) {
        match = stepMatch(match, {}, 50);
        ms += 50;
        const end = match.world.end;
        if (end && match.roundIndex >= counted) {
          counted = match.roundIndex + 1;
          if (sideOf(end.winner, match.roundIndex) === 'attack') attackWins++;
          else defenseWins++;
        }
      }
      expect(match.winner).not.toBeNull();
    }
    expect(attackWins).toBeGreaterThanOrEqual(3);
    expect(defenseWins).toBeGreaterThanOrEqual(3);
  }, 120_000);
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
    map.links = map.links.filter(([a, b]) => a !== 0 && b !== 0);
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

  it('reports a link that crosses a wall', () => {
    const map = clone();
    const near = (x: number, z: number) =>
      map.waypoints.reduce((best, w, i) => (Math.hypot(w.x - x, w.z - z) < Math.hypot(map.waypoints[best]!.x - x, map.waypoints[best]!.z - z) ? i : best), 0);
    map.links.push([near(20, 25), near(40, 25)]);
    expect(validateMap(map).join('|')).toMatch(/atravessa/);
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
