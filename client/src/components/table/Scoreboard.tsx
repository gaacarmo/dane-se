import type { DaneseRoomView } from '@dane-se/shared';
import { portraitUrl } from '../../lib/characters';

/** Everyone's bet and tricks made so far, in one place (the name tags on the table are small). */
export function Scoreboard({ room }: { room: DaneseRoomView }) {
  const game = room.game!;
  return (
    <aside
      className="pointer-events-none hidden w-44 space-y-1 rounded-2xl bg-black/65 p-2 shadow-xl ring-1 ring-white/20 backdrop-blur sm:block"
      aria-label="Placar da rodada"
    >
      <div className="flex items-center justify-between px-1 text-[10px] tracking-wider text-stone-300 uppercase">
        <span>Jogador</span>
        <span className="flex gap-3">
          <span>Palpite</span>
          <span>Fez</span>
        </span>
      </div>
      {game.players.map((p) => {
        const member = room.members.find((m) => m.id === p.id);
        const over = p.bet !== null && p.tricksWon > p.bet;
        const hit = p.bet !== null && p.tricksWon === p.bet;
        const isTurn = p.id === game.turnPlayerId && (game.phase === 'betting' || game.phase === 'playing');
        return (
          <div
            key={p.id}
            className={`flex items-center gap-1.5 rounded-lg px-1 py-1 ${
              isTurn ? 'bg-gold-500/30 ring-1 ring-gold-300' : 'bg-white/5'
            } ${p.eliminated ? 'opacity-45' : ''}`}
          >
            {member && (
              <img
                src={portraitUrl(member.character)}
                alt=""
                className="size-6 shrink-0 rounded-full bg-stone-100 object-cover object-top"
              />
            )}
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white">
              {p.id === room.youId ? 'Você' : p.name}
            </span>
            {p.eliminated ? (
              <span className="text-[10px] font-black text-card-red">FORA</span>
            ) : (
              <span className="flex gap-1 text-sm font-black text-white">
                <span className="w-6 rounded bg-black/40 text-center text-gold-300">{p.bet ?? '–'}</span>
                <span
                  className={`w-6 rounded text-center ${over ? 'bg-wine-700' : hit ? 'bg-emerald-700/80' : 'bg-black/40'}`}
                >
                  {p.tricksWon}
                </span>
              </span>
            )}
          </div>
        );
      })}
    </aside>
  );
}
