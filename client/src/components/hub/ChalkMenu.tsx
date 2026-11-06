import { AnimatePresence, motion } from 'framer-motion';
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import { GAME_CATALOG, ROOM_CODE_LENGTH, formatMoney, groupThousands, type GameCatalogEntry, type GameType } from '@dane-se/shared';
import { csMode } from '../../lib/csMode';
import { actions } from '../../lib/store';

/** Tudo que está escrito no quadro: os jogos do hub e o modo CS. */
export type MenuId = GameType | 'cs';

interface MenuDish {
  id: MenuId;
  name: string;
  /** O que é, em poucas palavras, como num cardápio. */
  blurb: string;
  /** Preço no quadro: a entrada mínima, ou "grátis". */
  price: string;
  /** Rabisco ao lado do nome. */
  scribble?: string;
}

const BLURBS: Record<GameType, string> = {
  danese: 'Palpite quantas vazas faz e não complete a palavra. 2 a 6 na mesa.',
  truco: 'Vira, manilha e grito de truco. 1 contra 1 ou dupla contra dupla.',
  poker: "Texas Hold'em com fichas: senta, joga mão atrás de mão e sai quando quiser. 2 a 8.",
};

/** Ordem do quadro: os clássicos da cantina primeiro. */
const ORDER: MenuId[] = ['danese', 'truco', 'poker', 'cs'];

function dishes(): MenuDish[] {
  const all: MenuDish[] = [
    ...GAME_CATALOG.filter((g) => g.available).map((g) => ({
      id: g.id,
      name: g.id === 'truco' ? 'Truco' : g.id === 'poker' ? 'Poker' : g.name,
      blurb: BLURBS[g.id],
      price: formatMoney(g.minEntry),
      scribble: g.id === 'truco' ? 'novo!' : undefined,
    })),
    { id: 'cs', name: 'Modo CS', blurb: 'Tiro em primeira pessoa, 3 contra 3, contra amigos ou bots.', price: 'grátis' },
  ];
  return ORDER.flatMap((id) => all.filter((d) => d.id === id));
}

/**
 * Um círculo de giz feito à mão em volta do que foi escolhido. É a única animação
 * do quadro, e responde a um toque. (Movimento reduzido: aparece já desenhado.)
 */
function ChalkCircle({ tone = 'giz' }: { tone?: 'giz' | 'amarelo' }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 60"
      preserveAspectRatio="none"
      className="pointer-events-none absolute -inset-x-2 -inset-y-1.5 h-[calc(100%+0.75rem)] w-[calc(100%+1rem)] overflow-visible"
    >
      <motion.path
        d="M14 34 C 10 12, 70 4, 118 6 C 170 8, 196 20, 192 36 C 188 52, 130 58, 80 56 C 34 54, 6 46, 12 28 C 16 18, 40 10, 64 9"
        fill="none"
        stroke={tone === 'amarelo' ? 'var(--color-giz-amarelo)' : 'var(--color-giz)'}
        strokeWidth="2.6"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0, opacity: 0.2 }}
        animate={{ pathLength: 1, opacity: 0.9 }}
        transition={{ duration: 0.45, ease: [0.3, 0.1, 0.3, 1] }}
      />
    </svg>
  );
}

function MenuRow({ dish, selected, onSelect }: { dish: MenuDish; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-expanded={selected}
      className="group block w-full rounded-lg px-1 py-2 text-left focus-visible:outline-offset-4"
    >
      <span className="flex items-end">
        <span className="relative">
          {selected && <ChalkCircle />}
          <span className="chalk text-[2.1rem] leading-none text-giz transition-colors group-hover:text-white">{dish.name}</span>
        </span>
        {dish.scribble && (
          <span className="chalk mb-3 ml-4 -rotate-6 text-lg leading-none text-giz-vermelho">{dish.scribble}</span>
        )}
        <span aria-hidden className="menu-leader" />
        <span className="chalk text-2xl leading-none whitespace-nowrap text-giz-amarelo tabular-nums">{dish.price}</span>
      </span>
      <span className="mt-1 block max-w-[34ch] font-barlow text-[15px] leading-snug text-giz/65">{dish.blurb}</span>
    </button>
  );
}

/** O pedido: escolher a entrada (circulando o preço) e abrir a mesa. */
function GameOrder({
  game,
  balance,
  entry,
  setEntry,
  arcade,
  setArcade,
}: {
  game: GameCatalogEntry;
  balance: number;
  entry: number;
  setEntry: (v: number) => void;
  arcade: boolean;
  setArcade: (v: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const poker = game.id === 'poker';
  const broke = balance < entry;
  const short = game.id === 'truco' ? 'Truco' : game.id === 'poker' ? 'poker' : game.name;

  async function open() {
    setBusy(true);
    await actions.createRoom({ gameType: game.id, settings: { entry }, arcade: game.id === 'danese' && arcade });
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-1 font-barlow text-[15px] text-giz/70">
          {poker ? 'Quanto cada um leva pra mesa, em R$' : 'Quanto cada um põe no pote, em R$'}
        </legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {game.entryOptions.map((v) => {
            const on = entry === v;
            return (
              <button
                key={v}
                type="button"
                aria-pressed={on}
                onClick={() => setEntry(v)}
                className={`chalk relative min-h-11 px-1 text-2xl tabular-nums transition-colors ${
                  on ? 'text-giz-amarelo' : 'text-giz/55 hover:text-giz'
                }`}
              >
                {on && <ChalkCircle tone="amarelo" />}
                <span className="sr-only">R$ </span>
                {groupThousands(v)}
              </button>
            );
          })}
        </div>
      </fieldset>

      {game.id === 'danese' && (
        <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={arcade}
            onChange={(e) => setArcade(e.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="chalk mt-0.5 grid size-7 shrink-0 place-items-center rounded-sm border-2 border-giz/70 text-2xl leading-none text-giz-amarelo peer-focus-visible:outline-2 peer-focus-visible:outline-giz-amarelo"
          >
            {arcade ? '✓' : ''}
          </span>
          <span className="font-barlow text-[15px] leading-snug text-giz/80">
            <span className="font-semibold text-giz">Modo arcade.</span> Cada personagem ganha um poder e um talento
            pra usar na partida.
          </span>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          disabled={busy || broke}
          onClick={() => void open()}
          className="min-h-12 rounded-md bg-giz px-6 font-cond text-xl font-bold text-lousa-funda shadow-[0_3px_0_rgb(0_0_0/0.45)] transition active:translate-y-[2px] active:shadow-none disabled:bg-giz/30 disabled:text-lousa-funda/70 disabled:shadow-none"
        >
          {busy ? 'Abrindo a mesa…' : `Abrir mesa de ${short}`}
        </button>
        <span className="font-barlow text-sm text-giz/60">
          {broke ? `Você tem ${formatMoney(balance)}. Escolha uma entrada menor.` : 'Você recebe um código pra chamar a galera.'}
        </span>
      </div>
    </div>
  );
}

function CsOrder() {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await actions.csCreate();
          setBusy(false);
        }}
        className="min-h-12 rounded-md bg-giz px-6 font-cond text-xl font-bold text-lousa-funda shadow-[0_3px_0_rgb(0_0_0/0.45)] transition active:translate-y-[2px] active:shadow-none disabled:opacity-60"
      >
        {busy ? 'Criando…' : 'Criar sala com amigos'}
      </button>
      <button
        type="button"
        onClick={csMode.open}
        className="min-h-12 rounded-md px-4 font-cond text-xl font-bold text-giz underline decoration-giz/40 decoration-2 underline-offset-4 hover:decoration-giz"
      >
        Treinar contra bots
      </button>
    </div>
  );
}

/** Entrar na mesa de alguém: o código vai escrito numa linha de giz. */
function JoinLine({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const ready = code.trim().length === ROOM_CODE_LENGTH;

  async function join(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    await actions.joinRoom(code);
    setBusy(false);
  }

  return (
    <form onSubmit={join} className="flex flex-wrap items-end gap-x-3 gap-y-2">
      <label htmlFor={inputId} className="chalk pb-1 text-2xl leading-none">
        Tem código?
      </label>
      <input
        id={inputId}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^a-z]/gi, '').toUpperCase())}
        maxLength={ROOM_CODE_LENGTH}
        autoCapitalize="characters"
        autoComplete="off"
        placeholder="ABCD"
        className="chalk min-h-11 w-32 border-b-2 border-dashed border-giz/50 bg-transparent px-1 text-center text-3xl tracking-[0.3em] text-giz-amarelo uppercase placeholder:text-giz/20 focus:border-giz-amarelo focus:outline-none"
      />
      <button
        type="submit"
        disabled={!ready || busy}
        className="min-h-11 rounded-md border-2 border-giz/70 px-4 font-cond text-lg font-bold text-giz transition hover:bg-giz hover:text-lousa-funda disabled:border-giz/20 disabled:text-giz/30 disabled:hover:bg-transparent"
      >
        {busy ? 'Entrando…' : 'Entrar na mesa'}
      </button>
    </form>
  );
}

/** O quadro de giz da cantina: o cardápio de jogos, o pedido e o código. */
export function ChalkMenu({
  balance,
  initialCode,
  onRules,
  header,
}: {
  balance: number;
  initialCode: string;
  onRules: () => void;
  /** Título do quadro (o letreiro). */
  header?: ReactNode;
}) {
  const [selected, setSelected] = useState<MenuId | null>(null);
  const [entry, setEntry] = useState(0);
  const [arcade, setArcade] = useState(false);
  const list = dishes();

  function pick(id: MenuId) {
    if (selected === id) return setSelected(null);
    setSelected(id);
    const game = GAME_CATALOG.find((g) => g.id === id);
    if (game) setEntry(game.defaultEntry);
  }

  return (
    <section className="chalkboard px-5 pt-5 pb-6 sm:px-7" aria-label="Jogos da cantina">
      <header className="mb-3 flex items-start justify-between gap-3">
        {header}
        <button
          type="button"
          onClick={onRules}
          className="chalk mt-1 shrink-0 text-xl text-giz/70 underline decoration-giz/30 decoration-2 underline-offset-4 hover:text-giz"
        >
          regras
        </button>
      </header>

      <ul className="divide-y divide-dashed divide-giz/15">
        {list.map((dish) => {
          const game = GAME_CATALOG.find((g) => g.id === dish.id);
          const open = selected === dish.id;
          return (
            <li key={dish.id} className="py-1.5">
              <MenuRow dish={dish} selected={open} onSelect={() => pick(dish.id)} />
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="px-1 pt-3 pb-3">
                      {game ? (
                        <GameOrder
                          game={game}
                          balance={balance}
                          entry={entry}
                          setEntry={setEntry}
                          arcade={arcade}
                          setArcade={setArcade}
                        />
                      ) : (
                        <CsOrder />
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 border-t-2 border-giz/20 pt-4">
        <JoinLine initialCode={initialCode} />
      </div>
    </section>
  );
}
