import { useState } from 'react';
import { MAX_NAME_LENGTH, REFILL_AMOUNT, REFILL_COOLDOWN_MS, formatMoney, type ProfileView } from '@dane-se/shared';
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
    <section className="comanda px-4 pt-5 pb-3" aria-label="Sua comanda">
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-cond text-sm font-medium text-tinta/60">Comanda de</p>
          {editing ? (
            <form onSubmit={save} className="mt-0.5 flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={MAX_NAME_LENGTH}
                autoFocus
                aria-label="Seu apelido"
                className="min-h-10 min-w-0 flex-1 rounded-sm border-b-2 border-tinta/40 bg-transparent px-1 font-chalk text-2xl text-tinta focus:border-tinta focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy}
                className="min-h-10 rounded-sm bg-tinta px-3 font-cond text-base font-bold text-comanda disabled:opacity-60"
              >
                Salvar
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex min-h-10 max-w-full items-center gap-2 text-left"
              title="Trocar o apelido"
            >
              <span className="truncate font-chalk text-3xl leading-none text-tinta">{profile.nickname}</span>
              <span className="shrink-0 font-cond text-sm font-medium text-tinta/50 underline underline-offset-2">trocar</span>
            </button>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p className="font-cond text-sm font-medium text-tinta/60">Saldo</p>
          <p className="font-cond text-[2.1rem] leading-none font-bold text-tinta tabular-nums">{formatMoney(profile.balance)}</p>
        </div>
      </div>

      {profile.refillEligible ? (
        <button
          type="button"
          onClick={() => actions.refill()}
          className="mt-3 min-h-11 w-full rounded-sm border-2 border-dashed border-tinta/40 font-cond text-lg font-bold text-tinta transition hover:bg-tinta/5"
        >
          Recarregar o saldo até {formatMoney(REFILL_AMOUNT)}
        </button>
      ) : profile.balance < 100 ? (
        <p className="mt-2 font-cond text-sm text-tinta/60">Dá pra recarregar daqui a {minutes} min.</p>
      ) : null}
    </section>
  );
}
