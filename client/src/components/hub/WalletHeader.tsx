import { useState } from 'react';
import { MAX_NAME_LENGTH, REFILL_COOLDOWN_MS, formatMoney, type ProfileView } from '@dane-se/shared';
import { avatarColor, initial } from '../../lib/avatar';
import { actions } from '../../lib/store';
import { Button } from '../ui/Button';

/** Wallet strip at the top of the hub: who you are, your balance, and refills. */
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
    <section className="flex flex-wrap items-center gap-3 rounded-2xl bg-felt-900/90 p-3 ring-1 ring-gold-500/30">
      <span
        className="grid size-11 shrink-0 place-items-center rounded-full text-lg font-bold text-white ring-2 ring-white/25"
        style={{ background: avatarColor(profile.id) }}
        aria-hidden
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
              className="min-h-11 min-w-0 flex-1 rounded-lg bg-black/40 px-3 text-white ring-1 ring-white/15 focus:ring-gold-400 focus:outline-none"
            />
            <Button type="submit" disabled={busy} className="px-3">
              OK
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-11 truncate text-left text-lg font-semibold text-white hover:text-gold-300"
            title="Trocar o apelido"
          >
            {profile.nickname} <span className="text-sm text-stone-400">✏️</span>
          </button>
        )}
        <p className="text-sm text-stone-400">Seu saldo</p>
      </div>

      <div className="text-right">
        <div className="font-display text-2xl gold-text">{formatMoney(profile.balance)}</div>
        {profile.refillEligible ? (
          <Button variant="secondary" className="mt-1 px-3 py-1.5 text-sm" onClick={() => actions.refill()}>
            💰 Recarregar
          </Button>
        ) : profile.balance < 100 ? (
          <p className="text-xs text-stone-400">
            Recarga em {minutes} min
          </p>
        ) : null}
      </div>
    </section>
  );
}
