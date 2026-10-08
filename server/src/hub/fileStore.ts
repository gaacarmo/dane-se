import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LedgerEntry, ProfileRow, SettlementRecord, WalletStore } from './store.js';

interface Snapshot {
  version: 1;
  profiles: ProfileRow[];
  wallets: Record<string, number>;
  refillAt: Record<string, number>;
  ledger: LedgerEntry[];
  settlements: SettlementRecord[];
  ledgerSeq: number;
}

const EMPTY: Snapshot = { version: 1, profiles: [], wallets: {}, refillAt: {}, ledger: [], settlements: [], ledgerSeq: 0 };

/**
 * JSON-file implementation of `WalletStore`. Atomic writes (temp file + rename)
 * and a short debounce so bursts of ledger entries don't thrash the disk.
 *
 * Local dev: survives `npm run dev` restarts. Render free: the disk is
 * ephemeral, so this file is lost on redeploy/restart/sleep — use the hosted
 * adapter for real persistence.
 */
export class FileWalletStore implements WalletStore {
  private snapshot: Snapshot = structuredClone(EMPTY);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> = Promise.resolve();

  private constructor(private readonly file: string) {}

  static async open(file: string): Promise<FileWalletStore> {
    const store = new FileWalletStore(file);
    await store.load();
    return store;
  }

  private async load(): Promise<void> {
    try {
      const raw = await readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as Partial<Snapshot>;
      this.snapshot = {
        ...structuredClone(EMPTY),
        ...parsed,
        profiles: parsed.profiles ?? [],
        wallets: parsed.wallets ?? {},
        refillAt: parsed.refillAt ?? {},
        ledger: parsed.ledger ?? [],
        settlements: parsed.settlements ?? [],
      };
    } catch {
      // No file yet (first run) or unreadable: start empty.
      this.snapshot = structuredClone(EMPTY);
    }
  }

  async ready(): Promise<void> {
    // Nothing else to do: load() ran in open().
  }

  getProfile(id: string): ProfileRow | undefined {
    return this.snapshot.profiles.find((p) => p.id === id);
  }

  findProfileByToken(token: string): ProfileRow | undefined {
    return this.snapshot.profiles.find((p) => p.token === token);
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
    // Keep the log bounded (it is for debugging, not accounting history).
    if (this.snapshot.ledger.length > 5000) this.snapshot.ledger.splice(0, this.snapshot.ledger.length - 5000);
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

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.persist();
    }, 150);
    this.saveTimer.unref?.();
  }

  private persist(): Promise<void> {
    const data = JSON.stringify(this.snapshot, null, 0);
    // Serialize writes so a rename never races another.
    this.writing = this.writing.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, data, 'utf8');
      await rename(tmp, this.file);
    });
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

export function defaultDataFile(): string {
  return process.env.HUB_DATA_FILE ?? path.resolve(process.cwd(), '.data', 'hub.json');
}
