import { randomUUID } from 'node:crypto';
import {
  type ErrorCode,
  type ProfileView,
  REFILL_AMOUNT,
  REFILL_COOLDOWN_MS,
  REFILL_THRESHOLD,
  STARTING_BALANCE,
  isValidMoney,
} from '@dane-se/shared';
import type { LedgerType, ProfileRow, WalletStore } from './store.js';

/**
 * The single place money moves. Every debit/credit is validated and recorded in
 * an append-only ledger; settlements are idempotent (a room's payout can never
 * be applied twice) and always balance.
 */
export class WalletService {
  constructor(
    private readonly store: WalletStore,
    private readonly now: () => number = Date.now,
  ) {}

  async ready(): Promise<void> {
    await this.store.ready();
  }

  createProfile(nickname: string): ProfileRow {
    const profile: ProfileRow = {
      id: randomUUID().slice(0, 12),
      token: randomUUID(),
      nickname,
      createdAt: this.now(),
    };
    this.store.saveProfile(profile);
    this.store.setBalance(profile.id, STARTING_BALANCE);
    this.store.setRefillAt(profile.id, 0);
    this.store.appendLedger({
      profileId: profile.id,
      type: 'initial',
      amount: STARTING_BALANCE,
      roomCode: null,
      at: this.now(),
    });
    return profile;
  }

  profileById(id: string): ProfileRow | undefined {
    return this.store.getProfile(id);
  }

  profileByToken(token: string): ProfileRow | undefined {
    return this.store.findProfileByToken(token);
  }

  rename(profileId: string, nickname: string): void {
    const profile = this.store.getProfile(profileId);
    if (profile) this.store.saveProfile({ ...profile, nickname });
  }

  balance(profileId: string): number {
    return this.store.getBalance(profileId) ?? 0;
  }

  profileView(profile: ProfileRow): ProfileView {
    const balance = this.balance(profile.id);
    const refillAt = this.store.getRefillAt(profile.id);
    return {
      id: profile.id,
      nickname: profile.nickname,
      balance,
      refillEligible: balance < REFILL_THRESHOLD && this.refillReady(profile.id, refillAt),
      refillAt,
    };
  }

  /** Returns null on success, or the error code that prevented the debit. */
  debit(profileId: string, amount: number, type: LedgerType, roomCode: string | null): ErrorCode | null {
    if (!isValidMoney(amount) || amount < 0) return 'INVALID_PAYLOAD';
    const balance = this.store.getBalance(profileId);
    if (balance === undefined) return 'WALLET_NOT_FOUND';
    if (amount > balance) return 'INSUFFICIENT_BALANCE';
    this.store.setBalance(profileId, balance - amount);
    this.store.appendLedger({ profileId, type, amount, roomCode, at: this.now() });
    return null;
  }

  credit(profileId: string, amount: number, type: LedgerType, roomCode: string | null): void {
    if (!isValidMoney(amount) || amount < 0) throw new Error(`invalid credit ${amount}`);
    const balance = this.store.getBalance(profileId);
    if (balance === undefined) throw new Error(`wallet not found: ${profileId}`);
    this.store.setBalance(profileId, balance + amount);
    this.store.appendLedger({ profileId, type, amount, roomCode, at: this.now() });
  }

  refill(profile: ProfileRow): ProfileView | ErrorCode {
    const balance = this.balance(profile.id);
    if (balance >= REFILL_THRESHOLD) return 'REFILL_NOT_ELIGIBLE';
    if (!this.refillReady(profile.id, this.store.getRefillAt(profile.id))) return 'REFILL_NOT_ELIGIBLE';
    const gained = REFILL_AMOUNT - balance;
    this.store.setBalance(profile.id, REFILL_AMOUNT);
    this.store.setRefillAt(profile.id, this.now());
    this.store.appendLedger({ profileId: profile.id, type: 'refill', amount: gained, roomCode: null, at: this.now() });
    return this.profileView(profile);
  }

  /** `refillAt === 0` means "never refilled": always allowed the first time. */
  private refillReady(profileId: string, refillAt: number): boolean {
    return refillAt === 0 || this.now() - refillAt >= REFILL_COOLDOWN_MS;
  }

  /**
   * Pays out a finished game exactly once. `key` must identify the game (room +
   * round), `credits` are already mapped to profile ids. Returns whether the
   * money actually moved (false if this settlement was already applied).
   */
  settle(key: string, credits: readonly { profileId: string; amount: number; place: number }[]): { applied: boolean } {
    if (this.store.getSettlement(key)) return { applied: false };
    for (const credit of credits) {
      if (credit.amount > 0) this.credit(credit.profileId, credit.amount, 'payout', key);
    }
    this.store.saveSettlement({ key, credits: credits.map((c) => ({ ...c })), at: this.now() });
    return { applied: true };
  }

  async flush(): Promise<void> {
    await this.store.flush();
  }

  async close(): Promise<void> {
    await this.store.close();
  }
}
