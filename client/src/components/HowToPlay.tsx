import { useEffect, useState } from 'react';
import type { GameType } from '@dane-se/shared';
import { AppIcon, Segmented } from './hub/IosKit';
import { Modal } from './ui/Modal';

const GAMES: { id: GameType; label: string; name: string }[] = [
  { id: 'danese', label: 'Dane-se', name: 'Dane-se' },
  { id: 'truco', label: 'Truco', name: 'Truco Paulista' },
  { id: 'duvido', label: 'Duvido', name: 'Duvido' },
  { id: 'bingo', label: 'Bingo', name: 'Bingo' },
  { id: 'poker', label: 'Poker', name: "Poker Texas Hold'em" },
];

export function HowToPlay({
  open,
  onClose,
  gameType,
  followAppearance = false,
}: {
  open: boolean;
  onClose: () => void;
  /** When set, that game's rules open first (inside a room, only that game). */
  gameType?: GameType;
  /** Hub and lobby: follow light/dark. Game tables: always dark. */
  followAppearance?: boolean;
}) {
  const [picked, setPicked] = useState<GameType>(gameType ?? 'danese');
  useEffect(() => {
    if (gameType) setPicked(gameType);
  }, [gameType]);
  const shown = gameType ?? picked;
  const game = GAMES.find((g) => g.id === shown)!;

  return (
    <Modal open={open} onClose={onClose} title="Como jogar" followAppearance={followAppearance}>
      <div className="space-y-4 text-[15px] leading-relaxed">
        {!gameType && (
          <Segmented
            label="Jogo"
            options={GAMES.map((g) => g.id)}
            value={picked}
            onChange={setPicked}
            format={(id) => GAMES.find((g) => g.id === id)!.label}
            layoutId="rules-game"
          />
        )}
        <header className="flex items-center gap-3 px-1">
          <AppIcon id={game.id} size={44} />
          <h3 className="text-[20px] font-bold tracking-tight">{game.name}</h3>
        </header>
        {shown === 'danese' && <DaneseRules />}
        {shown === 'poker' && <PokerRules />}
        {shown === 'truco' && <TrucoRules />}
        {shown === 'duvido' && <DuvidoRules />}
        {shown === 'bingo' && <BingoRules />}
      </div>
    </Modal>
  );
}

function DaneseRules() {
  return (
    <section className="space-y-3">
      <section className="glass px-4 py-3">
        <h4 className="mb-1 text-[15px] font-semibold">Objetivo</h4>
        <p>
          Acertar quantas vazas (quedas) você vai fazer em cada rodada. Errou, pra mais ou pra menos? Ganha uma letra de{' '}
          <strong>D-A-N-E-S-E</strong>. Completou a palavra, está fora. O último que sobrar vence.
        </p>
      </section>
      <section className="glass px-4 py-3">
        <h4 className="mb-1 text-[15px] font-semibold">Cartas</h4>
        <p>Baralho de 40 cartas (sem 8, 9 e 10). Da mais fraca para a mais forte:</p>
        <p className="mt-2 rounded-xl bg-ios-fill px-3 py-2 text-center font-semibold tracking-wide tabular-nums">
          4 · 5 · 6 · 7 · Q · J · K · A · 2 · 3
        </p>
      </section>
      <section className="glass px-4 py-3">
        <h4 className="mb-1 text-[15px] font-semibold">Vira e manilha</h4>
        <p>
          Depois de dar as cartas, uma carta é virada na mesa: a <strong>vira</strong>. A <strong>manilha</strong> é a carta
          logo acima dela (vira 3 → manilha 4). Manilhas ganham de tudo e, entre elas, vale o naipe:
        </p>
        <p className="mt-2 rounded-xl bg-ios-fill px-3 py-2 text-center font-semibold">Paus ♣ › Copas ♥ › Espadas ♠ › Ouros ♦</p>
      </section>
      <section className="glass px-4 py-3">
        <h4 className="mb-1 text-[15px] font-semibold">Rodadas</h4>
        <p>
          A 1ª rodada tem 1 carta, a 2ª tem 2… até 6, e depois volta descendo (sobe e desce). Na rodada de 1 carta (
          <strong>cega</strong>) você põe a carta na testa: vê a de todo mundo, menos a sua!
        </p>
      </section>
      <section className="glass px-4 py-3">
        <h4 className="mb-1 text-[15px] font-semibold">Palpites e o Pé</h4>
        <p>
          O <strong>Pé</strong> é quem dá as cartas: ele palpita e joga por último. Começa quem está à direita dele, e a vez
          anda no sentido anti-horário. O Pé <strong>não pode</strong> dar um palpite que faça a soma ficar igual ao número de
          cartas — assim alguém sempre erra.
        </p>
      </section>
      <section className="glass px-4 py-3">
        <h4 className="mb-1 text-[15px] font-semibold">Vazas</h4>
        <p>
          A carta mais forte leva a vaza, e quem leva começa a próxima. Se <strong>duas</strong> cartas mais fortes
          tiverem o mesmo valor, elas <strong>embucham</strong> (se cancelam) e ganha a maior que sobrou; se tudo
          embuchar, ninguém leva e quem começou começa de novo, e a <strong>próxima rodada vale 2</strong> (cada erro
          dá 2 letras). Se forem <strong>três</strong> do mesmo valor, ganha a <strong>terceira carta jogada</strong>,
          seja qual for o naipe. Se a rodada inteira embuchar, o Pé leva uma letra.
        </p>
      </section>
    </section>
  );
}

function PokerRules() {
  return (
    <div className="space-y-3">
      <section className="glass px-4 py-3">
        <h4 className="mb-1 text-[15px] font-semibold">Objetivo</h4>
        <p>
          Levar as fichas dos adversários montando a melhor mão de 5 cartas, usando suas <strong>2 cartas fechadas</strong> e
          as <strong>5 cartas da mesa</strong>. É um cash game: você senta com uma banca e sai com o que tiver no fim.
        </p>
      </section>
      <section className="glass px-4 py-3">
        <h4 className="mb-1 text-[15px] font-semibold">Rodadas de aposta</h4>
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
      <section className="glass px-4 py-3">
        <h4 className="mb-1 text-[15px] font-semibold">Blinds e o botão</h4>
        <p>
          O <strong>D</strong> na mesa é o botão (dealer): ele move a posição que paga as apostas obrigatórias. O small blind
          fica à esquerda do botão e o big blind ao lado dele. As apostas aumentam de rodada em rodada, então a ação volta
          sempre para quem ainda está na mão.
        </p>
      </section>
      <section className="glass px-4 py-3">
        <h4 className="mb-1 text-[15px] font-semibold">Valor das mãos</h4>
        <p>Da mais forte para a mais fraca:</p>
        <p className="mt-2 rounded-xl bg-ios-fill px-3 py-2 text-center font-semibold">
          Straight flush · Quadra · Full house · Flush · Sequência · Trinca · Dois pares · Par · Carta alta
        </p>
        <p className="mt-1">No empate, valem as cartas de desempate — o Ás é a maior carta (e também fecha a sequência A-2-3-4-5).</p>
      </section>
      <section className="glass px-4 py-3">
        <h4 className="mb-1 text-[15px] font-semibold">Tempo e banca</h4>
        <p>
          Você tem <strong>30 segundos</strong> para agir: passou da hora, a mesa passa ou desiste por você. Se ficar sem
          agir em duas mãos seguidas, você fica de fora até voltar. Entre uma mão e outra dá para <strong>recarregar a banca</strong>.
          Ficou sem fichas e não recarregou? A mesa termina quando sobra só um jogador com fichas.
        </p>
      </section>
    </div>
  );
}

function TrucoRules() {
  return (
    <section className="space-y-3">
      <p className="glass px-4 py-3">
        <strong>1 contra 1</strong> ou <strong>2 contra 2</strong> (parceiros sentados frente a frente). Cada um recebe 3
        cartas e uma carta é virada na mesa: a <strong>vira</strong>. A <strong>manilha</strong> é o valor logo acima dela
        e ganha de tudo, por naipe: ♦ pica-fumo &lt; ♠ espadilha &lt; ♥ copas &lt; ♣ zap.
      </p>
      <p className="glass px-4 py-3">
        Fora as manilhas, a ordem é 4 &lt; 5 &lt; 6 &lt; 7 &lt; Q &lt; J &lt; K &lt; A &lt; 2 &lt; 3. Cartas de mesmo valor{' '}
        <strong>cangam</strong> (empatam).
      </p>
      <p className="glass px-4 py-3">
        A mão tem até 3 <strong>vazas</strong>; quem ganhar duas leva. Se a primeira cangar, quem ganhar a próxima leva. Se
        você ganhou a primeira, um empate depois não tira a mão de você.
      </p>
      <p className="glass px-4 py-3">
        Na sua vez, grite <strong>TRUCO!</strong> pra mão valer 3. O outro lado aceita, corre (você leva o que valia) ou
        aumenta pra <strong>seis</strong>, <strong>nove</strong> e <strong>doze</strong>. Quem pediu por último não pode
        pedir de novo.
      </p>
      <p className="glass px-4 py-3">
        <strong>Mão de onze:</strong> o time com 11 vê as cartas dos parceiros e decide se joga (vale 3) ou corre (o outro
        lado leva 1). Ninguém pede truco nela. <strong>Mão de ferro:</strong> os dois times com 11 jogam com as cartas
        viradas, no escuro.
      </p>
      <p className="glass px-4 py-3">
        <strong>Regra da casa, 3 palhaços:</strong> se as suas 3 cartas forem figuras (Dama, Valete ou Rei, em qualquer
        mistura), aparece o botão <strong>Trocar</strong> do lado da mão e você troca as 3 por cartas novas do baralho,
        enquanto ainda não jogou nenhuma. Na mão de ferro não vale.
      </p>
      <p className="glass px-4 py-3">
        <strong>Carta encoberta:</strong> da segunda vaza em diante, na sua vez, ligue <strong>Jogar encoberta</strong> e a
        próxima carta vai virada. Ela perde pra qualquer carta (duas encobertas cangam) e ninguém fica sabendo qual era: serve
        pra jogar fora uma carta sem mostrar o que você tinha.
      </p>
      <p className="glass px-4 py-3">
        Dá pra jogar <strong>1 contra 1</strong>, <strong>2 contra 2</strong> ou <strong>3 contra 3</strong>; os times se
        alternam na mesa. Quem fizer 12 pontos primeiro vence. Valendo dinheiro, o time vencedor divide o pote.
      </p>
    </section>
  );
}

function DuvidoRules() {
  return (
    <section className="space-y-3">
      <p className="glass px-4 py-3">
        De 2 a 6 jogadores, cada um por si. A cada rodada todo mundo recebe 5 cartas, uma carta é virada (a{' '}
        <strong>vira</strong>) e a mesa sorteia um <strong>valor</strong>, por exemplo &ldquo;Reis&rdquo;. A{' '}
        <strong>manilha</strong> (o valor logo acima da vira) é curinga e vale como qualquer valor.
      </p>
      <p className="glass px-4 py-3">
        Na sua vez, jogue de 1 a 3 cartas <strong>viradas pra baixo</strong> dizendo que são do valor da mesa. Pode ser
        verdade ou blefe. O próximo jogador escolhe: acredita e joga as dele, ou grita <strong>Duvido!</strong>. Quem
        ficou sem cartas só pode duvidar.
      </p>
      <p className="glass px-4 py-3">
        No &ldquo;Duvido!&rdquo; as cartas são desviradas. Se tinha mentira, quem jogou leva o castigo; se era tudo
        verdade, quem duvidou leva. A rodada acaba e começa outra com quem levou o castigo.
      </p>
      <p className="glass px-4 py-3">
        <strong>O castigo:</strong> cada um tem um pote com 6 balas, e uma delas é apimentada. Quem leva castigo tira
        uma bala. Se for doce, come e segue (o pote fica menor, então o risco sobe: 1 em 6, 1 em 5…). Se for a
        apimentada, está fora. O último que sobrar ganha.
      </p>
    </section>
  );
}

function BingoRules() {
  return (
    <section className="space-y-3">
      <p className="glass px-4 py-3">
        De 2 a 8 jogadores, cada um com uma cartela de 5×5: a coluna <strong>B</strong> tem números de 1 a 15, a{' '}
        <strong>I</strong> de 16 a 30, a <strong>N</strong> de 31 a 45, a <strong>G</strong> de 46 a 60 e a{' '}
        <strong>O</strong> de 61 a 75. O meio da cartela é livre e já vem marcado.
      </p>
      <p className="glass px-4 py-3">
        A mesa sorteia uma bola de cada vez, e os números que saem são marcados sozinhos na sua cartela.
      </p>
      <p className="glass px-4 py-3">
        Fechou uma <strong>linha</strong> (deitada, em pé ou na diagonal)? Aperte <strong>Linha!</strong> antes dos outros:
        vale 30% do pote. Cartela inteira marcada? Aperte <strong>Bingo!</strong>: vale 70% e acaba o jogo. Só o primeiro que
        cantar leva, e os bots só cantam uma bola depois de você.
      </p>
    </section>
  );
}
