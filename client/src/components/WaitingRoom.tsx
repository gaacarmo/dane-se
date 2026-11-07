import { motion } from 'framer-motion';
import { type ReactNode, useEffect, useState } from 'react';
import {
  GAME_CATALOG,
  type CommonTalentId,
  type DaneseRoomView,
  type GameType,
  type PokerRoomView,
  type PokerSettings,
  type RoomMember,
  type RoomView,
  CHARACTER_IDS,
  CHARACTER_KITS,
  COMMON_TALENT_IDS,
  COMMON_TALENTS,
  bigBlind,
  formatMoney,
  isPokerRoom,
  smallBlind,
  talentsFor,
  wordLetters,
} from '@dane-se/shared';
import { avatarColor, initial } from '../lib/avatar';
import { CHARACTER_NAMES, CHARACTER_COLORS, portraitUrl } from '../lib/characters';
import { actions, notify, roomLink } from '../lib/store';
import { ChatPanel } from './ChatPanel';
import { InviteFriends } from './InviteFriends';
import { VoiceButton } from './VoiceButton';
import { AppIcon, CircleButton, PrimaryButton, SectionHeader, Segmented, Switch, Symbols } from './hub/IosKit';

/** Nota de rodapé de uma seção agrupada, como no iOS. */
function Footnote({ children }: { children: ReactNode }) {
  return <p className="mt-2 px-4 text-[13px] leading-snug text-ios-label-2">{children}</p>;
}

/** Linha de uma lista agrupada: rótulo à esquerda, conteúdo à direita. */
function Row({ label, children, first = false }: { label: ReactNode; children?: ReactNode; first?: boolean }) {
  return (
    <div className={`flex min-h-12 items-center gap-3 px-4 py-2 ${first ? '' : 'border-t border-ios-separator'}`}>
      <span className="min-w-0 flex-1 text-[17px]">{label}</span>
      {children}
    </div>
  );
}

/** Etiqueta pequena e arredondada (dupla, anfitrião…). */
function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'blue' | 'gold' | 'green' | 'orange' }) {
  const tones = {
    neutral: 'bg-ios-fill text-ios-label-2',
    blue: 'bg-ios-blue/15 text-ios-blue',
    gold: 'bg-ios-yellow/15 text-ios-orange',
    green: 'bg-ios-green/15 text-ios-green',
    orange: 'bg-ios-orange/15 text-ios-orange',
  };
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold ${tones[tone]}`}>{children}</span>;
}

function memberStatus(m: RoomMember, arcade: boolean): string {
  if (!m.connected) return 'Sem sinal';
  if (m.isBot) return 'Bot';
  if (arcade) return m.talentsReady ? 'Kit pronto' : 'Escolhendo o kit…';
  if (m.isHost) return 'Anfitrião';
  return 'Pronto';
}

export function WaitingRoom({ room, onHelp }: { room: RoomView; onHelp: () => void }) {
  const isHost = room.hostId === room.youId;
  const link = roomLink(room.code);
  const game = GAME_CATALOG.find((g) => g.id === room.gameType)!;
  const allReady = !room.arcade || room.members.every((m) => m.talentsReady);
  const truco = room.gameType === 'truco';
  // Truco: as duas duplas precisam ter o mesmo tamanho (1x1 ou 2x2).
  const teamA = room.members.filter((m) => m.team === 0).length;
  const trucoOdd = truco && teamA * 2 !== room.members.length;
  const canStart = room.members.length >= game.minPlayers && allReady && !trucoOdd;
  const poker = isPokerRoom(room);
  const missing = Math.max(0, game.minPlayers - room.members.length);
  const host = room.members.find((m) => m.isHost);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: game.name, text: `Bora jogar ${game.name}! Sala ${room.code}`, url: link });
        return;
      } catch {
        // Cancelled: fall back to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      notify('Link copiado!', 'info');
    } catch {
      notify(`Compartilhe este link: ${link}`, 'info');
    }
  }

  const startLabel = canStart
    ? 'Começar partida'
    : missing > 0
      ? missing === 1
        ? 'Falta 1 jogador'
        : `Faltam ${missing} jogadores`
      : trucoOdd
        ? 'Duplas desiguais'
        : 'Esperando os kits';

  return (
    <main className="ios-hub relative min-h-full">
      <div className="ios-wallpaper" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-md px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-40">
        {/* Barra de navegação: voltar (sair) à esquerda, regras à direita. */}
        <nav className="relative z-40 flex items-center justify-between py-2">
          <button
            type="button"
            onClick={() => actions.leave()}
            className="-ml-1 flex min-h-11 items-center gap-0.5 pr-2 text-[17px] text-ios-blue"
          >
            <span className="rotate-180">{Symbols.chevron}</span>
            Sair
          </button>
          <div className="flex items-center gap-2">
            <VoiceButton buttonClassName="glass-control grid size-11 place-items-center rounded-full text-lg" />
            <ChatPanel room={room} opensDown className="relative z-40" buttonClassName="glass-control grid size-11 place-items-center rounded-full text-lg" />
            <CircleButton label="Regras" onClick={onHelp}>
              {Symbols.question}
            </CircleButton>
          </div>
        </nav>

        <header className="mt-2 mb-6 flex items-center gap-4">
          <AppIcon id={game.id as GameType} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="silver-text truncate text-[28px] leading-tight font-bold tracking-tight">{game.name}</h1>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Tag tone="neutral">Sala de espera</Tag>
              {room.money.practice && <Tag tone="blue">Treino</Tag>}
              {room.arcade && <Tag tone="orange">Arcade</Tag>}
            </div>
          </div>
        </header>

        <div className="space-y-7">
          {/* O código da sala, em destaque, com o botão de convidar. */}
          <section className="glass px-5 pt-4 pb-5 text-center" aria-label="Código da sala">
            <p className="text-[13px] text-ios-label-2">Código da sala</p>
            <p className="silver-text mt-1 text-[3.25rem] leading-none font-bold tracking-[0.18em] tabular-nums" aria-live="polite">
              {room.code}
            </p>
            <button
              type="button"
              onClick={share}
              className="glass-control mx-auto mt-4 flex min-h-11 items-center gap-2 rounded-full px-5 text-[17px] font-semibold text-ios-blue"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12" />
              </svg>
              Convidar
            </button>
          </section>

          {truco ? (
            <TeamsSection room={room} isHost={isHost} maxPlayers={game.maxPlayers} />
          ) : (
            <section>
              <SectionHeader>
                Jogadores {room.members.length} de {game.maxPlayers}
              </SectionHeader>
              <ul className="glass overflow-hidden">
                {room.members.map((m, i) => (
                  <MemberRow key={m.id} room={room} member={m} isHost={isHost} first={i === 0} />
                ))}
                {isHost && room.members.length < game.maxPlayers && <AddBotRow />}
              </ul>
              <Footnote>
                {missing > 0
                  ? `${missing === 1 ? 'Falta 1' : `Faltam ${missing}`} pra começar. Mande o código pra galera ou adicione um bot.`
                  : 'Com bot na mesa, a sala vira treino e ninguém paga entrada.'}
              </Footnote>
            </section>
          )}

          {poker ? <PokerMoneyPanel room={room} isHost={isHost} /> : <MoneyPanel room={room} isHost={isHost} />}

          <InviteFriends ios />

          <CharacterPicker room={room} />

          {room.gameType === 'danese' && (room.arcade || isHost) && <ArcadeSection room={room} isHost={isHost} />}

          {room.gameType === 'danese' && <Settings room={room} isHost={isHost} />}
        </div>
      </div>

      {/* Barra flutuante de vidro com a ação principal. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className="glass glass-thick w-full max-w-md rounded-[2rem]! p-2">
          {isHost ? (
            <PrimaryButton disabled={!canStart} onClick={() => actions.start()}>
              {startLabel}
            </PrimaryButton>
          ) : (
            <p className="flex min-h-[50px] items-center justify-center gap-2 text-[15px] text-ios-label-2">
              <span className="size-2 animate-pulse rounded-full bg-ios-green" aria-hidden />
              Esperando {host?.name ?? 'o anfitrião'} começar
            </p>
          )}
        </div>
      </div>

    </main>
  );
}

function MemberRow({
  room,
  member: m,
  isHost,
  first,
  onSwap,
}: {
  room: RoomView;
  member: RoomMember;
  isHost: boolean;
  first: boolean;
  /** Truco: o anfitrião troca um bot de dupla. */
  onSwap?: () => void;
}) {
  return (
    <motion.li layout className={`flex items-center gap-3 px-4 py-2.5 ${first ? '' : 'border-t border-ios-separator'}`}>
      <span
        aria-hidden
        className={`relative grid size-10 shrink-0 place-items-center rounded-full text-[17px] font-semibold text-white ${m.connected ? '' : 'opacity-50'}`}
        style={{ background: avatarColor(m.id) }}
      >
        {initial(m.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px]">
          {m.name}
          {m.id === room.youId && <span className="text-ios-label-2"> (você)</span>}
        </span>
        <span className={`block text-[13px] ${m.connected ? 'text-ios-label-2' : 'text-ios-red'}`}>{memberStatus(m, room.arcade)}</span>
      </span>
      {m.isHost && room.gameType !== 'truco' && <Tag tone="neutral">Anfitrião</Tag>}
      {onSwap && (
        <button type="button" onClick={onSwap} className="min-h-9 shrink-0 px-1 text-[15px] text-ios-blue" aria-label={`Trocar ${m.name} de dupla`}>
          Trocar
        </button>
      )}
      {isHost && m.id !== room.youId && (
        <button
          type="button"
          onClick={() => actions.kick(m.id)}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-ios-red text-white"
          aria-label={`Remover ${m.name}`}
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
            <path d="M6 12h12" />
          </svg>
        </button>
      )}
    </motion.li>
  );
}

function AddBotRow({ first = false, label = 'Adicionar bot' }: { first?: boolean; label?: string }) {
  return (
    <li className={first ? '' : 'border-t border-ios-separator'}>
      <button
        type="button"
        onClick={() => actions.addBot()}
        className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-[17px] text-ios-blue transition-colors active:bg-ios-fill"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ios-blue/15">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
            <path d="M12 6v12M6 12h12" />
          </svg>
        </span>
        {label}
      </button>
    </li>
  );
}

const TEAM_NAMES = ['Dupla A', 'Dupla B'] as const;

/** Truco: as duas duplas lado a lado; cada um escolhe a sua, e o anfitrião move os bots. */
function TeamsSection({ room, isHost, maxPlayers }: { room: RoomView; isHost: boolean; maxPlayers: number }) {
  const me = room.members.find((m) => m.id === room.youId);
  const sizes = [0, 1].map((t) => room.members.filter((m) => m.team === t).length);
  const even = sizes[0] === sizes[1];
  const [busy, setBusy] = useState(false);

  async function move(team: 0 | 1, playerId?: string) {
    setBusy(true);
    await actions.setTeam(team, playerId);
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      {([0, 1] as const).map((team) => {
        const members = room.members.filter((m) => m.team === team);
        const mine = me?.team === team;
        return (
          <section key={team} aria-label={TEAM_NAMES[team]}>
            <h2 className="mb-2 flex items-center gap-2 px-4 text-[15px] font-semibold text-ios-label-2">
              <span className={`size-2.5 rounded-full ${team === 0 ? 'bg-ios-orange' : 'bg-ios-blue'}`} aria-hidden />
              {TEAM_NAMES[team]}
              <span className="font-normal">{members.length === 1 ? '1 jogador' : `${members.length} jogadores`}</span>
              {mine && <Tag tone={team === 0 ? 'gold' : 'blue'}>Sua dupla</Tag>}
            </h2>
            <ul className="glass overflow-hidden">
              {members.map((m, i) => (
                <MemberRow
                  key={m.id}
                  room={room}
                  member={m}
                  isHost={isHost}
                  first={i === 0}
                  onSwap={isHost && m.isBot ? () => void move(team === 0 ? 1 : 0, m.id) : undefined}
                />
              ))}
              {!mine && me && (
                <li className={members.length > 0 ? 'border-t border-ios-separator' : ''}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void move(team)}
                    className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-[17px] font-semibold text-ios-blue transition-colors active:bg-ios-fill disabled:opacity-50"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ios-blue/15">
                      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M4 12h13M12 6l6 6-6 6" />
                      </svg>
                    </span>
                    Entrar na {TEAM_NAMES[team]}
                  </button>
                </li>
              )}
              {members.length === 0 && !me && <li className="px-4 py-3 text-[15px] text-ios-label-2">Ninguém ainda</li>}
            </ul>
          </section>
        );
      })}
      {isHost && room.members.length < maxPlayers && (
        <ul className="glass overflow-hidden">
          <AddBotRow first label="Adicionar bot na dupla menor" />
        </ul>
      )}
      <Footnote>
        {!even
          ? `As duplas precisam ter o mesmo tamanho pra começar: agora está ${sizes[0]} contra ${sizes[1]}.`
          : room.members.length < 2
            ? 'Chame alguém pra outra dupla ou adicione um bot.'
            : 'Parceiros sentam frente a frente. Dá pra jogar 1 contra 1 ou 2 contra 2.'}
      </Footnote>
    </div>
  );
}

function Settings({ room, isHost }: { room: DaneseRoomView; isHost: boolean }) {
  const [word, setWord] = useState(room.settings.word);
  const { settings } = room;
  const lives = wordLetters(settings.word).length;

  return (
    <section>
      <SectionHeader>Regras da mesa</SectionHeader>
      <div className="glass overflow-hidden">
        <Row label="Palavra" first>
          {isHost ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void actions.updateSettings({ word });
              }}
            >
              <input
                value={word}
                onChange={(e) => setWord(e.target.value.toUpperCase())}
                maxLength={20}
                className="min-h-9 w-32 rounded-lg bg-ios-fill px-2 text-right text-[17px] font-semibold tracking-widest focus:outline-none"
                aria-label="Palavra de vidas"
              />
              {word.trim() !== settings.word && (
                <button type="submit" className="min-h-9 px-1 text-[17px] font-semibold text-ios-blue">
                  OK
                </button>
              )}
            </form>
          ) : (
            <span className="text-[17px] font-semibold tracking-widest text-ios-label-2">{settings.word}</span>
          )}
        </Row>
        <div className="border-t border-ios-separator px-4 py-3">
          <p className="mb-2 text-[17px]">Máximo de cartas</p>
          <Segmented
            label="Máximo de cartas"
            options={[3, 4, 5, 6] as const}
            value={settings.maxCards as 3 | 4 | 5 | 6}
            onChange={(n) => void actions.updateSettings({ maxCards: n })}
            format={(n) => String(n)}
            layoutId="max-cards"
            disabled={!isHost}
          />
        </div>
        <div className="border-t border-ios-separator px-4 py-3">
          <p className="mb-2 text-[17px]">Sequência das rodadas</p>
          <Segmented
            label="Sequência das rodadas"
            options={['upDown', 'restart'] as const}
            value={settings.cardCountMode}
            onChange={(mode) => void actions.updateSettings({ cardCountMode: mode })}
            format={(m) => (m === 'upDown' ? 'Sobe e desce' : 'Volta pro 1')}
            layoutId="card-mode"
            disabled={!isHost}
          />
        </div>
      </div>
      <Footnote>
        {lives} letras, {lives} vidas: quem completar a palavra está fora.{isHost ? '' : ' Só o anfitrião muda essas regras.'}
      </Footnote>
    </section>
  );
}

function MoneyPanel({ room, isHost }: { room: RoomView; isHost: boolean }) {
  const game = GAME_CATALOG.find((g) => g.id === room.gameType)!;
  const paying = room.members.filter((m) => !m.isBot).length;
  const { entry } = room.money;

  return (
    <section>
      <SectionHeader>Entrada</SectionHeader>
      <div className="glass overflow-hidden">
        {room.money.practice ? (
          <Row label="Treino" first>
            <span className="text-[17px] text-ios-label-2">Ninguém paga</span>
          </Row>
        ) : (
          <>
            {isHost && room.status === 'lobby' && (
              <div className="px-4 py-3">
                <Segmented
                  label="Entrada por pessoa"
                  options={game.entryOptions}
                  value={entry}
                  onChange={(v) => void actions.updateSettings({ entry: v })}
                  format={(v) => formatMoney(v).replace('R$ ', '')}
                  layoutId="room-entry"
                />
              </div>
            )}
            <Row label="Por pessoa" first={!(isHost && room.status === 'lobby')}>
              <span className="text-[17px] text-ios-label-2 tabular-nums">{formatMoney(entry)}</span>
            </Row>
            <Row label="Pote">
              <span className="text-[17px] font-semibold tabular-nums">{formatMoney(entry * paying)}</span>
            </Row>
          </>
        )}
      </div>
      <Footnote>
        {room.money.practice
          ? 'Tem bot na mesa, então ninguém paga e nada vale dinheiro.'
          : `A entrada sai do seu saldo quando a partida começa. ${
              room.gameType === 'truco' ? 'A dupla que fizer 12 pontos divide o pote' : room.gameType === 'bingo' ? 'Quem cantar Linha leva 30% e quem cantar Bingo leva 70%' : 'Quem ficar até o fim leva o pote'
            }; quem sai no meio perde a entrada.`}
      </Footnote>
    </section>
  );
}

function PokerMoneyPanel({ room, isHost }: { room: PokerRoomView; isHost: boolean }) {
  const { settings, money } = room;
  const options = GAME_CATALOG.find((g) => g.id === 'poker')!.entryOptions.filter(
    (v) => v >= settings.minBuyIn && v <= settings.maxBuyIn,
  );
  const mins = [1000, 2500, 5000] as const;

  return (
    <section>
      <SectionHeader>Banca</SectionHeader>
      <div className="glass overflow-hidden">
        <div className="px-4 py-3">
          <p className="mb-2 flex items-baseline justify-between text-[17px]">
            Banca de cada um
            <span className="text-ios-label-2 tabular-nums">{money.practice ? 'Só fichas' : formatMoney(money.entry)}</span>
          </p>
          <Segmented
            label="Banca inicial"
            options={options}
            value={settings.entry}
            onChange={(v) => void actions.updateSettings({ entry: v, minBuyIn: settings.minBuyIn, maxBuyIn: settings.maxBuyIn })}
            format={(v) => formatMoney(v).replace('R$ ', '')}
            layoutId="poker-entry"
            disabled={!isHost}
          />
        </div>
        <div className="border-t border-ios-separator px-4 py-3">
          <p className="mb-2 text-[17px]">Banca mínima</p>
          <Segmented
            label="Banca mínima"
            options={mins}
            value={settings.minBuyIn as (typeof mins)[number]}
            onChange={(min) => void actions.updateSettings(blindsPatch(settings, min))}
            format={(v) => formatMoney(v).replace('R$ ', '')}
            layoutId="poker-min"
            disabled={!isHost}
          />
        </div>
        <Row label="Blinds">
          <span className="text-[17px] text-ios-label-2 tabular-nums">
            {formatMoney(smallBlind(settings.minBuyIn))} / {formatMoney(bigBlind(settings.minBuyIn))}
          </span>
        </Row>
      </div>
      <Footnote>
        {money.practice
          ? 'Sala de treino: ninguém paga nada, as fichas são de brincadeira.'
          : `A banca sai do seu saldo quando a partida começa; a máxima é ${formatMoney(settings.maxBuyIn)}. Entre as mãos dá pra recomprar.`}
      </Footnote>
    </section>
  );
}

/** Keeps `entry` inside the new [min, max] range so the server never rejects the patch. */
function blindsPatch(settings: PokerSettings, minBuyIn: number): Partial<PokerSettings> {
  const maxBuyIn = minBuyIn * 10;
  const entry = settings.entry >= minBuyIn && settings.entry <= maxBuyIn ? settings.entry : minBuyIn;
  return { minBuyIn, maxBuyIn, entry };
}

function CharacterPicker({ room }: { room: RoomView }) {
  const mine = room.members.find((m) => m.id === room.youId)?.character;
  return (
    <section>
      <SectionHeader>Seu personagem</SectionHeader>
      <div className="glass grid grid-cols-3 gap-3 p-3" role="radiogroup" aria-label="Seu personagem">
        {CHARACTER_IDS.map((id) => {
          const on = mine === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => actions.setCharacter(id)}
              className="group flex flex-col items-center gap-1.5 text-center"
            >
              <span
                className={`relative block aspect-square w-full overflow-hidden rounded-[1.1rem] bg-stone-100 transition ${
                  on ? 'ring-[3px] ring-ios-blue' : 'ring-1 ring-ios-separator group-hover:ring-ios-label-3'
                }`}
              >
                <img src={portraitUrl(id)} alt="" className="size-full object-cover object-top" />
                {on && (
                  <span className="absolute right-1.5 bottom-1.5 grid size-6 place-items-center rounded-full bg-ios-blue text-ios-on-tint ring-2 ring-white">
                    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                )}
              </span>
              <span className={`w-full truncate text-[13px] ${on ? 'font-semibold' : 'text-ios-label-2'}`}>{CHARACTER_NAMES[id]}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

const TALENT_ICONS: Record<CommonTalentId, string> = {
  escudo: '🛡️',
  radar: '📡',
  curinga: '🃏',
};

/** Ticks locally while a server deadline is in the future (0 when none is set). */
function useCountdown(deadline: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline === null ? 0 : Math.max(0, deadline - now);
}

/**
 * Arcade mode lives above the games: the host switches it on for the room, then
 * each player picks their common talents (the kit itself is fixed per character).
 * Talents stay private — only readiness is public.
 */
function ArcadeSection({ room, isHost }: { room: RoomView; isHost: boolean }) {
  const me = room.members.find((m) => m.id === room.youId);
  const character = me?.character;
  const need = character ? talentsFor(character) : 1;
  const pick = room.yourTalents;
  const ready = pick.length === need;
  const kit = character ? CHARACTER_KITS[character] : null;
  const gameKey = room.gameType === 'poker' ? 'poker' : 'danese';
  const seconds = Math.ceil(useCountdown(room.talentDeadline) / 1000);

  function toggle(id: CommonTalentId) {
    const next = pick.includes(id) ? pick.filter((t) => t !== id) : [...pick, id].slice(-need);
    void actions.setTalents(next);
  }

  return (
    <section>
      <SectionHeader>Modo arcade</SectionHeader>
      <div className="glass overflow-hidden">
        <Row label="Arcade" first>
          {room.arcade && room.talentDeadline !== null && (
            <span className={`text-[15px] tabular-nums ${seconds <= 10 ? 'font-semibold text-ios-orange' : 'text-ios-label-2'}`}>
              {seconds}s
            </span>
          )}
          {isHost ? (
            <Switch on={room.arcade} onChange={(v) => void actions.setArcade(v)} label="Modo arcade" />
          ) : (
            <span className="text-[17px] text-ios-label-2">{room.arcade ? 'Ligado' : 'Desligado'}</span>
          )}
        </Row>

        {room.arcade && kit && (
          <>
            <div className="flex items-start gap-3 border-t border-ios-separator px-4 py-3">
              <img
                src={portraitUrl(kit.character)}
                alt=""
                className="size-12 shrink-0 rounded-xl bg-stone-100 object-cover object-top"
                style={{ boxShadow: `0 0 0 2px ${CHARACTER_COLORS[kit.character]}` }}
              />
              <div className="min-w-0 text-[15px] leading-snug">
                <p className="font-semibold">{CHARACTER_NAMES[kit.character]}</p>
                <p className="text-ios-label-2">
                  <span className="font-semibold text-ios-label">{kit.passive.name}.</span> {kit.passive[gameKey]}
                </p>
                <p className="text-ios-label-2">
                  <span className="font-semibold text-ios-label">{kit.special.name}.</span> {kit.special[gameKey]}
                </p>
              </div>
            </div>
            {COMMON_TALENT_IDS.map((id) => {
              const def = COMMON_TALENTS[id];
              const on = pick.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  aria-pressed={on}
                  className="flex w-full items-center gap-3 border-t border-ios-separator px-4 py-2.5 text-left transition-colors active:bg-ios-fill"
                >
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[0.6rem] bg-ios-fill text-lg">
                    {TALENT_ICONS[id]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px]">{def.name}</span>
                    <span className="block text-[13px] text-ios-label-2">{def[gameKey]}</span>
                  </span>
                  {on && (
                    <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-ios-blue" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </button>
              );
            })}
          </>
        )}
      </div>
      <Footnote>
        {!room.arcade
          ? 'Cada personagem ganha uma passiva e um especial (1× por partida), e todo mundo escolhe talentos comuns.'
          : ready
            ? 'Seu kit está pronto.'
            : `Escolha ${need} talento${need === 1 ? '' : 's'}${need === 2 ? ' (você tá no Camarote!)' : ''}. ${
                room.talentDeadline !== null ? 'Se o tempo acabar, o servidor completa por você.' : ''
              }`}
      </Footnote>
    </section>
  );
}
