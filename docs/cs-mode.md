# Modo CS

Jogo do hub: tiro em primeira pessoa, 2 times, plantar e desarmar bomba. Design em
`docs/superpowers/specs/2026-10-28-cs-mode-design.md`.

## Como entrar

Card **Modo CS** na lista de jogos do hub, sem entrada e sem prêmio. Dois caminhos:

- **Treinar sozinho contra bots**: abre direto, o motor roda no navegador.
- **Criar sala com amigos**: gera um código de 4 letras (e um link). Quem recebe o código usa "Entrar com código" no hub
  (o mesmo campo do Dane-se e do poker) ou abre o link.

## Controles (desktop)

| Tecla | Ação |
| --- | --- |
| WASD | mover |
| Shift | andar devagar e em silêncio |
| Mouse | olhar (clique na tela para travar o mouse) |
| Botão esquerdo | atirar |
| Espaço | pular |
| C | agachar (Ctrl não, porque Ctrl+W fecha a aba) |
| R | recarregar |
| 1 / 2 / roda do mouse | troca para a principal, para a secundária ou alterna |
| E (segurar) | plantar ou desarmar a bomba |
| B | abrir ou fechar o mercado (só na fase de compra); os dígitos da lista compram (1 a 6 armas, depois colete, colete e capacete, e o kit de desarme na defesa) |
| Tab | abre/fecha o mapa de cima com o placar (cursor livre; clique no mapa para pingar) |
| Q | pinga o ponto para onde você está olhando |
| Esc | menu: continuar, desistir (na sala é votação do time), sair |
| Clique (morto) | troca o colega que você observa |

## Fases da rodada

1. **Compra** (15 s): todos parados, mercado aberto.
2. **Preparação** (25 s): um portão azul separa os times. Cada lado anda e se posiciona no seu pedaço do mapa, sem atirar e sem plantar; os inimigos não aparecem do outro lado.
3. **Ação** (5 min): o portão cai. Os atacantes bots esperam uns 14 s no ponto de espera e entram juntos; os defensores seguram os pontos.
4. **Bomba plantada** (40 s): atacantes guardam a bomba e os defensores correm para desarmar.

Os bots têm dificuldade (`easy`, `normal` e `hard`; o padrão é `normal`): reação, erro de mira, giro, controle de recuo e
chance de mirar a cabeça. No normal um bot leva em média ~1,4 s para matar um alvo parado a 10 m.

## Regras

- Times de 3. Os bots completam os times; sozinho você joga no time A, na sala cada um escolhe o seu.
- Rodada: 15 s de compra, até 5 min de jogo. A bomba explode 40 s depois de plantada.
- Lados trocam a cada 3 rodadas: o time A ataca nas rodadas 1 a 3, defende nas 4 a 6 e volta a atacar na 7. Na troca o dinheiro, as armas e o equipamento voltam ao início, os spawns mudam de ponta do mapa e a tela
  avisa "Troca de lados". O HUD mostra a rodada e o seu lado o tempo todo.
- Vence quem abrir 4 rodadas de diferença ou chegar a 7 rodadas ganhas.
- Dinheiro só da partida: vitória 3250; derrota 1400 + 500 por derrota seguida (até 4); bônus de 800 ao ataque
  derrotado com a bomba plantada; 300 por abate, por plantar e por desarmar.
- Os jogadores são os personagens do Dane-se, sorteados por partida (um por jogador), desenhados como figuras estáticas que
  encaram a câmera.
- Hitbox por zona, igual para todos os personagens: pernas, corpo e cabeça, com a cabeça mais estreita que os ombros.
- Mapa (Tab): mostra o seu time, os pontos A e B e a bomba plantada, nunca os inimigos. Pings: Atenção, Inimigo e Ir para
  cá; duram 8 s, no máximo 3 por jogador.
- Sem colete nem capacete, headshot mata com tudo, menos a pistola inicial, e a sniper mata com um tiro no corpo. Sem fogo amigo.
- Equipamento (mercado, só na compra): colete $650, colete e capacete $1000 (cobra só o que falta: $350 se já tem o colete
  cheio, $650 se já tem o capacete e o colete gastou) e kit de desarme $400, só na defesa. O colete cobre o corpo e deixa
  passar uma parte do dano que depende da arma (pistola 60%, submetralhadora 65%, fuzil 77,5%, sniper 97%) e se gasta; a
  cabeça só é coberta com capacete (um headshot do Tabelinha deixa 7 de vida, o do Cartão Vermelho ainda mata); as pernas
  nunca. O capacete some junto com o colete. Com o kit o desarme leva 3,5 s em vez de 7 s, e quem já está desarmando
  continua quando um colega chega. Quem sobrevive à rodada leva o equipamento; quem morre perde. Os bots compram colete e
  kit depois da arma, se sobrar dinheiro (inclusive o bot que assume o lugar de quem saiu durante a compra).

## Multiplayer

**Lobby** (`CsLobby`): código e link para copiar, times A e B lado a lado (vagas vazias mostram "Bot completa este lugar"),
cada um troca de time antes de começar, escolhe o personagem (os já escolhidos ficam bloqueados), o anfitrião define a
dificuldade dos bots, chama amigos e inicia. Quem fecha a aba no lobby sai da lista; no meio da partida um bot assume o
lugar e o jogador volta pelo mesmo link (token guardado no navegador). Entrar numa partida em andamento por código não é
possível (`GAME_IN_PROGRESS`); só volta quem já estava.

**Partida**: o servidor decide tudo (`server/src/cs/csRooms.ts`), em passos de 1/60 s. O cliente manda uma entrada por
passo (`cs:input`) e recebe um snapshot a cada 3 passos (`cs:snapshot`, 20 Hz).

- O seu corpo é previsto no cliente com o mesmo código do servidor (`predictBody`) e refeito a cada confirmação; os outros
  são interpolados 100 ms atrás. Sem compensação de lag nos tiros: o servidor acerta no estado dele.
- Cada um recebe só o que pode saber (`buildSnapshot`): o seu time sempre (vida, dinheiro, equipamento), os inimigos só se
  um colega vivo os enxerga por linha de visão (com 250 ms de memória), nada deles na compra e na preparação. Passos de
  inimigos fora de vista chegam só como som (`heard`), tiros fora de vista só como som, e os abates são públicos.
- O olhar do spawn vale até o cliente confirmar a rodada (`round` na entrada), senão cada rodada começaria olhando para o
  norte com o olhar da rodada anterior.
- Morto, a câmera acompanha um colega vivo (clique troca). O placar (Tab) mostra abates e mortes dos dois times e dinheiro e
  arma só do seu.
- Desistir é votação da maioria dos humanos conectados do time (um humano sozinho desiste com um voto). No fim, o
  anfitrião escolhe "Jogar de novo" e todos voltam ao lobby com os mesmos times.
- Voz: só entre o seu time (`voice:*`, WebRTC). Pings do mapa chegam só ao seu time.

Eventos do protocolo: `cs:create`, `cs:join`, `cs:resume`, `cs:leave`, `cs:team`, `cs:difficulty`, `cs:character`,
`cs:kick`, `cs:start`, `cs:rematch`, `cs:input`, `cs:buy` (`{ item }`: arma ou equipamento), `cs:ping`, `cs:forfeit`; do
servidor `cs:lobby`, `cs:started`, `cs:snapshot`, `cs:ping`, `cs:forfeit`, `cs:closed`.

Para testar sem esperar os 40 s de compra e preparação: nos testes do servidor `server.cs.advance(code, ms)` roda a partida
adiante; no navegador (DEV) `window.__csDebug` expõe o fluxo, o motor e a fonte da partida.

## Estado

Cantina, 1 a 6 humanos (3 por time) com bots completando, desktop, multiplayer em sala por código. O motor puro está em
`shared/src/cs/`, o servidor em `server/src/cs/` e a tela em `client/src/components/cs/`.

Ainda não feito: celular (layout PUBG clássico, com assistência de mira), Estacionamento e Terminal Boqueirão, granadas
(fumaça e luz), largar arma para o colega, entrar numa partida em andamento no lugar de um bot, previsão dos próprios
tiros (o som e o coice do tiro esperam o próximo snapshot, ~50 ms mais a latência) e interpolação do corpo local entre os
passos de 1/60 s.
