import { type Client, createClient } from '@libsql/client/web';
import { SnapshotWalletStore } from './snapshotStore.js';

/**
 * `WalletStore` on Turso (hosted libSQL), so profiles, wallets, friends and the
 * ranking survive Render redeploys and restarts. The whole hub state is one
 * JSON row: small for a group of friends, and every save is atomic.
 */
export class TursoWalletStore extends SnapshotWalletStore {
  private constructor(private readonly client: Client) {
    // Fewer, larger writes: a game ends in a burst of ledger entries.
    super(1000);
  }

  static async open(url: string, authToken: string | undefined): Promise<TursoWalletStore> {
    const client = createClient({ url, authToken });
    await client.execute(
      'CREATE TABLE IF NOT EXISTS hub_state (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, updated_at INTEGER NOT NULL)',
    );
    const store = new TursoWalletStore(client);
    await store.load();
    return store;
  }

  protected async loadRaw(): Promise<string | null> {
    const result = await this.client.execute('SELECT data FROM hub_state WHERE id = 1');
    const value = result.rows[0]?.data;
    return typeof value === 'string' ? value : null;
  }

  protected async saveRaw(data: string): Promise<void> {
    await this.client.execute({
      sql: 'INSERT INTO hub_state (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
      args: [data, Date.now()],
    });
  }

  async close(): Promise<void> {
    await super.close();
    this.client.close();
  }
}
