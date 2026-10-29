import { useEffect, useMemo, useReducer } from 'react';
import type { CsLobbyView, CsStartInfo } from '@dane-se/shared';
import { actions, socket, useClient } from '../../lib/store';
import { CsPlay, CsUnsupported, unsupportedReason } from './CsScreen';
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
  const driver = useMemo(
    () => new NetDriver(socket, lobby.youId, start, refresh),
    // Cada `cs:started` traz um objeto novo e pede um driver novo (revanche).
    [start],
  );
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
