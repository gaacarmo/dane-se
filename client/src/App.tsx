import { useState } from 'react';
import { Hub } from './components/hub/Hub';
import { HowToPlay } from './components/HowToPlay';
import { WaitingRoom } from './components/WaitingRoom';
import { Preview3D } from './components/table3d/Preview3D';
import { GameScreen } from './components/table/GameScreen';
import { PokerScreen } from './components/poker/PokerScreen';
import { ConnectionBanner, Toast } from './components/ui/Toast';
import { VoiceButton } from './components/VoiceButton';
import { InviteToast } from './components/InviteToast';
import { useClient } from './lib/store';

export function App() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('preview3d')) return <Preview3D />;
  const { room, resuming, profileReady } = useClient();
  const [help, setHelp] = useState(false);
  const openHelp = () => setHelp(true);

  let screen;
  if (room?.gameType === 'poker' && room.game && room.status !== 'lobby') {
    screen = <PokerScreen room={room} onHelp={openHelp} />;
  } else if (room?.gameType === 'danese' && room.game && room.status !== 'lobby') {
    screen = <GameScreen room={room} onHelp={openHelp} />;
  } else if (room) screen = <WaitingRoom room={room} onHelp={openHelp} />;
  else if (resuming || !profileReady) screen = <Splash />;
  else screen = <Hub onHelp={openHelp} />;

  return (
    <>
      {screen}
      {room && <VoiceButton className="fixed top-[7.25rem] right-2 z-40" />}
      <HowToPlay open={help} onClose={() => setHelp(false)} gameType={room?.gameType} />
      <Toast />
      <InviteToast />
      <ConnectionBanner />
    </>
  );
}

function Splash() {
  return (
    <main className="room-bg flex h-full items-center justify-center">
      <p className="animate-pulse font-display text-3xl gold-text">Voltando para a mesa…</p>
    </main>
  );
}
