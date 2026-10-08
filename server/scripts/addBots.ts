/**
 * Dev helper: fills a room with bot players so you can test alone.
 *
 *   npm run bots -- ABCD 3              # 3 bots join room ABCD (local server)
 *   npm run bots -- ABCD 2 https://...  # against a deployed server
 *
 * Bots play using the same heuristics as the server stand-in bot. Ctrl+C to remove them.
 */
import { BotClient } from './botClient.js';

const [code, countArg = '3', url = 'http://localhost:3001'] = process.argv.slice(2);
if (!code) {
  console.error('Uso: npm run bots -- <CÓDIGO> [quantidade] [url]');
  process.exit(1);
}

const NAMES = ['Zé Bot', 'Tia Bot', 'Bot do Bar', 'Robozão', 'Dona Bot'];
const bots = NAMES.slice(0, Number(countArg)).map((name) => new BotClient(url, name));

for (const bot of bots) {
  const r = await bot.join(code);
  if (!r.ok) {
    console.error(`${bot.name}: ${r.error}`);
    continue;
  }
  bot.enableAutoPlay();
  console.log(`${bot.name} entrou na sala ${code.toUpperCase()}`);
}

process.on('SIGINT', () => {
  for (const bot of bots) bot.close();
  process.exit(0);
});
