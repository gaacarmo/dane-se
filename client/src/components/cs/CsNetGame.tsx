import { useEffect, useReducer, useRef } from 'react';
import type { CsLobbyView, CsStartInfo } from '@dane-se/shared';
import { actions, socket, useClient } from '../../lib/store';
import { CsPlay, CsUnsupported, unsupportedReason } from './CsScreen';
import { Button } from '../ui/Button';
import { NetDriver } from './driver';

/** Partida de uma sala: o servidor roda tudo; aqui só se joga e se desenha. */
export function CsNetGame() {
  const { csLobby, csStart, csForfeit } = useClient();
  const leave = () => void actions.leave();
  const reason = unsupportedReason();
  if (reason) return <CsUnsupported reason={reason} onExit={leave} />;
  if (!csLobby || !csStart) return null;
  return <NetPlay lobby={csLobby} start={csStart} forfeitVote={csForfeit} onExit={leave} />;
}

/** Sala do CS sem partida na tela: conectando (logo depois de voltar) ou encerrada (recarregou no resultado). */
export function CsWaiting({ lobby }: { lobby: CsLobbyView }) {
  const finished = lobby.status === 'finished';
  return (
    <main className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black p-6 text-center font-mono text-sm text-stone-300">
      <p className={finished ? '' : 'animate-pulse text-stone-400'}>{finished ? 'Partida encerrada.' : 'Conectando à partida…'}</p>
      <div className="flex gap-3">
        {finished && lobby.youId === lobby.hostId && <Button onClick={() => void actions.csRematch()}>Jogar de novo</Button>}
        <Button variant="secondary" onClick={() => void actions.leave()}>
          Sair
        </Button>
      </div>
    </main>
  );
}

function NetPlay({
  lobby,
  start,
  forfeitVote,
  onExit,
}: {
  lobby: CsLobbyView;
  start: CsStartInfo;
  forfeitVote: { votes: number; needed: number } | null;
  onExit: () => void;
}) {
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  // O driver guarda a numeração das entradas: nada de useMemo, que o React pode descartar. Cada `cs:started` traz um objeto novo.
  const held = useRef<{ start: CsStartInfo; driver: NetDriver } | null>(null);
  if (held.current?.start !== start) held.current = { start, driver: new NetDriver(socket, lobby.youId, start, refresh) };
  const driver = held.current.driver;
  useEffect(() => driver.start(), [driver]);

  if (!driver.matchRef.current) {
    return (
      <main className="fixed inset-0 z-50 flex items-center justify-center bg-black font-mono text-sm text-stone-400">
        <p className="animate-pulse">Conectando à partida…</p>
      </main>
    );
  }
  return (
    <CsPlay
      driver={driver}
      onExit={onExit}
      skipDraw
      forfeitVote={forfeitVote}
      rematch={{ canRematch: lobby.youId === lobby.hostId, onRematch: () => void actions.csRematch() }}
    />
  );
}
