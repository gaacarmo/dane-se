import { type FormEvent, useState } from 'react';
import { MAX_NAME_LENGTH, formatMoney } from '@dane-se/shared';
import { type Appearance, setPref, usePrefs } from '../../lib/prefs';
import { actions, codeFromUrl, useClient } from '../../lib/store';
import { webglSupported } from '../../lib/webgl';
import { FriendsPanel } from './FriendsPanel';
import { GameList } from './GameList';
import { CircleButton, PrimaryButton, SectionHeader, Segmented, Symbols, TabBar } from './IosKit';
import { RankingPanel } from './RankingPanel';
import { RecoveryPanel } from './RecoveryPanel';
import { WalletHeader } from './WalletHeader';

type HubTab = 'play' | 'friends' | 'ranking' | 'settings';

const TABS: { id: HubTab; label: string; title: string; icon: React.ReactNode }[] = [
  { id: 'play', label: 'Jogar', title: 'Jogar', icon: Symbols.play },
  { id: 'friends', label: 'Amigos', title: 'Amigos', icon: Symbols.friends },
  { id: 'ranking', label: 'Ranking', title: 'Ranking', icon: Symbols.trophy },
  { id: 'settings', label: 'Ajustes', title: 'Ajustes', icon: Symbols.gear },
];

const VIEW_MODES = [
  { realistic: false, title: 'Vista de cima', text: 'Leve, ideal pro celular.' },
  { realistic: true, title: 'Primeira pessoa', text: 'Você sentado à mesa, em 3D.' },
] as const;

const APPEARANCES: Record<Appearance, string> = { auto: 'Automático', light: 'Claro', dark: 'Escuro' };

/** Claro, escuro ou seguindo o aparelho, como em Ajustes > Tela e Brilho. */
function AppearancePicker() {
  const { appearance } = usePrefs();
  return (
    <section>
      <SectionHeader>Aparência</SectionHeader>
      <Segmented
        label="Aparência"
        options={['auto', 'light', 'dark'] as const}
        value={appearance}
        onChange={(v) => setPref('appearance', v)}
        format={(v) => APPEARANCES[v]}
        layoutId="appearance"
      />
      <p className="mt-2 px-4 text-[13px] text-ios-label-2">No automático, o app segue o modo claro ou escuro do aparelho.</p>
    </section>
  );
}

/** Como ver a mesa: uma lista com marca de seleção, como no app Ajustes. */
function ViewModePicker() {
  const { view3d } = usePrefs();
  return (
    <section>
      <SectionHeader>Como ver a mesa</SectionHeader>
      <div role="radiogroup" aria-label="Como ver a mesa" className="glass overflow-hidden">
        {VIEW_MODES.map((m, i) => {
          const selected = view3d === m.realistic;
          return (
            <button
              key={m.title}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPref('view3d', m.realistic)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-ios-fill ${
                i > 0 ? 'border-t border-ios-separator' : ''
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[17px]">{m.title}</span>
                <span className="block text-[13px] text-ios-label-2">
                  {m.realistic && !webglSupported ? 'Seu navegador está sem 3D. Dá pra tentar; se falhar, volta pra vista de cima.' : m.text}
                </span>
              </span>
              {selected && (
                <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-ios-blue" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 px-4 text-[13px] text-ios-label-2">
        Vale pro Dane-se e pro poker. O truco, por enquanto, só tem a vista de cima.
        {!webglSupported && ' No Chrome, ligue "Usar aceleração gráfica" em chrome://settings/system e recarregue.'}
      </p>
    </section>
  );
}

/** Primeira visita: como uma tela de boas-vindas do iOS. */
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
    <form onSubmit={submit} className="relative z-10 flex w-full max-w-sm flex-col items-center text-center">
      <img src="/brand/logo.png" alt="Dane-se" width={180} height={174} className="brand-logo h-auto w-44" />
      <h1 className="mt-8 text-[34px] leading-tight font-bold tracking-tight">Boas-vindas</h1>
      <p className="mt-2 text-[17px] leading-snug text-ios-label-2">
        Dane-se, truco e poker com a galera. Você começa com {formatMoney(10_000)} de mentirinha.
      </p>
      <label className="glass mt-8 block w-full px-4 py-1 text-left">
        <span className="sr-only">Seu apelido</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="nickname"
          autoFocus
          placeholder="Seu apelido"
          className="min-h-12 w-full bg-transparent text-[17px] placeholder:text-ios-label-3 focus:outline-none"
        />
      </label>
      <PrimaryButton type="submit" className="mt-4" disabled={busy || trimmed.length === 0 || !online}>
        {!online ? 'Conectando…' : busy ? 'Entrando…' : 'Continuar'}
      </PrimaryButton>
    </form>
  );
}

/** O hub: título grande, conteúdo em vidro e a barra de abas flutuante. */
export function Hub({ onHelp }: { onHelp: () => void }) {
  const { profile, social } = useClient();
  const linkCode = codeFromUrl();
  const [tab, setTab] = useState<HubTab>('play');
  const current = TABS.find((t) => t.id === tab)!;

  if (!profile) {
    return (
      <main className="ios-hub flex min-h-full items-center justify-center px-6 py-12">
        <div className="ios-wallpaper" aria-hidden />
        <NicknameGate />
      </main>
    );
  }

  const play = (
    <div className="space-y-7">
      <WalletHeader profile={profile} />
      <GameList balance={profile.balance} initialCode={linkCode ?? ''} />
    </div>
  );
  const ranking = social && (
    <section>
      <SectionHeader>Você e seus amigos</SectionHeader>
      <RankingPanel social={social} />
    </section>
  );
  const friends = social && <FriendsPanel social={social} />;
  const settings = (
    <div className="space-y-7">
      <AppearancePicker />
      <ViewModePicker />
      <section>
        <SectionHeader>Sua conta</SectionHeader>
        <RecoveryPanel />
      </section>
    </div>
  );

  return (
    <main className="ios-hub relative min-h-full">
      <div className="ios-wallpaper" aria-hidden />

      {/* Celular: uma aba por vez, com título grande. */}
      <div className="relative z-10 mx-auto w-full max-w-md px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-32 lg:hidden">
        {tab === 'play' ? (
          // A aba inicial abre com a marca no lugar do título grande.
          <header className="relative mb-6 flex justify-center pt-4">
            <img src="/brand/logo.png" alt="Dane-se" width={180} height={174} className="brand-logo h-auto w-32" />
            <span className="absolute top-4 right-0">
              <CircleButton label="Regras" onClick={onHelp}>
                {Symbols.question}
              </CircleButton>
            </span>
          </header>
        ) : (
          <header className="mb-5 flex items-end justify-between gap-3 pt-6">
            <h1 className="text-[34px] leading-none font-bold tracking-tight">{current.title}</h1>
            <CircleButton label="Regras" onClick={onHelp}>
              {Symbols.question}
            </CircleButton>
          </header>
        )}
        {/*
          Tabs switch instantly, like iOS. No opacity fade here on purpose: in
          Safari, glass (backdrop-filter) inside a parent animating opacity can
          stay unpainted, which left the tab blank after changing the appearance.
        */}
        <div key={tab}>
          {tab === 'play' && play}
          {tab === 'friends' && friends}
          {tab === 'ranking' && ranking}
          {tab === 'settings' && settings}
        </div>
      </div>
      <TabBar tabs={TABS} value={tab} onChange={setTab} />

      {/* Computador: tudo à vista, como um app de iPad em paisagem. */}
      <div className="relative z-10 mx-auto hidden max-w-6xl grid-cols-[18rem_minmax(0,1fr)_20rem] items-start gap-8 px-8 py-10 lg:grid">
        <aside className="space-y-7">{ranking}</aside>
        <div>
          <header className="relative mb-6 flex justify-center">
            <img src="/brand/logo.png" alt="Dane-se" width={180} height={174} className="brand-logo h-auto w-36" />
            <span className="absolute top-0 right-0">
              <CircleButton label="Regras" onClick={onHelp}>
                {Symbols.question}
              </CircleButton>
            </span>
          </header>
          {play}
        </div>
        <aside className="space-y-7">
          {friends}
          {settings}
        </aside>
      </div>
    </main>
  );
}
