import { randomInt } from 'node:crypto';
import {
  type ErrorCode,
  FRIEND_CODE_ALPHABET,
  FRIEND_CODE_LENGTH,
  type GameType,
  type RankingRow,
  type SocialView,
  normalizeFriendCode,
} from '@dane-se/shared';
import type { FriendshipRow, ProfileRow, WalletStore } from './store.js';

/** Who is online and who is sitting at a table; the room manager knows, the store doesn't. */
export interface Presence {
  online(profileId: string): boolean;
  inRoom(profileId: string): boolean;
}

/** One human's outcome in a finished money game, for the ranking. */
export interface GameOutcome {
  profileId: string;
  gameType: GameType;
  /** Dane-se: finished first. */
  won: boolean;
  /** Poker: what they took out minus what they put in. */
  profit: number;
}

const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

/** Friend codes, friend requests and the ranking among friends. */
export class SocialService {
  constructor(
    private readonly store: WalletStore,
    private readonly now: () => number = Date.now,
  ) {}

  /** The profile's friend code, given out the first time it's needed. */
  friendCode(profile: ProfileRow): string {
    if (profile.friendCode) return profile.friendCode;
    let code: string;
    do {
      code = Array.from({ length: FRIEND_CODE_LENGTH }, () => FRIEND_CODE_ALPHABET[randomInt(FRIEND_CODE_ALPHABET.length)]).join('');
    } while (this.store.findProfileByFriendCode(code));
    this.store.saveProfile({ ...profile, friendCode: code });
    return code;
  }

  private friendship(a: string, b: string): FriendshipRow | undefined {
    const [x, y] = pair(a, b);
    return this.store.friendships(x).find((f) => f.a === x && f.b === y);
  }

  areFriends(a: string, b: string): boolean {
    return this.friendship(a, b)?.status === 'accepted';
  }

  /** Accepted friends' ids. */
  friendIds(profileId: string): string[] {
    return this.store
      .friendships(profileId)
      .filter((f) => f.status === 'accepted')
      .map((f) => (f.a === profileId ? f.b : f.a));
  }

  /** Everyone whose hub shows this profile (friends and pending requests). */
  relatedIds(profileId: string): string[] {
    return this.store.friendships(profileId).map((f) => (f.a === profileId ? f.b : f.a));
  }

  /** Sends a request, or accepts the one they had already sent you. Returns the other profile. */
  add(profileId: string, rawCode: unknown): { other: ProfileRow } | { error: ErrorCode } {
    if (typeof rawCode !== 'string') return { error: 'INVALID_PAYLOAD' };
    const other = this.store.findProfileByFriendCode(normalizeFriendCode(rawCode));
    if (!other) return { error: 'FRIEND_NOT_FOUND' };
    if (other.id === profileId) return { error: 'FRIEND_SELF' };
    const existing = this.friendship(profileId, other.id);
    if (existing?.status === 'accepted') return { error: 'ALREADY_FRIENDS' };
    const [a, b] = pair(profileId, other.id);
    if (existing && existing.requestedBy !== profileId) {
      this.store.saveFriendship({ ...existing, status: 'accepted', at: this.now() });
    } else if (!existing) {
      this.store.saveFriendship({ a, b, requestedBy: profileId, status: 'pending', at: this.now() });
    }
    return { other };
  }

  respond(profileId: string, otherId: unknown, accept: unknown): ErrorCode | null {
    if (typeof otherId !== 'string' || typeof accept !== 'boolean') return 'INVALID_PAYLOAD';
    const existing = this.friendship(profileId, otherId);
    if (!existing || existing.status !== 'pending' || existing.requestedBy === profileId) return 'FRIEND_NOT_FOUND';
    if (accept) this.store.saveFriendship({ ...existing, status: 'accepted', at: this.now() });
    else this.store.deleteFriendship(existing.a, existing.b);
    return null;
  }

  remove(profileId: string, otherId: unknown): ErrorCode | null {
    if (typeof otherId !== 'string') return 'INVALID_PAYLOAD';
    const existing = this.friendship(profileId, otherId);
    if (!existing) return 'NOT_FRIENDS';
    this.store.deleteFriendship(existing.a, existing.b);
    return null;
  }

  view(profile: ProfileRow, presence: Presence): SocialView {
    const nickname = (id: string) => this.store.getProfile(id)?.nickname ?? '?';
    const friends = [];
    const incoming = [];
    const outgoing = [];
    for (const f of this.store.friendships(profile.id)) {
      const id = f.a === profile.id ? f.b : f.a;
      if (f.status === 'accepted') {
        friends.push({ id, nickname: nickname(id), online: presence.online(id), inRoom: presence.inRoom(id) });
      } else if (f.requestedBy === profile.id) {
        outgoing.push({ id, nickname: nickname(id) });
      } else {
        incoming.push({ id, nickname: nickname(id) });
      }
    }
    friends.sort((x, y) => Number(y.online) - Number(x.online) || x.nickname.localeCompare(y.nickname));

    const ranking: RankingRow[] = [profile.id, ...friends.map((f) => f.id)].map((id) => {
      const stats = this.store.getStats(id);
      return { id, nickname: id === profile.id ? profile.nickname : nickname(id), isYou: id === profile.id, ...stats };
    });
    return { friendCode: this.friendCode(profile), friends, incoming, outgoing, ranking };
  }

  /** Adds a finished money game to each player's totals. */
  record(outcomes: readonly GameOutcome[]): void {
    for (const o of outcomes) {
      const stats = this.store.getStats(o.profileId);
      if (o.gameType === 'danese') {
        stats.daneseGames += 1;
        if (o.won) stats.daneseWins += 1;
      } else {
        stats.pokerGames += 1;
        stats.pokerProfit += o.profit;
      }
      this.store.setStats(o.profileId, stats);
    }
  }
}
