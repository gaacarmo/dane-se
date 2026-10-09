import {
  EMPTY_STATS,
  type FriendshipRow,
  type LedgerEntry,
  type ProfileRow,
  type SettlementRecord,
  type StatsRow,
  type WalletStore,
} from './store.js';

export interface Snapshot {
  version: 1 | 2;
  profiles: ProfileRow[];
  wallets: Record<string, number>;
  refillAt: Record<string, number>;
  ledger: LedgerEntry[];
  settlements: SettlementRecord[];
  ledgerSeq: number;
  friendships: FriendshipRow[];
  stats: Record<string, StatsRow>;
}

const EMPTY: Snapshot = {
  version: 2,
  profiles: [],
  wallets: {},
  refillAt: {},
  ledger: [],
  settlements: [],
  ledgerSeq: 0,
  friendships: [],
  stats: {},
};

/** The ledger is for debugging, not accounting history: keep it bounded. */
const MAX_LEDGER = 5000;

/**
 * `WalletStore` that keeps everything in memory and hands a JSON snapshot to a
 * backend after a short debounce. Reads and writes stay synchronous, which is
 * what `WalletService` relies on (read balance, decide, write, nothing awaited
 * in between). Subclasses only load and save the serialized snapshot.
 */
export abstract class SnapshotWalletStore implements WalletStore {
  protected snapshot: Snapshot = structuredClone(EMPTY);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly debounceMs = 150) {}

  /** The last saved snapshot, or null when there is none yet. */
  protected abstract loadRaw(): Promise<string | null>;
  protected abstract saveRaw(data: string): Promise<void>;

  protected async load(): Promise<void> {
    let raw: string | null = null;
    try {
      raw = await this.loadRaw();
    } catch (error) {
      // A store that can't be read must not start empty and overwrite real data.
      throw new Error(`could not load the wallet store: ${String(error)}`);
    }
    if (!raw) {
      this.snapshot = structuredClone(EMPTY);
      return;
    }
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    this.snapshot = {
      ...structuredClone(EMPTY),
      ...parsed,
      version: 2,
      profiles: parsed.profiles ?? [],
      wallets: parsed.wallets ?? {},
      refillAt: parsed.refillAt ?? {},
      ledger: parsed.ledger ?? [],
      settlements: parsed.settlements ?? [],
      friendships: parsed.friendships ?? [],
      stats: parsed.stats ?? {},
    };
  }

  async ready(): Promise<void> {}

  getProfile(id: string): ProfileRow | undefined {
    return this.snapshot.profiles.find((p) => p.id === id);
  }

  findProfileByToken(token: string): ProfileRow | undefined {
    return this.snapshot.profiles.find((p) => p.token === token);
  }

  findProfileByFriendCode(code: string): ProfileRow | undefined {
    return this.snapshot.profiles.find((p) => p.friendCode === code);
  }

  saveProfile(row: ProfileRow): void {
    const index = this.snapshot.profiles.findIndex((p) => p.id === row.id);
    if (index >= 0) this.snapshot.profiles[index] = row;
    else this.snapshot.profiles.push(row);
    this.scheduleSave();
  }

  getBalance(profileId: string): number | undefined {
    return this.snapshot.wallets[profileId];
  }

  setBalance(profileId: string, balance: number): void {
    this.snapshot.wallets[profileId] = balance;
    this.scheduleSave();
  }

  getRefillAt(profileId: string): number {
    return this.snapshot.refillAt[profileId] ?? 0;
  }

  setRefillAt(profileId: string, at: number): void {
    this.snapshot.refillAt[profileId] = at;
    this.scheduleSave();
  }

  appendLedger(entry: Omit<LedgerEntry, 'seq'>): void {
    this.snapshot.ledger.push({ ...entry, seq: ++this.snapshot.ledgerSeq });
    if (this.snapshot.ledger.length > MAX_LEDGER) this.snapshot.ledger.splice(0, this.snapshot.ledger.length - MAX_LEDGER);
    this.scheduleSave();
  }

  ledger(profileId: string): readonly LedgerEntry[] {
    return this.snapshot.ledger.filter((e) => e.profileId === profileId);
  }

  getSettlement(key: string): SettlementRecord | undefined {
    return this.snapshot.settlements.find((s) => s.key === key);
  }

  saveSettlement(record: SettlementRecord): void {
    this.snapshot.settlements.push(record);
    this.scheduleSave();
  }

  friendships(profileId: string): readonly FriendshipRow[] {
    return this.snapshot.friendships.filter((f) => f.a === profileId || f.b === profileId);
  }

  saveFriendship(row: FriendshipRow): void {
    const index = this.snapshot.friendships.findIndex((f) => f.a === row.a && f.b === row.b);
    if (index >= 0) this.snapshot.friendships[index] = row;
    else this.snapshot.friendships.push(row);
    this.scheduleSave();
  }

  deleteFriendship(a: string, b: string): void {
    this.snapshot.friendships = this.snapshot.friendships.filter((f) => !(f.a === a && f.b === b));
    this.scheduleSave();
  }

  getStats(profileId: string): StatsRow {
    return { ...EMPTY_STATS, ...this.snapshot.stats[profileId] };
  }

  setStats(profileId: string, stats: StatsRow): void {
    this.snapshot.stats[profileId] = { ...stats };
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.persist();
    }, this.debounceMs);
    this.saveTimer.unref?.();
  }

  private persist(): Promise<void> {
    const data = JSON.stringify(this.snapshot);
    // One write at a time, in order; a failed write is logged and the next one carries the newer state.
    this.writing = this.writing
      .then(() => this.saveRaw(data))
      .catch((error) => console.error('wallet store: save failed', error));
    return this.writing;
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      await this.persist();
    }
    await this.writing;
  }

  async close(): Promise<void> {
    await this.flush();
  }
}
