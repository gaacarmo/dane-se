import { type FormEvent, useState } from 'react';
import { actions, notify, useClient } from '../../lib/store';

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
    <details className="glass group overflow-hidden">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 select-none">
        <span className="flex-1 text-[17px]">Usar este perfil em outro aparelho</span>
        <svg viewBox="0 0 24 24" className="size-4 text-ios-label-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m9 5 7 7-7 7" />
        </svg>
      </summary>
      <div className="space-y-3 border-t border-ios-separator px-4 py-3">
        <p className="text-[15px] leading-snug text-ios-label-2">
          O código de recuperação abre sua carteira, seus amigos e seu ranking em qualquer aparelho. Ele funciona como uma
          senha: não passe pra ninguém.
        </p>
        {mine && (
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl bg-ios-fill px-3 py-2.5 text-[13px] text-ios-label">
              {show ? mine : '••••••••-••••-••••-••••-••••••••••••'}
            </code>
            <button type="button" className="min-h-9 px-1 text-[15px] text-ios-blue" onClick={() => setShow((v) => !v)}>
              {show ? 'Esconder' : 'Mostrar'}
            </button>
            <button type="button" className="min-h-9 px-1 text-[15px] font-semibold text-ios-blue" onClick={copy}>
              Copiar
            </button>
          </div>
        )}
        <form onSubmit={recover} className="flex items-center gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Colar código de outro aparelho"
            aria-label="Código de recuperação"
            className="min-h-11 min-w-0 flex-1 rounded-xl bg-ios-fill px-3 text-[15px] text-ios-label placeholder:text-ios-label-3 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!code.trim() || busy || !!room}
            className="min-h-9 rounded-full tint-fill px-4 text-[15px] font-semibold"
          >
            Entrar
          </button>
        </form>
      </div>
    </details>
  );
}
