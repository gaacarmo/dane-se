import { motion } from 'framer-motion';
import { useState } from 'react';
import { type RoomView, MAX_PLAYERS, MIN_PLAYERS, wordLetters } from '@dane-se/shared';
import { avatarColor, initial } from '../lib/avatar';
import { actions, notify, roomLink } from '../lib/store';
import { Button } from './ui/Button';

export function WaitingRoom({ room, onHelp }: { room: RoomView; onHelp: () => void }) {
  const isHost = room.hostId === room.youId;
  const link = roomLink(room.code);
  const canStart = room.members.length >= MIN_PLAYERS;

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Dane-se', text: `Bora jogar Dane-se! Sala ${room.code}`, url: link });
        return;
      } catch {
        // Cancelled: fall back to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      notify('Link copiado!', 'info');
    } catch {
      notify(`Compartilhe este link: ${link}`, 'info');
    }
  }

  return (
    <main className="room-bg flex min-h-full flex-col items-center px-4 py-8">
      <div className="w-full max-w-md space-y-5">
        <header className="text-center">
          <p className="text-sm tracking-widest text-stone-400 uppercase">Sala</p>
          <h1 className="font-mono text-6xl font-bold tracking-[0.25em] gold-text">{room.code}</h1>
          <div className="mt-3 flex justify-center gap-2">
            <Button variant="secondary" onClick={share}>
              🔗 Convidar amigos
            </Button>
            <Button variant="ghost" onClick={onHelp}>
              📖 Regras
            </Button>
          </div>
        </header>

        <section className="rounded-2xl bg-felt-900/90 p-4 ring-1 ring-gold-500/30">
          <h2 className="mb-3 flex items-baseline justify-between text-stone-300">
            <span className="font-semibold">Jogadores</span>
            <span className="text-sm">
              {room.members.length}/{MAX_PLAYERS}
            </span>
          </h2>
          <ul className="space-y-2">
            {room.members.map((m, i) => (
              <motion.li
                key={m.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-3 rounded-xl bg-black/25 p-2"
              >
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-full font-bold text-white ring-2 ring-white/30"
                  style={{ background: avatarColor(m.id) }}
                >
                  {initial(m.name)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {m.name}
                  {m.id === room.youId && <span className="text-stone-400"> (você)</span>}
                </span>
                {m.isHost && (
                  <span className="rounded-full bg-gold-500/20 px-2 py-0.5 text-xs text-gold-300" title="Anfitrião">
                    👑 anfitrião
                  </span>
                )}
                {!m.connected && <span className="text-xs text-stone-400">desconectado</span>}
                {isHost && m.id !== room.youId && (
                  <button
                    onClick={() => actions.kick(m.id)}
                    className="grid size-11 place-items-center rounded-lg text-stone-400 hover:bg-wine-700/60 hover:text-white"
                    aria-label={`Remover ${m.name}`}
                  >
                    ✕
                  </button>
                )}
              </motion.li>
            ))}
          </ul>
          {room.members.length < MIN_PLAYERS && (
            <p className="mt-3 text-center text-sm text-stone-400">Esperando mais gente entrar…</p>
          )}
        </section>

        <Settings room={room} isHost={isHost} />

        {isHost ? (
          <Button className="w-full text-lg" disabled={!canStart} onClick={() => actions.start()}>
            {canStart ? 'Começar partida' : `Precisa de pelo menos ${MIN_PLAYERS} jogadores`}
          </Button>
        ) : (
          <p className="text-center text-stone-300">
            Aguardando {room.members.find((m) => m.isHost)?.name ?? 'o anfitrião'} começar a partida…
          </p>
        )}

        <div className="text-center">
          <Button variant="ghost" onClick={() => actions.leave()}>
            Sair da sala
          </Button>
        </div>
      </div>
    </main>
  );
}

function Settings({ room, isHost }: { room: RoomView; isHost: boolean }) {
  const [word, setWord] = useState(room.settings.word);
  const { settings } = room;
  const lives = wordLetters(settings.word).length;

  return (
    <section className="space-y-3 rounded-2xl bg-felt-900/90 p-4 ring-1 ring-gold-500/30">
      <h2 className="font-semibold text-stone-300">Configurações</h2>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-stone-300">Palavra (vidas)</span>
        {isHost ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void actions.updateSettings({ word });
            }}
          >
            <input
              value={word}
              onChange={(e) => setWord(e.target.value.toUpperCase())}
              maxLength={20}
              className="min-h-11 w-32 rounded-lg bg-black/40 px-3 text-center font-bold tracking-widest ring-1 ring-white/15 focus:ring-gold-400 focus:outline-none"
              aria-label="Palavra de vidas"
            />
            <Button variant="secondary" type="submit" disabled={word.trim() === settings.word} className="px-3">
              OK
            </Button>
          </form>
        ) : (
          <span className="font-bold tracking-widest text-gold-300">{settings.word}</span>
        )}
      </div>
      <p className="-mt-1 text-xs text-stone-400">
        {lives} letras = {lives} vidas. Quem completar a palavra está fora.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-stone-300">Máximo de cartas</span>
        <div className="flex gap-1">
          {[3, 4, 5, 6].map((n) => (
            <button
              key={n}
              disabled={!isHost}
              onClick={() => actions.updateSettings({ maxCards: n })}
              aria-pressed={settings.maxCards === n}
              className={`size-11 rounded-lg font-bold ring-1 transition ${
                settings.maxCards === n ? 'bg-gold-400 text-wood-900 ring-gold-300' : 'bg-black/30 text-stone-300 ring-white/10'
              } ${isHost ? '' : 'cursor-default opacity-80'}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-stone-300">Sequência</span>
        <div className="flex gap-1">
          {(
            [
              ['upDown', 'Sobe e desce'],
              ['restart', 'Volta pro 1'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              disabled={!isHost}
              onClick={() => actions.updateSettings({ cardCountMode: mode })}
              aria-pressed={settings.cardCountMode === mode}
              className={`min-h-11 rounded-lg px-3 text-sm font-semibold ring-1 transition ${
                settings.cardCountMode === mode
                  ? 'bg-gold-400 text-wood-900 ring-gold-300'
                  : 'bg-black/30 text-stone-300 ring-white/10'
              } ${isHost ? '' : 'cursor-default opacity-80'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
