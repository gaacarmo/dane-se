import { useState } from 'react';
import { actions } from '../../lib/store';
import { Button } from '../ui/Button';

/** Detalhes do modo CS no hub: treinar sozinho contra bots ou criar uma sala para jogar com amigos. */
export function CsPanel({ onTrain }: { onTrain: () => void }) {
  const [busy, setBusy] = useState(false);

  async function createRoom() {
    setBusy(true);
    await actions.csCreate();
    setBusy(false);
  }

  return (
    <div className="space-y-2.5">
      <Button className="w-full rounded-2xl" disabled={busy} onClick={() => void createRoom()}>
        {busy ? 'Criando…' : 'Criar sala com amigos'}
      </Button>
      <Button variant="secondary" className="w-full rounded-2xl" onClick={onTrain}>
        Treinar sozinho contra bots
      </Button>
      <p className="text-[11px] leading-snug text-stone-400">
        Na sala você recebe um código de 4 letras para mandar para a galera; cada um escolhe o time antes de começar. Para entrar na sala
        de um amigo, use "Entrar com código" abaixo.
      </p>
    </div>
  );
}
