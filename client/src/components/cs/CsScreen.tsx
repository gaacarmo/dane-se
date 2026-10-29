import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PING_TTL_MS,
  addPing,
  buyForPlayer,
  createMatch,
  eyePos,
  forfeit,
  initialFlow,
  lookDirection,
  needsLockClick,
  raycast,
  reduceFlow,
  simPaused,
  spreadFor,
  stepMatch,
  type FlowEvent,
  type FlowState,
  type Match,
  type Ping,
  type PingKind,
  type WeaponId,
  type WorldEvent,
  WEAPONS,
} from '@dane-se/shared';
import { CHARACTER_NAMES } from '../../lib/characters';
import { setPref, usePrefs } from '../../lib/prefs';
import { useClient } from '../../lib/store';
import { webglSupported } from '../../lib/webgl';
import { Button } from '../ui/Button';
import { BUY_LIST, CsBuyMenu } from './CsBuyMenu';
import { AudioDirector } from './audioDirector';
import { CsHud, type DamageFlash, type FeedItem, type HitMarker, type MoneyGain } from './CsHud';
import { CsMap } from './CsMap';
import { CsMapDraw } from './CsMapDraw';
import { CsScene } from './CsScene';
import { useCsInput, type CsInputHandlers } from './useCsInput';

const STEP_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 5;
const HUD_REFRESH_MS = 100;
const FEED_SIZE = 5;
const FEED_TTL_MS = 6000;
const INTERACT_REACH = 1.5;
const PING_RANGE = 60;
const MAX_FX_QUEUE = 300;
const HALF_FOV_TAN = Math.tan((75 / 2) * (Math.PI / 180));

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

function feedTone(e: WorldEvent, meId: string): FeedItem['tone'] {
  if (e.type !== 'kill') return undefined;
  if (e.killer === meId) return 'kill';
  return e.victim === meId ? 'death' : undefined;
}

/** Direção de quem atirou em radianos relativos ao olhar: 0 à frente, positivo à direita. */
function relativeAngle(match: Match, attackerId: string, meId: string, yaw: number): number | null {
  const attacker = match.world.players.find((p) => p.id === attackerId);
  const me = match.world.players.find((p) => p.id === meId);
  if (!attacker || !me || attacker.id === me.id) return null;
  const dx = attacker.body.pos.x - me.body.pos.x;
  const dz = attacker.body.pos.z - me.body.pos.z;
  const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  return Math.atan2(dx * right.x + dz * right.z, dx * forward.x + dz * forward.z);
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
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [pings, setPings] = useState<Ping[]>([]);
  const [pingKind, setPingKind] = useState<PingKind>('attention');
  const pingKindRef = useRef<PingKind>('attention');
  pingKindRef.current = pingKind;
  const pingId = useRef(0);
  const fxRef = useRef<WorldEvent[]>([]);
  const crosshairRef = useRef<HTMLDivElement>(null);
  const director = useMemo(() => new AudioDirector(), []);
  const [hitMarker, setHitMarker] = useState<HitMarker | null>(null);
  const [damage, setDamage] = useState<DamageFlash | null>(null);
  const [moneyGain, setMoneyGain] = useState<MoneyGain | null>(null);

  const flowRef = useRef<FlowState>(initialFlow());
  const [flow, setFlow] = useState<FlowState>(flowRef.current);
  const stage3d = useRef<HTMLDivElement>(null);
  const handlers = useRef<CsInputHandlers>({ onLock: () => {}, onLockError: () => {} });
  const input = useCsInput(stage3d, handlers);

  /** Aplica o evento na máquina de estados e executa os efeitos dentro do mesmo gesto do usuário. */
  const send = useCallback(
    (event: FlowEvent) => {
      const result = reduceFlow(flowRef.current, event);
      flowRef.current = result.state;
      setFlow(result.state);
      for (const effect of result.effects) {
        if (effect === 'requestLock') input.requestLock();
        else input.releaseLock();
      }
    },
    [input],
  );
  handlers.current = {
    onLock: (locked) => send({ type: 'lock', locked }),
    onLockError: () => send({ type: 'lockError' }),
  };

  const me = hud.world.players.find((p) => p.id === meId)!;
  const onDrawDone = useCallback(() => setStage('play'), []);

  const placePing = useCallback(
    (x: number, z: number) => {
      const at = performance.now();
      setPings((list) => addPing(list, { id: pingId.current++, kind: pingKindRef.current, x, z, by: meId, at }));
    },
    [meId],
  );

  /** Ping no ponto para onde o jogador olha: o primeiro sólido ou o chão, até PING_RANGE metros. */
  const pingAhead = useCallback(() => {
    const m = matchRef.current;
    const mine = m.world.players.find((p) => p.id === meId);
    if (!mine?.alive) return;
    const look = input.look();
    const origin = eyePos(mine.body);
    const dir = lookDirection(look.yaw, look.pitch);
    const solid = raycast(m.world.map, origin, dir, PING_RANGE);
    const floor = dir.y < -0.01 ? Math.min(PING_RANGE, -origin.y / dir.y) : Infinity;
    const t = Math.min(solid ?? Infinity, floor);
    if (Number.isFinite(t)) placePing(origin.x + dir.x * t, origin.z + dir.z * t);
  }, [input, meId, placePing]);

  const buy = useCallback(
    (weapon: WeaponId) => {
      matchRef.current = buyForPlayer(matchRef.current, meId, weapon);
      setHud(matchRef.current);
    },
    [meId],
  );

  useEffect(() => {
    if (stage !== 'play') return;
    const start = matchRef.current.world.players.find((p) => p.id === meId)!;
    input.setLook(start.yaw, 0);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let sinceHud = 0;
    let feedId = 0;
    let hudId = 0;
    let lastMoney = matchRef.current.world.players.find((p) => p.id === meId)!.money;
    let round = matchRef.current.roundIndex;
    let phase = matchRef.current.world.phase;
    let ended = !!matchRef.current.winner;
    const items: (FeedItem & { at: number })[] = [];

    const tick = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;

      if (!simPaused(flowRef.current)) {
        acc += dt;
        let steps = 0;
        while (acc >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
          const before = matchRef.current;
          const pressed = input.read();
          if (pressed.fire) director.emptyClick(before, meId, now);
          const after = stepMatch(before, { [meId]: pressed }, STEP_MS);
          matchRef.current = after;
          if (after.world !== before.world) {
            director.onEvents(after, after.world.events, meId);
            for (const e of after.world.events) {
              const text = eventText(after, e);
              if (text) items.push({ id: feedId++, text, tone: feedTone(e, meId), at: now });
              if (e.type === 'shot') fxRef.current.push(e);
              if (e.type === 'hit' && e.attacker === meId) {
                setHitMarker({ id: ++hudId, kind: e.killed ? 'kill' : e.zone === 'head' ? 'head' : 'body' });
              }
              if (e.type === 'hit' && e.victim === meId) {
                setDamage({ id: ++hudId, angle: relativeAngle(after, e.attacker, meId, input.look().yaw), amount: Math.min(1, e.damage / 60) });
              }
            }
            if (fxRef.current.length > MAX_FX_QUEUE) fxRef.current.splice(0, fxRef.current.length - MAX_FX_QUEUE);
          }
          if (after.roundIndex !== round) {
            round = after.roundIndex;
            input.setLook(after.world.players.find((p) => p.id === meId)!.yaw, 0);
            fxRef.current.length = 0;
            setRoundKey(round);
          }
          acc -= STEP_MS;
          steps++;
        }
        if (steps === MAX_STEPS_PER_FRAME) acc = 0;
        director.frame(matchRef.current, dt / 1000, meId, input.look().yaw);
      }

      const mine = matchRef.current.world.players.find((p) => p.id === meId);
      if (mine?.alive && crosshairRef.current) {
        const spread = spreadFor(mine, WEAPONS[mine.weapon]);
        const pixels = (Math.tan((spread * Math.PI) / 180) / HALF_FOV_TAN) * (window.innerHeight / 2);
        crosshairRef.current.style.setProperty('--gap', `${Math.min(70, 3 + pixels).toFixed(1)}px`);
      }

      const current = matchRef.current;
      if (current.world.phase !== phase || !!current.winner !== ended) {
        phase = current.world.phase;
        ended = !!current.winner;
        send({ type: 'phase', phase, ended });
      }

      sinceHud += dt;
      if (sinceHud >= HUD_REFRESH_MS) {
        sinceHud = 0;
        while (items.length > 0 && now - items[0]!.at > FEED_TTL_MS) items.shift();
        setFeed(items.slice(-FEED_SIZE).map(({ id, text }) => ({ id, text })));
        setHud(matchRef.current);
        if (mine) {
          if (mine.money - lastMoney >= 50) setMoneyGain({ id: ++hudId, amount: mine.money - lastMoney });
          lastMoney = mine.money;
        }
        setPings((list) => (list.some((p) => now - p.at >= PING_TTL_MS) ? list.filter((p) => now - p.at < PING_TTL_MS) : list));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, meId, input, send, director]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Tab') {
        e.preventDefault();
        if (!e.repeat) send({ type: 'key', key: 'map' });
        return;
      }
      if (e.repeat) return;
      if (e.code === 'Escape') send({ type: 'key', key: 'escape' });
      else if (e.code === 'KeyB') send({ type: 'key', key: 'buy' });
      else if (e.code === 'KeyQ' && input.isLocked()) pingAhead();
      else if (flowRef.current.overlay === 'buy' && /^Digit[1-6]$/.test(e.code)) buy(BUY_LIST[Number(e.code.slice(5)) - 1]!);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [input, send, pingAhead, buy]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __csDebug?: unknown };
    w.__csDebug = { flow: () => flowRef.current, send, input, match: () => matchRef.current };
    return () => {
      delete w.__csDebug;
    };
  }, [send, input]);

  function giveUp() {
    matchRef.current = forfeit(matchRef.current, me.team);
    setHud(matchRef.current);
  }

  if (stage === 'draw') return <CsMapDraw mapId={hud.mapId} onDone={onDrawDone} />;

  const world = hud.world;
  const bombPos = world.bomb.pos;
  let hint: string | null = null;
  if (me.alive && world.phase === 'live') {
    const nearBomb = bombPos && Math.hypot(me.body.pos.x - bombPos.x, me.body.pos.z - bombPos.z) <= INTERACT_REACH;
    if (me.hasBomb && world.bomb.status === 'carried') hint = 'Segure E dentro do ponto A ou B para plantar';
    else if (me.side === 'defense' && world.bomb.status === 'planted' && nearBomb) hint = 'Segure E para desarmar';
  }

  return (
    <main className="fixed inset-0 z-50 overflow-hidden bg-black">
      <div ref={stage3d} className="absolute inset-0">
        <CsScene matchRef={matchRef} meId={meId} input={input} roundKey={roundKey} pings={pings} fx={fxRef} />
      </div>
      <CsHud
        match={hud}
        meId={meId}
        feed={feed}
        hint={hint}
        onExit={onExit}
        crosshair={crosshairRef}
        hitMarker={hitMarker}
        damage={damage}
        moneyGain={moneyGain}
      />

      {flow.overlay === 'buy' && (
        <CsBuyMenu match={hud} meId={meId} onBuy={buy} onClose={() => send({ type: 'click', target: 'close-buy' })} />
      )}

      {flow.map && (
        <CsMap
          match={hud}
          meId={meId}
          pings={pings}
          kind={pingKind}
          onKind={setPingKind}
          onPing={placePing}
          onClose={() => send({ type: 'click', target: 'close-map' })}
        />
      )}

      {needsLockClick(flow) && (
        <button
          type="button"
          onClick={() => send({ type: 'click', target: 'play' })}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/45 font-mono text-sm text-stone-200"
        >
          <span>{flow.lockFailed ? 'Clique para voltar ao jogo' : 'Clique para jogar'}</span>
          <span className="text-xs text-stone-400">
            WASD move · Shift anda devagar · Espaço pula · C agacha · R recarrega · 1/2 troca de arma · E interage · Tab mapa · Q ping · B mercado · Esc pausa
          </span>
        </button>
      )}

      {flow.overlay === 'pause' && (
        <PauseMenu
          onResume={() => send({ type: 'click', target: 'resume' })}
          onGiveUp={() => {
            giveUp();
            send({ type: 'phase', phase: matchRef.current.world.phase, ended: true });
          }}
          onExit={onExit}
        />
      )}
    </main>
  );
}

function PauseMenu({ onResume, onGiveUp, onExit }: { onResume: () => void; onGiveUp: () => void; onExit: () => void }) {
  const { csSensitivity } = usePrefs();
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/75 font-mono text-stone-200">
      <p className="mb-2 text-sm tracking-[0.2em] uppercase">Pausa</p>
      <label className="mb-2 flex w-64 flex-col gap-1 text-xs text-stone-400">
        Sensibilidade do mouse
        <input
          type="range"
          min={0.0006}
          max={0.004}
          step={0.0001}
          value={csSensitivity}
          onChange={(e) => setPref('csSensitivity', Number(e.target.value))}
        />
        <span className="text-stone-500">{(csSensitivity * 1000).toFixed(1)}</span>
      </label>
      <Button onClick={onResume}>Continuar</Button>
      <Button variant="danger" onClick={onGiveUp}>
        Desistir
      </Button>
      <Button variant="ghost" onClick={onExit}>
        Sair
      </Button>
    </div>
  );
}
