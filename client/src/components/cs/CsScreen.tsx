import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buyForPlayer,
  createMatch,
  eyePos,
  forfeit,
  lookDirection,
  raycast,
  stepMatch,
  type Match,
  type WeaponId,
  type WorldEvent,
} from '@dane-se/shared';
import { CHARACTER_NAMES } from '../../lib/characters';
import { useClient } from '../../lib/store';
import { webglSupported } from '../../lib/webgl';
import { Button } from '../ui/Button';
import { CsBuyMenu } from './CsBuyMenu';
import { CsHud, type FeedItem } from './CsHud';
import { CsMap } from './CsMap';
import { CsMapDraw } from './CsMapDraw';
import { CsScene } from './CsScene';
import { PING_TTL_MS, addPing, type Ping, type PingKind } from '@dane-se/shared';
import { useCsInput } from './useCsInput';

const STEP_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 5;
const HUD_REFRESH_MS = 100;
const FEED_SIZE = 5;
const FEED_TTL_MS = 6000;
const INTERACT_REACH = 1.5;

function unsupportedReason(): string | null {
  if (!webglSupported) return 'Este navegador não tem WebGL, necessário para o modo CS.';
  if (!('requestPointerLock' in document.documentElement)) return 'Este navegador não permite travar o mouse.';
  try {
    if (window.matchMedia('(pointer: coarse)').matches) return 'O modo CS no celular chega na próxima etapa. Por enquanto, use um computador.';
  } catch {
    /* sem matchMedia: segue como desktop */
  }
  return null;
}

export function CsScreen({ onExit }: { onExit: () => void }) {
  const reason = unsupportedReason();
  if (reason) {
    return (
      <main className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black p-6 text-center font-mono text-stone-300">
        <p className="max-w-sm text-sm">{reason}</p>
        <Button variant="secondary" onClick={onExit}>
          Voltar
        </Button>
      </main>
    );
  }
  return <CsGame onExit={onExit} />;
}

function eventText(match: Match, e: WorldEvent): string | null {
  const name = (id: string) => {
    const entry = match.roster.find((r) => r.id === id);
    if (!entry) return id;
    return entry.bot ? CHARACTER_NAMES[entry.character] : entry.name;
  };
  switch (e.type) {
    case 'kill':
      return `${name(e.killer)} › ${name(e.victim)}${e.headshot ? ' (cabeça)' : ''}`;
    case 'plant':
      return `${name(e.by)} plantou a bomba no ponto ${e.site}`;
    case 'defuse':
      return `${name(e.by)} desarmou a bomba`;
    case 'explode':
      return 'A bomba explodiu';
    default:
      return null;
  }
}

function CsGame({ onExit }: { onExit: () => void }) {
  const { profile } = useClient();
  const meId = profile?.id ?? 'jogador';
  const meName = profile?.nickname ?? 'Você';

  const matchRef = useRef<Match>(null as unknown as Match);
  if (!matchRef.current) matchRef.current = createMatch([{ id: meId, name: meName }], Date.now() % 2_147_483_647);
  const [hud, setHud] = useState<Match>(matchRef.current);
  const [stage, setStage] = useState<'draw' | 'play'>('draw');
  const [roundKey, setRoundKey] = useState(0);
  const [buyOpen, setBuyOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [mapOpen, setMapOpen] = useState(false);
  const [pings, setPings] = useState<Ping[]>([]);
  const [pingKind, setPingKind] = useState<PingKind>('attention');
  const pingId = useRef(0);
  const mapOpenRef = useRef(false);
  mapOpenRef.current = mapOpen;

  const stage3d = useRef<HTMLDivElement>(null);
  const input = useCsInput(stage3d);
  const pausedRef = useRef(false);
  pausedRef.current = menuOpen;
  const lockedRef = useRef(false);
  lockedRef.current = input.locked;

  const me = hud.world.players.find((p) => p.id === meId)!;
  const phase = hud.world.phase;

  const refresh = useCallback(() => setHud(matchRef.current), []);
  const onDrawDone = useCallback(() => setStage('play'), []);

  useEffect(() => {
    if (stage !== 'play') return;
    const start = matchRef.current.world.players.find((p) => p.id === meId)!;
    input.setLook(start.yaw, 0);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let sinceHud = 0;
    let feedId = 0;
    let round = matchRef.current.roundIndex;
    const items: (FeedItem & { at: number })[] = [];

    const tick = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      const current = matchRef.current;
      const waitingForLock =
        current.world.phase === 'live' && !lockedRef.current && !mapOpenRef.current && !current.winner;
      if (!pausedRef.current && !waitingForLock) {
        acc += dt;
        let steps = 0;
        while (acc >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
          const before = matchRef.current;
          const after = stepMatch(before, { [meId]: input.read() }, STEP_MS);
          matchRef.current = after;
          if (after.world !== before.world) {
            for (const e of after.world.events) {
              const text = eventText(after, e);
              if (text) items.push({ id: feedId++, text, at: now });
            }
          }
          if (after.roundIndex !== round) {
            round = after.roundIndex;
            const mine = after.world.players.find((p) => p.id === meId)!;
            input.setLook(mine.yaw, 0);
            setRoundKey(round);
            setBuyOpen(true);
            input.releaseLock();
          }
          acc -= STEP_MS;
          steps++;
        }
        if (steps === MAX_STEPS_PER_FRAME) acc = 0;
      }
      sinceHud += dt;
      if (sinceHud >= HUD_REFRESH_MS) {
        sinceHud = 0;
        while (items.length > 0 && now - items[0]!.at > FEED_TTL_MS) items.shift();
        setFeed(items.slice(-FEED_SIZE).map(({ id, text }) => ({ id, text })));
        setHud(matchRef.current);
        setPings((list) => (list.some((p) => now - p.at >= PING_TTL_MS) ? list.filter((p) => now - p.at < PING_TTL_MS) : list));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, meId, input]);

  useEffect(() => {
    if (phase !== 'buy') setBuyOpen(false);
  }, [phase]);

  const wasLocked = useRef(false);
  useEffect(() => {
    if (wasLocked.current && !input.locked && phase !== 'buy' && !hud.winner && !mapOpenRef.current) setMenuOpen(true);
    wasLocked.current = input.locked;
  }, [input.locked, phase, hud.winner]);

  useEffect(() => {
    if (hud.winner) input.releaseLock();
  }, [hud.winner, input]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        if (!e.repeat && !matchRef.current.winner) toggleMap();
        return;
      }
      if (e.code === 'Escape' && mapOpenRef.current) {
        toggleMap();
        return;
      }
      if (e.code === 'KeyQ' && !e.repeat) pingAhead();
      if (e.code !== 'KeyB' || matchRef.current.world.phase !== 'buy') return;
      setBuyOpen((open) => {
        if (!open) input.releaseLock();
        return !open;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [input, pingKind]);

  function placePing(x: number, z: number) {
    const at = performance.now();
    setPings((list) => addPing(list, { id: pingId.current++, kind: pingKind, x, z, by: meId, at }));
  }

  function toggleMap() {
    if (mapOpenRef.current) {
      setMapOpen(false);
      input.requestLock();
    } else {
      setMapOpen(true);
      input.releaseLock();
    }
  }

  /** Ping no ponto para onde o jogador olha: o primeiro sólido ou o chão, até 60 m. */
  function pingAhead() {
    const m = matchRef.current;
    const mine = m.world.players.find((p) => p.id === meId);
    if (!mine?.alive) return;
    const look = input.look();
    const origin = eyePos(mine.body);
    const dir = lookDirection(look.yaw, look.pitch);
    const solid = raycast(m.world.map, origin, dir, 60);
    const floor = dir.y < -0.01 ? Math.min(60, -origin.y / dir.y) : Infinity;
    const t = Math.min(solid ?? Infinity, floor);
    if (!Number.isFinite(t)) return;
    placePing(origin.x + dir.x * t, origin.z + dir.z * t);
  }

  function buy(weapon: WeaponId) {
    matchRef.current = buyForPlayer(matchRef.current, meId, weapon);
    refresh();
  }

  function giveUp() {
    matchRef.current = forfeit(matchRef.current, me.team);
    setMenuOpen(false);
    input.releaseLock();
    refresh();
  }

  function resume() {
    setMenuOpen(false);
    input.requestLock();
  }

  if (stage === 'draw') return <CsMapDraw mapId={hud.mapId} onDone={onDrawDone} />;

  const world = hud.world;
  const bombPos = world.bomb.pos;
  let hint: string | null = null;
  if (me.alive && phase === 'live') {
    const nearBomb = bombPos && Math.hypot(me.body.pos.x - bombPos.x, me.body.pos.z - bombPos.z) <= INTERACT_REACH;
    if (me.hasBomb && world.bomb.status === 'carried') hint = 'Segure E dentro do ponto A ou B para plantar';
    else if (me.side === 'defense' && world.bomb.status === 'planted' && nearBomb) hint = 'Segure E para desarmar';
  }

  const showBuy = phase === 'buy' && buyOpen && !hud.winner;
  const needsClick = !input.locked && !menuOpen && !mapOpen && !hud.winner && !showBuy;

  return (
    <main className="fixed inset-0 z-50 overflow-hidden bg-black">
      <div ref={stage3d} className="absolute inset-0">
        <CsScene matchRef={matchRef} meId={meId} input={input} roundKey={roundKey} pings={pings} />
      </div>
      <CsHud match={hud} meId={meId} feed={feed} hint={hint} onExit={onExit} />

      {showBuy && <CsBuyMenu match={hud} meId={meId} onBuy={buy} onClose={() => setBuyOpen(false)} />}

      {mapOpen && (
        <CsMap
          match={hud}
          meId={meId}
          pings={pings}
          kind={pingKind}
          onKind={setPingKind}
          onPing={placePing}
          onClose={toggleMap}
        />
      )}

      {needsClick && (
        <button
          type="button"
          onClick={() => input.requestLock()}
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 font-mono text-sm text-stone-200"
        >
          Clique para jogar · WASD move · Espaço pula · C agacha · R recarrega · E interage · Tab mapa · Q ping · B mercado · Esc menu
        </button>
      )}

      {menuOpen && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/75 font-mono text-stone-200">
          <p className="mb-2 text-sm tracking-[0.2em] uppercase">Pausa</p>
          <Button onClick={resume}>Continuar</Button>
          <Button variant="danger" onClick={giveUp}>
            Desistir
          </Button>
          <Button variant="ghost" onClick={onExit}>
            Sair
          </Button>
        </div>
      )}
    </main>
  );
}
