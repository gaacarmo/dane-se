import { Fragment, type FormEvent, useRef, useState } from 'react';
import { GAME_CATALOG, ROOM_CODE_LENGTH, formatMoney, type GameCatalogEntry } from '@dane-se/shared';
import { csMode } from '../../lib/csMode';
import { actions } from '../../lib/store';
import { AppIcon, CircleButton, GlassButton, type HubGameId, PrimaryButton, SectionHeader, Segmented, Sheet, Switch, Symbols } from './IosKit';

interface Row {
  id: HubGameId;
  name: string;
  /** Nome curto pra lista. */
  short: string;
  subtitle: string;
  description: string;
  players: string;
}

const ROWS: Row[] = [
  {
    id: 'danese',
    name: 'Dane-se',
    short: 'Dane-se',
    subtitle: 'Palpite e vazas',
    description: 'Diga quantas vazas vai fazer e cumpra. Quem erra ganha uma letra; quem completar a palavra sai.',
    players: '2–6',
  },
  {
    id: 'truco',
    name: 'Truco Paulista',
    short: 'Truco',
    subtitle: 'Duplas, vira e manilha',
    description: 'Peça truco, blefe e leve sua dupla até 12 pontos. Dá pra jogar 1 contra 1 ou 2 contra 2.',
    players: '2 ou 4',
  },
  {
    id: 'poker',
    name: "Poker Texas Hold'em",
    short: 'Poker',
    subtitle: 'Cash game com fichas',
    description: 'Sente com uma banca, jogue mão atrás de mão e saia com o que tiver. Dá pra recomprar entre as mãos.',
    players: '2–8',
  },
  {
    id: 'duvido',
    name: 'Duvido',
    short: 'Duvido',
    subtitle: 'Blefe e bala apimentada',
    description:
      'Jogue cartas viradas dizendo que são do valor da mesa. Duvidou e acertou? O mentiroso tira uma bala do pote. Uma é apimentada: quem pega, sai.',
    players: '2–6',
  },
  {
    id: 'cs',
    name: 'Modo CS',
    short: 'Modo CS',
    subtitle: 'Tiro 3 contra 3',
    description: 'Primeira pessoa, plante e desarme a bomba. Jogue com amigos ou treine contra bots. Não vale dinheiro.',
    players: '1–6',
  },
];

/** Uma faixa de fatos, como na App Store: rótulo pequeno em cima, valor embaixo. */
function Facts({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-3 divide-x divide-ios-separator py-1 text-center">
      {items.map((it) => (
        <div key={it.label} className="min-w-0 px-2">
          <dt className="truncate text-[11px] font-medium text-ios-label-2">{it.label}</dt>
          <dd className="mt-0.5 truncate text-[17px] font-semibold tabular-nums">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function GameSheetBody({ row, game, balance, onClose }: { row: Row; game: GameCatalogEntry | null; balance: number; onClose: () => void }) {
  const [entry, setEntry] = useState(game?.defaultEntry ?? 0);
  const [arcade, setArcade] = useState(false);
  const [busy, setBusy] = useState(false);
  const poker = game?.id === 'poker';

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    await fn();
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-4">
        <AppIcon id={row.id} size={72} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[22px] leading-tight font-bold">{row.name}</h2>
          <p className="text-[15px] text-ios-label-2">{row.subtitle}</p>
        </div>
        <CircleButton label="Fechar" onClick={onClose}>
          {Symbols.close}
        </CircleButton>
      </header>

      <Facts
        items={[
          { label: 'Jogadores', value: row.players },
          { label: poker ? 'Banca mín.' : 'Entrada mín.', value: game ? formatMoney(game.minEntry) : 'Grátis' },
          { label: 'Bots', value: 'Sim' },
        ]}
      />

      <p className="text-[15px] leading-snug text-ios-label-2">{row.description}</p>

      {game ? (
        <>
          <div className="space-y-2">
            <p className="px-1 text-[13px] text-ios-label-2">{poker ? 'Banca de cada um' : 'Entrada de cada um'}</p>
            <Segmented
              label={poker ? 'Banca' : 'Entrada'}
              options={game.entryOptions}
              value={entry}
              onChange={setEntry}
              format={(v) => formatMoney(v).replace('R$ ', '')}
              layoutId={`entry-${game.id}`}
            />
            <p className="px-1 text-[13px] text-ios-label-2">
              Você tem <span className="font-semibold text-ios-label tabular-nums">{formatMoney(balance)}</span>
            </p>
          </div>

          {game.id === 'danese' && (
            <div className="flex items-center gap-3 rounded-2xl bg-ios-fill px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[17px]">Modo arcade</p>
                <p className="text-[13px] text-ios-label-2">Cada personagem ganha um poder e um talento.</p>
              </div>
              <Switch on={arcade} onChange={setArcade} label="Modo arcade" />
            </div>
          )}

          <PrimaryButton
            disabled={busy || balance < entry}
            onClick={() => void run(() => actions.createRoom({ gameType: game.id, settings: { entry }, arcade: game.id === 'danese' && arcade }))}
          >
            {busy ? 'Criando…' : balance < entry ? 'Saldo insuficiente' : 'Criar sala'}
          </PrimaryButton>
        </>
      ) : (
        <div className="space-y-2.5">
          <PrimaryButton disabled={busy} onClick={() => void run(() => actions.csCreate())}>
            {busy ? 'Criando…' : 'Criar sala com amigos'}
          </PrimaryButton>
          <GlassButton onClick={csMode.open}>Treinar contra bots</GlassButton>
        </div>
      )}
    </div>
  );
}

/** Campo de código da sala, no formato de um campo de busca do iOS. */
function JoinField({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const ready = code.trim().length === ROOM_CODE_LENGTH;

  async function join(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    await actions.joinRoom(code);
    setBusy(false);
  }

  return (
    <form onSubmit={join} className="glass flex items-center gap-2 p-2 pl-4">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^a-z]/gi, '').toUpperCase())}
        maxLength={ROOM_CODE_LENGTH}
        autoCapitalize="characters"
        autoComplete="off"
        placeholder="Código da sala"
        aria-label="Código da sala"
        className="min-h-11 min-w-0 flex-1 bg-transparent text-[17px] font-semibold tracking-[0.2em] uppercase placeholder:font-normal placeholder:tracking-normal placeholder:text-ios-label-3 placeholder:normal-case focus:outline-none"
      />
      <button
        type="submit"
        disabled={!ready || busy}
        className="min-h-11 rounded-full bg-ios-blue px-5 text-[15px] font-semibold text-white transition active:scale-95 disabled:bg-ios-fill-strong disabled:text-ios-label-3"
      >
        {busy ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}

/** A aba Jogar: lista agrupada de jogos (cada um abre uma folha) e o campo de código. */
export function GameList({ balance, initialCode }: { balance: number; initialCode: string }) {
  const [open, setOpen] = useState<HubGameId | null>(null);
  // Keep the last game while the sheet slides away, so it doesn't empty mid-animation.
  const last = useRef<HubGameId>('danese');
  if (open) last.current = open;
  const row = ROWS.find((r) => r.id === last.current)!;
  const game = GAME_CATALOG.find((g) => g.id === last.current) ?? null;

  return (
    <div className="space-y-7">
      <section>
        <SectionHeader>Jogos</SectionHeader>
        <ul className="glass overflow-hidden p-0!">
          {ROWS.map((r, i) => (
            <Fragment key={r.id}>
              {i > 0 && <li aria-hidden className="ml-[88px] h-px bg-ios-separator" />}
              <li>
                <button
                  type="button"
                  onClick={() => setOpen(r.id)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors active:bg-ios-fill"
                >
                  <AppIcon id={r.id} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[17px] font-semibold">{r.short}</span>
                      {r.id === 'duvido' && (
                        <span className="shrink-0 rounded-full bg-ios-blue/20 px-2 py-px text-[11px] font-bold text-ios-blue">Novo</span>
                      )}
                    </span>
                    <span className="block truncate text-[15px] text-ios-label-2">{r.subtitle}</span>
                  </span>
                  <span className="glass-control shrink-0 rounded-full px-4 py-1.5 text-[15px] font-bold text-ios-blue">Jogar</span>
                </button>
              </li>
            </Fragment>
          ))}
        </ul>
      </section>

      <section>
        <SectionHeader>Entrar na sala de um amigo</SectionHeader>
        <JoinField initialCode={initialCode} />
        <p className="mt-2 px-4 text-[13px] text-ios-label-2">Peça o código de 4 letras pra quem criou a sala.</p>
      </section>

      <Sheet open={open !== null} onClose={() => setOpen(null)} label={row.name}>
        <GameSheetBody key={row.id} row={row} game={game} balance={balance} onClose={() => setOpen(null)} />
      </Sheet>
    </div>
  );
}
