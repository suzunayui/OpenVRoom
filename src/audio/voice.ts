import type { Pose } from '../network/protocol';

interface RemoteAudio {
  track: MediaStreamTrack; source: MediaStreamAudioSourceNode; analyser: AnalyserNode; panner: PannerNode; gain: GainNode;
  element: HTMLAudioElement; samples: Float32Array<ArrayBuffer>;
}
interface PeerAudio { enabled: boolean; ready: boolean; muted: boolean; volume: number; audio?: RemoteAudio; pose?: Pose; }
export interface VoiceState { enabled: boolean; busy: boolean; ready: boolean; selected: string; devices: { id: string; label: string }[]; playbackBlocked: boolean; }
export interface VoiceLevels { local: number; peers: { id: string; level: number; enabled: boolean; muted: boolean }[]; }
export class VoiceController {
  private context = new AudioContext();
  private master = this.context.createGain();
  private silent = this.context.createGain();
  private stream?: MediaStream;
  private pendingStream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private analyser?: AnalyserNode;
  private samples = new Float32Array(256);
  private peers = new Map<string, PeerAudio>();
  private devices: VoiceState['devices'] = [];
  private selected = '';
  private busy = false;
  private ready = false;
  private disposed = false;
  private operation = 0;
  private timer: ReturnType<typeof setInterval>;
  private controller = new AbortController();
  constructor(
    private publish: (track: MediaStreamTrack | null) => Promise<void>,
    private changed: (state: VoiceState) => void,
    private levels: (levels: VoiceLevels) => void,
    private error: (message: string) => void,
  ) {
    this.master.connect(this.context.destination);
    this.silent.gain.value = 0; this.silent.connect(this.context.destination);
    this.context.onstatechange = () => this.emit();
    navigator.mediaDevices?.addEventListener('devicechange', () => { void this.refreshDevices(false); }, { signal: this.controller.signal });
    this.timer = setInterval(() => this.meter(), 100);
    this.emit();
    void this.refreshDevices(false);
  }
  private emit() {
    if (!this.disposed) this.changed({ enabled: !!this.stream, busy: this.busy, ready: this.ready, selected: this.selected, devices: this.devices, playbackBlocked: this.context.state !== 'running' });
  }
  async resume() {
    if (this.disposed) return;
    try { await this.context.resume(); } catch { /* The UI keeps the explicit playback button visible. */ }
    this.emit();
  }
  setReady(ready: boolean) { this.ready = ready; if (!ready) this.stopMic(); this.emit(); this.updateGains(); }
  setPeerReady(id: string, ready: boolean) { this.peer(id).ready = ready; this.updateGain(id); }
  private peer(id: string) {
    let peer = this.peers.get(id);
    if (!peer) { peer = { enabled: false, ready: false, muted: false, volume: 1 }; this.peers.set(id, peer); }
    return peer;
  }
  async refreshDevices(requestPermission: boolean) {
    let probe: MediaStream | undefined;
    try {
      if (!navigator.mediaDevices?.enumerateDevices) throw new Error('unsupported');
      let devices = await navigator.mediaDevices.enumerateDevices();
      if (requestPermission && !this.stream && !devices.some(d => d.kind === 'audioinput' && d.label)) {
        probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (this.disposed) return;
        devices = await navigator.mediaDevices.enumerateDevices();
      }
      if (this.disposed) return;
      this.devices = devices.filter(d => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default').map((d, i) => ({ id: d.deviceId, label: d.label || `マイク ${i + 1}` }));
      if (this.stream && this.selected && !this.devices.some(d => d.id === this.selected)) {
        this.stopMic(); this.error('選択したマイクが取り外されました。マイクを選び直してください。');
      }
      this.emit();
    } catch (error) { if (requestPermission && !this.disposed) this.error(microphoneError(error)); }
    finally { probe?.getTracks().forEach(track => track.stop()); }
  }
  async selectDevice(id: string) {
    if (this.disposed || this.busy) return;
    if (this.stream) await this.startMic(id);
    else { this.selected = id; this.emit(); }
  }
  toggleMic() {
    if (this.stream || this.busy) this.stopMic();
    else void this.startMic(this.selected);
  }
  private async startMic(device: string) {
    if (this.disposed || !this.ready || this.busy) return;
    const request = ++this.operation;
    this.busy = true; this.emit(); void this.resume();
    let next: MediaStream | undefined;
    try {
      next = await navigator.mediaDevices.getUserMedia({
        audio: { ...(device ? { deviceId: { exact: device } } : {}), channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false,
      });
      if (this.disposed || request !== this.operation || !this.ready) { next.getTracks().forEach(track => track.stop()); return; }
      const track = next.getAudioTracks()[0];
      if (!track) throw new Error('No audio track');
      this.pendingStream = next;
      await this.publish(track);
      if (this.disposed || request !== this.operation || !this.ready) { track.stop(); return; }
      this.releaseLocal(); this.stream = next; this.selected = device;
      this.source = this.context.createMediaStreamSource(next); this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 256;
      this.source.connect(this.analyser); this.analyser.connect(this.silent);
      track.onended = () => {
        if (this.stream === next) { this.stopMic(); this.error('マイクの接続が切れました。選び直してオンにしてください。'); }
      };
      void this.refreshDevices(false);
    } catch (error) {
      next?.getTracks().forEach(track => track.stop());
      if (this.stream === next && next) { this.releaseLocal(); void this.publish(null).catch(() => {}); }
      if (request === this.operation && !this.disposed) this.error(microphoneError(error));
    } finally {
      if (this.pendingStream === next) this.pendingStream = undefined;
      if (request === this.operation && !this.disposed) { this.busy = false; this.emit(); }
    }
  }
  stopMic() {
    ++this.operation; this.busy = false;
    this.pendingStream?.getTracks().forEach(track => track.stop()); this.pendingStream = undefined;
    // Stop capture synchronously, including on disconnect or permission cancellation.
    this.releaseLocal(); void this.publish(null).catch(() => {}); this.emit();
  }
  private releaseLocal() {
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); }); this.stream = undefined;
    this.source?.disconnect(); this.analyser?.disconnect(); this.source = undefined; this.analyser = undefined;
  }
  addTrack(id: string, track: MediaStreamTrack) {
    if (this.disposed || track.kind !== 'audio') { track.stop(); return; }
    const peer = this.peer(id); this.releaseRemote(peer);
    const stream = new MediaStream([track]);
    const element = new Audio(); element.muted = true; element.autoplay = true; element.srcObject = stream;
    void element.play().catch(() => {});
    const source = this.context.createMediaStreamSource(stream), analyser = this.context.createAnalyser(), panner = this.context.createPanner(), gain = this.context.createGain();
    analyser.fftSize = 256;
    panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse'; panner.refDistance = 2; panner.maxDistance = 40; panner.rolloffFactor = 1;
    source.connect(analyser); analyser.connect(panner); panner.connect(gain); gain.connect(this.master);
    peer.audio = { track, source, analyser, panner, gain, element, samples: new Float32Array(256) };
    this.updateGain(id); if (peer.pose) this.positionPeer(id, peer.pose);
  }
  setEnabled(id: string, enabled: boolean) { this.peer(id).enabled = enabled; this.updateGain(id); }
  setMuted(id: string, muted: boolean) { this.peer(id).muted = muted; this.updateGain(id); }
  isMuted(id: string) { return this.peer(id).muted; }
  setVolume(id: string, volume: number) { this.peer(id).volume = Math.max(0, Math.min(2, volume)); this.updateGain(id); }
  volume(id: string) { return this.peer(id).volume; }
  private updateGain(id: string) {
    const peer = this.peers.get(id); if (!peer?.audio) return;
    peer.audio.gain.gain.setTargetAtTime(this.ready && peer.ready && peer.enabled && !peer.muted ? peer.volume : 0, this.context.currentTime, 0.02);
  }
  private updateGains() { for (const id of this.peers.keys()) this.updateGain(id); }
  positionPeer(id: string, pose: Pose) {
    const peer = this.peer(id); peer.pose = pose;
    if (!peer.audio) return;
    const p = peer.audio.panner;
    p.positionX.setTargetAtTime(pose.x, this.context.currentTime, 0.05); p.positionY.setTargetAtTime(pose.y + 1.5, this.context.currentTime, 0.05); p.positionZ.setTargetAtTime(pose.z, this.context.currentTime, 0.05);
  }
  positionListener(pose: Pose, forward: { x: number; y: number; z: number }) {
    const listener = this.context.listener;
    listener.positionX.value = pose.x; listener.positionY.value = pose.y + 1.5; listener.positionZ.value = pose.z;
    listener.forwardX.value = forward.x; listener.forwardY.value = forward.y; listener.forwardZ.value = forward.z;
    listener.upX.value = 0; listener.upY.value = 1; listener.upZ.value = 0;
  }
  private meter() {
    if (this.disposed) return;
    const level = (analyser: AnalyserNode | undefined, samples: Float32Array<ArrayBuffer>) => {
      if (!analyser) return 0;
      analyser.getFloatTimeDomainData(samples);
      return Math.min(1, Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length) * 4);
    };
    this.levels({ local: level(this.analyser, this.samples), peers: [...this.peers].map(([id, peer]) => ({ id, enabled: peer.enabled, muted: peer.muted, level: peer.enabled && peer.ready ? level(peer.audio?.analyser, peer.audio?.samples ?? this.samples) : 0 })) });
  }
  private releaseRemote(peer: PeerAudio) {
    const a = peer.audio; if (!a) return;
    a.element.pause(); a.element.srcObject = null; a.source.disconnect(); a.analyser.disconnect(); a.panner.disconnect(); a.gain.disconnect(); a.track.stop(); peer.audio = undefined;
  }
  remove(id: string) { const peer = this.peers.get(id); if (peer) this.releaseRemote(peer); this.peers.delete(id); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.ready = false; this.stopMic(); clearInterval(this.timer); this.controller.abort();
    for (const id of this.peers.keys()) this.remove(id);
    this.master.disconnect(); this.silent.disconnect(); void this.context.close();
  }
}
export function microphoneError(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'マイクが許可されていません。ブラウザやOSのマイク権限を確認してください。';
  if (name === 'NotFoundError') return 'マイクが見つかりません。接続して一覧を更新してください。';
  if (name === 'OverconstrainedError') return '選択したマイクを使えません。一覧を更新して選び直してください。';
  if (name === 'NotReadableError' || name === 'AbortError') return 'マイクを開始できません。他のアプリの使用状況や接続を確認してください。';
  return '音声を開始できませんでした。マイクの接続とブラウザの対応状況を確認してください。';
}
