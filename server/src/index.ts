import { createApp } from './app.js';
import { FileWalletStore, defaultDataFile } from './hub/fileStore.js';

const port = Number(process.env.PORT ?? 3001);

// Profiles and wallets live on disk by default. On Render free the disk is
// ephemeral (lost on redeploy/restart), so set DATABASE_URL to use a hosted
// store instead — see README.
const store = await FileWalletStore.open(defaultDataFile());
const server = createApp({ walletStore: store });

const actualPort = await server.listen(port);
console.log(`Dane-se server listening on http://localhost:${actualPort}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
