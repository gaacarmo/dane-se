# Modo CS

Jogo do hub: tiro em primeira pessoa, 2 times, plantar e desarmar bomba. Design em
`docs/superpowers/specs/2026-10-28-cs-mode-design.md`.

## Como entrar

Card **Modo CS** na lista de jogos do hub. Abre direto, sem sala, sem entrada e sem prêmio.

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
| B | abrir ou fechar o mercado (só na fase de compra); 1 a 6 compram a arma da linha |
| Tab | abre/fecha o mapa de cima (cursor livre; clique no mapa para pingar) |
| Q | pinga o ponto para onde você está olhando |
| Esc | menu: continuar, desistir, sair |

## Fases da rodada

1. **Compra** (15 s): todos parados, mercado aberto.
2. **Preparação** (25 s): um portão azul separa os times. Cada lado anda e se posiciona no seu pedaço do mapa, sem atirar e sem plantar; os inimigos não aparecem do outro lado.
3. **Ação** (5 min): o portão cai. Os atacantes bots esperam uns 14 s no ponto de espera e entram juntos; os defensores seguram os pontos.
4. **Bomba plantada** (40 s): atacantes guardam a bomba e os defensores correm para desarmar.

Os bots têm dificuldade (`easy`, `normal` e `hard`; o padrão é `normal`): reação, erro de mira, giro, controle de recuo e
chance de mirar a cabeça. No normal um bot leva em média ~1,4 s para matar um alvo parado a 10 m.

## Regras

- Times de 3. Os bots completam os times; você joga no time A.
- Rodada: 15 s de compra, até 5 min de jogo. A bomba explode 40 s depois de plantada.
- Lados trocam a cada 3 rodadas, e nessa troca o dinheiro e as armas voltam ao início.
- Vence quem abrir 4 rodadas de diferença ou chegar a 7 rodadas ganhas.
- Dinheiro só da partida: vitória 3250; derrota 1400 + 500 por derrota seguida (até 4); bônus de 800 ao ataque
  derrotado com a bomba plantada; 300 por abate, por plantar e por desarmar.
- Os jogadores são os personagens do Dane-se, sorteados por partida (um por jogador), desenhados como figuras estáticas que
  encaram a câmera.
- Hitbox por zona, igual para todos os personagens: pernas, corpo e cabeça, com a cabeça mais estreita que os ombros.
- Mapa (Tab): mostra o seu time, os pontos A e B e a bomba plantada, nunca os inimigos. Pings: Atenção, Inimigo e Ir para
  cá; duram 8 s, no máximo 3 por jogador.
- Headshot mata com tudo, menos a pistola inicial; a sniper mata com um tiro no corpo. Sem fogo amigo.

## Estado

Etapa 1: Cantina, 1 jogador contra bots, desktop, rodando no navegador. O motor está em `shared/src/cs/`.

Próximas etapas: multiplayer em times no servidor, forfeit votado, mapa e ping; depois voz por time, celular
(layout PUBG clássico, com assistência de mira), Estacionamento e Terminal Boqueirão.
