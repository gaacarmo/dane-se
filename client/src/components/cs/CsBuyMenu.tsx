import {
  DEFUSE_KIT_MS,
  EQUIPMENT,
  EQUIPMENT_IDS,
  MAX_ARMOR,
  WEAPONS,
  canBuy,
  canBuyEquipment,
  equipmentPrice,
  slotOf,
  type BuyItem,
  type EquipmentId,
  type Match,
  type Side,
  type SimPlayer,
  type WeaponId,
} from '@dane-se/shared';
import { Button } from '../ui/Button';

const WEAPON_LIST: readonly WeaponId[] = ['chinelo', 'tamanco', 'garcom', 'tabelinha', 'cartao_vermelho', 'escanteio'];

/** Ordem do mercado: o dígito de cada linha compra o item dela. O equipamento do outro lado não aparece. */
export function buyList(side: Side): readonly BuyItem[] {
  return [...WEAPON_LIST, ...EQUIPMENT_IDS.filter((id) => !EQUIPMENT[id].side || EQUIPMENT[id].side === side)];
}

const CATEGORY: Record<string, string> = { pistol: 'Pistola', smg: 'Submetralhadora', rifle: 'Fuzil', sniper: 'Sniper' };

const GEAR_NOTE: Record<EquipmentId, string> = {
  kevlar: 'Corta o dano no corpo pela metade',
  kevlar_helmet: 'Corta o dano no corpo e na cabeça',
  kit: `Desarma a bomba em ${(DEFUSE_KIT_MS / 1000).toFixed(1).replace('.', ',')} s`,
};

function worn(me: SimPlayer, id: EquipmentId): boolean {
  if (id === 'kit') return me.kit;
  return me.armor >= MAX_ARMOR && (id === 'kevlar' || me.helmet);
}

function Row({
  slot,
  title,
  note,
  price,
  ownedLabel,
  state,
  enabled,
  onClick,
}: {
  slot: number;
  title: string;
  note: string;
  price: string;
  ownedLabel: string;
  state: 'owned' | 'affordable' | 'broke';
  enabled: boolean;
  onClick: () => void;
}) {
  const owned = state === 'owned';
  return (
    <li>
      <button
        type="button"
        disabled={!enabled}
        onClick={onClick}
        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-1.5 text-left text-sm transition disabled:cursor-not-allowed ${
          owned ? 'border-gold-500/50 bg-gold-500/10' : enabled ? 'border-white/10 hover:bg-white/10' : 'border-white/5 opacity-45'
        }`}
      >
        <span className="grid size-6 shrink-0 place-items-center rounded border border-white/20 text-xs text-stone-400">{slot}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{title}</span>
          <span className="block text-[11px] text-stone-500">{note}</span>
        </span>
        <span className={`shrink-0 text-xs ${owned ? 'text-gold-400' : state === 'affordable' ? 'text-stone-200' : 'text-red-400'}`}>
          {owned ? ownedLabel : price}
        </span>
      </button>
    </li>
  );
}

/** Mercado da fase de compra: painel lateral, para o campo continuar visível. Os dígitos da lista compram. */
export function CsBuyMenu({
  match,
  meId,
  onBuy,
  onClose,
}: {
  match: Match;
  meId: string;
  onBuy: (item: BuyItem) => void;
  onClose: () => void;
}) {
  const me = match.world.players.find((p) => p.id === meId)!;
  const seconds = Math.max(0, Math.ceil(match.world.phaseLeftMs / 1000));
  const held = [me.weapon, me.holstered?.weapon].filter((w): w is WeaponId => !!w);
  const primary = held.find((w) => slotOf(w) === 1);
  const secondary = held.find((w) => slotOf(w) === 2);
  const list = buyList(me.side);

  return (
    <aside className="absolute top-1/2 left-4 z-20 max-h-[calc(100%-1.5rem)] w-[24rem] max-w-[calc(100vw-2rem)] -translate-y-1/2 space-y-2.5 overflow-y-auto rounded-xl border border-white/10 bg-stone-950/85 p-3.5 font-mono text-stone-200 backdrop-blur-sm">
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm tracking-[0.2em] uppercase">Mercado</h2>
        <p className="text-sm">
          <span className="text-gold-400">$ {me.money}</span>
          <span className="ml-3 text-stone-500">{seconds}s</span>
        </p>
      </header>

      <ul className="space-y-1">
        {list.map((id, index) => {
          if (id in EQUIPMENT) {
            const gear = id as EquipmentId;
            const price = equipmentPrice(me, gear);
            const isWorn = worn(me, gear);
            return (
              <Row
                key={id}
                slot={index + 1}
                title={EQUIPMENT[gear].name}
                note={GEAR_NOTE[gear]}
                price={`$ ${price}`}
                ownedLabel="Equipado"
                state={isWorn ? 'owned' : me.money >= price ? 'affordable' : 'broke'}
                enabled={canBuyEquipment(match.world, meId, gear)}
                onClick={() => onBuy(gear)}
              />
            );
          }
          const weapon = WEAPONS[id as WeaponId];
          const owned = held.includes(weapon.id);
          const rate = Math.round(60_000 / weapon.fireIntervalMs);
          return (
            <Row
              key={id}
              slot={index + 1}
              title={weapon.name}
              note={`${CATEGORY[weapon.category]} · dano ${weapon.damage} · ${rate} tiros/min · ${weapon.magSize} no pente`}
              price={weapon.price === 0 ? 'Grátis' : `$ ${weapon.price}`}
              ownedLabel="Equipada"
              state={owned ? 'owned' : me.money >= weapon.price ? 'affordable' : 'broke'}
              enabled={!owned && canBuy(match.world, meId, weapon.id)}
              onClick={() => onBuy(weapon.id)}
            />
          );
        })}
      </ul>

      <p className="text-[11px] text-stone-500">
        Principal: <span className="text-stone-300">{primary ? WEAPONS[primary].name : 'nenhuma'}</span> · Secundária:{' '}
        <span className="text-stone-300">{secondary ? WEAPONS[secondary].name : 'nenhuma'}</span>
      </p>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-stone-500">1-{list.length} compra · B ou Esc fecha</span>
        <Button variant="secondary" onClick={onClose}>
          Pronto
        </Button>
      </div>
    </aside>
  );
}
