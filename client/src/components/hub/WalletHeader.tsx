import { useState } from 'react';
import { MAX_NAME_LENGTH, REFILL_COOLDOWN_MS, formatMoney, type ProfileView } from '@dane-se/shared';
import { avatarColor, initial } from '../../lib/avatar';
import { actions } from '../../lib/store';
import { Button } from '../ui/Button';

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
    <section className="hub-panel relative overflow-hidden p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 left-1/2 h-40 w-64 -translate-x-1/2 rounded-full bg-gold-400/10 blur-3xl"
      />

      <div className="relative flex items-center gap-3">
        <span
          className="grid size-12 shrink-0 place-items-center rounded-2xl text-xl font-bold text-white ring-2 ring-gold-400/35"
          style={{ background: avatarColor(profile.id) }}
          aria-hidden
        >
          {initial(profile.nickname)}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-stone-400 uppercase">Carteira</p>
          {editing ? (
            <form onSubmit={save} className="mt-1 flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={MAX_NAME_LENGTH}
                autoFocus
                aria-label="Seu apelido"
                className="min-h-10 min-w-0 flex-1 rounded-xl bg-black/40 px-3 text-white ring-1 ring-white/15 focus:ring-gold-400 focus:outline-none"
              />
              <Button type="submit" disabled={busy} className="px-3 py-1.5">
                OK
              </Button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex min-h-9 max-w-full items-center gap-1.5 text-left text-lg font-semibold text-white hover:text-gold-300"
              title="Trocar o apelido"
            >
              <span className="truncate">{profile.nickname}</span>
              <span className="shrink-0 text-sm text-stone-400" aria-hidden>
                ✏️
              </span>
            </button>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-stone-400 uppercase">Saldo</p>
          <div className="font-display text-3xl leading-tight tabular-nums gold-text">{formatMoney(profile.balance)}</div>
        </div>
      </div>

      {profile.refillEligible ? (
        <button
          type="button"
          onClick={() => actions.refill()}
          className="relative mt-3 w-full rounded-xl border border-dashed border-gold-500/40 bg-gold-500/5 py-2.5 text-sm font-semibold text-gold-200 transition hover:bg-gold-500/15"
        >
          🪙 Recarregar fichas
        </button>
      ) : profile.balance < 100 ? (
        <p className="relative mt-3 text-center text-xs text-stone-400">Nova recarga em {minutes} min</p>
      ) : null}
    </section>
  );
}
