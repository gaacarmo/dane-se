import { describe, expect, it } from 'vitest';
import { REFILL_AMOUNT, REFILL_COOLDOWN_MS, STARTING_BALANCE } from '@dane-se/shared';
import { MemoryWalletStore } from '../src/hub/memoryStore.js';
import { WalletService } from '../src/hub/walletService.js';

function make(start = 1_000_000) {
  let now = start;
  const store = new MemoryWalletStore();
  const wallets = new WalletService(store, () => now);
  return {
    store,
    wallets,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('WalletService', () => {
  it('starts a new profile with the starting balance and an initial ledger entry', () => {
    const { store, wallets } = make();
    const profile = wallets.createProfile('Ana');
    expect(wallets.balance(profile.id)).toBe(STARTING_BALANCE);
    expect(store.ledger(profile.id)).toMatchObject([{ type: 'initial', amount: STARTING_BALANCE }]);
  });

  it('debits and credits, and refuses to go negative', () => {
    const { wallets } = make();
    const profile = wallets.createProfile('Ana');
    expect(wallets.debit(profile.id, 100, 'buyIn', 'ABCD')).toBeNull();
    expect(wallets.balance(profile.id)).toBe(STARTING_BALANCE - 100);
    expect(wallets.debit(profile.id, STARTING_BALANCE, 'buyIn', 'ABCD')).toBe('INSUFFICIENT_BALANCE');
    wallets.credit(profile.id, 40, 'payout', 'ABCD');
    expect(wallets.balance(profile.id)).toBe(STARTING_BALANCE - 60);
  });

  it('reports a missing wallet', () => {
    const { wallets } = make();
    expect(wallets.debit('nope', 10, 'buyIn', null)).toBe('WALLET_NOT_FOUND');
  });

  it('refills only below the threshold, once per cooldown', () => {
    const { wallets, advance } = make();
    const profile = wallets.createProfile('Ana');
    const drainTo = (target: number) => wallets.debit(profile.id, wallets.balance(profile.id) - target, 'buyIn', 'X');

    // Above the threshold: not eligible.
    expect(wallets.refill(profile)).toBe('REFILL_NOT_ELIGIBLE');

    drainTo(50);
    const refilled = wallets.refill(profile);
    expect(refilled).toMatchObject({ balance: REFILL_AMOUNT });

    // Cooldown: not eligible again.
    drainTo(10);
    expect(wallets.refill(profile)).toBe('REFILL_NOT_ELIGIBLE');

    advance(REFILL_COOLDOWN_MS);
    expect(wallets.refill(profile)).toMatchObject({ balance: REFILL_AMOUNT });
  });

  it('applies a settlement exactly once', () => {
    const { wallets } = make();
    const a = wallets.createProfile('A');
    const b = wallets.createProfile('B');
    const credits = [
      { profileId: a.id, amount: 200, place: 1 },
      { profileId: b.id, amount: 0, place: 2 },
    ];
    expect(wallets.settle('room-1', credits)).toEqual({ applied: true });
    expect(wallets.balance(a.id)).toBe(STARTING_BALANCE + 200);
    expect(wallets.settle('room-1', credits)).toEqual({ applied: false });
    expect(wallets.balance(a.id)).toBe(STARTING_BALANCE + 200);
  });
});
