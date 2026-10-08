import { Modal } from './ui/Modal';

export function HowToPlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Como jogar">
      <div className="space-y-4 text-sm leading-relaxed text-stone-200">
        <section>
          <h3 className="mb-1 font-semibold text-gold-300">Objetivo</h3>
          <p>
            Acertar quantas vazas (quedas) você vai fazer em cada rodada. Errou, pra mais ou pra menos? Ganha uma letra de{' '}
            <strong>D-A-N-E-S-E</strong>. Completou a palavra, está fora. O último que sobrar vence.
          </p>
        </section>
        <section>
          <h3 className="mb-1 font-semibold text-gold-300">Cartas</h3>
          <p>Baralho de 40 cartas (sem 8, 9 e 10). Da mais fraca para a mais forte:</p>
          <p className="mt-1 rounded-lg bg-black/30 px-3 py-2 text-center font-mono font-bold tracking-wide text-white">
            4 · 5 · 6 · 7 · Q · J · K · A · 2 · 3
          </p>
        </section>
        <section>
          <h3 className="mb-1 font-semibold text-gold-300">Vira e manilha</h3>
          <p>
            Depois de dar as cartas, uma carta é virada na mesa: a <strong>vira</strong>. A <strong>manilha</strong> é a
            carta logo acima dela (vira 3 → manilha 4). Manilhas ganham de tudo e, entre elas, vale o naipe:
          </p>
          <p className="mt-1 text-center font-semibold text-white">Paus ♣ › Copas ♥ › Espadas ♠ › Ouros ♦</p>
        </section>
        <section>
          <h3 className="mb-1 font-semibold text-gold-300">Rodadas</h3>
          <p>
            A 1ª rodada tem 1 carta, a 2ª tem 2… até 6, e depois volta descendo (sobe e desce). Na rodada de 1 carta
            (<strong>cega</strong>) você põe a carta na testa: vê a de todo mundo, menos a sua!
          </p>
        </section>
        <section>
          <h3 className="mb-1 font-semibold text-gold-300">Palpites e o Pé</h3>
          <p>
            O <strong>Pé</strong> é quem dá as cartas: ele palpita e joga por último. Começa quem está à direita dele, e a
            vez anda no sentido anti-horário. O Pé <strong>não pode</strong> dar um palpite que faça a soma ficar igual
            ao número de cartas — assim alguém sempre erra.
          </p>
        </section>
        <section>
          <h3 className="mb-1 font-semibold text-gold-300">Vazas</h3>
          <p>
            A carta mais forte leva a vaza, e quem leva começa a próxima. Se duas cartas tiverem o mesmo valor, ganha a de{' '}
            <strong>naipe maior</strong>: Paus ganha de Copas, que ganha de Espadas, que ganha de Ouros.
          </p>
        </section>
      </div>
    </Modal>
  );
}
