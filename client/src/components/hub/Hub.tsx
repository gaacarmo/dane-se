import { motion } from 'framer-motion';
import { Fragment, type FormEvent, type ReactNode, useState } from 'react';
import {
  GAME_CATALOG,
  MAX_NAME_LENGTH,
  ROOM_CODE_LENGTH,
  formatMoney,
  type GameCatalogEntry,
  type GameType,
} from '@dane-se/shared';
import { setPref, usePrefs } from '../../lib/prefs';
import { actions, codeFromUrl, useClient } from '../../lib/store';
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

/** Small all-caps section marker with a gold rule that fades out. */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] font-semibold tracking-[0.18em] text-stone-400 uppercase">{children}</span>
      <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-gold-500/30 to-transparent" />
    </div>
  );
}

/** Chosen before creating or joining a room; remembered on this device. */
function ViewModePicker() {
  const { view3d: wantsView3d } = usePrefs();
  const view3d = wantsView3d && webglSupported;
  return (
    <div className="hub-panel space-y-3 p-4">
      <h2 className="text-[11px] font-semibold tracking-[0.16em] text-stone-400 uppercase">Modo de jogo</h2>
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
              className={`flex flex-col items-start gap-1 rounded-2xl p-3 text-left ring-2 transition disabled:cursor-not-allowed disabled:opacity-50 ${
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
      <p className="text-xs text-stone-500">Vale para as mesas do Dane-se.</p>
    </div>
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
    <form onSubmit={submit} className="hub-panel w-full max-w-sm space-y-4 p-5">
      <div className="text-center">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-stone-400 uppercase">Nova carteira</p>
        <p className="mt-1 text-sm text-stone-300">Escolha um apelido pra começar a jogar.</p>
      </div>
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

/** Inline create form for the chosen game, rendered right under its card. */
function CreatePanel({
  game,
  entry,
  setEntry,
  balance,
  busy,
  onCreate,
}: {
  game: GameCatalogEntry;
  entry: number;
  setEntry: (value: number) => void;
  balance: number;
  busy: boolean;
  onCreate: () => void;
}) {
  const poker = game.id === 'poker';
  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'circOut' }}
      className="hub-panel space-y-3 p-4"
    >
      <div>
        <h2 className="text-sm font-semibold text-white">Abrir mesa de {game.name}</h2>
        <p className="mt-0.5 text-sm text-stone-400">
          {poker
            ? 'Você define a banca inicial; as apostas cegas saem dela. No lobby dá pra ajustar a banca mínima.'
            : 'Você escolhe a entrada; todo mundo paga a mesma para entrar no pote.'}
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-stone-400">{poker ? 'Banca inicial (buy-in)' : 'Entrada'}</p>
        <div className="grid grid-cols-4 gap-1.5">
          {game.entryOptions.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={entry === v}
              onClick={() => setEntry(v)}
              className={`min-h-11 rounded-xl text-sm font-bold ring-1 transition ${
                entry === v ? 'bg-gold-400 text-wood-900 ring-gold-300' : 'bg-black/30 text-stone-300 ring-white/10 hover:ring-white/25'
              }`}
            >
              {formatMoney(v)}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-stone-400">
        Saldo: <span className="font-semibold text-stone-200 tabular-nums">{formatMoney(balance)}</span> · precisa de pelo menos{' '}
        {formatMoney(game.minEntry)}.
      </p>

      <Button className="w-full" disabled={busy || balance < entry} onClick={onCreate}>
        {busy ? 'Abrindo…' : `Criar sala de ${game.name}`}
      </Button>
    </motion.section>
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

  if (!profile) {
    return (
      <main className="room-bg flex min-h-full flex-col items-center justify-center gap-6 px-4 py-10">
        <CardFan />
        <header className="max-w-xs text-center">
          <h1 className="font-display text-5xl font-bold tracking-wide gold-text drop-shadow sm:text-6xl">Game Hub</h1>
          <p className="mt-2 text-stone-300">Uma carteira só para Dane-se e poker — jogue com a galera.</p>
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
    <main className="room-bg flex min-h-full flex-col items-center px-4 py-7">
      <div className="w-full max-w-md space-y-6">
        <header className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-2xl bg-felt-800 text-xl ring-1 ring-gold-500/30"
          >
            🎴
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-2xl leading-none gold-text">Game Hub</h1>
            <p className="mt-1 text-xs text-stone-400">Escolha uma mesa e boa sorte.</p>
          </div>
          <Button variant="ghost" onClick={onHelp} className="ml-auto shrink-0 px-3 py-2 text-sm">
            📖 Regras
          </Button>
        </header>

        <WalletHeader profile={profile} />

        <section className="space-y-3">
          <SectionLabel>Escolha o jogo</SectionLabel>
          {GAME_CATALOG.map((game, i) => (
            <Fragment key={game.id}>
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i, duration: 0.35, ease: 'circOut' }}
              >
                <GameCard
                  game={game}
                  selected={selected === game.id}
                  onSelect={() => {
                    setSelected(selected === game.id ? null : game.id);
                    setEntry(game.defaultEntry);
                  }}
                />
              </motion.div>
              {selected === game.id && (
                <CreatePanel
                  game={game}
                  entry={entry}
                  setEntry={setEntry}
                  balance={profile.balance}
                  busy={busy}
                  onCreate={() => void create(game)}
                />
              )}
            </Fragment>
          ))}
        </section>

        <form onSubmit={join} className="hub-panel space-y-2.5 p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-stone-200">Entrar com código</h2>
            <span className="text-[11px] text-stone-500">4 letras</span>
          </div>
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
          {!joinOpen && <p className="text-xs text-stone-500">Recebeu um código? Digite aqui (ex.: ABCD).</p>}
        </form>

        <ViewModePicker />

        <p className="pb-1 text-center text-xs text-stone-500">Dinheiro de mentirinha — sem apostas de verdade. 🍀</p>
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
