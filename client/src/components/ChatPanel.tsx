import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { type RoomView, MAX_CHAT_LENGTH } from '@dane-se/shared';
import { actions } from '../lib/store';

/** Floating chat button with an unread badge; opens a panel with the room's messages. */
export function ChatPanel({
  room,
  className = '',
  opensDown = false,
}: {
  room: RoomView;
  className?: string;
  /** The button sits at the top of the screen: open the panel below it instead of above. */
  opensDown?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [seen, setSeen] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const lastId = room.chat.at(-1)?.id ?? 0;
  const unread = room.chat.filter((m) => m.id > seen && m.playerId !== room.youId).length;

  useEffect(() => {
    if (open) setSeen(lastId);
  }, [open, lastId]);

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [open, lastId]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    void actions.chat(value);
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Chat"
        aria-expanded={open}
        className="relative grid size-12 place-items-center rounded-full bg-black/60 text-xl shadow-lg ring-1 ring-white/20 backdrop-blur hover:bg-black/75"
      >
        💬
        {unread > 0 && !open && (
          <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-card-red px-1 text-[11px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.section
            initial={{ opacity: 0, y: opensDown ? -12 : 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: opensDown ? -12 : 12, scale: 0.97 }}
            className={`absolute right-0 z-50 ${opensDown ? 'top-14' : 'bottom-14'} flex h-80 w-[min(20rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl bg-felt-950/95 shadow-2xl ring-1 ring-gold-500/40 backdrop-blur`}
            aria-label="Chat da sala"
          >
            <ul ref={listRef} className="flex-1 space-y-1.5 overflow-y-auto p-3 text-sm">
              {room.chat.length === 0 && <li className="text-center text-stone-400">Ninguém falou nada ainda…</li>}
              {room.chat.map((m) => {
                const mine = m.playerId === room.youId;
                return (
                  <li key={m.id} className={mine ? 'text-right' : ''}>
                    <span
                      className={`inline-block max-w-[85%] rounded-2xl px-3 py-1.5 text-left break-words ${
                        mine ? 'bg-gold-500/90 text-wood-900' : 'bg-white/10 text-white'
                      }`}
                    >
                      {!mine && <strong className="mr-1.5 text-gold-300">{m.name}</strong>}
                      {m.text}
                    </span>
                  </li>
                );
              })}
            </ul>
            <form onSubmit={send} className="flex gap-2 border-t border-white/10 p-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={MAX_CHAT_LENGTH}
                placeholder="Escreva uma mensagem…"
                className="min-w-0 flex-1 rounded-xl bg-black/40 px-3 py-2 text-sm text-white ring-1 ring-white/15 outline-none focus:ring-gold-400"
                enterKeyHint="send"
              />
              <button
                type="submit"
                className="rounded-xl bg-gold-400 px-3 font-bold text-wood-900 disabled:opacity-50"
                disabled={!text.trim()}
              >
                Enviar
              </button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
