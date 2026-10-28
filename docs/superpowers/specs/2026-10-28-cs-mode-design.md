# Modo CS — design

Jogo escondido dentro do hub: tiro em primeira pessoa, 2 times, plantar e desarmar bomba, no estilo CS / Rainbow Six. Sem skills na v1. Nomes, armas e mapas são originais (sem marca de terceiros).

## Entrada

- Clique escondido num detalhe discreto do hub (ícone ou título). Não aparece em `GAME_CATALOG`.
- Sem entrada, sem pote, sem movimentação de R$. Não entra no ranking do hub.

## Jogadores e times

- Até 6 humanos, usando os mesmos personagens do Dane-se. Dois times (3x3 no máximo).
- Se os times ficam desiguais, o time menor recebe bots até igualar.
- Bots têm que jogar bem: mira, rota, cobertura, plantar e desarmar com noção. Navegação por pontos (waypoints) por mapa e regras táticas simples (decisão do builder: sem IA pesada).

## Partida

- Ataque planta a bomba, defesa impede ou desarma.
- Rodada: 15 s de compra, até 5 min de jogo. Bomba explode 40 s após plantada. (Escolha minha.)
- Lados trocam a cada 3 rodadas. (Escolha minha.)
- Vitória: o vencedor precisa de 4 rodadas de diferença sobre o adversário (4 a 0, 5 a 1, 6 a 2) ou chegar a 7 rodadas ganhas, o que vier primeiro. Confirmado pelo usuário.
- Forfeit votado pelo time, abrir mapa e pingar (marcar local para o time).
- Sorteio de mapa depois de montados os times, com tela rápida mostrando o sorteado.

## Mapas (3, feitos de blocos)

1. Cantina de faculdade
2. Estacionamento
3. Terminal Boqueirão (nome definido pelo usuário)

Cada um com pontos de bomba A e B, spawn de ataque e de defesa, e waypoints para os bots.

## Economia e armas

- Dinheiro só da partida: começa baixo (só pistola). Vitória paga mais que derrota, derrotas seguidas dão bônus crescente, plantar e desarmar rendem. (Valores são do builder.)
- Mercado por categoria: pistola, submetralhadora, fuzil, sniper. Quem morre perde a arma; quem sobrevive pode guardar.
- Sem granadas na v1. Nomes de armas inventados, tema boteco/futebol, como no modo Arcade.
- Tiro no estilo CS/Valorant/R6: headshot mata com a maioria das armas, sniper mata com um tiro no corpo, corpo com dano menor, pernas menor ainda. Recuo e dispersão crescem ao se mover e em rajada. Fogo amigo desligado.
- Servidor decide todo acerto e dano.

## Técnica (decidida pelo builder, aprovada pelo usuário)

- Servidor autoritativo, tick ~20 Hz, no socket.io existente. Motor puro em `shared/` quando possível.
- Cliente: three.js (já no projeto), primeira pessoa, previsão de movimento no cliente.
- Mapas como dados (caixas), compartilhados entre cliente e servidor.
- Render free (Virginia) dá ~120–180 ms do Brasil: jogável, sem prometer experiência de CS real. Cloudflare Tunnel local melhora.

## Controles

- **Desktop:** WASD, mouse, clique atira, R recarrega, E planta/desarma, B mercado, M mapa, Q ping.
- **Celular:** tela cheia e deitado (iPhone: preencher a viewport e pedir para girar, pois o Safari não tem tela cheia real). Layout "PUBG clássico": joystick à esquerda; atirar, pular, agachar, mirar e recarregar à direita; arrastar o meio/direita da tela para olhar; mapa, ping, microfone e menu nos cantos; botão de bomba só perto do ponto.
- Assistência de mira leve no celular: aumenta um pouco a área de acerto, sem grudar no inimigo.

## Voz

Chat de voz só com o próprio time, reaproveitando o que o Dane-se já tem.

## Etapas (cada uma jogável)

1. Cantina, 1 jogador contra bots, desktop: movimento, tiro, mercado, bomba, rodadas e placar.
2. Multiplayer em times, bots de equilíbrio, forfeit, mapa e ping.
3. Voz por time, controles de celular, Estacionamento e Terminal Boqueirão.

## Fora de escopo

Skills, granadas, ranking, dinheiro real/fictício da carteira, anti-cheat além de servidor autoritativo.

## Anti-metas

Jogo que dá vantagem a quem tem ping melhor por falha de design; bot burro; nome ou arte que copie marca.
