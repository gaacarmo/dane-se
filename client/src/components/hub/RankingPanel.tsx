import { useState } from 'react';
import { type SocialView, formatMoney } from '@dane-se/shared';

type Tab = 'danese' | 'poker';

/** You and your friends: Dane-se wins and poker profit, money games only. */
export function RankingPanel({ social }: { social: SocialView }) {
  const [tab, setTab] = useState<Tab>('danese');
  const rows = [...social.ranking].sort((a, b) =>
    tab === 'danese'
      ? b.daneseWins - a.daneseWins || a.daneseGames - b.daneseGames
      : b.pokerProfit - a.pokerProfit || b.pokerGames - a.pokerGames,
  );

  return (
    <section className="hub-panel space-y-3 p-4" aria-label="Ranking entre amigos">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1" role="tablist">
        {(['danese', 'poker'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-10 rounded-lg text-sm font-semibold transition ${tab === t ? 'bg-felt-700 text-gold-300 shadow' : 'text-stone-400'}`}
          >
            {t === 'danese' ? 'Dane-se' : 'Poker'}
          </button>
        ))}
      </div>

      <ol className="space-y-1">
        {rows.map((r, i) => (
          <li
            key={r.id}
            className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm ${r.isYou ? 'bg-gold-500/15 ring-1 ring-gold-500/40' : 'bg-black/25'}`}
          >
            <span className={`w-6 text-center font-black ${i === 0 ? 'text-gold-300' : 'text-stone-500'}`}>
              {i + 1}º
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">
              {r.isYou ? `${r.nickname} (você)` : r.nickname}
            </span>
            {tab === 'danese' ? (
              <span className="text-right whitespace-nowrap">
                <strong className="text-gold-300">{r.daneseWins}</strong>
                <span className="text-xs text-stone-400">
                  {' '}
                  {r.daneseWins === 1 ? 'vitória' : 'vitórias'} · {r.daneseGames} jogos
                </span>
              </span>
            ) : (
              <span className="text-right whitespace-nowrap">
                <strong
                  className={
                    r.pokerProfit > 0 ? 'text-emerald-300' : r.pokerProfit < 0 ? 'text-red-300' : 'text-stone-300'
                  }
                >
                  {r.pokerProfit > 0 ? '+' : r.pokerProfit < 0 ? '−' : ''}
                  {formatMoney(Math.abs(r.pokerProfit))}
                </strong>
                <span className="text-xs text-stone-400"> · {r.pokerGames} mesas</span>
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="text-xs text-stone-500">
        {social.ranking.length < 2 ? 'Adicione amigos pra disputar o ranking. ' : ''}
        Só contam partidas valendo dinheiro (treino com bots não conta).
      </p>
    </section>
  );
}
