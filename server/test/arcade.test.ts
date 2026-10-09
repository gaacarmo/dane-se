import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isDaneseRoom, type RoomView } from '@dane-se/shared';
import { BotClient } from '../scripts/botClient.js';
import { createApp } from '../src/app.js';

let server: ReturnType<typeof createApp>;
let url: string;
let clients: BotClient[];

beforeEach(async () => {
  server = createApp({
    timings: {
      trickPauseMs: 5,
      roundSummaryMs: 5,
      botDelayMs: 5,
      reconnectGraceMs: 400,
      hostGraceMs: 50,
      emptyRoomTtlMs: 100,
    },
    clientDist: '/nonexistent',
  });
  url = `http://localhost:${await server.listen(0)}`;
  clients = [];
});

afterEach(async () => {
  for (const c of clients) c.close();
  await server.close();
});

function client(name: string): BotClient {
  const c = new BotClient(url, name);
  clients.push(c);
  return c;
}

/** Narrows a room view to the Dane-se branch. */
function danese(view: RoomView | null | undefined): Extract<RoomView, { gameType: 'danese' }> {
  if (!view || !isDaneseRoom(view)) throw new Error('expected a Dane-se room');
  return view;
}

/** Two players in one arcade room, each on a known character. */
async function arcadeLobby() {
  const host = client('Ana');
  const guest = client('Bia');
  const { code } = await host.create({ arcade: true });
  expect((await guest.join(code)).ok).toBe(true);
  await host.waitFor((v) => v.members.length === 2);
  // Deterministic kits: Martelo picks 1 talent, Dezin picks 1, Carmelo picks 2.
  await host.setCharacter('martelo');
  await guest.setCharacter('dezin');
  return { host, guest, code };
}

describe('arcade lobby', () => {
  it('is off by default and only the host can switch it on', async () => {
    const host = client('Ana');
    const guest = client('Bia');
    const { code } = await host.create();
    await guest.join(code);
    await host.waitFor((v) => v.members.length === 2);

    expect(host.view!.arcade).toBe(false);
    expect(host.view!.yourTalents).toEqual([]);

    expect(await guest.setArcade(true)).toEqual({ ok: false, error: 'NOT_HOST' });
    expect((await host.setArcade(true)).ok).toBe(true);
    await guest.waitFor((v) => v.arcade === true);
  });

  it('validates talents against the character and keeps only readiness public', async () => {
    const { host, guest } = await arcadeLobby();

    // Martelo (1 talent): two picks or an unknown id are rejected.
    expect(await host.setTalents(['radar', 'escudo'])).toEqual({ ok: false, error: 'INVALID_TALENTS' });
    expect(await host.setTalents(['invisivel'])).toEqual({ ok: false, error: 'INVALID_TALENTS' });
    expect((await host.setTalents(['radar'])).ok).toBe(true);

    // Readiness is public, but the pick itself stays private.
    const guestSeesHostReady = await guest.waitFor((v) => v.members.filter((m) => m.talentsReady).length === 1);
    expect(guestSeesHostReady.yourTalents).toEqual([]);

    expect((await guest.setTalents(['escudo'])).ok).toBe(true);
    await host.waitFor((v) => v.members.every((m) => m.talentsReady));
    expect(host.view!.yourTalents).toEqual(['radar']);
    expect(guest.view!.yourTalents).toEqual(['escudo']);
  });

  it('Carmelo needs two talents; a single pick is valid but not ready', async () => {
    const { host, guest } = await arcadeLobby();
    await guest.setCharacter('carmelo');

    expect((await guest.setTalents(['escudo'])).ok).toBe(true);
    const partial = await guest.waitFor((v) => v.yourTalents.length === 1);
    expect(partial.members.find((m) => m.name === 'Bia')!.talentsReady).toBe(false);

    // A partial set does not build a loadout, so the game can't start yet.
    await host.setTalents(['radar']);
    expect(await host.start()).toEqual({ ok: false, error: 'TALENTS_REQUIRED' });

    expect((await guest.setTalents(['escudo', 'curinga'])).ok).toBe(true);
    await host.waitFor((v) => v.members.every((m) => m.talentsReady));
  });

  it('starts a match carrying each player’s kit and a public charged aura', async () => {
    const { host, guest } = await arcadeLobby();
    await host.setTalents(['escudo']);
    await guest.setTalents(['radar']);
    await host.waitFor((v) => v.members.every((m) => m.talentsReady));

    expect((await guest.start())).toEqual({ ok: false, error: 'NOT_HOST' });
    expect((await host.start()).ok).toBe(true);

    const views = await Promise.all([host, guest].map((p) => p.waitFor((v) => v.game?.phase === 'betting')));
    const hostId = host.view!.youId;
    for (const v of views) {
      const g = danese(v).game!;
      expect(g.arcade.enabled).toBe(true);
      // The viewer's own loadout is private and matches the lobby pick.
      expect(g.arcade.loadout).toEqual(
        v.youId === hostId ? { character: 'martelo', talents: ['escudo'] } : { character: 'dezin', talents: ['radar'] },
      );
      // The only public signal about kits is the charged 1× special.
      for (const p of g.players) expect(p.specialCharged).toBe(true);
    }
  });

  it('switching arcade off clears every pick and blocks new ones', async () => {
    const { host, guest } = await arcadeLobby();
    await host.setTalents(['radar']);
    await guest.setTalents(['escudo']);
    await host.waitFor((v) => v.members.every((m) => m.talentsReady));

    expect((await host.setArcade(false)).ok).toBe(true);
    await host.waitFor((v) => v.arcade === false);
    expect(host.view!.yourTalents).toEqual([]);
    expect(host.view!.members.every((m) => m.talentsReady)).toBe(true); // no arcade: readiness is moot

    expect(await guest.setTalents(['escudo'])).toEqual({ ok: false, error: 'INVALID_TALENTS' });

    expect((await host.setArcade(true)).ok).toBe(true);
    await host.waitFor((v) => v.arcade === true && v.members.every((m) => !m.talentsReady));
  });
});

describe('arcade talent window', () => {
  it('opens a deadline and auto-fills stragglers when it closes', async () => {
    const app = createApp({ timings: { talentPickMs: 400 }, clientDist: '/nonexistent' });
    const localUrl = `http://localhost:${await app.listen(0)}`;
    const host = new BotClient(localUrl, 'Ana');
    const guest = new BotClient(localUrl, 'Bia');
    try {
      const { code } = await host.create({ arcade: true });
      // The window opens the moment arcade is switched on.
      expect(host.view!.talentDeadline).not.toBeNull();

      expect((await guest.join(code)).ok).toBe(true);
      await host.waitFor((v) => v.members.length === 2);
      await host.setCharacter('martelo');
      await guest.setCharacter('carmelo');
      await host.waitFor((v) => v.members.every((m) => !m.talentsReady));

      // Nobody picks: on expiry the server fills the first talents each kit allows.
      const settled = (v: RoomView) => v.talentDeadline === null && v.members.every((m) => m.talentsReady);
      const [hostFilled, guestFilled] = await Promise.all([
        host.waitFor(settled, 4000),
        guest.waitFor(settled, 4000),
      ]);
      expect(hostFilled.yourTalents).toEqual(['escudo']); // Martelo: 1 talent
      expect(guestFilled.yourTalents).toEqual(['escudo', 'radar']); // Carmelo: 2
    } finally {
      host.close();
      guest.close();
      await app.close();
    }
  });
});
