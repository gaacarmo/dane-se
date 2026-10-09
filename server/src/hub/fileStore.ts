import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SnapshotWalletStore } from './snapshotStore.js';

/**
 * JSON-file `WalletStore`, with atomic writes (temp file + rename).
 *
 * Local dev: survives `npm run dev` restarts. Render free: the disk is
 * ephemeral, so this file is lost on redeploy/restart/sleep — set
 * `DATABASE_URL` to use Turso instead.
 */
export class FileWalletStore extends SnapshotWalletStore {
  private constructor(private readonly file: string) {
    super(150);
  }

  static async open(file: string): Promise<FileWalletStore> {
    const store = new FileWalletStore(file);
    await store.load();
    return store;
  }

  protected async loadRaw(): Promise<string | null> {
    try {
      return await readFile(this.file, 'utf8');
    } catch (error) {
      // No file yet (first run): start empty.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  protected async saveRaw(data: string): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, data, 'utf8');
    await rename(tmp, this.file);
  }
}

export function defaultDataFile(): string {
  return process.env.HUB_DATA_FILE ?? path.resolve(process.cwd(), '.data', 'hub.json');
}
