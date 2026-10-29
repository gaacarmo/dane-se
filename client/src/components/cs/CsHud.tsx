import type { CSSProperties, RefObject } from 'react';
import { DEFUSE_KIT_MS, DEFUSE_MS, PLANT_MS, WEAPONS, slotOf, type Match, type WeaponId } from '@dane-se/shared';
import { Button } from '../ui/Button';

export interface FeedItem {
  id: number;
  text: string;
  /** Abate seu ou morte sua: destaca a linha. */
  tone?: 'kill' | 'death';
}

export interface HitMarker {
  id: number;
  kind: 'body' | 'head' | 'kill';
}

export interface DamageFlash {
  id: number;
  /** Direção de quem atirou em radianos relativos ao olhar (0 à frente, positivo à direita), ou null. */
  angle: number | null;
  amount: number;
}

export interface MoneyGain {
  id: number;
  amount: number;
}

const END_REASON: Record<string, string> = {
  elimination: 'eliminação',
  explosion: 'bomba explodiu',
  defuse: 'bomba desarmada',
  time: 'tempo esgotado',
};

function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const BAR = 'absolute bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.55)] transition-[left,right,top,bottom] duration-75';

/** Mira de quatro traços; a folga `--gap` é ajustada por quadro pelo loop do jogo, conforme o espalhamento. */
function Crosshair({ element }: { element: RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={element} className="absolute top-1/2 left-1/2 size-0" style={{ '--gap': '6px' } as CSSProperties}>
      <span className={BAR} style={{ right: 'var(--gap)', top: -1, width: 9, height: 2 }} />
      <span className={BAR} style={{ left: 'var(--gap)', top: -1, width: 9, height: 2 }} />
      <span className={BAR} style={{ bottom: 'var(--gap)', left: -1, width: 2, height: 9 }} />
      <span className={BAR} style={{ top: 'var(--gap)', left: -1, width: 2, height: 9 }} />
      <span className="absolute -top-px -left-px size-[2px] bg-white/90" />
    </div>
  );
}

function HitMarkerView({ marker }: { marker: HitMarker }) {
  const color = marker.kind === 'body' ? '#ffffff' : '#ff5a4a';
  const length = marker.kind === 'kill' ? 20 : 14;
  return (
    <div key={marker.id} className="cs-hitmarker absolute top-1/2 left-1/2 size-0">
      {[45, -45].map((angle) => (
        <span
          key={angle}
          className="absolute rounded-full"
          style={{
            width: length,
            height: 2,
            left: -length / 2,
            top: -1,
            background: color,
            transform: `rotate(${angle}deg)`,
            boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
          }}
        />
      ))}
    </div>
  );
}

function DamageView({ flash }: { flash: DamageFlash }) {
  return (
    <>
      <div
        key={`v${flash.id}`}
        className="cs-damage absolute inset-0"
        style={
          {
            '--cs-damage-opacity': 0.25 + flash.amount * 0.6,
            background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(190,20,20,0.85) 100%)',
          } as CSSProperties
        }
      />
      {flash.angle !== null && (
        <div
          key={`a${flash.id}`}
          className="cs-damage-arc absolute top-1/2 left-1/2 size-0"
          style={{ transform: `rotate(${flash.angle}rad)` }}
        >
          <span
            className="absolute rounded-full"
            style={{
              width: 90,
              height: 14,
              left: -45,
              top: -170,
              background: 'linear-gradient(90deg, rgba(200,30,30,0), rgba(220,40,40,0.95), rgba(200,30,30,0))',
            }}
          />
        </div>
      )}
    </>
  );
}

export function CsHud({
  match,
  meId,
  feed,
  hint,
  onExit,
  crosshair,
  hitMarker,
  damage,
  moneyGain,
  notice,
  spectating,
  rematch,
}: {
  match: Match;
  meId: string;
  feed: FeedItem[];
  hint: string | null;
  onExit: () => void;
  crosshair: RefObject<HTMLDivElement | null>;
  hitMarker: HitMarker | null;
  damage: DamageFlash | null;
  moneyGain: MoneyGain | null;
  /** Aviso fixo no topo (troca de lados). */
  notice: string | null;
  /** Nome do colega que a câmera acompanha enquanto você está morto. */
  spectating: string | null;
  /** Rede: no fim da partida o anfitrião pode voltar ao lobby. */
  rematch?: { canRematch: boolean; onRematch: () => void };
}) {
  const { world } = match;
  const me = world.players.find((p) => p.id === meId)!;
  const mine = me.team;
  const theirs = mine === 'A' ? 'B' : 'A';
  const planted = world.bomb.status === 'planted';
  const progress = world.bomb.progress?.who === meId ? world.bomb.progress.ms : 0;
  const progressMax = planted ? (me.kit ? DEFUSE_KIT_MS : DEFUSE_MS) : PLANT_MS;

  const held: { id: WeaponId; ammo: number; reserve: number; active: boolean }[] = [
    { id: me.weapon, ammo: me.ammo, reserve: me.reserve, active: true },
    ...(me.holstered ? [{ id: me.holstered.weapon, ammo: me.holstered.ammo, reserve: me.holstered.reserve, active: false }] : []),
  ].sort((a, b) => slotOf(a.id) - slotOf(b.id));
  const weapon = WEAPONS[me.weapon];
  const reloading = me.reloadLeftMs > 0;
  const lowAmmo = me.ammo <= weapon.magSize * 0.3;
  const lowHp = me.alive && me.hp < 30;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 font-mono text-stone-200 select-none">
      {lowHp && <div className="cs-pulse absolute inset-0 shadow-[inset_0_0_140px_rgba(170,0,0,0.45)]" />}
      {damage && <DamageView flash={damage} />}

      <div className="absolute top-3 left-1/2 -translate-x-1/2 text-center">
        <p className="rounded-lg bg-black/55 px-4 py-1.5 text-lg">
          <span className="text-stone-400">Você </span>
          <span className="font-bold">{match.score[mine]}</span>
          <span className="mx-2 text-stone-600">:</span>
          <span className="font-bold">{match.score[theirs]}</span>
          <span className="text-stone-400"> Adversários</span>
        </p>
        <p className="mt-1 text-[11px] tracking-wide text-stone-400 uppercase">
          Rodada {match.roundIndex + 1} · {me.side === 'attack' ? 'Atacando' : 'Defendendo'}
        </p>
        <p className={`text-sm ${planted ? 'text-red-400' : 'text-stone-300'}`}>
          {world.phase === 'buy'
            ? `Compra ${clock(world.phaseLeftMs)}`
            : world.phase === 'prep'
              ? `Preparação ${clock(world.phaseLeftMs)}`
              : planted
              ? `Bomba no ponto ${world.bomb.site} · ${clock(world.bomb.explodeInMs)}`
              : clock(world.phaseLeftMs)}
        </p>
        {world.phase === 'buy' && <p className="text-[11px] text-stone-500">B abre o mercado</p>}
        {world.phase === 'prep' && (
          <p className="text-[11px] text-stone-500">
            {me.side === 'attack' ? 'Posicione o time: o portão abre quando a preparação acabar' : 'Segure os pontos: o portão abre quando a preparação acabar'}
          </p>
        )}
      </div>

      <ul className="absolute top-3 right-3 space-y-1 text-xs">
        {feed.map((item) => (
          <li
            key={item.id}
            className={`rounded bg-black/55 px-2 py-1 ${
              item.tone === 'kill' ? 'border-l-2 border-gold-400' : item.tone === 'death' ? 'border-l-2 border-red-500' : ''
            }`}
          >
            {item.text}
          </li>
        ))}
      </ul>

      {me.alive && !match.winner && <Crosshair element={crosshair} />}
      {hitMarker && <HitMarkerView marker={hitMarker} />}

      {hint && <p className="absolute bottom-28 left-1/2 -translate-x-1/2 rounded bg-black/60 px-3 py-1 text-sm">{hint}</p>}
      {progress > 0 && (
        <div className="absolute bottom-20 left-1/2 h-1.5 w-56 -translate-x-1/2 rounded bg-white/15">
          <div className="h-full rounded bg-gold-400" style={{ width: `${Math.min(100, (progress / progressMax) * 100)}%` }} />
        </div>
      )}
      {!me.alive && world.phase === 'live' && !world.end && (
        <p className="absolute bottom-28 left-1/2 -translate-x-1/2 rounded bg-black/60 px-3 py-1 text-sm text-stone-400">
          {spectating ? `Observando ${spectating} · clique para trocar` : 'Você morreu. Aguarde o fim da rodada.'}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="absolute top-28 left-1/2 w-[min(28rem,90vw)] -translate-x-1/2 rounded-lg border border-white/15 bg-black/75 px-5 py-3 text-center text-sm"
        >
          {notice}
        </p>
      )}

      <div className="absolute bottom-4 left-4 rounded-lg bg-black/55 px-4 py-2">
        <p className={`text-3xl font-bold ${lowHp ? 'text-red-400' : ''}`}>{me.alive ? me.hp : 0}</p>
        {me.alive && me.armor > 0 && (
          <p className="text-xs text-stone-300">
            Colete {me.armor}
            {me.helmet ? ' · capacete' : ''}
          </p>
        )}
        <p className="relative text-xs text-gold-400">
          $ {me.money}
          {moneyGain && (
            <span key={moneyGain.id} className="cs-gain absolute left-full ml-2 whitespace-nowrap text-gold-300">
              +${moneyGain.amount}
            </span>
          )}
        </p>
      </div>

      <div className="absolute right-4 bottom-4 w-52 space-y-1.5">
        {held.map((w) => {
          const def = WEAPONS[w.id];
          return (
            <div
              key={w.id}
              className={`flex items-baseline justify-between rounded-lg px-3 py-1.5 ${
                w.active ? 'bg-black/65 ring-1 ring-white/25' : 'bg-black/35 text-stone-500'
              }`}
            >
              <span className="flex items-baseline gap-2 text-xs">
                <span className="grid size-4 place-items-center rounded border border-white/20 text-[10px]">{slotOf(w.id)}</span>
                {def.name}
              </span>
              <span className={w.active ? 'text-2xl font-bold' : 'text-sm'}>
                <span className={w.active && lowAmmo ? (w.ammo === 0 ? 'cs-pulse text-red-400' : 'text-red-400') : ''}>
                  {w.active && reloading ? '…' : w.ammo}
                </span>
                <span className="text-xs text-stone-500"> / {w.reserve}</span>
              </span>
            </div>
          );
        })}
        {me.hasBomb && (
          <div className="flex items-center justify-between rounded-lg bg-black/35 px-3 py-1 text-xs text-stone-400">
            <span>Bomba</span>
            <span className="text-stone-500">E no ponto</span>
          </div>
        )}
        {me.kit && (
          <div className="flex items-center justify-between rounded-lg bg-black/35 px-3 py-1 text-xs text-stone-400">
            <span>Kit de desarme</span>
            <span className="text-stone-500">desarma mais rápido</span>
          </div>
        )}
        {reloading && (
          <div className="h-1 w-full overflow-hidden rounded bg-white/15">
            <div className="h-full bg-white/70" style={{ width: `${(1 - me.reloadLeftMs / weapon.reloadMs) * 100}%` }} />
          </div>
        )}
      </div>

      {world.end && !match.winner && (
        <p className="absolute top-1/3 left-1/2 -translate-x-1/2 rounded-lg bg-black/70 px-6 py-3 text-center text-xl">
          {world.end.winner === mine ? 'Rodada ganha' : 'Rodada perdida'}
          <span className="block text-xs text-stone-400">{END_REASON[world.end.reason]}</span>
        </p>
      )}

      {match.winner && (
        <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/75">
          <p className="text-3xl font-bold">{match.winner === mine ? 'Vitória' : 'Derrota'}</p>
          <p className="text-sm text-stone-400">
            {match.forfeitedBy ? (match.forfeitedBy === mine ? 'Seu time desistiu' : 'O time adversário desistiu') : `${match.score[mine]} a ${match.score[theirs]}`}
          </p>
          <div className="flex items-center gap-3">
            {rematch?.canRematch && <Button onClick={rematch.onRematch}>Jogar de novo</Button>}
            <Button variant={rematch?.canRematch ? 'secondary' : 'primary'} onClick={onExit}>
              Sair
            </Button>
          </div>
          {rematch && !rematch.canRematch && <p className="text-xs text-stone-500">O anfitrião escolhe se vocês jogam de novo.</p>}
        </div>
      )}
    </div>
  );
}
