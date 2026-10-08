import { useState } from 'react';
import { Home } from './components/Home';
import { HowToPlay } from './components/HowToPlay';
import { WaitingRoom } from './components/WaitingRoom';
import { GameScreen } from './components/table/GameScreen';
import { ConnectionBanner, Toast } from './components/ui/Toast';
import { useClient } from './lib/store';

export function App() {
  const { room, resuming } = useClient();
  const [help, setHelp] = useState(false);
  const openHelp = () => setHelp(true);

  let screen;
  if (room?.game && room.status !== 'lobby') screen = <GameScreen room={room} onHelp={openHelp} />;
  else if (room) screen = <WaitingRoom room={room} onHelp={openHelp} />;
  else if (resuming) screen = <Splash />;
  else screen = <Home onHelp={openHelp} />;

  return (
    <>
      {screen}
      <HowToPlay open={help} onClose={() => setHelp(false)} />
      <Toast />
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
