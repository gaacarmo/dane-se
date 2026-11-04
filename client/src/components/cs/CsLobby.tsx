import {
  CHARACTER_IDS,
  canJoinTeam,
  type CsLobbyView,
  type CsMember,
  type Difficulty,
  type TeamId,
} from '@dane-se/shared';
import { CHARACTER_NAMES, portraitUrl } from '../../lib/characters';
import { actions, notify, roomLink } from '../../lib/store';
import { InviteFriends } from '../InviteFriends';
import { Button } from '../ui/Button';

const TEAM_COLOR: Record<TeamId, string> = { A: '#4a7a8c', B: '#a8703c' };
const DIFFICULTIES: { id: Difficulty; label: string; hint: string }[] = [
  { id: 'easy', label: 'Fácil', hint: 'Bots lentos e imprecisos' },
  { id: 'normal', label: 'Normal', hint: 'Bots que erram como gente' },
  { id: 'hard', label: 'Difícil', hint: 'Bots rápidos e certeiros' },
];

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify(done, 'info');
  } catch {
    notify(text, 'info');
  }
}

function MemberRow({ member, lobby }: { member: CsMember; lobby: CsLobbyView }) {
  const mine = member.id === lobby.youId;
  const isHost = lobby.hostId === lobby.youId;
  return (
    <li className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${mine ? 'bg-gold-400/10 ring-1 ring-gold-400/40' : 'bg-black/25'}`}>
      <img src={portraitUrl(member.character)} alt="" className="size-9 shrink-0 rounded-full bg-black/40 object-cover object-top ring-1 ring-white/15" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">
          {member.name}
          {mine && <span className="ml-1.5 text-xs font-normal text-gold-300">você</span>}
        </span>
        <span className="block truncate text-[11px] text-stone-400">
          {CHARACTER_NAMES[member.character]}
          {!member.connected && ' · desconectado'}
        </span>
      </span>
      {member.isHost && (
        <span title="Anfitrião" aria-label="Anfitrião">
          👑
        </span>
      )}
      {isHost && !mine && (
        <button
          type="button"
          onClick={() => void actions.csKick(member.id)}
          className="grid size-7 place-items-center rounded-lg text-stone-400 hover:bg-white/10 hover:text-white"
          title={`Remover ${member.name}`}
          aria-label={`Remover ${member.name}`}
        >
          ✕
        </button>
      )}
    </li>
  );
}

function TeamColumn({ team, lobby }: { team: TeamId; lobby: CsLobbyView }) {
  const members = lobby.members.filter((m) => m.team === team);
  const mine = lobby.members.find((m) => m.id === lobby.youId);
  const here = mine?.team === team;
  const bots = Math.max(0, lobby.teamSize - members.length);
  const open = !here && canJoinTeam(lobby.members, lobby.youId, team);
  return (
    <section className="hub-panel space-y-2.5 p-3.5" aria-label={`Time ${team}`}>
      <header className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold tracking-wide text-white uppercase">
          <span className="size-3 rounded-full" style={{ background: TEAM_COLOR[team] }} aria-hidden />
          Time {team}
        </h2>
        <span className="text-[11px] text-stone-400">
          {members.length}/{lobby.teamSize} jogadores
        </span>
      </header>
      <ul className="space-y-1.5">
        {members.map((m) => (
          <MemberRow key={m.id} member={m} lobby={lobby} />
        ))}
        {Array.from({ length: bots }, (_, i) => (
          <li key={`bot-${i}`} className="flex items-center gap-2.5 rounded-xl border border-dashed border-white/10 px-2.5 py-2 text-sm text-stone-500">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-black/25 text-base">🤖</span>
            Bot completa este lugar
          </li>
        ))}
      </ul>
      {!here && (
        <Button variant="secondary" className="w-full" disabled={!open} onClick={() => void actions.csTeam(team)}>
          {open ? 'Entrar neste time' : 'Time cheio'}
        </Button>
      )}
    </section>
  );
}

/** Sala do modo CS antes de começar: código para chamar a galera, times, personagem e dificuldade. */
export function CsLobby({ lobby }: { lobby: CsLobbyView }) {
  const isHost = lobby.hostId === lobby.youId;
  const me = lobby.members.find((m) => m.id === lobby.youId);
  const takenBy = new Map(lobby.members.map((m) => [m.character, m.id]));

  return (
    <main className="room-bg min-h-full px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="hub-panel space-y-3 p-4 text-center">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-stone-400 uppercase">Modo CS · código da sala</p>
          <p className="font-display text-6xl font-bold tracking-[0.3em] gold-text" aria-label={`Código ${lobby.code.split('').join(' ')}`}>
            {lobby.code}
          </p>
          <p className="text-sm text-stone-300">Mande o código ou o link: quem entrar escolhe o time. Os bots completam o que faltar.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => void copy(lobby.code, 'Código copiado!')}>Copiar código</Button>
            <Button variant="secondary" onClick={() => void copy(roomLink(lobby.code), 'Link copiado!')}>
              Copiar link
            </Button>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          <TeamColumn team="A" lobby={lobby} />
          <TeamColumn team="B" lobby={lobby} />
        </div>

        <section className="hub-panel space-y-2.5 p-3.5" aria-label="Seu personagem">
          <h2 className="text-sm font-semibold text-stone-200">Seu personagem</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {CHARACTER_IDS.map((id) => {
              const owner = takenBy.get(id);
              const mine = me?.character === id;
              const blocked = !!owner && !mine;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={blocked}
                  onClick={() => void actions.csCharacter(id)}
                  aria-pressed={mine}
                  className={`flex flex-col items-center gap-1 rounded-xl p-2 text-[11px] transition ${
                    mine ? 'bg-gold-400/15 ring-2 ring-gold-400' : 'bg-black/25 ring-1 ring-white/10 hover:bg-white/10'
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <img src={portraitUrl(id)} alt="" className="size-12 rounded-full bg-black/40 object-cover object-top" />
                  <span className="max-w-full truncate text-stone-200">{CHARACTER_NAMES[id].split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="hub-panel space-y-2.5 p-3.5" aria-label="Dificuldade dos bots">
          <h2 className="text-sm font-semibold text-stone-200">Dificuldade dos bots</h2>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                type="button"
                disabled={!isHost}
                onClick={() => void actions.csDifficulty(d.id)}
                aria-pressed={lobby.difficulty === d.id}
                className={`rounded-xl px-2 py-2.5 text-center transition ${
                  lobby.difficulty === d.id ? 'bg-gold-400/15 ring-2 ring-gold-400' : 'bg-black/25 ring-1 ring-white/10'
                } ${isHost ? 'hover:bg-white/10' : 'cursor-default'}`}
              >
                <span className="block text-sm font-bold text-white">{d.label}</span>
                <span className="block text-[11px] text-stone-400">{d.hint}</span>
              </button>
            ))}
          </div>
          {!isHost && <p className="text-[11px] text-stone-500">Só o anfitrião muda a dificuldade.</p>}
        </section>

        <InviteFriends names={lobby.members.map((m) => m.name)} />

        <div className="flex flex-col gap-2 sm:flex-row">
          {isHost ? (
            <Button className="flex-1" onClick={() => void actions.csStartMatch()}>
              Começar partida
            </Button>
          ) : (
            <p className="flex-1 rounded-xl bg-black/25 px-4 py-3 text-center text-sm text-stone-300">Aguardando o anfitrião começar…</p>
          )}
          <Button variant="ghost" onClick={() => void actions.leave()}>
            Sair da sala
          </Button>
        </div>
        <p className="pb-4 text-center text-[11px] text-stone-500">
          Quem sair no meio da partida é substituído por um bot. Se a conexão cair, dá para voltar pelo mesmo link.
        </p>
      </div>
    </main>
  );
}
