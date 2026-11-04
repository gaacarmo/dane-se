import { useRef, type MouseEvent } from 'react';
import { type Match } from '@dane-se/shared';
import { type Ping, type PingKind } from '@dane-se/shared';
import { Scoreboard, playerName } from './CsScoreboard';
import { PING_KINDS } from './pings';

const TEAM_COLOR = { A: '#4a7a8c', B: '#a8703c' } as const;

/** Mapa de cima (Tab) com o placar ao lado. Mostra o seu time, os pontos de bomba e os pings; inimigos não aparecem. */
export function CsMap({
  match,
  meId,
  pings,
  dead,
  kind,
  onKind,
  onPing,
  onClose,
}: {
  match: Match;
  meId: string;
  pings: Ping[];
  /** Quem já morreu na rodada (para o placar). */
  dead: ReadonlySet<string>;
  kind: PingKind;
  onKind: (kind: PingKind) => void;
  onPing: (x: number, z: number) => void;
  onClose: () => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const { world } = match;
  const { map, bomb } = world;
  const { min, max } = map.bounds;
  const me = world.players.find((p) => p.id === meId)!;

  function place(e: MouseEvent<SVGSVGElement>) {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return;
    const point = el.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const local = point.matrixTransform(ctm.inverse());
    if (local.x < min.x || local.x > max.x || local.y < min.z || local.y > max.z) return;
    onPing(local.x, local.y);
  }

  return (
    <div className="absolute inset-0 z-[25] flex flex-col items-center justify-center gap-3 bg-black/85 p-4 font-mono text-stone-200">
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
        {(Object.keys(PING_KINDS) as PingKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onKind(k)}
            aria-pressed={kind === k}
            className={`rounded-lg border px-3 py-1.5 transition ${kind === k ? 'border-white/60 bg-white/10' : 'border-white/10 hover:bg-white/10'}`}
          >
            <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: PING_KINDS[k].color }} />
            {PING_KINDS[k].label}
          </button>
        ))}
        <span className="text-stone-500">Clique no mapa para pingar · Q pinga onde você olha · Tab fecha</span>
        <button type="button" onClick={onClose} className="rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/10">
          Fechar
        </button>
      </div>

      <div className="flex w-full max-w-[95vw] flex-col items-center gap-3 lg:flex-row lg:items-start lg:justify-center">
        <svg
          ref={svg}
          viewBox={`${min.x} ${min.z} ${max.x - min.x} ${max.z - min.z}`}
          onClick={place}
          className="max-h-[70vh] w-full max-w-[min(90vw,48rem)] cursor-crosshair rounded-lg border border-white/10 bg-[#23272c]"
        >
          {map.solids.map((s, i) => (
            <rect
              key={i}
              x={s.min.x}
              y={s.min.z}
              width={s.max.x - s.min.x}
              height={s.max.z - s.min.z}
              fill={s === map.barrier ? 'none' : s.max.y > 2 ? '#6a737e' : '#8a8478'}
              stroke={s === map.barrier ? '#6aa0c8' : undefined}
              strokeWidth={s === map.barrier ? 0.3 : undefined}
              strokeDasharray={s === map.barrier ? '1 0.8' : undefined}
            />
          ))}
          {(['A', 'B'] as const).map((key) => {
            const s = map.sites[key];
            return (
              <g key={key}>
                <rect
                  x={s.min.x}
                  y={s.min.z}
                  width={s.max.x - s.min.x}
                  height={s.max.z - s.min.z}
                  fill={key === 'A' ? '#b89a4a' : '#5a86a8'}
                  fillOpacity={0.3}
                />
                <text
                  x={(s.min.x + s.max.x) / 2}
                  y={(s.min.z + s.max.z) / 2}
                  fill="#e7e5e4"
                  fontSize={3}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {key}
                </text>
              </g>
            );
          })}

          {bomb.status === 'planted' && bomb.pos && (
            <rect x={bomb.pos.x - 0.6} y={bomb.pos.z - 0.6} width={1.2} height={1.2} fill="#d9534f" />
          )}

          {world.players
            .filter((p) => p.team === me.team && p.alive)
            .map((p) => {
              const forward = (Math.atan2(-Math.cos(p.yaw), -Math.sin(p.yaw)) * 180) / Math.PI;
              const self = p.id === meId;
              return (
                <g key={p.id} transform={`translate(${p.body.pos.x} ${p.body.pos.z})`}>
                  <circle r={self ? 1 : 0.8} fill={TEAM_COLOR[p.team]} stroke={self ? '#fff' : 'none'} strokeWidth={0.25} />
                  <polygon points="0.9,0 2.1,-0.7 2.1,0.7" fill={self ? '#fff' : TEAM_COLOR[p.team]} transform={`rotate(${forward})`} />
                  {!self && (
                    <text y={-1.4} fill="#d6d3d1" fontSize={1.4} textAnchor="middle">
                      {playerName(match.roster.find((r) => r.id === p.id)!).split(' ')[0]}
                    </text>
                  )}
                </g>
              );
            })}

          {pings.map((ping) => (
            <g key={ping.id} transform={`translate(${ping.x} ${ping.z})`}>
              <circle r={1.3} fill="none" stroke={PING_KINDS[ping.kind].color} strokeWidth={0.35} />
              <circle r={0.4} fill={PING_KINDS[ping.kind].color} />
            </g>
          ))}
        </svg>
        <Scoreboard match={match} meId={meId} dead={dead} />
      </div>
    </div>
  );
}
