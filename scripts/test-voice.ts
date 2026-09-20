import { chromium, expect as baseExpect, type Page } from '@playwright/test';
import { testAudioFile } from '../tests/audio-fixture';

// Synthetic tone only. The tests never open a physical microphone or record anyone.
const audioFile = await testAudioFile();
const expect = baseExpect.configure({ timeout: 20000 });
const origin = process.argv[2] ?? 'http://127.0.0.1:5180/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${audioFile}`, '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const errors: string[] = [];
async function open(name: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await context.addInitScript(({ relay }) => {
    const state = { calls: [] as MediaStreamConstraints[], streams: [] as MediaStream[], peers: [] as RTCPeerConnection[], outputs: [] as AnalyserNode[], deny: false, hold: false, release: undefined as (() => void) | undefined };
    Object.assign(window, { voiceTest: state });
    const NativeAudio = window.AudioContext;
    window.AudioContext = class extends NativeAudio {
      private firstGain = true;
      createGain() {
        const gain = super.createGain();
        if (this.firstGain) { this.firstGain = false; const analyser = super.createAnalyser(); analyser.fftSize = 256; gain.connect(analyser); state.outputs.push(analyser); }
        return gain;
      }
    };
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      state.calls.push(constraints ?? {});
      if (state.deny) throw new DOMException('Test permission denied', 'NotAllowedError');
      const stream = await getUserMedia(constraints); state.streams.push(stream);
      if (state.hold) await new Promise<void>(resolve => { state.release = resolve; });
      return stream;
    };
    const Native = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends Native {
      constructor(config?: RTCConfiguration) { super({ ...config, ...(relay ? { iceTransportPolicy: 'relay' as const } : {}) }); state.peers.push(this); }
    };
  }, { relay: process.argv.includes('--relay') });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') console.error(name, message.text()); });
  await page.goto(origin); await expect(page.locator('#loading')).toBeHidden({ timeout: 60000 });
  await page.locator('#online-button').click();
  await page.locator('#player-name').fill(name); return page;
}
async function captureCount(page: Page) { return page.evaluate(() => (window as any).voiceTest.calls.length as number); }
async function liveTracks(page: Page) { return page.evaluate(() => (window as any).voiceTest.streams.flatMap((s: MediaStream) => s.getTracks()).filter((t: MediaStreamTrack) => t.readyState === 'live').length as number); }
async function receivingEnergy(page: Page) {
  // Measure decoded PCM after the app's per-user gain and spatial processing.
  // Chromium's RTP totalAudioEnergy can stay zero with a muted helper element.
  return page.evaluate(() => {
    let level = 0;
    for (const analyser of (window as any).voiceTest.outputs as AnalyserNode[]) {
      const samples = new Float32Array(256); analyser.getFloatTimeDomainData(samples);
      level += Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
    }
    return level;
  });
}
try {
  const host = await open('音声ホスト'); await host.locator('#create-room').click();
  await expect(host.locator('#invite-link')).toHaveValue(/#invite=/);
  const guest = await open('音声ゲスト'); await guest.locator('#invite-input').fill(await host.locator('#invite-link').inputValue()); await guest.locator('#join-room').click();
  await expect(guest.locator('#status-text')).toHaveText('みんなで探索中 · 2人', { timeout: 60000 });
  if (await guest.locator('#resume-audio').isVisible()) await guest.locator('#resume-audio').click();
  expect(await captureCount(host)).toBe(0); expect(await captureCount(guest)).toBe(0);
  await expect(host.locator('#mic-toggle')).toHaveAttribute('aria-pressed', 'false');
  await host.locator('#refresh-mics').click();
  await expect.poll(async () => host.locator('#mic-device option').count()).toBeGreaterThan(1);
  expect(await liveTracks(host)).toBe(0);
  const devices = await host.locator('#mic-device option').evaluateAll(options => options.map(o => (o as HTMLOptionElement).value).filter(Boolean));
  await host.locator('#mic-device').selectOption(devices[0]);
  await host.locator('#mic-toggle').click();
  await expect(host.locator('#mic-toggle')).toHaveAttribute('aria-pressed', 'true');
  await host.locator('#close-settings').click();
  await expect(host.locator('#quick-mic')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => receivingEnergy(guest), { timeout: 15000 }).toBeGreaterThan(0.001);
  await host.locator('#quick-mic').click();
  await expect.poll(() => liveTracks(host)).toBe(0);
  await host.locator('#quick-mic').click();
  await expect(host.locator('#quick-mic')).toHaveAttribute('aria-pressed', 'true');
  await host.locator('#online-button').click();
  console.log('Microphone enabled; waiting for received audio');
  await expect.poll(() => receivingEnergy(guest), { timeout: 15000 }).toBeGreaterThan(0.001);
  await expect.poll(async () => Number(await guest.locator('[data-voice-enabled=true]').first().getAttribute('data-voice-level'))).toBeGreaterThan(0.02);
  const selected = await host.evaluate(() => (window as any).voiceTest.calls.at(-1).audio.deviceId.exact);
  expect(selected).toBe(devices[0]);
  await guest.getByRole('button', { name: '音声ホストをミュート', exact: true }).click();
  await expect(guest.getByRole('button', { name: '音声ホストをミュート', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(guest.locator('.talk-state').filter({ hasText: '消音中' })).toHaveCount(1);
  await expect.poll(() => receivingEnergy(guest)).toBeLessThan(0.0001);
  await guest.getByRole('slider', { name: '音声ホストの音量', exact: true }).evaluate((slider: HTMLInputElement) => { slider.value = '50'; slider.dispatchEvent(new Event('input', { bubbles: true })); });
  await guest.getByRole('button', { name: '音声ホストをミュート', exact: true }).click();
  await expect.poll(() => receivingEnergy(guest)).toBeGreaterThan(0.001);
  // Replace the live capture with the default device; the old track must stop.
  await host.locator('#mic-device').selectOption('');
  await expect.poll(() => liveTracks(host)).toBe(1);
  await expect.poll(async () => host.evaluate(() => (window as any).voiceTest.streams.length)).toBeGreaterThanOrEqual(2);
  await host.evaluate(() => { (window as any).voiceTest.deny = true; });
  await host.locator('#mic-device').selectOption(devices[0]);
  await expect(host.locator('#toast-message')).toContainText('許可');
  await expect(host.locator('#mic-device')).toHaveValue('');
  await expect(host.locator('#mic-toggle')).toHaveAttribute('aria-pressed', 'true');
  expect(await liveTracks(host)).toBe(1);
  await host.evaluate(() => { (window as any).voiceTest.deny = false; });
  await host.locator('#mic-toggle').click();
  await expect.poll(() => liveTracks(host)).toBe(0);
  await expect(guest.locator('[data-voice-enabled=true]')).toHaveCount(0);
  await expect.poll(() => receivingEnergy(guest)).toBeLessThan(0.0001);
  // Permission denial leaves the session usable and the microphone off.
  await guest.evaluate(() => { (window as any).voiceTest.deny = true; });
  await guest.locator('#mic-toggle').click(); await expect(guest.locator('#toast-message')).toContainText('許可');
  await expect(guest.locator('#mic-toggle')).toHaveAttribute('aria-pressed', 'false');
  await guest.evaluate(() => { (window as any).voiceTest.deny = false; });
  await guest.locator('#mic-toggle').click();
  await expect(guest.locator('#mic-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => receivingEnergy(host), { timeout: 30000 }).toBeGreaterThan(0.001);
  // An unplugged device does not fall back to a different microphone.
  await guest.evaluate(() => { const track = (window as any).voiceTest.streams.at(-1).getAudioTracks()[0]; track.stop(); track.dispatchEvent(new Event('ended')); });
  await expect(guest.locator('#mic-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(guest.locator('#toast-message')).toContainText('接続が切れ');
  await host.locator('#mic-toggle').click();
  await expect(host.locator('#mic-toggle')).toHaveAttribute('aria-pressed', 'true');
  const third = await open('後から参加'); await third.locator('#invite-input').fill(await host.locator('#invite-link').inputValue()); await third.locator('#join-room').click();
  await expect(third.locator('#status-text')).toHaveText('みんなで探索中 · 3人', { timeout: 60000 });
  expect(await captureCount(third)).toBe(0);
  await expect.poll(() => receivingEnergy(third), { timeout: 30000 }).toBeGreaterThan(0.001);
  if (process.argv.includes('--relay')) {
    const relayed = await third.evaluate(async () => {
      const result: string[] = [];
      for (const pc of (window as any).voiceTest.peers as RTCPeerConnection[]) {
        const stats = await pc.getStats(); stats.forEach(s => { if (s.type === 'transport' && s.selectedCandidatePairId) { const pair = stats.get(s.selectedCandidatePairId); result.push(stats.get(pair.localCandidateId).candidateType, stats.get(pair.remoteCandidateId).candidateType); } });
      }
      return result;
    });
    expect(relayed.length).toBeGreaterThan(0); expect(relayed.every(type => type === 'relay')).toBe(true);
  }
  await host.locator('#voice-controls').scrollIntoViewIfNeeded(); await host.screenshot({ path: 'test-results/voice.png' });
  // A permission request completing after exit must not reopen/send the microphone.
  await guest.evaluate(() => { (window as any).voiceTest.hold = true; });
  await guest.locator('#mic-toggle').click();
  await expect.poll(async () => guest.evaluate(() => !!(window as any).voiceTest.release)).toBe(true);
  await guest.locator('#leave-room').click();
  await guest.evaluate(() => (window as any).voiceTest.release());
  await expect.poll(() => liveTracks(guest)).toBe(0);
  await host.locator('#leave-room').click();
  await expect.poll(() => liveTracks(host)).toBe(0);
  await expect(third.locator('#session-entry')).toBeVisible();
  expect(errors).toEqual([]);
  console.log('PASS: opt-in microphone, exact device selection, live switch, audio energy both ways, per-user mute/volume, permission denial, device loss, late join, late permission cleanup, exit stops capture' + (process.argv.includes('--relay') ? ', TURN relay' : ''));
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) {
    console.error(await page.locator('#mic-status, #session-status, #toast-message').allTextContents());
    console.error(JSON.stringify(await page.evaluate(async () => {
      const result = [];
      for (const pc of (window as any).voiceTest.peers as RTCPeerConnection[]) {
        const stats = await pc.getStats(), audio: unknown[] = [];
        stats.forEach(s => { if (['inbound-rtp', 'outbound-rtp', 'media-source'].includes(s.type)) audio.push({ type: s.type, kind: s.kind, energy: s.totalAudioEnergy, level: s.audioLevel, bytes: s.bytesSent ?? s.bytesReceived }); });
        result.push({ audio, transceivers: pc.getTransceivers().map(t => ({ direction: t.direction, current: t.currentDirection, sending: t.sender.track?.readyState, receiving: t.receiver.track.readyState, muted: t.receiver.track.muted })) });
      }
      return { result, level: (document.getElementById('mic-level') as HTMLMeterElement).value, playbackBlocked: !document.getElementById('resume-audio')!.hidden, peers: [...document.querySelectorAll('[data-voice-enabled]')].map(e => ({ enabled: (e as HTMLElement).dataset.voiceEnabled, level: (e as HTMLElement).dataset.voiceLevel })) };
    }), null, 2));
  }
  throw error;
} finally { await browser.close(); }
