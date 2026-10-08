import { motion } from 'framer-motion';
import { type FormEvent, useState } from 'react';
import {
  GAME_CATALOG,
  MAX_NAME_LENGTH,
  ROOM_CODE_LENGTH,
  formatMoney,
  type GameCatalogEntry,
  type GameType,
} from '@dane-se/shared';
import { actions, codeFromUrl, useClient } from '../../lib/store';
import { setPref, usePrefs } from '../../lib/prefs';
import { webglSupported } from '../../lib/webgl';
import { CardBack, PlayingCard } from '../cards/PlayingCard';
import { Button } from '../ui/Button';
import { GameCard } from './GameCard';
import { WalletHeader } from './WalletHeader';

const FAN = [
  { rank: '3', suit: 'C' },
  { rank: 'K', suit: 'H' },
  { rank: '7', suit: 'D' },
  { rank: 'A', suit: 'S' },
] as const;

const VIEW_MODES = [
  {
    realistic: false,
    icon: '📱',
    title: 'Mobile',
    text: 'A mesa vista de cima. Leve e ideal pro celular, mas também dá pra jogar no computador.',
  },
  {
    realistic: true,
    icon: '🖥️',
    title: 'Desktop',
    text: 'Em primeira pessoa: você sentado à mesa com os outros jogadores.',
  },
] as const;

/** Chosen before creating or joining a room; remembered on this device. */
function ViewModePicker() {
  const { view3d: wantsView3d } = usePrefs();
  const view3d = wantsView3d && webglSupported;
  return (
    <fieldset>
      <legend className="mb-1 block text-sm text-stone-300">Modo de jogo</legend>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Modo de jogo">
        {VIEW_MODES.map((m) => {
          const selected = view3d === m.realistic;
          return (
            <button
              key={m.title}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={m.realistic && !webglSupported}
              onClick={() => setPref('view3d', m.realistic)}
              className={`flex flex-col items-start gap-1 rounded-xl p-3 text-left ring-2 transition disabled:cursor-not-allowed disabled:opacity-50 ${
                selected ? 'bg-felt-700 ring-gold-400' : 'bg-black/30 ring-white/10 hover:ring-white/30'
              }`}
            >
              <span className="flex w-full items-center justify-between text-sm font-bold text-white">
                <span>
                  {m.icon} {m.title}
                </span>
                {selected && <span className="text-gold-300">✓</span>}
              </span>
              <span className="text-xs leading-snug text-stone-300">
                {m.realistic && !webglSupported
                  ? 'Indisponível: este navegador não tem gráficos 3D (WebGL) ativados.'
                  : m.text}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Creates a new wallet: the very first thing a visitor sees. */
function NicknameGate() {
  const { connection } = useClient();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!trimmed || connection !== 'connected') return;
    setBusy(true);
    await actions.hello(trimmed);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-felt-900/90 p-5 shadow-2xl ring-1 ring-gold-500/30">
      <label className="block">
        <span className="mb-1 block text-sm text-stone-300">Seu apelido</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="nickname"
          autoFocus
          placeholder="Ex.: Zé da Manilha"
          className="min-h-12 w-full rounded-xl bg-black/40 px-4 text-lg text-white ring-1 ring-white/15 placeholder:text-stone-500 focus:ring-gold-400 focus:outline-none"
        />
      </label>
      <Button type="submit" disabled={busy || trimmed.length === 0 || connection !== 'connected'} className="w-full text-lg">
        {connection !== 'connected' ? 'Conectando…' : busy ? 'Aguarde…' : 'Começar'}
      </Button>
      <p className="text-center text-xs text-stone-400">
        Você começa com {formatMoney(10_000)} de saldo — tudo fictício, é só pra jogar.
      </p>
    </form>
  );
}

/** The game hub: wallet on top, catalog below, create or join a room. */
export function Hub({ onHelp }: { onHelp: () => void }) {
  const { connection, profile } = useClient();
  const linkCode = codeFromUrl();
  const [selected, setSelected] = useState<GameType | null>(null);
  const [entry, setEntry] = useState(0);
  const [code, setCode] = useState(linkCode ?? '');
  const [joinOpen, setJoinOpen] = useState(Boolean(linkCode));
  const [busy, setBusy] = useState(false);

  const chooser = selected ? GAME_CATALOG.find((g) => g.id === selected)! : null;

  if (!profile) {
    return (
      <main className="room-bg flex min-h-full flex-col items-center justify-center gap-8 px-4 py-10">
        <CardFan />
        <header className="text-center">
          <h1 className="font-display text-6xl font-bold tracking-wide gold-text drop-shadow sm:text-7xl">Game Hub</h1>
          <p className="mt-2 text-stone-300">Dane-se, poker e mais — jogue com a galera.</p>
        </header>
        <NicknameGate />
      </main>
    );
  }

  async function create(game: GameCatalogEntry) {
    setBusy(true);
    await actions.createRoom({ gameType: game.id, settings: { entry } });
    setBusy(false);
  }

  async function join(e: FormEvent) {
    e.preventDefault();
    if (code.trim().length !== ROOM_CODE_LENGTH || busy) return;
    setBusy(true);
    await actions.joinRoom(code);
    setBusy(false);
  }

  const canJoin = connection === 'connected' && code.trim().length === ROOM_CODE_LENGTH;

  return (
    <main className="room-bg flex min-h-full flex-col items-center px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <header className="text-center">
          <h1 className="font-display text-4xl font-bold tracking-wide gold-text drop-shadow">Game Hub</h1>
          <p className="text-sm text-stone-400">Escolha um jogo ou entre numa sala pelo código.</p>
        </header>

        <WalletHeader profile={profile} />

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-widest text-stone-400 uppercase">Jogos</h2>
          </div>
          {GAME_CATALOG.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              selected={selected === game.id}
              onSelect={() => {
                setSelected(selected === game.id ? null : game.id);
                setEntry(game.defaultEntry);
              }}
            />
          ))}
        </section>

        {chooser && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3 rounded-2xl bg-felt-900/90 p-4 ring-1 ring-gold-500/30"
          >
            <h2 className="font-semibold text-stone-300">
              Criar sala de {chooser.name}
            </h2>
            <p className="text-sm text-stone-400">
              Você escolhe a entrada; todo mundo paga a mesma para entrar no pote.
            </p>
            <label className="block">
              <span className="mb-1 block text-sm text-stone-400">Entrada</span>
              <div className="grid grid-cols-4 gap-1.5">
                {chooser.entryOptions.map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={entry === v}
                    onClick={() => setEntry(v)}
                    className={`min-h-11 rounded-lg text-sm font-bold ring-1 transition ${
                      entry === v ? 'bg-gold-400 text-wood-900 ring-gold-300' : 'bg-black/30 text-stone-300 ring-white/10'
                    }`}
                  >
                    {formatMoney(v)}
                  </button>
                ))}
              </div>
            </label>
            <p className="text-xs text-stone-400">
              Saldo: {formatMoney(profile.balance)} · precisa de pelo menos {formatMoney(chooser.minEntry)}.
            </p>
            <Button
              className="w-full"
              disabled={busy || profile.balance < entry}
              onClick={() => void create(chooser)}
            >
              Criar sala de {chooser.name}
            </Button>
          </motion.section>
        )}

        <form onSubmit={join} className="space-y-2 rounded-2xl bg-felt-900/90 p-4 ring-1 ring-gold-500/30">
          <h2 className="font-semibold text-stone-300">Entrar com código</h2>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^a-z]/gi, '').toUpperCase())}
              maxLength={ROOM_CODE_LENGTH}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="ABCD"
              aria-label="Código da sala"
              className="min-h-12 min-w-0 flex-1 rounded-xl bg-black/40 px-3 text-center font-mono text-2xl tracking-[0.5em] text-white uppercase ring-1 ring-white/15 placeholder:text-stone-600 focus:ring-gold-400 focus:outline-none"
            />
            <Button type="submit" disabled={!canJoin || busy} className="px-4">
              Entrar
            </Button>
          </div>
          {!joinOpen && (
            <p className="text-xs text-stone-400">
              Já tem uma sala esperando? Digite o código de 4 letras (ex.: ABCD).
            </p>
          )}
        </form>

        <ViewModePicker />

        <div className="flex justify-center">
          <Button variant="ghost" onClick={onHelp}>
            📖 Como jogar
          </Button>
        </div>
      </div>
    </main>
  );
}

function CardFan() {
  return (
    <div className="relative h-36 w-64" aria-hidden>
      {FAN.map((card, i) => (
        <motion.div
          key={i}
          className="absolute bottom-0 left-1/2 w-20 origin-bottom"
          initial={{ rotate: 0, x: '-50%', y: 40, opacity: 0 }}
          animate={{
            rotate: (i - 1.5) * 14,
            x: `calc(-50% + ${(i - 1.5) * 26}px)`,
            y: Math.abs(i - 1.5) * 6,
            opacity: 1,
          }}
          transition={{ delay: 0.15 + i * 0.08, type: 'spring', stiffness: 160, damping: 16 }}
        >
          <PlayingCard card={card} highlight={i === 0} />
        </motion.div>
      ))}
      <motion.div
        className="absolute -right-6 bottom-2 w-14 rotate-12"
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.6 }}
      >
        <CardBack />
      </motion.div>
    </div>
  );
}