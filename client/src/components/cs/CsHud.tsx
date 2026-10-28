import { DEFUSE_MS, PLANT_MS, WEAPONS, type Match } from '@dane-se/shared';
import { Button } from '../ui/Button';

export interface FeedItem {
  id: number;
  text: string;
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

export function CsHud({
  match,
  meId,
  feed,
  hint,
  onExit,
}: {
  match: Match;
  meId: string;
  feed: FeedItem[];
  hint: string | null;
  onExit: () => void;
}) {
  const { world } = match;
  const me = world.players.find((p) => p.id === meId)!;
  const mine = me.team;
  const theirs = mine === 'A' ? 'B' : 'A';
  const weapon = WEAPONS[me.weapon];
  const planted = world.bomb.status === 'planted';
  const progress = world.bomb.progress?.who === meId ? world.bomb.progress.ms : 0;
  const progressMax = planted ? DEFUSE_MS : PLANT_MS;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 font-mono text-stone-200 select-none">
      <div className="absolute top-3 left-1/2 -translate-x-1/2 text-center">
        <p className="rounded-lg bg-black/55 px-4 py-1.5 text-lg">
          <span className="text-stone-400">Você </span>
          <span className="font-bold">{match.score[mine]}</span>
          <span className="mx-2 text-stone-600">:</span>
          <span className="font-bold">{match.score[theirs]}</span>
          <span className="text-stone-400"> Adversários</span>
        </p>
        <p className={`mt-1 text-sm ${planted ? 'text-red-400' : 'text-stone-300'}`}>
          {world.phase === 'buy'
            ? `Compra ${clock(world.phaseLeftMs)}`
            : planted
              ? `Bomba ${clock(world.bomb.explodeInMs)}`
              : clock(world.phaseLeftMs)}
        </p>
      </div>

      <ul className="absolute top-3 right-3 space-y-1 text-xs">
        {feed.map((item) => (
          <li key={item.id} className="rounded bg-black/55 px-2 py-1">
            {item.text}
          </li>
        ))}
      </ul>

      <div className="absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2">
        <span className="absolute top-1/2 left-0 h-px w-full bg-white/80" />
        <span className="absolute top-0 left-1/2 h-full w-px bg-white/80" />
      </div>

      {hint && (
        <p className="absolute bottom-28 left-1/2 -translate-x-1/2 rounded bg-black/60 px-3 py-1 text-sm">{hint}</p>
      )}
      {progress > 0 && (
        <div className="absolute bottom-20 left-1/2 h-1.5 w-56 -translate-x-1/2 rounded bg-white/15">
          <div className="h-full rounded bg-gold-400" style={{ width: `${Math.min(100, (progress / progressMax) * 100)}%` }} />
        </div>
      )}

      <div className="absolute bottom-4 left-4 rounded-lg bg-black/55 px-4 py-2">
        <p className="text-3xl font-bold">{me.alive ? me.hp : 0}</p>
        <p className="text-xs text-gold-400">$ {me.money}</p>
      </div>
      <div className="absolute right-4 bottom-4 rounded-lg bg-black/55 px-4 py-2 text-right">
        <p className="text-xs text-stone-400">{weapon.name}</p>
        <p className="text-3xl font-bold">
          {me.reloadLeftMs > 0 ? '…' : me.ammo}
          <span className="text-base text-stone-500"> / {me.reserve}</span>
        </p>
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
            {match.forfeitedBy ? (match.forfeitedBy === mine ? 'Você desistiu' : 'O adversário desistiu') : `${match.score[mine]} a ${match.score[theirs]}`}
          </p>
          <Button onClick={onExit}>Sair</Button>
        </div>
      )}
    </div>
  );
}
