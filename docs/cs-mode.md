# Modo CS

Jogo escondido no hub: tiro em primeira pessoa, 2 times, plantar e desarmar bomba. Design em
`docs/superpowers/specs/2026-10-28-cs-mode-design.md`.

## Como entrar

Dê 5 cliques seguidos, em até 2 s, no título "Dane-se" do hub. Não há dica na tela.

## Controles (desktop)

| Tecla | Ação |
| --- | --- |
| WASD | mover |
| Mouse | olhar (clique na tela para travar o mouse) |
| Botão esquerdo | atirar |
| Espaço | pular |
| C ou Ctrl esquerdo | agachar |
| R | recarregar |
| E (segurar) | plantar ou desarmar a bomba |
| B | abrir ou fechar o mercado (só na fase de compra) |
| Esc | menu: continuar, desistir, sair |

## Regras

- Times de 3. Os bots completam os times; você joga no time A.
- Rodada: 15 s de compra, até 5 min de jogo. A bomba explode 40 s depois de plantada.
- Lados trocam a cada 3 rodadas, e nessa troca o dinheiro e as armas voltam ao início.
- Vence quem abrir 4 rodadas de diferença ou chegar a 7 rodadas ganhas.
- Dinheiro só da partida: vitória 3250; derrota 1400 + 500 por derrota seguida (até 4); bônus de 800 ao ataque
  derrotado com a bomba plantada; 300 por abate, por plantar e por desarmar.
- Headshot mata com tudo, menos a pistola inicial; a sniper mata com um tiro no corpo. Sem fogo amigo.

## Estado

Etapa 1: Cantina, 1 jogador contra bots, desktop, rodando no navegador. O motor está em `shared/src/cs/`.

Próximas etapas: multiplayer em times no servidor, forfeit votado, mapa e ping; depois voz por time, celular
(layout PUBG clássico, com assistência de mira), Estacionamento e Terminal Boqueirão.
