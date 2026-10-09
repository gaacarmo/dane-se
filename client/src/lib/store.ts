import { useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  LOOK_INTERVAL_MS,
  type Ack,
  type CharacterId,
  type ClientToServerEvents,
  type ErrorCode,
  type GameSettings,
  type GameType,
  type PokerSettings,
  type ProfileView,
  type FriendInvite,
  type Reaction,
  type SocialView,
  type RoomView,
  type ServerToClientEvents,
  type Session,
  ERROR_MESSAGES_PT,
  normalizeRoomCode,
} from '@dane-se/shared';

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const SESSION_KEY = 'dane-se:session';
const NAME_KEY = 'dane-se:name';
const PROFILE_KEY = 'dane-se:profile-token';

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode / storage disabled: reconnection just won't survive a refresh.
  }
}

export function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

/** The wallet token kept on this device; lets a returning player find their money. */
export function savedProfileToken(): string | null {
  try {
    return localStorage.getItem(PROFILE_KEY);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Routing (one route: /sala/CODE)
// ---------------------------------------------------------------------------

export function codeFromUrl(): string | null {
  const match = /^\/sala\/([A-Za-z]{4,5})\/?$/.exec(window.location.pathname);
  return match ? normalizeRoomCode(match[1]!) : null;
}

function setUrl(code: string | null): void {
  const path = code ? `/sala/${code}` : '/';
  if (window.location.pathname !== path) window.history.replaceState(null, '', path);
}

export function roomLink(code: string): string {
  return `${window.location.origin}/sala/${code}`;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export type Connection = 'connecting' | 'connected' | 'offline';

export interface Notice {
  id: number;
  kind: 'error' | 'info';
  text: string;
}

export interface ClientState {
  connection: Connection;
  /** True once we've been trying to connect for a while (free host waking up). */
  slowConnect: boolean;
  /** True until the first resume attempt finishes, to avoid flashing the home screen. */
  resuming: boolean;
  /** The player's wallet profile, once `profile:hello` has resolved. */
  profile: ProfileView | null;
  /** False while a returning player's wallet is still loading. */
  profileReady: boolean;
  room: RoomView | null;
  notice: Notice | null;
  /** Emoji reactions currently floating over the table. */
  reactions: Reaction[];
  /** Friend code, friends, requests and the ranking (pushed by the server). */
  social: SocialView | null;
  /** Friends calling you to their table, newest last. */
  invites: FriendInvite[];
}

const hadSavedProfile = savedProfileToken() !== null || savedName() !== '';

let state: ClientState = {
  connection: 'connecting',
  slowConnect: false,
  resuming: readJson<Session>(SESSION_KEY) !== null,
  profile: null,
  profileReady: !hadSavedProfile,
  room: null,
  notice: null,
  reactions: [],
  social: null,
  invites: [],
};
const listeners = new Set<() => void>();

function setState(patch: Partial<ClientState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useClient(): ClientState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

let noticeId = 0;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

export function notify(text: string, kind: Notice['kind'] = 'error'): void {
  clearTimeout(noticeTimer);
  setState({ notice: { id: ++noticeId, kind, text } });
  noticeTimer = setTimeout(() => setState({ notice: null }), 5000);
}

export function dismissNotice(): void {
  setState({ notice: null });
}

// ---------------------------------------------------------------------------
// Socket
// ---------------------------------------------------------------------------

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
});

let slowTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => setState({ slowConnect: true }), 3000);

function leaveRoomLocally(message?: string): void {
  writeStorage(SESSION_KEY, null);
  setState({ room: null, resuming: false });
  setUrl(null);
  if (message) notify(message, 'info');
}

socket.on('connect', () => {
  clearTimeout(slowTimer);
  setState({ connection: 'connected', slowConnect: false });
  void ensureProfile();
  void resumeSaved();
});

socket.on('disconnect', () => {
  setState({ connection: 'offline' });
  clearTimeout(slowTimer);
  slowTimer = setTimeout(() => setState({ slowConnect: true }), 3000);
});

socket.on('profile:state', (profile) => setState({ profile }));
socket.on('social:state', (social) => setState({ social }));
/** An invite stays up for a minute; a new one from the same friend replaces it. */
const INVITE_VISIBLE_MS = 60_000;
socket.on('friend:invite', (invite) => {
  setState({ invites: [...state.invites.filter((i) => i.fromId !== invite.fromId), invite] });
  setTimeout(() => setState({ invites: state.invites.filter((i) => i.id !== invite.id) }), INVITE_VISIBLE_MS);
});

socket.on('room:state', (room) => {
  setState({ room, resuming: false });
  setUrl(room.code);
});

socket.on('room:closed', (reason) => {
  leaveRoomLocally(
    reason === 'idle'
      ? 'A sala foi encerrada por inatividade.'
      : 'A sala foi encerrada porque todos saíram.',
  );
});

socket.on('room:kicked', () => leaveRoomLocally('O anfitrião removeu você da sala.'));

/** A look older than this is ignored (the player stopped moving or left). */
const LOOK_STALE_MS = 5000;
const REACTION_VISIBLE_MS = 2800;

/** Where each other player is looking (first person). Read every frame, so kept outside React state. */
const looks = new Map<string, { yaw: number; pitch: number; at: number }>();
socket.on('room:look', ({ playerId, yaw, pitch }) => looks.set(playerId, { yaw, pitch, at: Date.now() }));

/** A player's recent head direction (-1..1 each), or null if they haven't moved it lately. */
export function getLook(playerId: string): { yaw: number; pitch: number } | null {
  const look = looks.get(playerId);
  return look && Date.now() - look.at < LOOK_STALE_MS ? look : null;
}

let lastLookSent = 0;
let lastLook = { yaw: 0, pitch: 0 };
/** Shares where you're looking; throttled and skipped when nothing changed. */
export function sendLook(yaw: number, pitch: number): void {
  const now = Date.now();
  if (now - lastLookSent < LOOK_INTERVAL_MS + 20) return;
  if (Math.abs(yaw - lastLook.yaw) < 0.03 && Math.abs(pitch - lastLook.pitch) < 0.03 && now - lastLookSent < 2000) return;
  lastLookSent = now;
  lastLook = { yaw, pitch };
  socket.emit('look:update', { yaw, pitch });
}

socket.on('room:reaction', (reaction) => {
  setState({ reactions: [...state.reactions, reaction] });
  setTimeout(() => setState({ reactions: state.reactions.filter((r) => r.id !== reaction.id) }), REACTION_VISIBLE_MS);
});

/**
 * Loads the wallet on connect. A returning device sends its token; a device
 * that only remembers a nickname asks for a fresh profile under that name.
 */
async function ensureProfile(): Promise<void> {
  const token = savedProfileToken();
  const name = savedName();
  if (!token && !name) {
    setState({ profileReady: true });
    return;
  }
  const result = await call<{ token: string; profile: ProfileView }>('profile:hello', {
    token: token ?? undefined,
    nickname: name || undefined,
  });
  if (result.ok) {
    writeStorage(PROFILE_KEY, result.token);
    setState({ profile: result.profile, profileReady: true });
  } else {
    // No way to reach the old wallet (new server, bad token): start clean.
    writeStorage(PROFILE_KEY, null);
    setState({ profile: null, profileReady: true });
  }
}

async function resumeSaved(): Promise<void> {
  const saved = readJson<Session>(SESSION_KEY);
  const urlCode = codeFromUrl();
  if (!saved || (urlCode && urlCode !== saved.code)) {
    setState({ resuming: false });
    return;
  }
  const result = await call<Session>('room:resume', { code: saved.code, token: saved.token });
  if (result.ok) return;
  leaveRoomLocally(
    result.error === 'ROOM_NOT_FOUND'
      ? 'Essa sala não existe mais — o servidor pode ter dormido ou reiniciado. Crie uma nova sala e chame a galera de novo!'
      : 'Não encontramos seu lugar nessa sala. Entre de novo pelo código.',
  );
}

function call<T = object>(event: keyof ClientToServerEvents, ...args: unknown[]): Promise<Ack<T>> {
  return new Promise((resolve) => {
    if (!socket.connected) {
      resolve({ ok: false, error: 'INVALID_PAYLOAD' as ErrorCode });
      notify('Sem conexão com o servidor. Tentando reconectar…');
      return;
    }
    (socket.emit as (...a: unknown[]) => void)(event, ...args, resolve);
  });
}

/** Sends an action; shows the pt-BR error message on failure. */
async function send<T = object>(event: keyof ClientToServerEvents, ...args: unknown[]): Promise<Ack<T>> {
  const result = await call<T>(event, ...args);
  if (!result.ok && socket.connected) notify(ERROR_MESSAGES_PT[result.error] ?? 'Algo deu errado.');
  return result;
}

function remember(session: Session): void {
  writeStorage(SESSION_KEY, JSON.stringify(session));
}

export const actions = {
  /** Creates or resumes the wallet, keeping the (possibly new) token on this device. */
  async hello(nickname: string): Promise<boolean> {
    const r = await send<{ token: string; profile: ProfileView }>('profile:hello', { nickname });
    if (!r.ok) return false;
    writeStorage(PROFILE_KEY, r.token);
    writeStorage(NAME_KEY, r.profile.nickname);
    setState({ profile: r.profile, profileReady: true });
    return true;
  },
  async rename(nickname: string): Promise<boolean> {
    const r = await send<{ profile: ProfileView }>('profile:rename', { nickname });
    if (!r.ok) return false;
    writeStorage(NAME_KEY, r.profile.nickname);
    setState({ profile: r.profile });
    return true;
  },
  addFriend: (code: string) => send('friend:add', { code }),
  respondFriend: (id: string, accept: boolean) => send('friend:respond', { id, accept }),
  removeFriend: (id: string) => send('friend:remove', { id }),
  inviteFriend: (id: string) => send('friend:invite', { id }),
  dismissInvite(id: string): void {
    setState({ invites: state.invites.filter((i) => i.id !== id) });
  },
  /** Joins the table a friend called you to (leaving yours first if needed). */
  async acceptInvite(invite: FriendInvite): Promise<boolean> {
    actions.dismissInvite(invite.id);
    if (state.room) await actions.leave();
    return actions.joinRoom(invite.code);
  },
  /** The secret that opens this profile on another device. */
  recoveryCode(): string | null {
    return savedProfileToken();
  },
  /** Switches this device to the profile behind a recovery code. */
  async recover(code: string): Promise<boolean> {
    const token = code.trim();
    if (!token) return false;
    const r = await call<{ token: string; profile: ProfileView }>('profile:hello', { token });
    if (!r.ok || r.token !== token) {
      notify('Código de recuperação inválido.');
      return false;
    }
    writeStorage(PROFILE_KEY, r.token);
    writeStorage(NAME_KEY, r.profile.nickname);
    setState({ profile: r.profile, profileReady: true });
    notify(`Pronto! Você entrou como ${r.profile.nickname}.`, 'info');
    return true;
  },
  async refill(): Promise<boolean> {
    const r = await send<{ profile: ProfileView }>('profile:refill');
    if (!r.ok) return false;
    setState({ profile: r.profile });
    return true;
  },
  async createRoom(opts: { gameType?: GameType; settings?: Record<string, unknown> } = {}): Promise<boolean> {
    const r = await send<Session>('room:create', { name: state.profile?.nickname, ...opts });
    if (r.ok) remember(r);
    return r.ok;
  },
  async joinRoom(code: string): Promise<boolean> {
    const r = await send<Session>('room:join', { code: normalizeRoomCode(code), name: state.profile?.nickname });
    if (r.ok) remember(r);
    return r.ok;
  },
  async leave(): Promise<void> {
    await call('room:leave');
    leaveRoomLocally();
  },
  updateSettings: (patch: Partial<GameSettings> & Partial<PokerSettings>) => send('room:settings', patch),
  start: () => send('room:start'),
  chat: (text: string) => send('chat:send', { text }),
  setCharacter: (character: CharacterId) => send('room:character', { character }),
  kick: (playerId: string) => send('room:kick', { playerId }),
  addBot: () => send('room:addBot'),
  skipWaiting: () => send('room:skipWaiting'),
  rematch: () => send('room:rematch'),
  bet: (bet: number) => send('game:bet', { bet }),
  /** Named, amount-free action (poker: `fold`/`check`/`call`/`allIn`). */
  action: (type: string, amount?: number) => send('game:action', { type, amount }),
  /** Between-hands rebuy; the amount defaults to the room buy-in on the server. */
  rebuy: (amount?: number) => send('game:action', { type: 'rebuy', amount }),
  play: (cardId?: string) => send('game:play', { cardId }),
  /** Fire and forget: a reaction that's too fast is simply dropped, no error toast. */
  react: (emoji: string) => call('room:react', { emoji }),
};
