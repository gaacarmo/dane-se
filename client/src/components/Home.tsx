import { motion } from 'framer-motion';
import { type FormEvent, useState } from 'react';
import { MAX_NAME_LENGTH, ROOM_CODE_LENGTH, type Card } from '@dane-se/shared';
import { actions, codeFromUrl, savedName, useClient } from '../lib/store';
import { setPref, usePrefs } from '../lib/prefs';
import { CardBack, PlayingCard } from './cards/PlayingCard';
import { Button } from './ui/Button';

const FAN: Card[] = [
  { rank: '3', suit: 'C' },
  { rank: 'K', suit: 'H' },
  { rank: '7', suit: 'D' },
  { rank: 'A', suit: 'S' },
];

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
  const { view3d } = usePrefs();
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
              onClick={() => setPref('view3d', m.realistic)}
              className={`flex flex-col items-start gap-1 rounded-xl p-3 text-left ring-2 transition ${
                selected ? 'bg-felt-700 ring-gold-400' : 'bg-black/30 ring-white/10 hover:ring-white/30'
              }`}
            >
              <span className="flex w-full items-center justify-between text-sm font-bold text-white">
                <span>
                  {m.icon} {m.title}
                </span>
                {selected && <span className="text-gold-300">✓</span>}
              </span>
              <span className="text-xs leading-snug text-stone-300">{m.text}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Home({ onHelp }: { onHelp: () => void }) {
  const { connection } = useClient();
  const linkCode = codeFromUrl();
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState(linkCode ?? '');
  const [mode, setMode] = useState<'create' | 'join'>(linkCode ? 'join' : 'create');
  const [busy, setBusy] = useState(false);

  const trimmed = name.trim();
  const canSubmit =
    connection === 'connected' && trimmed.length > 0 && (mode === 'create' || code.trim().length === ROOM_CODE_LENGTH);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    if (mode === 'create') await actions.createRoom(trimmed);
    else await actions.joinRoom(code, trimmed);
    setBusy(false);
  }

  return (
    <main className="room-bg flex min-h-full flex-col items-center justify-center gap-8 px-4 py-10">
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

      <header className="text-center">
        <h1 className="font-display text-6xl font-bold tracking-wide gold-text drop-shadow sm:text-7xl">Dane-se</h1>
      </header>

      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-2xl bg-felt-900/90 p-5 shadow-2xl ring-1 ring-gold-500/30"
      >
        {!linkCode && (
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1" role="tablist">
            {(['create', 'join'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`min-h-11 rounded-lg text-sm font-semibold transition ${
                  mode === m ? 'bg-felt-700 text-gold-300 shadow' : 'text-stone-400'
                }`}
              >
                {m === 'create' ? 'Criar sala' : 'Entrar com código'}
              </button>
            ))}
          </div>
        )}

        <ViewModePicker />

        <label className="block">
          <span className="mb-1 block text-sm text-stone-300">Seu apelido</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            autoComplete="nickname"
            placeholder="Ex.: Zé da Manilha"
            className="min-h-12 w-full rounded-xl bg-black/40 px-4 text-lg text-white ring-1 ring-white/15 placeholder:text-stone-500 focus:ring-gold-400 focus:outline-none"
          />
        </label>

        {mode === 'join' && (
          <label className="block">
            <span className="mb-1 block text-sm text-stone-300">Código da sala</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^a-z]/gi, '').toUpperCase())}
              maxLength={ROOM_CODE_LENGTH}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="ABCD"
              className="min-h-12 w-full rounded-xl bg-black/40 px-4 text-center font-mono text-2xl tracking-[0.5em] text-white uppercase ring-1 ring-white/15 placeholder:text-stone-600 focus:ring-gold-400 focus:outline-none"
            />
          </label>
        )}

        <Button type="submit" disabled={!canSubmit || busy} className="w-full text-lg">
          {busy ? 'Aguarde…' : mode === 'create' ? 'Criar sala' : 'Entrar na sala'}
        </Button>
      </form>

      <Button variant="ghost" onClick={onHelp}>
        📖 Como jogar
      </Button>
    </main>
  );
}
