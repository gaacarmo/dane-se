import { useState } from 'react';
import { type SocialView, formatMoney } from '@dane-se/shared';
import { avatarColor, initial } from '../../lib/avatar';
import { Segmented } from './IosKit';

type Tab = 'danese' | 'truco' | 'poker';

const TAB_LABELS: Record<Tab, string> = { danese: 'Dane-se', truco: 'Truco', poker: 'Poker' };

/** You and your friends: Dane-se and truco wins, poker profit; money games only. */
export function RankingPanel({ social }: { social: SocialView }) {
  const [tab, setTab] = useState<Tab>('danese');
  const rows = [...social.ranking].sort((a, b) =>
    tab === 'danese'
      ? b.daneseWins - a.daneseWins || a.daneseGames - b.daneseGames
      : tab === 'truco'
        ? b.trucoWins - a.trucoWins || a.trucoGames - b.trucoGames
        : b.pokerProfit - a.pokerProfit || b.pokerGames - a.pokerGames,
  );

  return (
    <div className="space-y-3" aria-label="Ranking entre amigos">
      <Segmented
        label="Jogo do ranking"
        options={['danese', 'truco', 'poker'] as const}
        value={tab}
        onChange={setTab}
        format={(t) => TAB_LABELS[t]}
        layoutId="ranking-tab"
      />

      <ol className="glass overflow-hidden">
        {rows.map((r, i) => {
          const wins = tab === 'truco' ? r.trucoWins : r.daneseWins;
          const games = tab === 'truco' ? r.trucoGames : r.daneseGames;
          return (
            <li key={r.id} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-ios-separator' : ''}`}>
              <span className={`w-5 text-center text-[17px] font-bold tabular-nums ${i === 0 ? 'text-[#ffd60a]' : 'text-ios-label-2'}`}>
                {i + 1}
              </span>
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-full text-[15px] font-semibold text-white"
                style={{ background: avatarColor(r.id) }}
              >
                {initial(r.nickname)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px]">{r.isYou ? `${r.nickname} (você)` : r.nickname}</span>
                <span className="block text-[13px] text-ios-label-2">
                  {tab === 'poker' ? `${r.pokerGames} ${r.pokerGames === 1 ? 'mesa' : 'mesas'}` : `${games} ${games === 1 ? 'partida' : 'partidas'}`}
                </span>
              </span>
              {tab === 'poker' ? (
                <span
                  className={`text-[17px] font-semibold tabular-nums ${
                    r.pokerProfit > 0 ? 'text-ios-green' : r.pokerProfit < 0 ? 'text-ios-red' : 'text-ios-label-2'
                  }`}
                >
                  {r.pokerProfit > 0 ? '+' : r.pokerProfit < 0 ? '−' : ''}
                  {formatMoney(Math.abs(r.pokerProfit))}
                </span>
              ) : (
                <span className="text-right">
                  <span className="block text-[17px] font-semibold tabular-nums">{wins}</span>
                  <span className="block text-[11px] text-ios-label-2">{wins === 1 ? 'vitória' : 'vitórias'}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="px-4 text-[13px] text-ios-label-2">
        {social.ranking.length < 2 ? 'Adicione amigos pra disputar o ranking. ' : ''}
        Só contam partidas valendo dinheiro; treino com bots fica de fora.
      </p>
    </div>
  );
}
