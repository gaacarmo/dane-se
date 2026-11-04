import { useState } from 'react';
import { actions } from '../../lib/store';
import { Button } from '../ui/Button';

/** O modo CS no catálogo do hub: treinar sozinho contra bots ou criar uma sala para jogar com amigos. */
export function CsCard({ onTrain }: { onTrain: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function createRoom() {
    setBusy(true);
    await actions.csCreate();
    setBusy(false);
  }

  return (
    <div className="space-y-2.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-pressed={open}
        className={`group relative flex w-full items-center gap-3.5 overflow-hidden rounded-3xl p-3.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 active:translate-y-px ${
          open
            ? 'bg-gradient-to-b from-felt-700 to-felt-800 shadow-[0_18px_40px_-22px_rgb(0_0_0/0.95)] ring-2 ring-gold-400'
            : 'hub-panel hover:border-gold-400/45'
        }`}
      >
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-2xl bg-black/25 text-2xl ring-1 ring-white/10">
          🎯
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-base font-bold text-white">Modo CS</span>
            {open && <span className="ml-auto shrink-0 text-gold-300">✓</span>}
          </span>
          <span className="mt-0.5 block text-sm leading-snug text-stone-300">
            Tiro em primeira pessoa, 3 contra 3. Plante e desarme a bomba, troque de lado e vença a partida.
          </span>
          <span className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium text-stone-400">
            <span className="rounded-full bg-black/30 px-2 py-0.5 ring-1 ring-white/10">👥 1–6 jogadores + bots</span>
            <span className="rounded-full bg-black/30 px-2 py-0.5 ring-1 ring-white/10">🖥️📱 computador e celular</span>
            <span className="rounded-full bg-black/30 px-2 py-0.5 ring-1 ring-white/10">🚫 sem entrada nem prêmio</span>
          </span>
        </span>
      </button>

      {open && (
        <div className="hub-panel space-y-2.5 p-3.5">
          <Button className="w-full" disabled={busy} onClick={() => void createRoom()}>
            {busy ? 'Criando…' : 'Criar sala com amigos'}
          </Button>
          <Button variant="secondary" className="w-full" onClick={onTrain}>
            Treinar sozinho contra bots
          </Button>
          <p className="text-[11px] leading-snug text-stone-400">
            Na sala você recebe um código de 4 letras para mandar para a galera; cada um escolhe o time antes de começar. Para entrar na sala
            de um amigo, use "Entrar com código" abaixo.
          </p>
        </div>
      )}
    </div>
  );
}
