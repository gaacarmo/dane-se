import { useState } from 'react';
import { actions, useClient } from '../lib/store';

/** In the lobby: call online friends who aren't at this table yet. */
export function InviteFriends() {
  const { social, room } = useClient();
  const [called, setCalled] = useState<Record<string, boolean>>({});
  if (!social || !room) return null;
  const here = new Set(room.members.map((m) => m.name));
  const online = social.friends.filter((f) => f.online && !here.has(f.nickname));

  async function call(id: string) {
    const r = await actions.inviteFriend(id);
    if (!r.ok) return;
    setCalled((c) => ({ ...c, [id]: true }));
    setTimeout(() => setCalled((c) => ({ ...c, [id]: false })), 5000);
  }

  return (
    <section className="rounded-2xl bg-felt-900/90 p-4 ring-1 ring-gold-500/30" aria-label="Chamar amigos">
      <h2 className="mb-2 font-semibold text-stone-300">Chamar amigos</h2>
      {social.friends.length === 0 ? (
        <p className="text-sm text-stone-400">Adicione amigos pelo código na tela inicial pra chamar eles daqui.</p>
      ) : online.length === 0 ? (
        <p className="text-sm text-stone-400">Nenhum amigo online agora.</p>
      ) : (
        <ul className="space-y-1.5">
          {online.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-xl bg-black/25 p-2">
              <span className="size-2.5 rounded-full bg-emerald-400" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm">
                {f.nickname}
                {f.inRoom && <span className="ml-1.5 text-xs text-stone-400">numa mesa</span>}
              </span>
              <button
                type="button"
                disabled={called[f.id]}
                onClick={() => void call(f.id)}
                className="rounded-lg bg-gold-400 px-3 py-1.5 text-sm font-bold text-wood-900 disabled:bg-emerald-700 disabled:text-white"
              >
                {called[f.id] ? 'Chamado!' : 'Chamar'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
