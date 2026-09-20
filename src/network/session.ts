import { MAX_TRANSFER, peerMessage, serverMessage, type Member, type Pose, type Signal } from './protocol';

interface Peer {
  audioSender?: RTCRtpSender;
  id: string; pc: RTCPeerConnection; data?: RTCDataChannel; poses?: RTCDataChannel;
  candidates: RTCIceCandidateInit[]; incoming: Promise<void>; signaling: Promise<void>;
  receiving?: { kind: 'room' | 'avatar'; buffer: Uint8Array; offset: number; hash: string; started: number };
  received: Set<string>; queued: number; ready: boolean; opened: boolean; deadline: number; rate: number; rateStart: number;
  controlRate: number; controlStart: number;
  ack?: { kind: 'room' | 'avatar'; resolve: () => void; reject: () => void };
}
export interface SessionEvents {
  audio: (id: string, track: MediaStreamTrack) => void;
  voice: (id: string, enabled: boolean) => void;
  room: (bytes: ArrayBuffer) => Promise<void>;
  avatar: (id: string, bytes: ArrayBuffer) => Promise<void>;
  members: (members: Member[], self: string, host: string, ready: Set<string>) => void;
  pose: (id: string, pose: Pose) => void;
  remove: (id: string) => void;
  status: (message: string) => void;
  closed: (reason: string) => void;
  invitation: (token: string) => void;
}
export function signalingUrl() {
  if (location.protocol === 'file:') return 'wss://openvroom.com/room/signal';
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/room/signal`;
}
async function digest(bytes: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
}
export class RoomSession {
  private ws?: WebSocket;
  private peers = new Map<string, Peer>();
  private roster: Member[] = [];
  private self = ''; private host = '';
  private iceServers: RTCIceServer[] = [];
  private relayOnly = false;
  private stopped = false;
  private ready = false;
  private poses = new Map<string, Pose>();
  private timer?: ReturnType<typeof setInterval>;
  private roomHash?: Promise<string>; private avatarHash?: Promise<string>;
  private started = Date.now();
  private audioTrack: MediaStreamTrack | null = null;
  private audioQueue: Promise<void> = Promise.resolve();
  constructor(private assets: { room: ArrayBuffer; avatar?: ArrayBuffer }, private events: SessionEvents) {}

  connect(name: string, token?: string) {
    this.ready = !token;
    this.roomHash = token ? undefined : digest(this.assets.room);
    this.avatarHash = this.assets.avatar ? digest(this.assets.avatar) : undefined;
    const ws = this.ws = new WebSocket(signalingUrl());
    ws.onopen = () => ws.send(JSON.stringify(token ? { type: 'join', version: 2, name, token } : { type: 'create', version: 2, name, shortInvite: true }));
    ws.onmessage = event => {
      try {
        if (typeof event.data !== 'string' || event.data.length > 20000) throw new Error();
        const msg = serverMessage.parse(JSON.parse(event.data));
        if (msg.type === 'error') return this.close(msg.message);
        if (msg.type === 'closed') return this.close(msg.reason);
        if (msg.type === 'welcome') {
          this.self = msg.self; this.host = msg.host; this.iceServers = msg.iceServers; this.relayOnly = msg.relayOnly;
          this.updateMembers(msg.members); this.events.invitation(msg.token);
          this.events.status(this.ready ? '招待リンクを送って、友だちを待ちましょう。' : 'ホストと接続中…');
        } else if (msg.type === 'members') this.updateMembers(msg.members);
        else {
          const peer = this.peers.get(msg.from); if (!peer) return;
          peer.signaling = peer.signaling.then(() => this.signal(peer, msg.payload)).catch(() => this.failPeer(peer, '接続の準備に失敗しました。'));
        }
      } catch { this.close('サーバーから不正な応答を受信しました。'); }
    };
    ws.onerror = () => this.close('接続サーバーに到達できません。時間をおいて再試行してください。');
    ws.onclose = () => this.close('サーバーとの接続が切れました。入室し直してください。');
    this.timer = setInterval(() => {
      if (!this.self && Date.now() - this.started > 15000) this.close('接続がタイムアウトしました。');
      for (const peer of this.peers.values()) {
        if ((!peer.opened && Date.now() > peer.deadline) || (peer.receiving && Date.now() - peer.receiving.started > 180000)) this.failPeer(peer, '接続またはファイル受信がタイムアウトしました。');
      }
    }, 1000);
  }
  private sendSignal(to: string, payload: Signal) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'signal', to, payload }));
  }
  private emitMembers() {
    const ready = new Set([...this.peers.values()].filter(p => p.ready).map(p => p.id));
    if (this.ready) ready.add(this.self);
    this.events.members(this.roster, this.self, this.host, ready);
  }
  private updateMembers(members: Member[]) {
    this.roster = members;
    for (const [id, peer] of this.peers) if (!members.some(m => m.id === id)) this.removePeer(peer);
    for (const member of members) {
      if (member.id === this.self || this.peers.has(member.id)) continue;
      const pc = new RTCPeerConnection({ iceServers: this.iceServers, iceTransportPolicy: this.relayOnly ? 'relay' : 'all' });
      const peer: Peer = { id: member.id, pc, candidates: [], incoming: Promise.resolve(), signaling: Promise.resolve(), received: new Set(), queued: 0, ready: false, opened: false, deadline: Date.now() + 45000, rate: 0, rateStart: Date.now(), controlRate: 0, controlStart: Date.now() };
      this.peers.set(member.id, peer);
      pc.onicecandidate = event => { if (event.candidate) this.sendSignal(peer.id, { kind: 'candidate', candidate: { ...event.candidate.toJSON(), candidate: event.candidate.candidate } }); };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') this.failPeer(peer, '相手との通信が切れました。入室し直してください。'); };
      pc.ondatachannel = event => this.channel(peer, event.channel);
      pc.ontrack = event => {
        if (event.track.kind !== 'audio' || this.stopped || this.peers.get(peer.id) !== peer) { event.track.stop(); return; }
        this.events.audio(peer.id, event.track);
      };
      if (this.self < peer.id) {
        this.channel(peer, pc.createDataChannel('assets'));
        this.channel(peer, pc.createDataChannel('poses', { ordered: false, maxRetransmits: 0 }));
        peer.signaling = peer.signaling.then(async () => {
          pc.addTransceiver('audio', { direction: 'sendrecv' });
          await this.configureAudio(peer);
          await pc.setLocalDescription(await pc.createOffer());
          this.sendSignal(peer.id, { kind: 'description', description: { type: 'offer', sdp: pc.localDescription!.sdp } });
        }).catch(() => this.failPeer(peer, '接続の準備に失敗しました。'));
      }
    }
    this.emitMembers();
  }
  private async signal(peer: Peer, payload: Signal) {
    if (payload.kind === 'candidate') {
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(payload.candidate);
      else { if (peer.candidates.length >= 100) throw new Error(); peer.candidates.push(payload.candidate); }
      return;
    }
    await peer.pc.setRemoteDescription(payload.description);
    for (const candidate of peer.candidates.splice(0)) await peer.pc.addIceCandidate(candidate);
    if (payload.description.type === 'offer') {
      await this.configureAudio(peer);
      await peer.pc.setLocalDescription(await peer.pc.createAnswer());
      this.sendSignal(peer.id, { kind: 'description', description: { type: 'answer', sdp: peer.pc.localDescription!.sdp } });
    }
  }
  private channel(peer: Peer, channel: RTCDataChannel) {
    if (!['assets', 'poses'].includes(channel.label) || (channel.label === 'assets' ? peer.data : peer.poses)) { channel.close(); return; }
    channel.binaryType = 'arraybuffer';
    if (channel.label === 'poses') {
      peer.poses = channel;
      channel.onmessage = event => {
        try {
          if (typeof event.data !== 'string' || event.data.length > 4096) throw new Error();
          // A long render task can deliver several seconds of queued poses at once.
          // Drop excess updates; the next snapshot supersedes them.
          if (!this.allowPose(peer)) return;
          const msg = peerMessage.parse(JSON.parse(event.data));
          if (msg.type === 'pose' && this.self === this.host && peer.ready) {
            this.poses.set(peer.id, msg.pose); this.events.pose(peer.id, msg.pose);
          } else if (msg.type === 'poses' && peer.id === this.host && this.ready) {
            for (const { id, pose } of msg.poses) if (id !== this.self && this.roster.some(member => member.id === id)) this.events.pose(id, pose);
          }
        } catch { this.failPeer(peer, '不正な移動データを受信しました。'); }
      };
      return;
    }
    peer.data = channel;
    channel.onopen = () => { peer.opened = true; this.send(peer, { type: 'hello' }); this.send(peer, { type: 'voice', enabled: !!this.audioTrack }); if (this.ready) this.send(peer, { type: 'ready' }); };
    channel.onclose = () => { setTimeout(() => { if (!this.stopped && this.peers.get(peer.id) === peer) this.failPeer(peer, '相手との通信が切れました。'); }, 1500); };
    channel.onmessage = event => {
      const data = event.data;
      const bytes = data instanceof ArrayBuffer ? data.byteLength : typeof data === 'string' ? data.length * 2 : MAX_TRANSFER;
      peer.queued += bytes;
      if (peer.queued > MAX_TRANSFER + 65536) return this.failPeer(peer, '受信量の上限を超えました。');
      peer.incoming = peer.incoming.then(async () => {
        if (this.peers.get(peer.id) !== peer || this.stopped) return;
        await this.receive(peer, data);
      }).catch(() => this.failPeer(peer, '共有ファイルを読み込めませんでした。')).finally(() => { peer.queued -= bytes; });
    };
  }
  private limit(peer: Peer) {
    const now = Date.now(); if (now - peer.controlStart > 1000) { peer.controlRate = 0; peer.controlStart = now; }
    if (++peer.controlRate > 30) throw new Error('Rate exceeded');
  }
  private allowPose(peer: Peer) {
    const now = Date.now(); if (now - peer.rateStart > 1000) { peer.rate = 0; peer.rateStart = now; }
    return ++peer.rate <= 80;
  }
  private async receive(peer: Peer, data: unknown) {
    if (data instanceof ArrayBuffer) {
      const asset = peer.receiving;
      if (!asset || data.byteLength > 16384 || !data.byteLength || asset.offset + data.byteLength > asset.buffer.byteLength) throw new Error();
      asset.buffer.set(new Uint8Array(data), asset.offset); asset.offset += data.byteLength; return;
    }
    if (typeof data !== 'string' || data.length > 4096) throw new Error();
    this.limit(peer);
    const msg = peerMessage.parse(JSON.parse(data));
    if (msg.type === 'hello') {
      if (peer.received.has('hello')) throw new Error(); peer.received.add('hello');
      void this.share(peer).catch(() => this.failPeer(peer, '共有ファイルを送信できませんでした。'));
    } else if (msg.type === 'ready') {
      peer.ready = true; this.emitMembers();
    } else if (msg.type === 'voice') {
      this.events.voice(peer.id, msg.enabled);
    } else if (msg.type === 'asset-ack') {
      if (peer.ack?.kind !== msg.kind) throw new Error();
      peer.ack.resolve(); peer.ack = undefined;
    } else if (msg.type === 'asset') {
      if (peer.receiving || peer.received.has(msg.kind) || (msg.kind === 'room' && (peer.id !== this.host || this.self === this.host))) throw new Error();
      peer.received.add(msg.kind);
      peer.receiving = { kind: msg.kind, buffer: new Uint8Array(msg.size), offset: 0, hash: msg.sha256, started: Date.now() };
      if (msg.kind === 'room') this.events.status('ホストのルームを受信中…');
    } else if (msg.type === 'asset-end') {
      const asset = peer.receiving;
      if (!asset || asset.offset !== asset.buffer.byteLength || await digest(asset.buffer.buffer as ArrayBuffer) !== asset.hash) throw new Error();
      const bytes = asset.buffer.buffer as ArrayBuffer;
      if (asset.kind === 'room') {
        await this.events.room(bytes);
        if (this.stopped) return;
        this.ready = true;
        for (const target of this.peers.values()) this.send(target, { type: 'ready' });
        this.events.status('入室しました。一緒に歩いてみましょう。'); this.emitMembers();
      } else await this.events.avatar(peer.id, bytes);
      peer.receiving = undefined;
      this.send(peer, { type: 'asset-ack', kind: asset.kind });
    } else throw new Error();
  }
  private async share(peer: Peer) {
    if (this.self === this.host) await this.transfer(peer, 'room', this.assets.room, await this.roomHash!);
    if (this.assets.avatar) await this.transfer(peer, 'avatar', this.assets.avatar, await this.avatarHash!);
  }
  private async transfer(peer: Peer, kind: 'room' | 'avatar', bytes: ArrayBuffer, sha256: string) {
    const channel = peer.data!;
    this.send(peer, { type: 'asset', kind, size: bytes.byteLength, sha256 });
    let lastProgress = Date.now();
    for (let offset = 0; offset < bytes.byteLength; offset += 16384) {
      while (channel.bufferedAmount > 256 * 1024) {
        if (channel.readyState !== 'open' || this.stopped || Date.now() - lastProgress > 30000) throw new Error();
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      if (channel.readyState !== 'open' || this.stopped) throw new Error();
      channel.send(bytes.slice(offset, offset + 16384)); lastProgress = Date.now();
    }
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { peer.ack = undefined; reject(new Error('Asset acknowledgement timeout')); }, 180000);
      peer.ack = { kind, resolve: () => { clearTimeout(timeout); resolve(); }, reject: () => { clearTimeout(timeout); reject(new Error('Peer left')); } };
      this.send(peer, { type: 'asset-end' });
    });
  }
  private send(peer: Peer, value: unknown) { if (peer.data?.readyState === 'open') peer.data.send(JSON.stringify(value)); }
  private async configureAudio(peer: Peer) {
    const audio = peer.pc.getTransceivers().find(t => t.receiver.track.kind === 'audio');
    if (!audio) return;
    audio.direction = 'sendrecv'; peer.audioSender = audio.sender;
    await audio.sender.replaceTrack(this.audioTrack);
  }
  setVoiceTrack(track: MediaStreamTrack | null): Promise<void> {
    if (this.stopped) return Promise.resolve();
    const previous = this.audioTrack; this.audioTrack = track;
    const job = this.audioQueue.catch(() => {}).then(async () => {
      if (this.stopped || this.audioTrack !== track) return;
      try {
        await Promise.all([...this.peers.values()].map(peer => peer.audioSender?.replaceTrack(track)));
        if (!this.stopped && this.audioTrack === track) for (const peer of this.peers.values()) this.send(peer, { type: 'voice', enabled: !!track });
      } catch (error) {
        if (this.audioTrack === track && track) {
          this.audioTrack = previous?.readyState === 'live' ? previous : null;
          await Promise.allSettled([...this.peers.values()].map(peer => peer.audioSender?.replaceTrack(this.audioTrack)));
        }
        throw error;
      }
    });
    this.audioQueue = job; return job;
  }
  update(pose: Pose) {
    if (!this.self || !this.ready || this.stopped) return;
    if (this.self === this.host) {
      this.poses.set(this.self, pose);
      const data = JSON.stringify({ type: 'poses', poses: [...this.poses].map(([id, pose]) => ({ id, pose })) });
      for (const peer of this.peers.values()) if (peer.ready && peer.poses?.readyState === 'open' && peer.poses.bufferedAmount < 8192) peer.poses.send(data);
    } else {
      const channel = this.peers.get(this.host)?.poses;
      if (channel?.readyState === 'open' && channel.bufferedAmount < 8192) channel.send(JSON.stringify({ type: 'pose', pose }));
    }
  }
  private removePeer(peer: Peer) {
    this.peers.delete(peer.id); this.poses.delete(peer.id); peer.receiving = undefined;
    peer.ack?.reject(); peer.ack = undefined;
    peer.pc.close(); this.events.remove(peer.id);
  }
  private failPeer(peer: Peer, reason: string) {
    if (this.stopped || this.peers.get(peer.id) !== peer) return;
    if (this.self === this.host) {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'kick', id: peer.id }));
      this.removePeer(peer); this.events.status(`参加者の接続を解除しました。${reason}`);
    } else this.close(reason);
  }
  close(reason = '退出しました。') {
    if (this.stopped) return;
    this.stopped = true; clearInterval(this.timer); this.ws?.close();
    this.audioTrack = null;
    for (const peer of [...this.peers.values()]) this.removePeer(peer);
    this.poses.clear(); this.assets = { room: new ArrayBuffer(0) }; this.roster = [];
    this.events.closed(reason);
  }
}
