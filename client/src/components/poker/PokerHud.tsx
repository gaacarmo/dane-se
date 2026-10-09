import type { PokerView } from '@dane-se/shared';
import { HAND_CATEGORY_NAMES_PT, bestHand, bigBlind, formatMoney, smallBlind } from '@dane-se/shared';
import { setPref, usePrefs } from '../../lib/prefs';

const STREET_LABEL: Record<string, string> = {
  preflop: 'Pré-flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  summary: 'Fim da mão',
  finished: 'Fim de jogo',
};

/** Top bar: hand, blinds, street, pot and (your) current best hand. */
export function PokerHud({ game, youId, onMenu }: { game: PokerView; youId: string; onMenu: () => void }) {
  const { muted } = usePrefs();
  const me = game.seats.find((s) => s.id === youId);
  const myHand = me && !me.folded && game.hole.length === 2 ? bestHand([...game.hole, ...game.community]) : null;
  const street = STREET_LABEL[game.phase] ?? '';

  return (
    <header className="safe-top relative z-30 flex items-center gap-1.5 bg-black/40 px-2 pb-1.5 text-[11px] backdrop-blur-sm sm:gap-2 sm:text-sm">
      <span className="flex items-baseline gap-1 rounded-full bg-black/40 px-2 py-1 whitespace-nowrap ring-1 ring-white/10">
        <span className="text-stone-300">Mão</span>
        <strong className="text-gold-300">#{game.handNumber}</strong>
      </span>
      <span className="hidden items-baseline gap-1 rounded-full bg-black/40 px-2 py-1 whitespace-nowrap ring-1 ring-white/10 sm:flex">
        <span className="text-stone-300">Blinds</span>
        <strong className="text-gold-300">
          {formatMoney(smallBlind(game.settings.minBuyIn))}/{formatMoney(bigBlind(game.settings.minBuyIn))}
        </strong>
      </span>
      <span className="flex items-baseline gap-1 rounded-full bg-black/40 px-2 py-1 whitespace-nowrap ring-1 ring-white/10">
        <span className="text-stone-300">Pote</span>
        <strong className="text-gold-300">{formatMoney(game.pot)}</strong>
      </span>
      {street && <span className="truncate text-stone-300">{street}</span>}
      {me && me.bet > 0 && (
        <span className="flex items-baseline gap-1 rounded-full bg-black/40 px-2 py-1 whitespace-nowrap ring-1 ring-gold-500/40">
          <span className="text-stone-300">Sua aposta</span>
          <strong className="text-gold-300">{formatMoney(me.bet)}</strong>
        </span>
      )}
      {myHand && (
        <span className="hidden items-baseline gap-1 rounded-full bg-felt-700/80 px-2 py-1 whitespace-nowrap ring-1 ring-gold-500/40 sm:flex">
          <span className="text-stone-300">Sua mão</span>
          <strong className="text-gold-200">
            {HAND_CATEGORY_NAMES_PT[myHand.value.category]}
          </strong>
        </span>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPref('muted', !muted)}
          aria-label={muted ? 'Ligar sons' : 'Desligar sons'}
          className="grid size-11 place-items-center rounded-full bg-black/40 text-lg ring-1 ring-white/10 hover:bg-white/10"
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <button
          type="button"
          onClick={onMenu}
          aria-label="Menu"
          className="grid size-11 place-items-center rounded-full bg-black/40 text-lg ring-1 ring-white/10 hover:bg-white/10"
        >
          ☰
        </button>
      </div>
    </header>
  );
}
