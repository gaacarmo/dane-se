import { actions } from '../../lib/store';
import { Modal } from './Modal';

/** "Sair da partida?" as an iOS alert: what happens, the red action, and stay. */
export function LeaveDialog({ open, onClose, message }: { open: boolean; onClose: () => void; message: string }) {
  return (
    <Modal open={open} onClose={onClose} title="Sair da partida?">
      <div className="space-y-5 pt-1">
        <p className="px-2 text-center text-[15px] leading-snug text-ios-label-2">{message}</p>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => actions.leave()}
            className="min-h-[50px] w-full rounded-full bg-ios-red text-[17px] font-semibold text-white transition active:scale-[0.98]"
          >
            Sair da partida
          </button>
          <button
            type="button"
            onClick={onClose}
            className="glass-control min-h-[50px] w-full rounded-full text-[17px] font-semibold text-ios-blue transition active:scale-[0.98]"
          >
            Continuar jogando
          </button>
        </div>
      </div>
    </Modal>
  );
}
