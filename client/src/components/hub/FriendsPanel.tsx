import { type FormEvent, useState } from 'react';
import { FRIEND_CODE_LENGTH, type SocialView, normalizeFriendCode } from '@dane-se/shared';
import { avatarColor, initial } from '../../lib/avatar';
import { actions, notify } from '../../lib/store';
import { Button } from '../ui/Button';

/** Your friend code, adding friends by code, requests, and who's online. */
export function FriendsPanel({ social }: { social: SocialView }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    const clean = normalizeFriendCode(code);
    if (clean.length !== FRIEND_CODE_LENGTH || busy) return;
    setBusy(true);
    const r = await actions.addFriend(clean);
    setBusy(false);
    if (r.ok) {
      setCode('');
      notify('Pedido enviado!', 'info');
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(social.friendCode);
      notify('Código copiado!', 'info');
    } catch {
      notify(`Seu código: ${social.friendCode}`, 'info');
    }
  }

  return (
    <section className="hub-panel space-y-3 p-4" aria-label="Amigos">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] tracking-[0.16em] text-stone-400 uppercase">Seu código de amigo</p>
          <p className="font-mono text-2xl font-bold tracking-[0.2em] text-gold-300">{social.friendCode}</p>
        </div>
        <Button variant="secondary" onClick={copyCode} className="px-3 text-sm">
          Copiar
        </Button>
      </div>

      <form onSubmit={add} className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(normalizeFriendCode(e.target.value))}
          maxLength={FRIEND_CODE_LENGTH}
          placeholder="Código do amigo"
          aria-label="Código do amigo"
          autoCapitalize="characters"
          className="min-h-11 min-w-0 flex-1 rounded-xl bg-black/40 px-3 font-mono tracking-[0.2em] text-white uppercase ring-1 ring-white/15 placeholder:tracking-normal placeholder:text-stone-500 focus:ring-gold-400 focus:outline-none"
        />
        <Button type="submit" disabled={code.length !== FRIEND_CODE_LENGTH || busy} className="px-4">
          Adicionar
        </Button>
      </form>

      {social.incoming.length > 0 && (
        <ul className="space-y-1.5" aria-label="Pedidos de amizade">
          {social.incoming.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-xl bg-gold-500/10 p-2 ring-1 ring-gold-500/30">
              <span className="min-w-0 flex-1 truncate text-sm">
                <strong>{r.nickname}</strong> quer ser seu amigo
              </span>
              <Button className="min-h-9 px-3 py-1 text-sm" onClick={() => actions.respondFriend(r.id, true)}>
                Aceitar
              </Button>
              <Button
                variant="ghost"
                className="min-h-9 px-2 py-1 text-sm"
                onClick={() => actions.respondFriend(r.id, false)}
              >
                Recusar
              </Button>
            </li>
          ))}
        </ul>
      )}

      {social.friends.length === 0 && social.incoming.length === 0 ? (
        <p className="text-sm text-stone-400">
          Passe seu código pra galera ou digite o código de alguém pra começar. Amigos aparecem aqui e você pode chamar
          eles pra sua mesa.
        </p>
      ) : (
        <ul className="space-y-1" aria-label="Seus amigos">
          {social.friends.map((f) => (
            <li key={f.id} className="flex items-center gap-2.5 rounded-xl bg-black/25 p-2">
              <span
                className="relative grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                style={{ background: avatarColor(f.id) }}
              >
                {initial(f.nickname)}
                <span
                  className={`absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-felt-900 ${f.online ? 'bg-emerald-400' : 'bg-stone-600'}`}
                  aria-label={f.online ? 'online' : 'offline'}
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {f.nickname}
                <span className="ml-1.5 text-xs text-stone-400">
                  {f.online ? (f.inRoom ? 'numa mesa' : 'online') : 'offline'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => actions.removeFriend(f.id)}
                className="grid size-8 place-items-center rounded-lg text-stone-500 hover:bg-white/10 hover:text-stone-200"
                aria-label={`Remover ${f.nickname}`}
                title="Remover amigo"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {social.outgoing.length > 0 && (
        <p className="text-xs text-stone-400">
          Aguardando: {social.outgoing.map((o) => o.nickname).join(', ')}{' '}
          <button
            type="button"
            className="underline hover:text-stone-200"
            onClick={() => social.outgoing.forEach((o) => actions.removeFriend(o.id))}
          >
            cancelar
          </button>
        </p>
      )}
    </section>
  );
}
