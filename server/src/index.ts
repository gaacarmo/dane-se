import { createApp } from './app.js';
import { FileWalletStore, defaultDataFile } from './hub/fileStore.js';
import { TursoWalletStore } from './hub/tursoStore.js';

const port = Number(process.env.PORT ?? 3001);

// Profiles, wallets, friends and ranking live in a file by default. On Render
// free that disk is ephemeral (lost on redeploy/restart/sleep), so set
// DATABASE_URL (and DATABASE_AUTH_TOKEN) to keep them in Turso — see README.
const databaseUrl = process.env.DATABASE_URL;
const store = databaseUrl
  ? await TursoWalletStore.open(databaseUrl, process.env.DATABASE_AUTH_TOKEN)
  : await FileWalletStore.open(defaultDataFile());
console.log(databaseUrl ? 'Wallets: Turso (DATABASE_URL)' : `Wallets: file ${defaultDataFile()} (lost on a Render restart)`);
const server = createApp({ walletStore: store });

const actualPort = await server.listen(port);
console.log(`Dane-se server listening on http://localhost:${actualPort}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
