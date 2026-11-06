import { useState } from 'react';
import { MAX_NAME_LENGTH, REFILL_AMOUNT, REFILL_COOLDOWN_MS, formatMoney, type ProfileView } from '@dane-se/shared';
import { avatarColor, initial } from '../../lib/avatar';
import { actions } from '../../lib/store';

/** Wallet card at the top of the hub: who you are, your balance, and refills. */
export function WalletHeader({ profile }: { profile: ProfileView }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.nickname);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const nickname = name.trim();
    if (!nickname || nickname === profile.nickname) {
      setEditing(false);
      setName(profile.nickname);
      return;
    }
    setBusy(true);
    const ok = await actions.rename(nickname);
    setBusy(false);
    if (ok) setEditing(false);
  }

  const nextRefill = Math.max(0, profile.refillAt + REFILL_COOLDOWN_MS - Date.now());
  const minutes = Math.ceil(nextRefill / 60_000);

  return (
    <section className="glass px-5 py-4" aria-label="Sua carteira">
      <div className="flex items-center gap-3.5">
        <span
          aria-hidden
          className="grid size-12 shrink-0 place-items-center rounded-full text-xl font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]"
          style={{ background: avatarColor(profile.id) }}
        >
          {initial(profile.nickname)}
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <form onSubmit={save} className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={MAX_NAME_LENGTH}
                autoFocus
                aria-label="Seu apelido"
                className="min-h-10 min-w-0 flex-1 rounded-xl bg-white/10 px-3 text-[17px] text-white focus:outline-none"
              />
              <button type="submit" disabled={busy} className="min-h-10 px-1 text-[17px] font-semibold text-ios-blue disabled:opacity-50">
                OK
              </button>
            </form>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="block max-w-full text-left" title="Trocar o apelido">
              <span className="block truncate text-[17px] font-semibold">{profile.nickname}</span>
              <span className="block text-[13px] text-ios-blue">Editar apelido</span>
            </button>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[13px] text-ios-label-2">Saldo</p>
          <p className="text-[28px] leading-tight font-bold tracking-tight tabular-nums">{formatMoney(profile.balance)}</p>
        </div>
      </div>

      {profile.refillEligible ? (
        <button
          type="button"
          onClick={() => actions.refill()}
          className="glass-control mt-3 min-h-11 w-full rounded-full text-[15px] font-semibold text-ios-blue"
        >
          Recarregar até {formatMoney(REFILL_AMOUNT)}
        </button>
      ) : profile.balance < 100 ? (
        <p className="mt-2 text-[13px] text-ios-label-2">Você pode recarregar daqui a {minutes} min.</p>
      ) : null}
    </section>
  );
}
