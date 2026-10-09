import { useEffect, useSyncExternalStore } from 'react';
import type { VoiceSignal } from '@dane-se/shared';
import { notify, socket, useClient } from './store';

/**
 * Voice chat: a WebRTC call between every pair of players in voice (fine for a 2–8 player table). The server only
 * relays the signaling messages; the audio goes straight between browsers. Only public STUN is used, so on some
 * strict networks (symmetric NAT) two players may not hear each other.
 */
const ICE_SERVERS: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

export interface VoiceState {
  /** You are in the voice chat. */
  joined: boolean;
  joining: boolean;
  muted: boolean;
  /** Other players currently in voice. */
  peers: string[];
}

let state: VoiceState = { joined: false, joining: false, muted: false, peers: [] };
const listeners = new Set<() => void>();
function set(patch: Partial<VoiceState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

let localStream: MediaStream | null = null;
const connections = new Map<string, RTCPeerConnection>();
const audios = new Map<string, HTMLAudioElement>();
/** ICE candidates that arrived before the remote description. */
const pendingCandidates = new Map<string, RTCIceCandidateInit[]>();

function sendSignal(to: string, data: VoiceSignal): void {
  socket.emit('voice:signal', { to, data });
}

function connectionFor(peerId: string): RTCPeerConnection {
  let pc = connections.get(peerId);
  if (pc) return pc;
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  connections.set(peerId, pc);
  for (const track of localStream?.getTracks() ?? []) pc.addTrack(track, localStream!);
  pc.onicecandidate = (e) => {
    if (e.candidate) sendSignal(peerId, { type: 'candidate', candidate: e.candidate.toJSON() });
  };
  pc.ontrack = (e) => {
    let audio = audios.get(peerId);
    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      audios.set(peerId, audio);
    }
    audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
    void audio.play().catch(() => {});
  };
  pc.onconnectionstatechange = () => {
    if (pc!.connectionState === 'failed') dropPeer(peerId);
  };
  return pc;
}

function dropPeer(peerId: string): void {
  connections.get(peerId)?.close();
  connections.delete(peerId);
  pendingCandidates.delete(peerId);
  const audio = audios.get(peerId);
  if (audio) {
    audio.srcObject = null;
    audios.delete(peerId);
  }
  set({ peers: state.peers.filter((p) => p !== peerId) });
}

async function call(peerId: string): Promise<void> {
  const pc = connectionFor(peerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sendSignal(peerId, { type: 'description', description: { type: 'offer', sdp: offer.sdp ?? '' } });
}

async function flushCandidates(peerId: string, pc: RTCPeerConnection): Promise<void> {
  for (const c of pendingCandidates.get(peerId) ?? []) await pc.addIceCandidate(c).catch(() => {});
  pendingCandidates.delete(peerId);
}

socket.on('voice:signal', async ({ from, data }) => {
  if (!state.joined) return;
  try {
    if (data.type === 'description') {
      const pc = connectionFor(from);
      await pc.setRemoteDescription(data.description);
      await flushCandidates(from, pc);
      if (data.description.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal(from, { type: 'description', description: { type: 'answer', sdp: answer.sdp ?? '' } });
      }
      if (!state.peers.includes(from)) set({ peers: [...state.peers, from] });
    } else {
      const pc = connections.get(from);
      if (pc?.remoteDescription) await pc.addIceCandidate(data.candidate);
      else pendingCandidates.set(from, [...(pendingCandidates.get(from) ?? []), data.candidate]);
    }
  } catch (err) {
    console.warn('voice signal failed', err);
  }
});

// Newcomers call everyone already in voice, so the ones already in just wait for the offer.
socket.on('voice:joined', ({ playerId }) => {
  if (state.joined && !state.peers.includes(playerId)) set({ peers: [...state.peers, playerId] });
});
socket.on('voice:left', ({ playerId }) => dropPeer(playerId));
socket.on('disconnect', () => leaveVoice(false));

export async function joinVoice(): Promise<void> {
  if (state.joined || state.joining) return;
  set({ joining: true });
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    set({ joining: false });
    notify('Não deu pra usar o microfone. Libere o acesso no navegador e tente de novo.');
    return;
  }
  socket.emit('voice:join', (result) => {
    if (!result.ok) {
      leaveVoice(false);
      notify('Não deu pra entrar no chat de voz.');
      return;
    }
    set({ joined: true, joining: false, muted: false, peers: result.peers });
    for (const peer of result.peers) void call(peer).catch((err) => console.warn('voice call failed', err));
  });
}

export function leaveVoice(tellServer = true): void {
  if (tellServer && state.joined) socket.emit('voice:leave', () => {});
  for (const peer of [...connections.keys()]) dropPeer(peer);
  for (const track of localStream?.getTracks() ?? []) track.stop();
  localStream = null;
  set({ joined: false, joining: false, muted: false, peers: [] });
}

export function toggleMute(): void {
  const muted = !state.muted;
  for (const track of localStream?.getAudioTracks() ?? []) track.enabled = !muted;
  set({ muted });
}

export function useVoice(): VoiceState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Leaves voice when you leave the room. */
export function useLeaveVoiceWithRoom(): void {
  const { room } = useClient();
  const inRoom = !!room;
  useEffect(() => {
    if (!inRoom && state.joined) leaveVoice();
  }, [inRoom]);
}
