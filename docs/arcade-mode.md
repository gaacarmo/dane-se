# Modo Arcade

Modo opcional por sala em que cada personagem traz um **kit de habilidades**. Vale
nos dois jogos (Dane-se e Pôquer Texas Hold'em). Sem o modo ligado, nada muda.

## Estrutura

Cada jogador entra com:

| Peça | Quantas | Quando age |
| --- | --- | --- |
| **Passiva** | 1 (fixa do personagem) | sempre ligada |
| **Especial** | 1 (fixa do personagem) | **1× por partida** |
| **Talento comum** | 1 escolhido no começo (2 para o Carmelo) | conforme o talento |

- **Especiais recarregam 1× por partida.**
- **Talentos comuns:** um **mesmo trio** é oferecido a todos; cada um escolhe **um**
  (o trio padrão é Escudo / Radar / Curinga). Personagens como o Carmelo podem
  escolher mais de um talento.

## Visibilidade

- **Kit privado:** passiva, talento e o efeito do especial **não** são anunciados.
- **Único sinal público:** se o especial ainda está **carregado** — a "aura" no
  avatar (dourada acesa = carregado; apaga quando usado).
- **Revelação por gatilho:** quando uma passiva dispara visivelmente (Sarney
  sobrevive além do letal, Zumbi do Dezin volta...), o efeito se revela sozinho.
  O segredo é pré-partida, não pós-evento.
- Decisão v1: passiva/especial são **fixos por personagem** (quem conhece o
  elenco sabe o que vem). O segredo real é o **talento comum**; a aura só diz
  "ainda tem especial".

## Unidades

- **Dane-se:** cartas, apostas (palpite de vazas), **letras** (dano), vidas.
- **Poker:** cartas (hole/board), fichas, pote, ruas.
- **Termo comum:**
  - **escudo** = nega um dano (1 letra no Dane-se / devolve as fichas de 1 mão perdida no poker).
  - **espia** = vê uma carta oculta de um oponente (1×, e some).
  - **troca** = substitui uma carta sua (ou pega a de alguém).

## Kits

### Carmelo — "O Bonzão"
- **Passiva "Sou o Bonzão":** escolhe **2 talentos comuns** em vez de 1.
- **Especial "NUOSSA!":** Dane-se → depois das apostas, troca a própria aposta;
  Poker → vê 1 hole card de um oponente escolhido.

### Martelo — blefador, politiqueiro, xereta
- **Passiva "Xereta":** Dane-se → 1× por rodada espia 1 carta aleatória de um
  adversário; Poker → no início da mão vê 1 hole card de um oponente.
- **Especial "A Safadeza":** Dane-se → troca 1 carta da mão com um adversário;
  Poker → troca 1 hole card com um oponente escolhido.

### Babin Tom Sahur (Babington) — atrapalha e se atrapalha
- **Passiva "Encrenca":** habilidades que afetam outros têm **40%** de voltar nele.
- **Especial "A Bomba":** Dane-se → embaralha as apostas (todos re-apostam);
  Poker → **bomb pot** (todos entram com um ante e a mão começa gorda — pode
  queimar ele também).

### Dezin du Couto — azarado, boa visão, volta da morte
- **Passiva "Zumbi":** Dane-se → a 1ª vez que seria eliminado, sobrevive (volta
  pra 1 letra abaixo do letal); Poker → a 1ª vez que quebraria, sobrevive com 1 ficha.
- **Especial "Visão de Jogo":** Dane-se → vê a próxima carta do baralho e 1 carta
  de um oponente; Poker → vê o board adiantado (flop/turn/river) antes de decidir.

### Sarney — esquenta e dura
- **Passiva "Esquenta":** precisa de **+2 letras** pra ser eliminado (com
  DANE-SE, cai só na 8ª); Poker → começa com **+25% de fichas**.
- **Especial "Deixa Esquentar":** Dane-se → cancela uma letra que você ganharia;
  Poker → recupera as fichas apostadas na última mão perdida.

### Colombo — sacana + fareja o gato
- **Passiva "Farejador de Gato":** Dane-se → aviso quando alguém que apostou ≥1
  já não consegue mais bater a aposta (tá "deixando passar de gato"); Poker →
  indicador de blefe provável (aposta inconsistente com a banca/histórico).
- **Especial "Pega o Gato!":** acusa um jogador. Se for gato: alvo leva o castigo
  (Dane-se +1 letra; Poker paga multa em fichas). Se errar, o castigo é seu.

## Talentos comuns (trio padrão)

1. **Escudo** — Dane-se: anula 1 letra; Poker: devolve as fichas de 1 mão perdida.
2. **Radar** — Dane-se: 1× vê 1 carta oculta de um oponente; Poker: 1× vê 1 hole card.
3. **Curinga** — Dane-se: 1× troca/refaz uma carta sua; Poker: 1× troca as 2 hole
   cards antes do flop.

## Arquitetura (server-authoritative, motores puros)

- O **modo é um flag de sala** (`arcade`) + um **loadout por membro**
  (`{ character, talents }`). Isso vive na camada de sala, não no `GameSettings`
  de cada jogo.
- O motor recebe os loadouts no `create(...)` e guarda o estado arcade dentro do
  próprio `GameState` (continua puro, sem I/O e sem timers).
- A `viewFor(...)` é a única porta: revela ao viewer **só o próprio kit** e, de
  todos, apenas `specialCharged` (a aura).
- **No lobby**, cada jogador escolhe os talentos do seu personagem; o servidor
  valida contra o personagem (1, ou 2 para o Carmelo) e publica só **"kit pronto"**
  por membro — nunca a escolha.
- Helpers puros em `shared/src/arcade/` (tipos, catálogo, tuning, estado).
- O RNG dos efeitos aleatórios (ex.: backfire do Babin) usa o RNG semeado do
  motor — nunca `Math.random`.

### Arquivos

- `shared/src/arcade/types.ts` — ids, loadout e estado arcade.
- `shared/src/arcade/catalog.ts` — kits dos 6 personagens + talentos comuns.
- `shared/src/arcade/tuning.ts` — números balanceáveis.
- `shared/src/arcade/state.ts` — criação/consulta do estado arcade (puro).

## Roadmap

1. ✅ **Fundação:** tipos, catálogo, tuning, helpers puros, testes, spec.
2. ✅ **Motor Dane-se:** loadout no `create`, buffer de eliminação (Esquenta),
   Zumbi, apostas do Carmelo, trocas (Safadeza/Curinga), espia (Xereta/Radar),
   aviso de gato, acusação, bomb/backfire.
3. **Motor Poker:** equivalentes por rua (espia hole card, board adiantado, bomb
   pot, troca de hole cards, escudo de fichas, multa do gato).
4. ✅ **Sala:** flag `arcade` na criação e no lobby, validação/escolha de talentos,
   aura no `PlayerView`/protocolo (`specialCharged` público, kit privado).
5. **UI:** aura no avatar 2D (feito); barra de habilidades em jogo, com atalhos de
   teclado (1..n), escolha de aposta e bandeja de espionagem (feito). Alvo é
   apontado no próprio jogador: a cadeira dele acende e basta clicar (feito, 2D e 3D).
   Faltam: aura no avatar 3D e animações dos especiais.

## Números em aberto (balancear depois)

- Backfire do Babin (40%?) e se o "erro" também dói nele no Colombo.
- Esquenta: +2 letras é forte; talvez +1 e uma passiva secundária.
- Bonzão: 2 talentos pode ser muito; alternativa é 1 talento + uma troca grátis.
- Bomb pot: valor do ante e se pode queimar o próprio Babin.
