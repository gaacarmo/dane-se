import { describe, expect, it } from 'vitest';
import { CANTINA } from '../../src/cs/maps/cantina.js';
import {
  CS_STEP_MS,
  VisionTracker,
  applySnapshot,
  buildSnapshot,
  interpolatePlayers,
  predictBody,
  sanitizeInput,
  type CsInputMsg,
} from '../../src/cs/net.js';
import { createMatch, stepMatch, type Match } from '../../src/cs/runner.js';
import { IDLE_INPUT, stepWorld, type PlayerInput, type World, type WorldEvent } from '../../src/cs/sim.js';

const validInput = (patch: Partial<PlayerInput> = {}): PlayerInput => ({ ...IDLE_INPUT, ...patch });

describe('sanitizeInput', () => {
  it('accepts a well formed input', () => {
    const input = validInput({ moveZ: 1, yaw: 1.2, pitch: 0.3, fire: true, slot: 2 });
    expect(sanitizeInput(input)).toEqual(input);
  });

  it('refuses anything that is not an object with numeric look and move', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}, { moveX: 0, moveZ: 0 }, { ...IDLE_INPUT, yaw: 'a' }]) {
      expect(sanitizeInput(bad)).toBeNull();
    }
  });

  it('refuses NaN and Infinity', () => {
    expect(sanitizeInput({ ...IDLE_INPUT, yaw: NaN })).toBeNull();
    expect(sanitizeInput({ ...IDLE_INPUT, pitch: Infinity })).toBeNull();
    expect(sanitizeInput({ ...IDLE_INPUT, moveX: -Infinity })).toBeNull();
  });

  it('clamps movement and pitch and wraps yaw', () => {
    const out = sanitizeInput({ ...IDLE_INPUT, moveX: 9, moveZ: -9, pitch: 9, yaw: 1e9 })!;
    expect(out.moveX).toBe(1);
    expect(out.moveZ).toBe(-1);
    expect(out.pitch).toBe(1.5);
    expect(Math.abs(out.yaw)).toBeLessThanOrEqual(Math.PI + 1e-9);
  });

  it('refuses a slot outside 0 to 3 and treats non-boolean flags as false', () => {
    expect(sanitizeInput({ ...IDLE_INPUT, slot: 7 })).toBeNull();
    expect(sanitizeInput({ ...IDLE_INPUT, slot: 1.5 })).toBeNull();
    const out = sanitizeInput({ ...IDLE_INPUT, fire: 'yes', jump: 1 })!;
    expect(out.fire).toBe(false);
    expect(out.jump).toBe(false);
  });
});

/** Partida ao vivo na Cantina: h1 no time A (ataque) e h2 no time B (defesa). */
function liveMatch(seed = 1): Match {
  let match = createMatch([{ id: 'h1', name: 'h1', team: 'A' }, { id: 'h2', name: 'h2', team: 'B' }], seed);
  for (let i = 0; i < 4000 && match.world.phase !== 'live'; i++) match = stepMatch(match, {}, 50);
  expect(match.world.phase).toBe('live');
  return match;
}

function place(match: Match, id: string, x: number, z: number, patch: Partial<{ vx: number; vz: number; alive: boolean }> = {}): Match {
  const players = match.world.players.map((p) =>
    p.id === id
      ? {
          ...p,
          alive: patch.alive ?? p.alive,
          body: { ...p.body, pos: { x, y: 0, z }, vel: { x: patch.vx ?? 0, y: 0, z: patch.vz ?? 0 }, onGround: true },
        }
      : p,
  );
  return { ...match, world: { ...match.world, players } };
}

/** Todos longe de tudo, no pátio de cada time, para os testes de visão controlarem quem enxerga quem. */
function scattered(match: Match): Match {
  let m = match;
  m = place(m, 'h1', 10, 25);
  m = place(m, 'bot-A2', 5, 40);
  m = place(m, 'bot-A3', 5, 8);
  m = place(m, 'h2', 70, 25);
  m = place(m, 'bot-B2', 72, 45);
  m = place(m, 'bot-B3', 72, 5);
  return m;
}

const snapFor = (match: Match, viewer: string, tracker = new VisionTracker(), now = 1000, events: WorldEvent[] = []) =>
  buildSnapshot(match, viewer, tracker, 7, 3, now, events);

describe('buildSnapshot', () => {
  it('gives the viewer private fields and teammates only public ones plus hp and money', () => {
    const snap = snapFor(scattered(liveMatch()), 'h1');
    const self = snap.players.find((p) => p.id === 'h1')!;
    expect(self.ammo).toBeGreaterThan(0);
    expect(self.money).toBeDefined();
    expect(self.holstered === null || typeof self.holstered === 'object').toBe(true);
    const mate = snap.players.find((p) => p.id === 'bot-A2')!;
    expect(mate.hp).toBeDefined();
    expect(mate.money).toBeDefined();
    expect(mate.ammo).toBeUndefined();
    expect(mate.punchPitch).toBeUndefined();
  });

  it('sends vest, helmet and kit to the owner and the team, never to an enemy', () => {
    let match = place(place(scattered(liveMatch()), 'h1', 10, 25), 'bot-B2', 18, 26);
    const wear = { armor: 70, helmet: true, kit: true };
    match = { ...match, world: { ...match.world, players: match.world.players.map((p) => ({ ...p, ...wear })) } };
    const players = snapFor(match, 'h1').players;
    expect(players.find((p) => p.id === 'h1')).toMatchObject(wear);
    expect(players.find((p) => p.id === 'bot-A2')).toMatchObject(wear);
    const enemy = players.find((p) => p.id === 'bot-B2')!;
    expect(enemy.armor).toBeUndefined();
    expect(enemy.kit).toBeUndefined();
  });

  it('carries the round, score and ack of the viewer', () => {
    const snap = snapFor(scattered(liveMatch()), 'h1');
    expect(snap).toMatchObject({ tick: 7, ack: 3, phase: 'live', roundIndex: 0, winner: null });
    expect(snap.score).toEqual({ A: 0, B: 0 });
    expect(Object.keys(snap.stats)).toHaveLength(6);
  });

  it('leaves out an enemy behind a wall', () => {
    const match = place(scattered(liveMatch()), 'bot-B2', 45, 15);
    const snap = snapFor(place(match, 'h1', 20, 15), 'h1');
    expect(snap.players.some((p) => p.id === 'bot-B2')).toBe(false);
  });

  it('includes an enemy in the open, without private fields', () => {
    const match = place(place(scattered(liveMatch()), 'h1', 10, 25), 'bot-B2', 18, 26);
    const enemy = snapFor(match, 'h1').players.find((p) => p.id === 'bot-B2')!;
    expect(enemy).toBeDefined();
    expect(enemy.hp).toBeUndefined();
    expect(enemy.money).toBeUndefined();
    expect(enemy.ammo).toBeUndefined();
    expect(enemy.weapon).toBeDefined();
  });

  it('shows an enemy to the whole team when only one teammate sees them', () => {
    let match = scattered(liveMatch());
    match = place(match, 'bot-A2', 10, 40);
    match = place(match, 'bot-B2', 18, 41);
    expect(snapFor(match, 'h1').players.some((p) => p.id === 'bot-B2')).toBe(true);
  });

  it('keeps showing an enemy for 250 ms after the sight line breaks', () => {
    const tracker = new VisionTracker();
    const open = place(place(scattered(liveMatch()), 'h1', 10, 25), 'bot-B2', 18, 26);
    expect(snapFor(open, 'h1', tracker, 1000).players.some((p) => p.id === 'bot-B2')).toBe(true);
    const hidden = place(open, 'bot-B2', 45, 15);
    expect(snapFor(hidden, 'h1', tracker, 1200).players.some((p) => p.id === 'bot-B2')).toBe(true);
    expect(snapFor(hidden, 'h1', tracker, 1300).players.some((p) => p.id === 'bot-B2')).toBe(false);
  });

  it('shows no enemy during the buy and preparation phases, even next to the viewer', () => {
    const open = place(place(scattered(liveMatch()), 'h1', 10, 25), 'bot-B2', 12, 25);
    for (const phase of ['buy', 'prep'] as const) {
      const match = { ...open, world: { ...open.world, phase } };
      expect(snapFor(match, 'h1').players.some((p) => p.id === 'bot-B2')).toBe(false);
    }
  });

  it('leaves out dead enemies but keeps dead teammates, marked dead', () => {
    let match = place(place(scattered(liveMatch()), 'h1', 10, 25), 'bot-B2', 18, 26, { alive: false });
    match = place(match, 'bot-A2', 10, 40, { alive: false });
    const snap = snapFor(match, 'h1');
    expect(snap.players.some((p) => p.id === 'bot-B2')).toBe(false);
    expect(snap.players.find((p) => p.id === 'bot-A2')!.alive).toBe(false);
  });

  it('reports a running enemy as a sound when it is close but out of sight, and not when slow or far', () => {
    const base = place(place(scattered(liveMatch()), 'h1', 20, 15), 'bot-B2', 40, 15, { vx: 5.5 });
    expect(snapFor(base, 'h1').heard).toHaveLength(1);
    expect(snapFor(place(base, 'bot-B2', 40, 15, { vx: 2.5 }), 'h1').heard).toHaveLength(0);
    expect(snapFor(place(base, 'bot-B2', 70, 15, { vx: 5.5 }), 'h1').heard).toHaveLength(0);
  });

  it('filters events: shots of enemies out of sight keep only the sound, hits only reach their two sides', () => {
    const match = place(place(scattered(liveMatch()), 'h1', 20, 15), 'bot-B2', 45, 15);
    const shot = (shooter: string): WorldEvent => ({
      type: 'shot',
      shooter,
      weapon: 'tabelinha',
      from: { x: 45, y: 1.65, z: 15 },
      to: { x: 30, y: 1, z: 15 },
      hit: 'wall',
      normal: { x: 1, y: 0, z: 0 },
    });
    const hit = (attacker: string, victim: string): WorldEvent => ({ type: 'hit', attacker, victim, zone: 'body', damage: 30, killed: false });
    const kill: WorldEvent = { type: 'kill', killer: 'bot-B2', victim: 'bot-B3', headshot: false };
    const events = [shot('bot-B2'), shot('bot-A2'), hit('bot-B2', 'h1'), hit('bot-B2', 'bot-A2'), hit('h1', 'bot-B2'), kill];
    const out = snapFor(match, 'h1', new VisionTracker(), 1000, events).events;

    const hidden = out.find((e) => e.type === 'shot' && e.shooter === 'bot-B2');
    expect(hidden).toMatchObject({ type: 'shot', hit: 'none' });
    if (hidden?.type === 'shot') {
      expect(hidden.to).toEqual(hidden.from);
      expect(hidden.normal).toBeUndefined();
    }
    expect(out.some((e) => e.type === 'shot' && e.shooter === 'bot-A2' && e.hit === 'wall')).toBe(true);
    expect(out.filter((e) => e.type === 'hit')).toHaveLength(2);
    expect(out.some((e) => e.type === 'hit' && e.attacker === 'bot-B2' && e.victim === 'bot-A2')).toBe(false);
    expect(out.some((e) => e.type === 'kill')).toBe(true);
  });

  it('rounds positions to the centimeter', () => {
    const match = place(scattered(liveMatch()), 'h1', 10.123456, 25.987654);
    const self = snapFor(match, 'h1').players.find((p) => p.id === 'h1')!;
    expect(self.x).toBe(10.12);
    expect(self.z).toBe(25.99);
  });
});

describe('applySnapshot', () => {
  const base = (match: Match) => ({ roster: match.roster, map: CANTINA });

  it('rebuilds a Match the client can render', () => {
    const match = place(place(scattered(liveMatch()), 'h1', 10, 25), 'bot-B2', 18, 26);
    const snap = snapFor(match, 'h1');
    const view = applySnapshot(null, snap, base(match));
    expect(view.world.players.map((p) => p.id)).toEqual(match.roster.map((r) => r.id));
    const self = view.world.players.find((p) => p.id === 'h1')!;
    const original = match.world.players.find((p) => p.id === 'h1')!;
    expect(self.ammo).toBe(original.ammo);
    expect(self.body.pos.x).toBeCloseTo(10, 5);
    expect(self.side).toBe('attack');
    expect(view.world.phase).toBe('live');
    expect(view.score).toEqual({ A: 0, B: 0 });
    expect(view.mapId).toBe('cantina');
    expect(view.world.map).toBe(CANTINA);
    expect(Object.keys(view.stats)).toHaveLength(6);
  });

  it('rebuilds the vest, helmet and kit of the viewer and the team', () => {
    let match = scattered(liveMatch());
    match = { ...match, world: { ...match.world, players: match.world.players.map((p) => ({ ...p, armor: 45, helmet: true, kit: p.id === 'h1' })) } };
    const view = applySnapshot(null, snapFor(match, 'h1'), base(match));
    expect(view.world.players.find((p) => p.id === 'h1')).toMatchObject({ armor: 45, helmet: true, kit: true });
    expect(view.world.players.find((p) => p.id === 'bot-A2')).toMatchObject({ armor: 45, helmet: true, kit: false });
  });

  it('hides the enemies the snapshot did not include', () => {
    const match = place(scattered(liveMatch()), 'bot-B2', 45, 15);
    const view = applySnapshot(null, snapFor(place(match, 'h1', 20, 15), 'h1'), base(match));
    expect(view.world.players.find((p) => p.id === 'bot-B2')!.alive).toBe(false);
    expect(view.world.players.find((p) => p.id === 'bot-A2')!.alive).toBe(true);
  });

  it('puts the preparation gate in the map during buy and preparation', () => {
    const match = liveMatch();
    const prep = { ...match, world: { ...match.world, phase: 'prep' as const } };
    const view = applySnapshot(null, snapFor(prep, 'h1'), base(match));
    expect(view.world.map.solids).toContain(CANTINA.barrier);
    expect(view.world.baseMap).toBe(CANTINA);
  });

  it('flips the side of each player on a swap round', () => {
    const match = liveMatch();
    const swapped = { ...match, roundIndex: 3, world: { ...match.world, roundIndex: 3 } };
    const view = applySnapshot(null, snapFor(swapped, 'h1'), base(match));
    expect(view.world.players.find((p) => p.id === 'h1')!.side).toBe('defense');
    expect(view.world.players.find((p) => p.id === 'h2')!.side).toBe('attack');
  });
});

describe('interpolatePlayers', () => {
  const snap = (players: { id: string; x: number; yaw: number }[]) =>
    ({ players: players.map((p) => ({ id: p.id, x: p.x, y: 0, z: 0, yaw: p.yaw, pitch: 0 })) }) as never;

  it('blends position and takes the short way around for yaw', () => {
    const out = interpolatePlayers(snap([{ id: 'a', x: 0, yaw: Math.PI - 0.1 }]), snap([{ id: 'a', x: 10, yaw: -Math.PI + 0.1 }]), 0.5);
    const a = out.get('a')!;
    expect(a.x).toBeCloseTo(5, 6);
    expect(Math.abs(Math.abs(a.yaw) - Math.PI)).toBeLessThan(1e-6);
  });

  it('uses the newer value for a player the older snapshot lacks', () => {
    const out = interpolatePlayers(snap([]), snap([{ id: 'a', x: 4, yaw: 1 }]), 0.3);
    expect(out.get('a')).toMatchObject({ x: 4, yaw: 1 });
  });

  it('clamps alpha to the range', () => {
    const a = snap([{ id: 'a', x: 0, yaw: 0 }]);
    const b = snap([{ id: 'a', x: 10, yaw: 0 }]);
    expect(interpolatePlayers(a, b, 5).get('a')!.x).toBe(10);
    expect(interpolatePlayers(a, b, -2).get('a')!.x).toBe(0);
  });
});

describe('predictBody', () => {
  const walking = (n: number): CsInputMsg[] => Array.from({ length: n }, (_, i) => ({ seq: i + 1, input: validInput({ moveZ: 1, yaw: -Math.PI / 2 }) }));
  const bodyOf = (world: World, id: string) => world.players.find((p) => p.id === id)!.body;

  it('returns the server body when nothing is pending', () => {
    const body = bodyOf(liveMatch().world, 'h1');
    expect(predictBody(CANTINA, body, [], 'chinelo', true, 'live')).toBe(body);
  });

  it('moves the body by the pending inputs', () => {
    const body = bodyOf(liveMatch().world, 'h1');
    const predicted = predictBody(CANTINA, body, walking(10), 'chinelo', true, 'live');
    expect(predicted.pos.x).toBeGreaterThan(body.pos.x + 0.3);
  });

  it('does not move in the buy phase or when dead', () => {
    const body = bodyOf(liveMatch().world, 'h1');
    expect(predictBody(CANTINA, body, walking(10), 'chinelo', true, 'buy')).toBe(body);
    expect(predictBody(CANTINA, body, walking(10), 'chinelo', false, 'live')).toBe(body);
  });

  it('lands exactly where the engine puts the player for the same inputs', () => {
    const match = liveMatch();
    const inputs = walking(20);
    let world = match.world;
    for (const { input } of inputs) world = stepWorld(world, { h1: input }, CS_STEP_MS);
    const player = match.world.players.find((p) => p.id === 'h1')!;
    const predicted = predictBody(match.world.map, player.body, inputs, player.weapon, true, 'live');
    const engine = bodyOf(world, 'h1');
    expect(predicted.pos.x).toBeCloseTo(engine.pos.x, 9);
    expect(predicted.pos.z).toBeCloseTo(engine.pos.z, 9);
    expect(predicted.vel.x).toBeCloseTo(engine.vel.x, 9);
  });
});
