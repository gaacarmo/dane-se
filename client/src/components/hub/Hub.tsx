import { type FormEvent, type ReactNode, useState } from 'react';
import { MAX_NAME_LENGTH, formatMoney } from '@dane-se/shared';
import { setPref, usePrefs } from '../../lib/prefs';
import { actions, codeFromUrl, useClient } from '../../lib/store';
import { webglSupported } from '../../lib/webgl';
import { ChalkMenu } from './ChalkMenu';
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

type HubTab = 'play' | 'friends' | 'ranking' | 'settings';

const TABS: { id: HubTab; label: string }[] = [
  { id: 'play', label: 'Jogar' },
  { id: 'friends', label: 'Amigos' },
  { id: 'ranking', label: 'Ranking' },
  { id: 'settings', label: 'Ajustes' },
];

/** Section heading for the side panels: plain sentence case, no eyebrow. */
function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="font-cond text-xl font-bold text-stone-200">{children}</h2>;
}

/** The board's sign: the group's name, hand-lettered. */
function BoardSign() {
  return (
    <div>
      <h1 className="chalk text-[2.6rem] leading-[0.95] text-giz">Cantina do Dane-se</h1>
      <p className="mt-1 font-barlow text-[15px] text-giz/60">O que vai ser hoje?</p>
    </div>
  );
}

/** Chosen before creating or joining a room; remembered on this device. */
function ViewModePicker() {
  const { view3d: wantsView3d } = usePrefs();
  const view3d = wantsView3d;
  return (
    <div className="hub-panel space-y-3 p-4">
      <h2 className="font-cond text-lg font-bold text-stone-200">Como ver a mesa</h2>
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

/** Creates a new wallet: the very first thing a visitor sees, on the same chalkboard. */
function NicknameGate() {
  const { connection } = useClient();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const online = connection === 'connected';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!trimmed || !online) return;
    setBusy(true);
    await actions.hello(trimmed);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="chalkboard w-full max-w-md space-y-5 px-6 pt-6 pb-7">
      <div>
        <h1 className="chalk text-[3.75rem] leading-[0.9] text-giz">Dane-se</h1>
        <p className="mt-2 max-w-[32ch] font-barlow text-base leading-snug text-giz/70">
          Dane-se, truco e poker com a galera, valendo dinheiro de mentira. Você começa com {formatMoney(10_000)}.
        </p>
      </div>
      <label className="block">
        <span className="chalk mb-1 block text-2xl text-giz">Como a galera te chama?</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="nickname"
          autoFocus
          placeholder="Zé da Manilha"
          className="chalk min-h-12 w-full border-b-2 border-dashed border-giz/50 bg-transparent px-1 text-3xl text-giz-amarelo placeholder:text-giz/20 focus:border-giz-amarelo focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={busy || trimmed.length === 0 || !online}
        className="min-h-12 w-full rounded-md bg-giz font-cond text-xl font-bold text-lousa-funda shadow-[0_3px_0_rgb(0_0_0/0.45)] transition active:translate-y-[2px] active:shadow-none disabled:bg-giz/30 disabled:shadow-none"
      >
        {!online ? 'Conectando…' : busy ? 'Abrindo sua comanda…' : 'Sentar na mesa'}
      </button>
    </form>
  );
}

/** The game hub: the bar tab on top, the chalkboard menu below, friends and ranking alongside. */
export function Hub({ onHelp }: { onHelp: () => void }) {
  const { profile, social } = useClient();
  const linkCode = codeFromUrl();
  const [tab, setTab] = useState<HubTab>('play');

  if (!profile) {
    return (
      <main className="room-bg flex min-h-full flex-col items-center justify-center px-4 py-10">
        <NicknameGate />
      </main>
    );
  }

  return (
    <main className="room-bg flex min-h-full flex-col items-center px-4 pt-5 pb-10">
      <div className="w-full max-w-md lg:grid lg:max-w-6xl lg:grid-cols-[17rem_minmax(0,1fr)_21rem] lg:items-start lg:gap-8">
        <div className="space-y-5 lg:order-2">
          <WalletHeader profile={profile} />

          <div role="tablist" aria-label="Seções" className="flex gap-1 rounded-lg bg-black/30 p-1 lg:hidden">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`min-h-10 flex-1 rounded-md px-2 font-cond text-[17px] font-bold transition ${
                  tab === t.id ? 'bg-giz text-lousa-funda' : 'text-stone-300 hover:bg-white/10'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className={`${tab === 'play' ? '' : 'hidden'} lg:block`}>
            <ChalkMenu balance={profile.balance} initialCode={linkCode ?? ''} onRules={onHelp} header={<BoardSign />} />
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
