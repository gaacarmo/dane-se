import { WEAPONS, type Match, type RosterEntry, type TeamId } from '@dane-se/shared';
import { CHARACTER_NAMES } from '../../lib/characters';

/** Humanos aparecem com o apelido; bots, com o nome do personagem. */
export function playerName(entry: RosterEntry): string {
  return entry.bot ? CHARACTER_NAMES[entry.character] : entry.name;
}

function TeamTable({
  match,
  meId,
  team,
  mine,
  dead,
}: {
  match: Match;
  meId: string;
  team: TeamId;
  mine: boolean;
  /** Quem já morreu na rodada; o servidor esconde se o inimigo está vivo, mas os abates são públicos. */
  dead: ReadonlySet<string>;
}) {
  const { world } = match;
  const side = world.players.find((p) => p.team === team)?.side;
  const rows = match.roster
    .filter((r) => r.team === team)
    .map((entry) => ({
      entry,
      player: world.players.find((p) => p.id === entry.id),
      stats: match.stats[entry.id] ?? { kills: 0, deaths: 0, headshots: 0 },
    }))
    .sort((a, b) => b.stats.kills - a.stats.kills || a.stats.deaths - b.stats.deaths);

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="tracking-wide text-stone-400 uppercase">
          {mine ? 'Seu time' : 'Adversários'} · {side === 'attack' ? 'ataque' : 'defesa'}
        </span>
        <span className="text-base font-bold text-stone-200">{match.score[team]}</span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-stone-500">
            <th className="text-left font-normal">Jogador</th>
            <th className="w-20 text-right font-normal">Abates</th>
            <th className="w-20 text-right font-normal">Mortes</th>
            {mine && <th className="w-24 text-right font-normal">Dinheiro</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ entry, player, stats }) => (
            <tr key={entry.id} className={(mine ? player?.alive === false : dead.has(entry.id)) ? 'text-stone-500' : 'text-stone-200'}>
              <td className="py-0.5">
                <span className={entry.id === meId ? 'font-bold' : ''}>{playerName(entry)}</span>
                {entry.id === meId && <span className="text-stone-500"> (você)</span>}
                {mine && player && <span className="text-stone-500"> · {WEAPONS[player.weapon].name}</span>}
              </td>
              <td className="text-right">{stats.kills}</td>
              <td className="text-right">{stats.deaths}</td>
              {mine && <td className="text-right text-gold-400">${player?.money ?? 0}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Placar da partida (Tab): abates e mortes dos dois times; dinheiro e arma só do seu. */
export function Scoreboard({ match, meId, dead }: { match: Match; meId: string; dead: ReadonlySet<string> }) {
  const mine = match.roster.find((r) => r.id === meId)!.team;
  const theirs: TeamId = mine === 'A' ? 'B' : 'A';
  return (
    <section aria-label="Placar" className="w-full max-w-md space-y-4 rounded-lg border border-white/10 bg-black/40 p-3 text-xs">
      <TeamTable match={match} meId={meId} team={mine} mine dead={dead} />
      <TeamTable match={match} meId={meId} team={theirs} mine={false} dead={dead} />
    </section>
  );
}
