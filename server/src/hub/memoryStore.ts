import { SnapshotWalletStore } from './snapshotStore.js';

/** In-memory `WalletStore` for tests and simulations: nothing is saved anywhere. */
export class MemoryWalletStore extends SnapshotWalletStore {
  protected async loadRaw(): Promise<string | null> {
    return null;
  }

  protected async saveRaw(): Promise<void> {}
}
