import { AnimatePresence, motion } from 'framer-motion';
import { type FormEvent, type ReactNode, useState } from 'react';
import {
  GAME_CATALOG,
  MAX_NAME_LENGTH,
  ROOM_CODE_LENGTH,
  formatMoney,
  type GameCatalogEntry,
} from '@dane-se/shared';
import { setPref, usePrefs } from '../../lib/prefs';
import { csMode } from '../../lib/csMode';
import { actions, codeFromUrl, useClient } from '../../lib/store';
import { webglSupported } from '../../lib/webgl';
import { CardFan } from '../cards/CardFan';
import { Button } from '../ui/Button';
import { CsPanel } from './CsCard';
import { GameIcon, GameTile, type HubGameId } from './GameCard';
import { FriendsPanel } from './FriendsPanel';
import { RankingPanel } from './RankingPanel';
import { RecoveryPanel } from './RecoveryPanel';
import { WalletHeader } from './WalletHeader';

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
type HubTab = 'play' | 'friends' | 'ranking' | 'settings';

const TABS: { id: HubTab; label: string }[] = [
  { id: 'play', label: 'Jogar' },
  { id: 'friends', label: 'Amigos' },
  { id: 'ranking', label: 'Ranking' },
  { id: 'settings', label: 'Ajustes' },
];

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
  const view3d = wantsView3d;
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
              onClick={() => setPref('view3d', m.realistic)}
              className={`flex flex-col items-start gap-1 rounded-2xl p-3 text-left ring-2 transition ${
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
                  ? 'Seu navegador diz que não tem gráficos 3D ativados. Dá pra tentar mesmo assim; se não abrir, o jogo volta pro Mobile.'
                  : m.text}
              </span>
            </button>
          );
        })}
      </div>
      {!webglSupported && (
        <p className="rounded-lg bg-black/30 p-2 text-xs leading-snug text-stone-300">
          Pra funcionar melhor no Chrome: abra <strong className="text-stone-100">chrome://settings/system</strong>,
          ligue <strong className="text-stone-100">&ldquo;Usar aceleração gráfica quando disponível&rdquo;</strong>,
          reinicie o Chrome e recarregue esta página. Pra conferir,{' '}
          <strong className="text-stone-100">chrome://gpu</strong> deve mostrar &ldquo;WebGL2: Hardware
          accelerated&rdquo;.
        </p>
      )}
      <p className="text-xs text-stone-500">Vale para as mesas do Dane-se e do Poker. O Truco, por enquanto, é só na mesa vista de cima.</p>
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

/** iOS-style on/off switch. */
function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative h-7 w-12 shrink-0 rounded-full p-0.5 transition-colors duration-200 ${on ? 'bg-emerald-500' : 'bg-white/15'}`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 600, damping: 34 }}
        className={`block size-6 rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.35)] ${on ? 'ml-auto' : ''}`}
      />
    </span>
  );
}

/** App Store-style info strip: three facts split by hairlines. */
function InfoStrip({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-3 divide-x divide-white/10 rounded-2xl bg-black/25 py-2.5 text-center">
      {items.map((it) => (
        <div key={it.label} className="min-w-0 px-1.5">
          <dt className="truncate text-[10px] font-semibold tracking-[0.08em] text-stone-500 uppercase">{it.label}</dt>
          <dd className="mt-0.5 truncate text-sm font-bold text-stone-100 tabular-nums">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const GAME_NOTES: Record<GameCatalogEntry['id'], string> = {
  danese: 'Você escolhe a entrada; todo mundo paga a mesma para entrar no pote.',
  poker: 'Você define a banca inicial; as apostas cegas saem dela. No lobby dá pra ajustar a banca mínima.',
  truco: '1 contra 1 ou 2 contra 2. A dupla que fizer 12 pontos divide o pote.',
};

/** Details of the chosen game, App Store style: icon, facts, entry and one big button. */
function GameDetail({
  game,
  entry,
  setEntry,
  arcade,
  setArcade,
  balance,
  busy,
  onCreate,
}: {
  game: GameCatalogEntry;
  entry: number;
  setEntry: (value: number) => void;
  arcade: boolean;
  setArcade: (value: boolean) => void;
  balance: number;
  busy: boolean;
  onCreate: () => void;
}) {
  const poker = game.id === 'poker';
  const players = game.id === 'truco' ? '2 ou 4' : `${game.minPlayers}–${game.maxPlayers}`;
  return (
    <div className="space-y-4">
      <InfoStrip
        items={[
          { label: 'Jogadores', value: players },
          { label: poker ? 'Buy-in mín.' : 'Entrada mín.', value: formatMoney(game.minEntry) },
          { label: 'Bots', value: 'Sim' },
        ]}
      />
      <p className="text-sm leading-snug text-stone-300">{GAME_NOTES[game.id]}</p>

      <div>
        <p className="mb-1.5 text-xs font-medium text-stone-400">{poker ? 'Banca inicial (buy-in)' : 'Entrada'}</p>
        {/* iOS segmented control. */}
        <div className="relative grid grid-cols-4 rounded-2xl bg-black/35 p-1 ring-1 ring-white/5" role="radiogroup" aria-label="Entrada">
          {game.entryOptions.map((v) => {
            const on = entry === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setEntry(v)}
                className={`relative min-h-10 rounded-xl text-[13px] font-bold transition-colors ${on ? 'text-wood-900' : 'text-stone-300 hover:text-white'}`}
              >
                {on && (
                  <motion.span
                    layoutId="entry-thumb"
                    transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-b from-gold-300 to-gold-400 shadow-[0_3px_10px_-2px_rgb(0_0_0/0.5)]"
                  />
                )}
                <span className="relative">{formatMoney(v)}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-stone-500">
          Saldo <span className="font-semibold text-stone-300 tabular-nums">{formatMoney(balance)}</span>
        </p>
      </div>

      {game.id === 'danese' && (
        <button
          type="button"
          role="switch"
          aria-checked={arcade}
          onClick={() => setArcade(!arcade)}
          className="flex w-full items-center gap-3 rounded-2xl bg-black/25 p-3 text-left ring-1 ring-white/5 transition hover:ring-white/15"
        >
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-fuchsia-500/20 text-lg">
            ⚡
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-white">Modo arcade</span>
            <span className="block text-xs text-stone-400">Kit por personagem + um talento comum.</span>
          </span>
          <Switch on={arcade} />
        </button>
      )}

      <Button className="w-full rounded-2xl text-base" disabled={busy || balance < entry} onClick={onCreate}>
        {busy ? 'Abrindo…' : balance < entry ? 'Saldo insuficiente' : `Criar sala de ${game.name}`}
      </Button>
    </div>
  );
}

/** The game hub: wallet on top, catalog below, create or join a room. */
export function Hub({ onHelp }: { onHelp: () => void }) {
  const { connection, profile, social } = useClient();
  const linkCode = codeFromUrl();
  const [selected, setSelected] = useState<HubGameId | null>(null);
  const [entry, setEntry] = useState(0);
  const [tab, setTab] = useState<HubTab>('play');
  const [code, setCode] = useState(linkCode ?? '');
  const [joinOpen, setJoinOpen] = useState(Boolean(linkCode));
  const [busy, setBusy] = useState(false);
  const [arcade, setArcade] = useState(false);

  if (!profile) {
    return (
      <main className="room-bg flex min-h-full flex-col items-center justify-center gap-6 px-4 py-10">
        <CardFan />
        <header className="max-w-xs text-center">
          <h1 className="font-display text-5xl font-bold tracking-wide gold-text drop-shadow sm:text-6xl">Dane-se</h1>
          <p className="mt-2 text-stone-300">Uma carteira só para Dane-se, poker e truco — jogue com a galera.</p>
        </header>
        <NicknameGate />
      </main>
    );
  }

  async function create(game: GameCatalogEntry) {
    setBusy(true);
    await actions.createRoom({ gameType: game.id, settings: { entry }, arcade });
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

  const tiles: { id: HubGameId; name: string; badge?: string; disabled?: boolean }[] = [
    ...GAME_CATALOG.map((g) => ({
      id: g.id,
      name: g.name,
      badge: !g.available ? 'em breve' : g.id === 'truco' ? 'novo' : undefined,
      disabled: !g.available,
    })),
    { id: 'cs', name: 'Modo CS' },
  ];
  const selectedGame = GAME_CATALOG.find((g) => g.id === selected) ?? null;
  const selectedName = selected === 'cs' ? 'Modo CS' : (selectedGame?.name ?? '');
  const selectedDescription =
    selected === 'cs'
      ? 'Tiro em primeira pessoa, 3 contra 3. Plante e desarme a bomba, troque de lado e vença a partida.'
      : (selectedGame?.description ?? '');

  function pick(id: HubGameId) {
    if (selected === id) {
      setSelected(null);
      return;
    }
    setSelected(id);
    const game = GAME_CATALOG.find((g) => g.id === id);
    if (game) setEntry(game.defaultEntry);
  }

  return (
    <main className="room-bg flex min-h-full flex-col items-center px-4 py-7">
      <div className="w-full max-w-md lg:grid lg:max-w-6xl lg:grid-cols-[17rem_minmax(0,1fr)_21rem] lg:items-start lg:gap-6">
        <div className="space-y-6 lg:order-2">
          <header className="hub-panel relative overflow-hidden px-4 py-5">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-16 left-1/2 h-40 w-64 -translate-x-1/2 rounded-full bg-gold-400/10 blur-3xl"
            />
            <Button
              variant="ghost"
              onClick={onHelp}
              className="absolute top-3 right-3 z-10 shrink-0 px-3 py-2 text-sm"
            >
              📖 Regras
            </Button>
            <div className="relative flex flex-col items-center text-center">
              <CardFan size="sm" />
              <h1 className="mt-1 font-display text-4xl font-bold tracking-wide gold-text drop-shadow">Dane-se</h1>
              <p className="mt-1 text-sm text-stone-300">Escolha uma mesa e boa sorte.</p>
            </div>
          </header>


          <WalletHeader profile={profile} />

          <div role="tablist" aria-label="Seções" className="flex gap-1 rounded-xl bg-black/30 p-1 lg:hidden">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`min-h-10 flex-1 rounded-lg px-2 text-sm font-semibold transition ${
                  tab === t.id ? 'bg-gold-500/90 text-stone-950' : 'text-stone-300 hover:bg-white/10'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className={`space-y-6 ${tab === 'play' ? '' : 'hidden'} lg:block`}>
          <section className="space-y-3">
            <SectionLabel>Escolha o jogo</SectionLabel>
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Jogos">
              {tiles.map((t, i) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * i, duration: 0.35, ease: 'circOut' }}
                >
                  <GameTile
                    id={t.id}
                    name={t.name}
                    badge={t.badge}
                    disabled={t.disabled}
                    selected={selected === t.id}
                    onSelect={() => pick(t.id)}
                  />
                </motion.div>
              ))}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {selected && (
                <motion.section
                  key={selected}
                  initial={{ opacity: 0, y: -10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="hub-panel space-y-4 p-4"
                  aria-label={selectedName}
                >
                  <header className="flex items-center gap-3.5">
                    <GameIcon id={selected} size="lg" />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-lg leading-tight font-bold text-white">{selectedName}</h2>
                      <p className="mt-0.5 text-sm leading-snug text-stone-400">{selectedDescription}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      aria-label="Fechar"
                      className="grid size-8 shrink-0 place-items-center self-start rounded-full bg-white/10 text-sm text-stone-300 transition hover:bg-white/20 hover:text-white"
                    >
                      ✕
                    </button>
                  </header>
                  {selectedGame ? (
                    <GameDetail
                      game={selectedGame}
                      entry={entry}
                      setEntry={setEntry}
                      arcade={arcade}
                      setArcade={setArcade}
                      balance={profile.balance}
                      busy={busy}
                      onCreate={() => void create(selectedGame)}
                    />
                  ) : (
                    <CsPanel onTrain={csMode.open} />
                  )}
                </motion.section>
              )}
            </AnimatePresence>
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


          </div>
        </div>

        {social && (
          <aside className={`mt-6 space-y-3 ${tab === 'ranking' ? '' : 'hidden'} lg:order-1 lg:mt-0 lg:block`}>
            <SectionLabel>Ranking entre amigos</SectionLabel>
            <RankingPanel social={social} />
          </aside>
        )}

        <aside className={`mt-6 space-y-6 ${tab === 'friends' || tab === 'settings' ? '' : 'hidden'} lg:order-3 lg:mt-0 lg:block`}>
          {social && (
            <section className={`space-y-3 ${tab === 'friends' ? '' : 'hidden'} lg:block`}>
              <SectionLabel>Amigos</SectionLabel>
              <FriendsPanel social={social} />
            </section>
          )}
          <div className={`space-y-6 ${tab === 'settings' ? '' : 'hidden'} lg:block`}>
            <ViewModePicker />
            <RecoveryPanel />
          </div>
        </aside>
      </div>
    </main>
  );
}
