import { type FormEvent, useState } from 'react';
import { actions, notify, useClient } from '../../lib/store';
import { Button } from '../ui/Button';

/** Moving your profile (wallet, friends, ranking) to another device. */
export function RecoveryPanel() {
  const { room } = useClient();
  const [show, setShow] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = actions.recoveryCode();

  async function copy() {
    if (!mine) return;
    try {
      await navigator.clipboard.writeText(mine);
      notify('Código de recuperação copiado. Guarde em lugar seguro!', 'info');
    } catch {
      setShow(true);
    }
  }

  async function recover(e: FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    if (!confirm('Entrar com outro perfil neste aparelho? O perfil atual sai daqui (guarde o código dele antes).'))
      return;
    setBusy(true);
    const ok = await actions.recover(code);
    setBusy(false);
    if (ok) setCode('');
  }

  return (
    <details className="hub-panel group p-4">
      <summary className="cursor-pointer list-none text-sm font-semibold text-stone-300 select-none">
        🔑 Usar este perfil em outro aparelho
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-stone-400">
          Seu código de recuperação abre esta carteira, seus amigos e seu ranking em qualquer aparelho. Ele funciona
          como uma senha: não passe pra ninguém.
        </p>
        {mine && (
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-black/40 px-2 py-2 font-mono text-xs text-stone-200">
              {show ? mine : '••••••••-••••-••••-••••-••••••••••••'}
            </code>
            <Button variant="ghost" className="min-h-9 px-2 py-1 text-xs" onClick={() => setShow((v) => !v)}>
              {show ? 'Esconder' : 'Mostrar'}
            </Button>
            <Button variant="secondary" className="min-h-9 px-3 py-1 text-xs" onClick={copy}>
              Copiar
            </Button>
          </div>
        )}
        <form onSubmit={recover} className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Colar código de outro aparelho"
            aria-label="Código de recuperação"
            className="min-h-10 min-w-0 flex-1 rounded-xl bg-black/40 px-3 text-sm text-white ring-1 ring-white/15 placeholder:text-stone-500 focus:ring-gold-400 focus:outline-none"
          />
          <Button type="submit" variant="secondary" disabled={!code.trim() || busy || !!room} className="px-3 text-sm">
            Entrar
          </Button>
        </form>
      </div>
    </details>
  );
}
