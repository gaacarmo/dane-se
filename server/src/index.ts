import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const server = createApp();

const actualPort = await server.listen(port);
console.log(`Dane-se server listening on http://localhost:${actualPort}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
