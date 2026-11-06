import { type FormEvent, useState } from 'react';
import { FRIEND_CODE_LENGTH, type SocialView, normalizeFriendCode } from '@dane-se/shared';
import { avatarColor, initial } from '../../lib/avatar';
import { actions, notify } from '../../lib/store';
import { SectionHeader } from './IosKit';

/** Your friend code, adding friends by code, requests, and who's online, as iOS grouped lists. */
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
    <div className="space-y-7" aria-label="Amigos">
      <div className="glass overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-ios-label-2">Seu código de amigo</p>
            <p className="text-[22px] font-bold tracking-[0.12em] tabular-nums">{social.friendCode}</p>
          </div>
          <button type="button" onClick={copyCode} className="glass-control min-h-9 rounded-full px-4 text-[15px] font-semibold text-ios-blue">
            Copiar
          </button>
        </div>
        <form onSubmit={add} className="flex items-center gap-2 border-t border-ios-separator py-1.5 pr-2 pl-4">
          <input
            value={code}
            onChange={(e) => setCode(normalizeFriendCode(e.target.value))}
            maxLength={FRIEND_CODE_LENGTH}
            placeholder="Código de um amigo"
            aria-label="Código do amigo"
            autoCapitalize="characters"
            className="min-h-11 min-w-0 flex-1 bg-transparent text-[17px] tracking-[0.12em] uppercase placeholder:tracking-normal placeholder:text-ios-label-3 placeholder:normal-case focus:outline-none"
          />
          <button
            type="submit"
            disabled={code.length !== FRIEND_CODE_LENGTH || busy}
            className="min-h-9 rounded-full bg-ios-blue px-4 text-[15px] font-semibold text-white disabled:bg-white/12 disabled:text-ios-label-3"
          >
            Adicionar
          </button>
        </form>
      </div>

      {social.incoming.length > 0 && (
        <section>
          <SectionHeader>Pedidos de amizade</SectionHeader>
          <ul className="glass overflow-hidden">
            {social.incoming.map((r, i) => (
              <li key={r.id} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-ios-separator' : ''}`}>
                <span className="min-w-0 flex-1 truncate text-[17px]">{r.nickname}</span>
                <button
                  type="button"
                  onClick={() => actions.respondFriend(r.id, false)}
                  className="min-h-9 px-2 text-[15px] text-ios-label-2"
                >
                  Recusar
                </button>
                <button
                  type="button"
                  onClick={() => actions.respondFriend(r.id, true)}
                  className="min-h-9 rounded-full bg-ios-blue px-4 text-[15px] font-semibold text-white"
                >
                  Aceitar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionHeader>Amigos</SectionHeader>
        {social.friends.length === 0 ? (
          <p className="glass px-4 py-4 text-[15px] leading-snug text-ios-label-2">
            Mande seu código pra galera ou digite o código de alguém. Seus amigos aparecem aqui, e dá pra chamar eles pra sua
            mesa.
          </p>
        ) : (
          <ul className="glass overflow-hidden">
            {social.friends.map((f, i) => (
              <li key={f.id} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-ios-separator' : ''}`}>
                <span
                  className="relative grid size-10 shrink-0 place-items-center rounded-full text-[17px] font-semibold text-white"
                  style={{ background: avatarColor(f.id) }}
                >
                  {initial(f.nickname)}
                  <span
                    className={`absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full ring-[2.5px] ring-[#1c1c1e] ${f.online ? 'bg-ios-green' : 'bg-white/30'}`}
                    aria-label={f.online ? 'online' : 'offline'}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px]">{f.nickname}</span>
                  <span className="block text-[13px] text-ios-label-2">
                    {f.online ? (f.inRoom ? 'Numa mesa agora' : 'Online') : 'Offline'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => actions.removeFriend(f.id)}
                  className="min-h-9 px-1 text-[15px] text-ios-red"
                  aria-label={`Remover ${f.nickname}`}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
        {social.outgoing.length > 0 && (
          <p className="mt-2 px-4 text-[13px] text-ios-label-2">
            Esperando resposta de {social.outgoing.map((o) => o.nickname).join(', ')}.{' '}
            <button
              type="button"
              className="text-ios-blue"
              onClick={() => social.outgoing.forEach((o) => actions.removeFriend(o.id))}
            >
              Cancelar pedido
            </button>
          </p>
        )}
      </section>
    </div>
  );
}
