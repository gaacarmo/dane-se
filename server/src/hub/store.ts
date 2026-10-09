/**
 * Persistence for profiles, wallets, the money ledger, friendships and ranking stats.
 *
 * Everything lives in memory and is written out in the background
 * (`SnapshotWalletStore`): to a JSON file by default, or to Turso (libSQL) when
 * `DATABASE_URL` is set. The file does NOT survive a Render free redeploy or
 * restart (that disk is ephemeral); Turso does. Every mutation must be atomic from the caller's point of
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
  /** Short public code friends type to add you. Given out lazily (older profiles have none yet). */
  friendCode?: string;
}

/** One friendship, stored once per pair with `a < b`. */
export interface FriendshipRow {
  a: string;
  b: string;
  /** Who sent the request. */
  requestedBy: string;
  status: 'pending' | 'accepted';
  at: number;
}

/** Totals for the friends ranking (money games only; practice games with bots don't count). */
export interface StatsRow {
  daneseGames: number;
  daneseWins: number;
  pokerGames: number;
  /** Sum over poker games of (cash out − money put in). Can be negative. */
  pokerProfit: number;
}

export const EMPTY_STATS: StatsRow = { daneseGames: 0, daneseWins: 0, pokerGames: 0, pokerProfit: 0 };

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
  findProfileByFriendCode(code: string): ProfileRow | undefined;
  /** Every friendship (pending or accepted) the profile is part of. */
  friendships(profileId: string): readonly FriendshipRow[];
  saveFriendship(row: FriendshipRow): void;
  deleteFriendship(a: string, b: string): void;
  getStats(profileId: string): StatsRow;
  setStats(profileId: string, stats: StatsRow): void;
  /** Persists any pending writes. */
  flush(): Promise<void>;
  close(): Promise<void>;
}
