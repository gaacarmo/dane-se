import type { GameType } from '@dane-se/shared';
import { Modal } from './ui/Modal';

export function HowToPlay({
  open,
  onClose,
  gameType,
}: {
  open: boolean;
  onClose: () => void;
  /** When set, only that game's rules are shown. Left out on the hub. */
  gameType?: GameType;
}) {
  const showDanese = gameType !== 'poker';
  const showPoker = gameType !== 'danese';
  const headings = !gameType;
  return (
    <Modal open={open} onClose={onClose} title="Como jogar">
      <div className="space-y-6 text-sm leading-relaxed text-stone-200">
        {showDanese && <DaneseRules heading={headings} />}
        {showPoker && <PokerRules heading={headings} />}
      </div>
    </Modal>
  );
}

function GameHeading({ icon, name }: { icon: string; name: string }) {
  return (
    <h2 className="border-b border-gold-500/40 pb-1 font-display text-xl text-gold-300">
      <span className="mr-2" aria-hidden>
        {icon}
      </span>
      {name}
    </h2>
  );
}

function DaneseRules({ heading }: { heading: boolean }) {
  return (
    <section className="space-y-4">
      {heading && <GameHeading icon="🃏" name="Dane-se" />}
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
          Depois de dar as cartas, uma carta é virada na mesa: a <strong>vira</strong>. A <strong>manilha</strong> é a carta
          logo acima dela (vira 3 → manilha 4). Manilhas ganham de tudo e, entre elas, vale o naipe:
        </p>
        <p className="mt-1 text-center font-semibold text-white">Paus ♣ › Copas ♥ › Espadas ♠ › Ouros ♦</p>
      </section>
      <section>
        <h3 className="mb-1 font-semibold text-gold-300">Rodadas</h3>
        <p>
          A 1ª rodada tem 1 carta, a 2ª tem 2… até 6, e depois volta descendo (sobe e desce). Na rodada de 1 carta (
          <strong>cega</strong>) você põe a carta na testa: vê a de todo mundo, menos a sua!
        </p>
      </section>
      <section>
        <h3 className="mb-1 font-semibold text-gold-300">Palpites e o Pé</h3>
        <p>
          O <strong>Pé</strong> é quem dá as cartas: ele palpita e joga por último. Começa quem está à direita dele, e a vez
          anda no sentido anti-horário. O Pé <strong>não pode</strong> dar um palpite que faça a soma ficar igual ao número de
          cartas — assim alguém sempre erra.
        </p>
      </section>
      <section>
        <h3 className="mb-1 font-semibold text-gold-300">Vazas</h3>
        <p>
          A carta mais forte leva a vaza, e quem leva começa a próxima. Se <strong>duas</strong> cartas mais fortes
          tiverem o mesmo valor, elas <strong>embucham</strong> (se cancelam) e ganha a maior que sobrou; se tudo
          embuchar, ninguém leva e quem começou começa de novo. Se forem <strong>três</strong> do mesmo valor, ganha a de
          naipe maior: Paus ganha de Copas, que ganha de Espadas, que ganha de Ouros. Se a rodada inteira embuchar, o Pé
          leva uma letra.
        </p>
      </section>
    </section>
  );
}

function PokerRules({ heading }: { heading: boolean }) {
  return (
    <div className="space-y-4">
      {heading && <GameHeading icon="♠️" name="Poker Texas Hold'em" />}
      <section>
        <h3 className="mb-1 font-semibold text-gold-300">Objetivo</h3>
        <p>
          Levar as fichas dos adversários montando a melhor mão de 5 cartas, usando suas <strong>2 cartas fechadas</strong> e
          as <strong>5 cartas da mesa</strong>. É um cash game: você senta com uma banca e sai com o que tiver no fim.
        </p>
      </section>
      <section>
        <h3 className="mb-1 font-semibold text-gold-300">Rodadas de aposta</h3>
        <ol className="ml-4 list-decimal space-y-1">
          <li>
            <strong>Pré-flop:</strong> cada um recebe 2 cartas fechadas. Falam primeiro as apostas cegas (small blind e big
            blind).
          </li>
          <li>
            <strong>Flop:</strong> 3 cartas abertas na mesa.
          </li>
          <li>
            <strong>Turn:</strong> a 4ª carta da mesa.
          </li>
          <li>
            <strong>River:</strong> a 5ª e última carta da mesa.
          </li>
        </ol>
        <p className="mt-1">Em cada rodada você pode passar (check), pagar (call), aumentar (raise), apostar (bet) ou ir de all-in.</p>
      </section>
      <section>
        <h3 className="mb-1 font-semibold text-gold-300">Blinds e o botão</h3>
        <p>
          O <strong>D</strong> na mesa é o botão (dealer): ele move a posição que paga as apostas obrigatórias. O small blind
          fica à esquerda do botão e o big blind ao lado dele. As apostas aumentam de rodada em rodada, então a ação volta
          sempre para quem ainda está na mão.
        </p>
      </section>
      <section>
        <h3 className="mb-1 font-semibold text-gold-300">Valor das mãos</h3>
        <p>Da mais forte para a mais fraca:</p>
        <p className="mt-1 rounded-lg bg-black/30 px-3 py-2 text-center font-semibold text-white">
          Straight flush · Quadra · Full house · Flush · Sequência · Trinca · Dois pares · Par · Carta alta
        </p>
        <p className="mt-1">No empate, valem as cartas de desempate — o Ás é a maior carta (e também fecha a sequência A-2-3-4-5).</p>
      </section>
      <section>
        <h3 className="mb-1 font-semibold text-gold-300">Tempo e banca</h3>
        <p>
          Você tem <strong>30 segundos</strong> para agir: passou da hora, a mesa passa ou desiste por você. Se ficar sem
          agir em duas mãos seguidas, você fica de fora até voltar. Entre uma mão e outra dá para <strong>recarregar a banca</strong>.
          Ficou sem fichas e não recarregou? A mesa termina quando sobra só um jogador com fichas.
        </p>
      </section>
    </div>
  );
}
