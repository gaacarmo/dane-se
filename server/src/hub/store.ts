/**
 * Persistence for profiles, wallets and the money ledger.
 *
 * The default implementation writes a JSON file (survives local restarts, but
 * NOT a Render free redeploy/restart: that disk is ephemeral). A hosted adapter
 * (Turso/libSQL) can be plugged behind this same interface when `DATABASE_URL`
 * is set; see README. Every mutation must be atomic from the caller's point of
 * view: `WalletService` reads the balance, decides, then writes, with nothing
 * awaited in between.
 */
export type LedgerType = 'initial' | 'buyIn' | 'rebuy' | 'refund' | 'payout' | 'cashOut' | 'refill';

export interface ProfileRow {
  id: string;
  /** Secret, stored in the client's localStorage. Treat like a password. */
  token: string;
  nickname: string;
  createdAt: number;
}

export interface LedgerEntry {
  seq: number;
  profileId: string;
  type: LedgerType;
  /** Always positive; the `type` says whether money came in or out. */
  amount: number;
  roomCode: string | null;
  at: number;
}

/** A settlement is keyed by room code so it can never be paid twice. */
export interface SettlementRecord {
  key: string;
  credits: { profileId: string; amount: number; place: number }[];
  at: number;
}

export interface WalletStore {
  /** Loads persisted state; must be awaited before serving traffic. */
  ready(): Promise<void>;
  getProfile(id: string): ProfileRow | undefined;
  findProfileByToken(token: string): ProfileRow | undefined;
  saveProfile(row: ProfileRow): void;
  getBalance(profileId: string): number | undefined;
  setBalance(profileId: string, balance: number): void;
  getRefillAt(profileId: string): number;
  setRefillAt(profileId: string, at: number): void;
  appendLedger(entry: Omit<LedgerEntry, 'seq'>): void;
  ledger(profileId: string): readonly LedgerEntry[];
  getSettlement(key: string): SettlementRecord | undefined;
  saveSettlement(record: SettlementRecord): void;
  /** Persists any pending writes. */
  flush(): Promise<void>;
  close(): Promise<void>;
}
