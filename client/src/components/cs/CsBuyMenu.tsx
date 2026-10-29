import { WEAPONS, canBuy, slotOf, type Match, type WeaponId } from '@dane-se/shared';
import { Button } from '../ui/Button';

/** Ordem do mercado: o dígito de cada linha compra a arma dela. */
export const BUY_LIST: readonly WeaponId[] = ['chinelo', 'tamanco', 'garcom', 'tabelinha', 'cartao_vermelho', 'escanteio'];

const CATEGORY: Record<string, string> = { pistol: 'Pistola', smg: 'Submetralhadora', rifle: 'Fuzil', sniper: 'Sniper' };

/** Mercado da fase de compra: painel lateral, para o campo continuar visível. Dígitos 1 a 6 compram. */
export function CsBuyMenu({
  match,
  meId,
  onBuy,
  onClose,
}: {
  match: Match;
  meId: string;
  onBuy: (weapon: WeaponId) => void;
  onClose: () => void;
}) {
  const me = match.world.players.find((p) => p.id === meId)!;
  const seconds = Math.max(0, Math.ceil(match.world.phaseLeftMs / 1000));
  const held = [me.weapon, me.holstered?.weapon].filter((w): w is WeaponId => !!w);
  const primary = held.find((w) => slotOf(w) === 1);
  const secondary = held.find((w) => slotOf(w) === 2);

  return (
    <aside className="absolute top-1/2 left-4 z-20 w-[22rem] max-w-[calc(100vw-2rem)] -translate-y-1/2 space-y-3 rounded-xl border border-white/10 bg-stone-950/85 p-4 font-mono text-stone-200 backdrop-blur-sm">
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm tracking-[0.2em] uppercase">Mercado</h2>
        <p className="text-sm">
          <span className="text-gold-400">$ {me.money}</span>
          <span className="ml-3 text-stone-500">{seconds}s</span>
        </p>
      </header>

      <ul className="space-y-1.5">
        {BUY_LIST.map((id, index) => {
          const w = WEAPONS[id];
          const owned = held.includes(id);
          const affordable = me.money >= w.price;
          const enabled = !owned && canBuy(match.world, meId, id);
          const rate = Math.round(60_000 / w.fireIntervalMs);
          return (
            <li key={id}>
              <button
                type="button"
                disabled={!enabled}
                onClick={() => onBuy(id)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed ${
                  owned
                    ? 'border-gold-500/50 bg-gold-500/10'
                    : enabled
                      ? 'border-white/10 hover:bg-white/10'
                      : 'border-white/5 opacity-45'
                }`}
              >
                <span className="grid size-6 shrink-0 place-items-center rounded border border-white/20 text-xs text-stone-400">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{w.name}</span>
                  <span className="block text-[11px] text-stone-500">
                    {CATEGORY[w.category]} · dano {w.damage} · {rate} tiros/min · {w.magSize} no pente
                  </span>
                </span>
                <span className={`shrink-0 text-xs ${owned ? 'text-gold-400' : affordable ? 'text-stone-200' : 'text-red-400'}`}>
                  {owned ? 'Equipada' : w.price === 0 ? 'Grátis' : `$ ${w.price}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] text-stone-500">
        Principal: <span className="text-stone-300">{primary ? WEAPONS[primary].name : 'nenhuma'}</span> · Secundária:{' '}
        <span className="text-stone-300">{secondary ? WEAPONS[secondary].name : 'nenhuma'}</span>
      </p>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-stone-500">1-6 compra · B ou Esc fecha</span>
        <Button variant="secondary" onClick={onClose}>
          Pronto
        </Button>
      </div>
    </aside>
  );
}
