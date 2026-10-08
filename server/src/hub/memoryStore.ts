import type { LedgerEntry, ProfileRow, SettlementRecord, WalletStore } from './store.js';

/** In-memory `WalletStore` for tests and simulations: nothing touches disk. */
export class MemoryWalletStore implements WalletStore {
  private profiles: ProfileRow[] = [];
  private wallets = new Map<string, number>();
  private refillAt = new Map<string, number>();
  private entries: LedgerEntry[] = [];
  private settlements = new Map<string, SettlementRecord>();
  private seq = 0;

  async ready(): Promise<void> {}

  getProfile(id: string): ProfileRow | undefined {
    return this.profiles.find((p) => p.id === id);
  }

  findProfileByToken(token: string): ProfileRow | undefined {
    return this.profiles.find((p) => p.token === token);
  }

  saveProfile(row: ProfileRow): void {
    const index = this.profiles.findIndex((p) => p.id === row.id);
    if (index >= 0) this.profiles[index] = row;
    else this.profiles.push(row);
  }

  getBalance(profileId: string): number | undefined {
    return this.wallets.get(profileId);
  }

  setBalance(profileId: string, balance: number): void {
    this.wallets.set(profileId, balance);
  }

  getRefillAt(profileId: string): number {
    return this.refillAt.get(profileId) ?? 0;
  }

  setRefillAt(profileId: string, at: number): void {
    this.refillAt.set(profileId, at);
  }

  appendLedger(entry: Omit<LedgerEntry, 'seq'>): void {
    this.entries.push({ ...entry, seq: ++this.seq });
  }

  ledger(profileId: string): readonly LedgerEntry[] {
    return this.entries.filter((e) => e.profileId === profileId);
  }

  getSettlement(key: string): SettlementRecord | undefined {
    return this.settlements.get(key);
  }

  saveSettlement(record: SettlementRecord): void {
    this.settlements.set(record.key, record);
  }

  async flush(): Promise<void> {}
  async close(): Promise<void> {}
}
