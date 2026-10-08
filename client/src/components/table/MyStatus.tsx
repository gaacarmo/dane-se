import type { PlayerView, PublicPlayer } from '@dane-se/shared';
import { Letters } from './Letters';

/**
 * Your own numbers, always on screen in the first-person view (you have no
 * name tag there): letters you lost, your bet and the tricks you've made.
 */
export function MyStatus({
  game,
  me,
  word,
  compact = false,
}: {
  game: PlayerView;
  me: PublicPlayer;
  word: string[];
  /** Short landscape screens: tighter panel. */
  compact?: boolean;
}) {
  const { bet, tricksWon } = me;
  const remaining = bet === null ? null : bet - tricksWon;
  const over = remaining !== null && remaining < 0;
  const hit = remaining === 0;
  const playing = game.phase === 'playing' || game.phase === 'trickEnd';

  let hint = 'Aguardando seu palpite';
  if (bet !== null) {
    if (over) hint = `Passou ${-remaining!} da meta`;
    else if (hit) hint = playing ? 'Meta batida! Agora é não ganhar mais' : 'Meta: não ganhar nenhuma';
    else hint = `Faltam ${remaining} ${remaining === 1 ? 'vaza' : 'vazas'}`;
  }

  return (
    <aside
      className={`pointer-events-none absolute top-14 left-2 z-30 space-y-1.5 rounded-2xl bg-black/65 p-2 shadow-xl ring-1 ring-white/20 backdrop-blur ${
        compact ? 'w-32' : 'w-36 sm:w-44 sm:space-y-2 sm:p-3'
      }`}
      aria-label="Seu placar"
    >
      <div className="flex items-center justify-between text-sm font-bold text-white">
        <span>Você</span>
        {me.isDealer && <span className="rounded bg-paper px-1.5 text-[11px] font-black text-wood-900">PÉ</span>}
      </div>

      <div>
        <p className="mb-1 text-[10px] tracking-wider text-stone-300 uppercase">Suas letras</p>
        <Letters word={word} lost={me.letters} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-black/40 py-1.5">
          <p className="text-[10px] tracking-wider text-stone-300 uppercase">Palpite</p>
          <p className="text-2xl leading-none font-black sm:text-3xl text-white">{bet ?? '–'}</p>
        </div>
        <div className={`rounded-xl py-1.5 ${over ? 'bg-wine-700' : hit ? 'bg-emerald-700/80' : 'bg-black/40'}`}>
          <p className="text-[10px] tracking-wider text-stone-200 uppercase">Fiz</p>
          <p className="text-2xl leading-none font-black sm:text-3xl text-white">{tricksWon}</p>
        </div>
      </div>

      {bet !== null && (
        <div className="hidden flex-wrap justify-center gap-1 sm:flex" aria-hidden>
          {Array.from({ length: Math.max(bet, tricksWon) }, (_, i) => (
            <span
              key={i}
              className={`size-3.5 rounded-full ring-1 ${
                i < tricksWon
                  ? i >= bet
                    ? 'bg-card-red ring-card-red'
                    : 'bg-gold-300 ring-gold-300'
                  : 'ring-gold-300/70'
              }`}
            />
          ))}
        </div>
      )}
      <p
        className={`text-center text-xs font-semibold ${over ? 'text-red-300' : hit ? 'text-emerald-300' : 'text-stone-200'}`}
      >
        {hint}
      </p>
    </aside>
  );
}
