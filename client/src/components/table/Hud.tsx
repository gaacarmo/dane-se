import type { PlayerView } from '@dane-se/shared';
import { PlayingCard } from '../cards/PlayingCard';

/** Round info, always visible: round, cards, bets vs N, current trick, who leads. */
export function Hud({
  game,
  showVira,
  onHelp,
  onLeave,
}: {
  game: PlayerView;
  /** Compact layout: the vira and manilha live here instead of the middle of the table. */
  showVira?: boolean;
  onHelp: () => void;
  onLeave: () => void;
}) {
  const n = game.cardsPerPlayer;
  const betsPlaced = game.players.filter((p) => p.bet !== null).length;
  const leader = game.players.find((p) => p.id === game.trick.leaderId);
  const playing = game.phase === 'playing' || game.phase === 'trickEnd';
  const diff = game.betsSum - n;

  return (
    <header className="relative z-30 flex items-center gap-1.5 bg-black/40 px-2 py-1.5 text-[11px] backdrop-blur-sm sm:gap-2 sm:text-sm">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 sm:gap-1.5">
        {showVira && (
          <span className="flex items-center gap-1.5 rounded-full bg-black/40 py-0.5 pr-2.5 pl-1 ring-1 ring-gold-500/50">
            <span className="w-5" aria-label="Vira">
              <PlayingCard card={game.vira} />
            </span>
            <span className="text-stone-300">Manilha</span>
            <strong className="text-gold-300">{game.manilhaRank}</strong>
          </span>
        )}
        <Chip label="Rodada" value={String(game.roundNumber)} />
        <Chip label={n === 1 ? 'carta' : 'cartas'} value={String(n)} highlight={game.blindRound} suffix={game.blindRound ? ' · cega' : ''} reverse />
        <Chip
          label="Palpites"
          value={`${game.betsSum}/${n}`}
          title={
            betsPlaced === 0
              ? 'Soma dos palpites / vazas da rodada'
              : diff > 0
                ? `Pediram ${diff} a mais do que existe`
                : diff < 0
                  ? `Sobram ${-diff} vazas`
                  : 'Soma igual ao número de vazas'
          }
        />
        {playing && <Chip label="Vaza" value={`${Math.min(game.tricksPlayed + 1, n)}/${n}`} />}
        {playing && leader && game.phase === 'playing' && game.trick.plays.length === 0 && (
          <span className="truncate text-stone-300">
            Começa: <strong className="text-white">{leader.name}</strong>
          </span>
        )}
      </div>
      <button
        onClick={onHelp}
        className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-lg font-bold text-gold-300 hover:bg-white/20 max-sm:size-9"
        aria-label="Como jogar"
      >
        ?
      </button>
      <button
        onClick={onLeave}
        className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-lg hover:bg-white/20 max-sm:size-9"
        aria-label="Sair da sala"
        title="Sair"
      >
        🚪
      </button>
    </header>
  );
}

function Chip({
  label,
  value,
  suffix = '',
  highlight,
  reverse,
  title,
}: {
  label: string;
  value: string;
  suffix?: string;
  highlight?: boolean;
  reverse?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`flex items-baseline gap-1 rounded-full px-2 py-1 whitespace-nowrap ring-1 sm:px-2.5 ${
        highlight ? 'bg-wine-700/80 ring-card-red/60' : 'bg-black/40 ring-white/10'
      }`}
    >
      {reverse ? (
        <>
          <strong className="text-gold-300">{value}</strong>
          <span className="text-stone-300">
            {label}
            {suffix}
          </span>
        </>
      ) : (
        <>
          <span className="text-stone-300">{label}</span>
          <strong className="text-gold-300">
            {value}
            {suffix}
          </strong>
        </>
      )}
    </span>
  );
}
