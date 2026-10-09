import { motion } from 'framer-motion';
import { useState } from 'react';
import {
  GAME_CATALOG,
  type DaneseRoomView,
  type PokerRoomView,
  type PokerSettings,
  type RoomView,
  CHARACTER_IDS,
  bigBlind,
  formatMoney,
  isPokerRoom,
  smallBlind,
  wordLetters,
} from '@dane-se/shared';
import { avatarColor, initial } from '../lib/avatar';
import { CHARACTER_NAMES, portraitUrl } from '../lib/characters';
import { actions, notify, roomLink } from '../lib/store';
import { ChatPanel } from './ChatPanel';
import { Button } from './ui/Button';

export function WaitingRoom({ room, onHelp }: { room: RoomView; onHelp: () => void }) {
  const isHost = room.hostId === room.youId;
  const link = roomLink(room.code);
  const game = GAME_CATALOG.find((g) => g.id === room.gameType)!;
  const canStart = room.members.length >= game.minPlayers;
  const poker = isPokerRoom(room);
  const missing = Math.max(0, game.minPlayers - room.members.length);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: game.name, text: `Bora jogar ${game.name}! Sala ${room.code}`, url: link });
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
    <main className="room-bg flex min-h-full flex-col items-center px-4 pt-6">
      <div className="flex w-full max-w-md flex-1 flex-col gap-5 pb-10">
        <header className="hub-panel relative overflow-hidden p-4 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-20 left-1/2 h-40 w-64 -translate-x-1/2 rounded-full bg-gold-400/10 blur-3xl"
          />
          <div className="relative flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-xs font-medium text-stone-200 ring-1 ring-white/10">
              <span aria-hidden>{game.icon}</span>
              {game.name}
            </span>
            {room.money.practice && (
              <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-xs font-semibold text-sky-300">🤖 treino</span>
            )}
            <button
              type="button"
              onClick={onHelp}
              className="ml-auto rounded-full bg-black/30 px-2.5 py-1 text-xs font-medium text-stone-300 ring-1 ring-white/10 transition hover:text-white"
            >
              📖 Regras
            </button>
          </div>
          <p className="relative mt-3 text-[11px] font-semibold tracking-[0.22em] text-stone-400 uppercase">Código da sala</p>
          <h1 className="relative font-mono text-5xl font-bold tracking-[0.22em] gold-text">{room.code}</h1>
          <Button variant="secondary" className="relative mt-3 w-full" onClick={share}>
            🔗 Convidar amigos
          </Button>
        </header>

        <section className="hub-panel p-4">
          <header className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[11px] font-semibold tracking-[0.16em] text-stone-400 uppercase">Jogadores</h2>
            <span className="text-sm font-medium text-stone-300">
              {room.members.length}/{game.maxPlayers}
            </span>
          </header>
          <ul className="space-y-2">
            {room.members.map((m, i) => (
              <motion.li
                key={m.id}
                layout
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-3 rounded-2xl bg-black/25 p-2 ring-1 ring-white/5"
              >
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-xl font-bold text-white ring-1 ring-white/20"
                  style={{ background: avatarColor(m.id) }}
                >
                  {initial(m.name)}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-stone-100">
                  {m.name}
                  {m.id === room.youId && <span className="font-normal text-stone-400"> (você)</span>}
                </span>
                {m.isHost && (
                  <span className="shrink-0 rounded-full bg-gold-500/20 px-2 py-0.5 text-[11px] font-semibold text-gold-300">
                    👑 anfitrião
                  </span>
                )}
                {m.isBot && <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-stone-300">🤖 bot</span>}
                {!m.connected && <span className="shrink-0 text-[11px] text-stone-500">sem sinal</span>}
                {isHost && m.id !== room.youId && (
                  <button
                    onClick={() => actions.kick(m.id)}
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-stone-400 transition hover:bg-wine-700/60 hover:text-white"
                    aria-label={`Remover ${m.name}`}
                  >
                    ✕
                  </button>
                )}
              </motion.li>
            ))}
          </ul>
          {missing > 0 && <p className="mt-3 text-center text-sm text-stone-400">Faltam {missing} para começar…</p>}
          {isHost && room.members.length < game.maxPlayers && (
            <Button variant="secondary" className="mt-3 w-full" onClick={() => actions.addBot()}>
              🤖 Adicionar bot
            </Button>
          )}
        </section>

        {poker ? <PokerMoneyPanel room={room} isHost={isHost} /> : <MoneyPanel room={room} isHost={isHost} />}

        <CharacterPicker room={room} />

        {room.gameType === 'danese' && <Settings room={room} isHost={isHost} />}

        <div className="text-center">
          <Button variant="ghost" onClick={() => actions.leave()}>
            Sair da sala
          </Button>
        </div>
      </div>

      <div className="safe-bottom sticky bottom-0 z-30 w-full max-w-md pt-4">
        <div className="rounded-2xl border border-gold-500/20 bg-felt-900/85 p-2 shadow-[0_-10px_30px_-15px_rgb(0_0_0/0.9)] backdrop-blur">
          {isHost ? (
            <Button className="w-full text-lg" disabled={!canStart} onClick={() => actions.start()}>
              {canStart ? '▶ Começar partida' : `Faltam ${missing} jogador${missing === 1 ? '' : 'es'}`}
            </Button>
          ) : (
            <p className="py-2 text-center text-sm text-stone-300">
              Aguardando {room.members.find((m) => m.isHost)?.name ?? 'o anfitrião'} começar…
            </p>
          )}
        </div>
      </div>

      <ChatPanel room={room} className="fixed right-4 bottom-24 z-40" />
    </main>
  );
}

function Settings({ room, isHost }: { room: DaneseRoomView; isHost: boolean }) {
  const [word, setWord] = useState(room.settings.word);
  const { settings } = room;
  const lives = wordLetters(settings.word).length;

  return (
    <section className="hub-panel space-y-3 p-4">
      <h2 className="text-[11px] font-semibold tracking-[0.16em] text-stone-400 uppercase">Configurações</h2>

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
              className="min-h-11 w-32 rounded-xl bg-black/40 px-3 text-center font-bold tracking-widest ring-1 ring-white/15 focus:ring-gold-400 focus:outline-none"
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
              className={`size-11 rounded-xl font-bold ring-1 transition ${
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
              className={`min-h-11 rounded-xl px-3 text-sm font-semibold ring-1 transition ${
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

function MoneyPanel({ room, isHost }: { room: RoomView; isHost: boolean }) {
  const game = GAME_CATALOG.find((g) => g.id === room.gameType)!;
  const paying = room.members.filter((m) => !m.isBot).length;
  const { entry } = room.money;

  return (
    <section className="hub-panel space-y-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold tracking-[0.16em] text-stone-400 uppercase">Entrada</h2>
        {room.money.practice ? (
          <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-xs font-semibold text-sky-300">
            Treino: ninguém paga
          </span>
        ) : (
          <span className="text-sm text-stone-400">{formatMoney(entry)} por pessoa</span>
        )}
      </div>

      {isHost && room.status === 'lobby' && !room.money.practice && (
        <div className="grid grid-cols-4 gap-1.5">
          {game.entryOptions.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={entry === v}
              onClick={() => actions.updateSettings({ entry: v })}
              className={`min-h-11 rounded-xl text-sm font-bold ring-1 transition ${
                entry === v ? 'bg-gold-400 text-wood-900 ring-gold-300' : 'bg-black/30 text-stone-300 ring-white/10'
              }`}
            >
              {formatMoney(v)}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-baseline justify-between rounded-2xl bg-black/25 px-3 py-2 text-sm">
        <span className="text-stone-300">Pote</span>
        <span className="font-bold text-gold-300 tabular-nums">
          {formatMoney(entry * paying)}
          <span className="ml-2 font-normal text-stone-400">
            {paying} × {formatMoney(entry)}
          </span>
        </span>
      </div>

      <p className="text-xs text-stone-400">
        A entrada é paga na hora de começar a partida, direto do seu saldo. Quem ficar até o fim leva o pote; sair no
        meio da partida perde a entrada.
      </p>
    </section>
  );
}

function PokerMoneyPanel({ room, isHost }: { room: PokerRoomView; isHost: boolean }) {
  const { settings, money } = room;
  const options = GAME_CATALOG.find((g) => g.id === 'poker')!.entryOptions.filter(
    (v) => v >= settings.minBuyIn && v <= settings.maxBuyIn,
  );

  return (
    <section className="space-y-3">
      <div className="hub-panel space-y-3 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[11px] font-semibold tracking-[0.16em] text-stone-400 uppercase">Banca (buy-in)</h3>
          {money.practice ? (
            <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-xs font-semibold text-sky-300">
              Treino: só fichas
            </span>
          ) : (
            <span className="font-mono font-bold text-gold-300 tabular-nums">{formatMoney(money.entry)}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Banca inicial">
          {options.map((v) => (
            <button
              key={v}
              type="button"
              disabled={!isHost}
              onClick={() => void actions.updateSettings({ entry: v, minBuyIn: settings.minBuyIn, maxBuyIn: settings.maxBuyIn })}
              aria-pressed={settings.entry === v}
              className={`min-h-11 rounded-xl px-3 text-sm font-bold ring-1 transition ${
                settings.entry === v ? 'bg-gold-400 text-wood-900 ring-gold-300' : 'bg-black/30 text-stone-300 ring-white/10'
              } ${isHost ? '' : 'cursor-default opacity-80'}`}
            >
              {formatMoney(v)}
            </button>
          ))}
        </div>
      </div>

      <div className="hub-panel space-y-3 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[11px] font-semibold tracking-[0.16em] text-stone-400 uppercase">Banca mínima</h3>
          <span className="font-mono font-bold text-gold-300 tabular-nums">{formatMoney(settings.minBuyIn)}</span>
        </div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Banca mínima">
          {[1000, 2500, 5000].map((min) => (
            <button
              key={min}
              type="button"
              disabled={!isHost}
              onClick={() => void actions.updateSettings(blindsPatch(settings, min))}
              aria-pressed={settings.minBuyIn === min}
              className={`min-h-11 rounded-xl px-3 text-sm font-bold ring-1 transition ${
                settings.minBuyIn === min ? 'bg-gold-400 text-wood-900 ring-gold-300' : 'bg-black/30 text-stone-300 ring-white/10'
              } ${isHost ? '' : 'cursor-default opacity-80'}`}
            >
              {formatMoney(min)}
            </button>
          ))}
        </div>
        <p className="text-xs text-stone-400">
          Blinds de {formatMoney(smallBlind(settings.minBuyIn))} / {formatMoney(bigBlind(settings.minBuyIn))} · banca máxima de{' '}
          {formatMoney(settings.maxBuyIn)}. A banca mínima também define as apostas cegas.
        </p>
      </div>

      <p className="text-xs text-stone-400">
        {money.practice
          ? 'Sala de treino: ninguém paga nada, as fichas são de brincadeira.'
          : 'A banca sai do seu saldo quando a partida começa. Entre as mãos você pode recarregar direto da carteira.'}
      </p>
    </section>
  );
}

/** Keeps `entry` inside the new [min, max] range so the server never rejects the patch. */
function blindsPatch(settings: PokerSettings, minBuyIn: number): Partial<PokerSettings> {
  const maxBuyIn = minBuyIn * 10;
  const entry = settings.entry >= minBuyIn && settings.entry <= maxBuyIn ? settings.entry : minBuyIn;
  return { minBuyIn, maxBuyIn, entry };
}

function CharacterPicker({ room }: { room: RoomView }) {
  const mine = room.members.find((m) => m.id === room.youId)?.character;
  return (
    <section className="hub-panel p-4">
      <h2 className="mb-3 text-[11px] font-semibold tracking-[0.16em] text-stone-400 uppercase">Seu personagem</h2>
      <div className="grid grid-cols-3 gap-2">
        {CHARACTER_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => actions.setCharacter(id)}
            aria-pressed={mine === id}
            className={`overflow-hidden rounded-2xl bg-black/25 pb-1 text-center text-sm transition ${
              mine === id ? 'ring-2 ring-gold-300' : 'ring-1 ring-white/10 hover:ring-white/30'
            }`}
          >
            <img src={portraitUrl(id)} alt="" className="aspect-square w-full bg-stone-100 object-cover object-top" />
            {CHARACTER_NAMES[id]}
          </button>
        ))}
      </div>
    </section>
  );
}
