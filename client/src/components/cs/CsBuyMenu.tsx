import { BUYABLE, WEAPONS, canBuy, type Match, type WeaponCategory, type WeaponId } from '@dane-se/shared';
import { Button } from '../ui/Button';

const CATEGORIES: { id: WeaponCategory; title: string }[] = [
  { id: 'pistol', title: 'Pistolas' },
  { id: 'smg', title: 'Submetralhadoras' },
  { id: 'rifle', title: 'Fuzis' },
  { id: 'sniper', title: 'Snipers' },
];

/** Mercado da fase de compra. Abre sozinho a cada rodada e fecha quando ela começa. */
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
  const weapons: WeaponId[] = ['chinelo', ...BUYABLE];

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4 font-mono text-stone-200">
      <div className="w-full max-w-2xl space-y-4 rounded-xl border border-white/10 bg-stone-950/95 p-5">
        <header className="flex items-baseline justify-between">
          <h2 className="text-sm tracking-[0.2em] uppercase">Mercado</h2>
          <p className="text-sm">
            <span className="text-stone-500">Dinheiro </span>
            <span className="text-gold-400">$ {me.money}</span>
            <span className="ml-4 text-stone-500">{seconds}s</span>
          </p>
        </header>
        {CATEGORIES.map((cat) => (
          <section key={cat.id} className="space-y-1.5">
            <h3 className="text-[11px] tracking-[0.18em] text-stone-500 uppercase">{cat.title}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {weapons
                .filter((id) => WEAPONS[id].category === cat.id)
                .map((id) => {
                  const w = WEAPONS[id];
                  const owned = me.weapon === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={owned || !canBuy(match.world, meId, id)}
                      onClick={() => onBuy(id)}
                      className={`rounded-lg border px-3 py-2 text-left text-sm transition disabled:opacity-40 ${
                        owned ? 'border-gold-500/60 bg-gold-500/10' : 'border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <span className="block">{w.name}</span>
                      <span className="text-xs text-stone-500">
                        {owned ? 'Equipada' : w.price === 0 ? 'Grátis' : `$ ${w.price}`} · dano {w.damage}
                      </span>
                    </button>
                  );
                })}
            </div>
          </section>
        ))}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Pronto (B)
          </Button>
        </div>
      </div>
    </div>
  );
}
