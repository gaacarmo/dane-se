import { joinVoice, leaveVoice, toggleMute, useLeaveVoiceWithRoom, useVoice } from '../lib/voice';

/** Floating voice chat control: join, mute, leave, and how many are talking with you. */
export function VoiceButton({ className = '' }: { className?: string }) {
  const voice = useVoice();
  useLeaveVoiceWithRoom();

  if (!voice.joined) {
    return (
      <button
        type="button"
        onClick={() => void joinVoice()}
        disabled={voice.joining}
        title="Entrar no chat de voz"
        aria-label="Entrar no chat de voz"
        className={`grid size-12 place-items-center rounded-full bg-black/60 text-xl shadow-lg ring-1 ring-white/20 backdrop-blur hover:bg-black/75 disabled:opacity-50 ${className}`}
      >
        {voice.joining ? '…' : '🎙️'}
      </button>
    );
  }

  return (
    <div
      className={`flex items-center gap-1 rounded-full bg-black/70 p-1 shadow-lg ring-2 ring-emerald-500/70 backdrop-blur ${className}`}
      role="group"
      aria-label="Chat de voz"
    >
      <button
        type="button"
        onClick={toggleMute}
        aria-pressed={voice.muted}
        title={voice.muted ? 'Ligar o microfone' : 'Silenciar o microfone'}
        className={`grid size-10 place-items-center rounded-full text-lg ${voice.muted ? 'bg-wine-700' : 'bg-emerald-700/80'}`}
      >
        {voice.muted ? '🔇' : '🎙️'}
      </button>
      <span className="px-1 text-xs whitespace-nowrap text-stone-200" title="Pessoas na voz com você">
        +{voice.peers.length}
      </span>
      <button
        type="button"
        onClick={() => leaveVoice()}
        title="Sair do chat de voz"
        aria-label="Sair do chat de voz"
        className="grid size-10 place-items-center rounded-full text-stone-300 hover:bg-white/15"
      >
        ✕
      </button>
    </div>
  );
}
