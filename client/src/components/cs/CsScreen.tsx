import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PING_TTL_MS,
  addPing,
  eyePos,
  initialFlow,
  isSideSwapRound,
  lookDirection,
  needsLockClick,
  raycast,
  reduceFlow,
  simPaused,
  spreadFor,
  type FlowEvent,
  type FlowState,
  type Match,
  type Ping,
  type PingKind,
  type WeaponId,
  type WorldEvent,
  type Vec3,
  WEAPONS,
} from '@dane-se/shared';
import { setPref, usePrefs } from '../../lib/prefs';
import { useClient } from '../../lib/store';
import { webglSupported } from '../../lib/webgl';
import { VoiceButton } from '../VoiceButton';
import { Button } from '../ui/Button';
import { BUY_LIST, CsBuyMenu } from './CsBuyMenu';
import { AudioDirector } from './audioDirector';
import { CsHud, type DamageFlash, type FeedItem, type HitMarker, type MoneyGain } from './CsHud';
import { CsMap } from './CsMap';
import { CsMapDraw } from './CsMapDraw';
import { CsScene } from './CsScene';
import { playerName } from './CsScoreboard';
import { LocalDriver, type CsDriver } from './driver';
import { useCsInput, type CsInputHandlers } from './useCsInput';

const HUD_REFRESH_MS = 100;
const FEED_SIZE = 5;
const FEED_TTL_MS = 6000;
const INTERACT_REACH = 1.5;
const PING_RANGE = 60;
const MAX_FX_QUEUE = 300;
const SWAP_NOTICE_MS = 7000;
const HALF_FOV_TAN = Math.tan((75 / 2) * (Math.PI / 180));

export function unsupportedReason(): string | null {
  if (!webglSupported) return 'Este navegador não tem WebGL, necessário para o modo CS.';
  if (!('requestPointerLock' in document.documentElement)) return 'Este navegador não permite travar o mouse.';
  try {
    if (window.matchMedia('(pointer: coarse)').matches) return 'O modo CS no celular chega na próxima etapa. Por enquanto, use um computador.';
  } catch {
    /* sem matchMedia: segue como desktop */
  }
  return null;
}

/** Treino sozinho contra bots. */
export function CsScreen({ onExit }: { onExit: () => void }) {
  const reason = unsupportedReason();
  if (reason) return <CsUnsupported reason={reason} onExit={onExit} />;
  return <CsSolo onExit={onExit} />;
}

export function CsUnsupported({ reason, onExit }: { reason: string; onExit: () => void }) {
  return (
    <main className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black p-6 text-center font-mono text-stone-300">
      <p className="max-w-sm text-sm">{reason}</p>
      <Button variant="secondary" onClick={onExit}>
        Voltar
      </Button>
    </main>
  );
}

function CsSolo({ onExit }: { onExit: () => void }) {
  const { profile } = useClient();
  const driver = useMemo(
    () => new LocalDriver(profile?.id ?? 'jogador', profile?.nickname ?? 'Você', Date.now() % 2_147_483_647),
    // O treino nasce uma vez: trocar de apelido no meio da partida não pode recriá-la.
    [],
  );
  return <CsPlay driver={driver} onExit={onExit} />;
}

function eventText(match: Match, e: WorldEvent): string | null {
  const name = (id: string) => {
    const entry = match.roster.find((r) => r.id === id);
    return entry ? playerName(entry) : id;
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

/** Direção de um ponto em radianos relativos ao olhar: 0 à frente, positivo à direita. */
function angleTo(me: Vec3, point: Vec3, yaw: number): number {
  const dx = point.x - me.x;
  const dz = point.z - me.z;
  const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  return Math.atan2(dx * right.x + dz * right.z, dx * forward.x + dz * forward.z);
}

function sideLabel(side: 'attack' | 'defense'): string {
  return side === 'attack' ? 'atacante' : 'defensor';
}

export interface CsPlayProps {
  driver: CsDriver;
  onExit: () => void;
  /** Sem a tela de sorteio do mapa (na rede a partida já está rolando). */
  skipDraw?: boolean;
  /** Votação para desistir (rede): quantos votaram e quantos faltam. */
  forfeitVote?: { votes: number; needed: number } | null;
  /** Fim de partida na rede: o anfitrião pode voltar ao lobby. */
  rematch?: { canRematch: boolean; onRematch: () => void };
}

/** A tela do jogo: cena, HUD, menus e áudio. Não sabe de onde vem a partida; o `driver` cuida disso. */
export function CsPlay({ driver, onExit, skipDraw = false, forfeitVote = null, rematch }: CsPlayProps) {
  const meId = driver.meId;
  const matchRef = driver.matchRef;
  const [hud, setHud] = useState<Match>(matchRef.current);
  const [stage, setStage] = useState<'draw' | 'play'>(skipDraw ? 'play' : 'draw');
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
  const [swapNotice, setSwapNotice] = useState<{ id: number; text: string } | null>(null);
  const [spectating, setSpectating] = useState<string | null>(null);
  const deadRef = useRef(new Set<string>());
  const deadDirty = useRef(false);
  const [dead, setDead] = useState<ReadonlySet<string>>(deadRef.current);
  const spectateRef = useRef<string | null>(null);
  const spectateIndex = useRef(0);
  const feedItems = useRef<(FeedItem & { at: number })[]>([]);
  const counters = useRef({ feed: 0, hud: 0 });

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
      const kind = pingKindRef.current;
      setPings((list) => addPing(list, { id: pingId.current++, kind, x, z, by: meId, at: performance.now() }));
      driver.ping(kind, x, z);
    },
    [driver, meId],
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
  }, [input, matchRef, meId, placePing]);

  const buy = useCallback(
    (weapon: WeaponId) => {
      driver.buy(weapon);
      setHud(matchRef.current);
    },
    [driver, matchRef],
  );

  useEffect(() => {
    const counter = counters.current;
    driver.hooks = {
      onEvents: (match, events) => {
        const now = performance.now();
        director.onEvents(match, events, meId);
        for (const e of events) {
          const text = eventText(match, e);
          if (text) feedItems.current.push({ id: counter.feed++, text, tone: feedTone(e, meId), at: now });
          if (e.type === 'shot') fxRef.current.push(e);
          if (e.type === 'kill') {
            deadRef.current.add(e.victim);
            deadDirty.current = true;
          }
          if (e.type === 'hit' && e.attacker === meId) {
            setHitMarker({ id: ++counter.hud, kind: e.killed ? 'kill' : e.zone === 'head' ? 'head' : 'body' });
          }
          if (e.type === 'hit' && e.victim === meId) {
            const mine = match.world.players.find((p) => p.id === meId);
            const shot = events.find((x) => x.type === 'shot' && x.shooter === e.attacker);
            const source = shot?.type === 'shot' ? shot.from : match.world.players.find((p) => p.id === e.attacker)?.body.pos;
            const angle = mine && source && e.attacker !== meId ? angleTo(mine.body.pos, source, input.look().yaw) : null;
            setDamage({ id: ++counter.hud, angle, amount: Math.min(1, e.damage / 60) });
          }
        }
        if (fxRef.current.length > MAX_FX_QUEUE) fxRef.current.splice(0, fxRef.current.length - MAX_FX_QUEUE);
      },
      onHeard: (positions) => director.heard(positions, performance.now()),
      onPing: (ping) => setPings((list) => addPing(list, ping)),
      onInput: (pressed, match, now) => {
        if (pressed.fire) director.emptyClick(match, meId, now);
      },
    };
    return driver.start();
  }, [driver, director, input, meId]);

  useEffect(() => {
    if (stage !== 'play') return;
    const start = matchRef.current.world.players.find((p) => p.id === meId)!;
    input.setLook(start.yaw, 0);

    let raf = 0;
    let last = performance.now();
    let sinceHud = 0;
    let feedKey = '';
    let lastMoney = start.money;
    let round = matchRef.current.roundIndex;
    // Parte do que o fluxo já sabe: quem volta no meio da rodada precisa fechar o mercado e pedir o mouse.
    let phase = flowRef.current.phase;
    let ended = flowRef.current.ended;
    let swapTimer: ReturnType<typeof setTimeout> | undefined;

    const tick = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;

      const paused = simPaused(flowRef.current, driver.solo);
      driver.frame(now, dt, { input, paused });
      if (!paused) director.frame(matchRef.current, dt / 1000, meId, input.look().yaw);

      const current = matchRef.current;
      const mine = current.world.players.find((p) => p.id === meId);

      if (current.roundIndex !== round) {
        round = current.roundIndex;
        if (mine) input.setLook(mine.yaw, 0);
        fxRef.current.length = 0;
        deadRef.current.clear();
        deadDirty.current = true;
        setRoundKey(round);
        if (mine && isSideSwapRound(round)) {
          setSwapNotice({ id: round, text: `Troca de lados: agora você é ${sideLabel(mine.side)}. Dinheiro e armas voltaram ao início.` });
          clearTimeout(swapTimer);
          swapTimer = setTimeout(() => setSwapNotice(null), SWAP_NOTICE_MS);
        }
      }

      // Morto, observa um colega vivo; sem ninguém vivo a câmera fica onde está.
      if (mine && !mine.alive) {
        const mates = current.world.players.filter((p) => p.team === mine.team && p.alive && p.id !== meId);
        spectateRef.current = mates.length > 0 ? mates[spectateIndex.current % mates.length]!.id : null;
      } else {
        spectateRef.current = null;
      }

      if (mine?.alive && crosshairRef.current) {
        const spread = spreadFor(mine, WEAPONS[mine.weapon]);
        const pixels = (Math.tan((spread * Math.PI) / 180) / HALF_FOV_TAN) * (window.innerHeight / 2);
        crosshairRef.current.style.setProperty('--gap', `${Math.min(70, 3 + pixels).toFixed(1)}px`);
      }

      if (current.world.phase !== phase || !!current.winner !== ended) {
        phase = current.world.phase;
        ended = !!current.winner;
        send({ type: 'phase', phase, ended });
      }

      sinceHud += dt;
      if (sinceHud >= HUD_REFRESH_MS) {
        sinceHud = 0;
        const items = feedItems.current;
        while (items.length > 0 && now - items[0]!.at > FEED_TTL_MS) items.shift();
        const visible = items.slice(-FEED_SIZE);
        const key = visible.map((item) => item.id).join(',');
        if (key !== feedKey) {
          feedKey = key;
          setFeed(visible.map(({ id, text, tone }) => ({ id, text, tone })));
        }
        setHud(current);
        if (deadDirty.current) {
          deadDirty.current = false;
          setDead(new Set(deadRef.current));
        }
        const watched = spectateRef.current ? current.roster.find((r) => r.id === spectateRef.current) : undefined;
        setSpectating(watched ? playerName(watched) : null);
        if (mine) {
          if (mine.money - lastMoney >= 50) setMoneyGain({ id: ++counters.current.hud, amount: mine.money - lastMoney });
          lastMoney = mine.money;
        }
        setPings((list) => (list.some((p) => now - p.at >= PING_TTL_MS) ? list.filter((p) => now - p.at < PING_TTL_MS) : list));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(swapTimer);
    };
  }, [stage, driver, matchRef, meId, input, send, director]);

  useEffect(() => {
    if (stage !== 'play') return;
    const onKey = (e: KeyboardEvent) => {
      // O slider da pausa mantém o foco; só campos de texto precisam ficar com o teclado.
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
      if (e.code === 'Tab') {
        // Na pausa o Tab continua navegando entre os botões.
        if (flowRef.current.overlay === 'pause') return;
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
    const onClick = (e: MouseEvent) => {
      if (e.button === 0 && spectateRef.current && input.isLocked()) spectateIndex.current++;
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [stage, input, send, pingAhead, buy]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __csDebug?: unknown };
    w.__csDebug = { flow: () => flowRef.current, send, input, match: () => matchRef.current, driver };
    return () => {
      delete w.__csDebug;
    };
  }, [send, input, matchRef, driver]);

  function giveUp() {
    driver.forfeit();
    if (driver.solo) {
      setHud(matchRef.current);
      send({ type: 'phase', phase: matchRef.current.world.phase, ended: true });
    }
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
        <CsScene matchRef={matchRef} meId={meId} input={input} roundKey={roundKey} pings={pings} fx={fxRef} spectateRef={spectateRef} />
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
        notice={swapNotice?.text ?? null}
        spectating={spectating}
        rematch={rematch}
      />
      {!driver.solo && <VoiceButton className="absolute top-3 left-3 z-40" />}

      {flow.overlay === 'buy' && (
        <CsBuyMenu match={hud} meId={meId} onBuy={buy} onClose={() => send({ type: 'click', target: 'close-buy' })} />
      )}

      {flow.map && (
        <CsMap
          match={hud}
          meId={meId}
          pings={pings}
          dead={dead}
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
            WASD move · Shift anda devagar · Espaço pula · C agacha · R recarrega · 1/2 troca de arma · E interage · Tab mapa e placar · Q ping · B mercado · Esc pausa
          </span>
        </button>
      )}

      {flow.overlay === 'pause' && (
        <PauseMenu
          solo={driver.solo}
          forfeitVote={forfeitVote}
          onResume={() => send({ type: 'click', target: 'resume' })}
          onGiveUp={giveUp}
          onExit={onExit}
        />
      )}
    </main>
  );
}

function PauseMenu({
  solo,
  forfeitVote,
  onResume,
  onGiveUp,
  onExit,
}: {
  solo: boolean;
  forfeitVote: { votes: number; needed: number } | null;
  onResume: () => void;
  onGiveUp: () => void;
  onExit: () => void;
}) {
  const { csSensitivity, muted } = usePrefs();
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/75 font-mono text-stone-200">
      <p className="mb-2 text-sm tracking-[0.2em] uppercase">{solo ? 'Pausa' : 'Menu'}</p>
      {!solo && <p className="max-w-64 text-center text-[11px] text-stone-500">A partida continua rolando enquanto você está no menu.</p>}
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
      <Button variant="secondary" onClick={() => setPref('muted', !muted)}>
        {muted ? 'Ligar o som' : 'Desligar o som'}
      </Button>
      <Button variant="danger" onClick={onGiveUp}>
        {solo ? 'Desistir' : 'Votar para desistir'}
      </Button>
      {!solo && forfeitVote && (
        <p className="text-xs text-stone-400">
          Votos do seu time: {forfeitVote.votes} de {forfeitVote.needed}
        </p>
      )}
      <Button variant="ghost" onClick={onExit}>
        Sair
      </Button>
    </div>
  );
}
