import { chromium, expect as baseExpect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { testVrm } from '../tests/fixtures';
import { packGlb } from './glb';

const url = process.argv[2] ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const errors: string[] = [];
const expect = baseExpect.configure({ timeout: 30000 });
async function page(name: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (process.argv.includes('--relay')) await context.addInitScript(() => {
    const Native = window.RTCPeerConnection;
    const peers: RTCPeerConnection[] = [];
    Object.assign(window, { testPeers: peers });
    window.RTCPeerConnection = class extends Native {
      constructor(config?: RTCConfiguration) {
        super({ ...config, iceTransportPolicy: 'relay' }); peers.push(this);
      }
    };
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') console.error(name, msg.text()); });
  await page.goto(url);
  await expect(page.locator('#loading')).toBeHidden({ timeout: 60000 });
  await page.locator('#settings-button').click(); await page.locator('#tab-avatar').click();
  if (await page.locator('#default-avatar').isVisible()) await page.locator('#default-avatar').click();
  await page.locator('#tab-social').click();
  await page.locator('#player-name').fill(name);
  return page;
}
async function remotes(page: Page) { return JSON.parse(await page.locator('#viewport').getAttribute('data-remotes') ?? '[]') as { x: number; z: number; avatar: boolean; visible: boolean }[]; }
try {
  const host = await page('ホスト');
  const bytes = await readFile('public/starter-room.vroom');
  const length = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + length).toString());
  json.extensions.OPENVROOM_room.title = 'みんなのテストルーム';
  await host.locator('#room-file').setInputFiles({ name: 'test.vroom', mimeType: 'application/octet-stream', buffer: Buffer.from(packGlb(json, bytes.subarray(28 + length))) });
  await expect(host.locator('#room-title')).toHaveText('みんなのテストルーム');
  await host.locator('#avatar-file').setInputFiles({ name: 'shared.vrm', mimeType: 'application/octet-stream', buffer: Buffer.from(testVrm()) });
  await expect(host.locator('#avatar-name')).toHaveText('shared');
  await host.locator('#share-avatar').check();
  await host.locator('#create-room').click();
  await expect(host.locator('#invite-link')).toHaveValue(/#invite=[\w-]{32}$/, { timeout: 15000 });
  const invite = await host.locator('#invite-link').inputValue();
  const guest = await page('ゲスト');
  // Loading a private avatar without checking sharing must not send it.
  await guest.locator('#avatar-file').setInputFiles({ name: 'unshared.vrm', mimeType: 'application/octet-stream', buffer: Buffer.from(testVrm()) });
  await expect(guest.locator('#avatar-name')).toHaveText('unshared');
  await guest.locator('#invite-input').fill(invite); await guest.locator('#join-room').click();
  await expect(guest.locator('#room-title')).toHaveText('みんなのテストルーム', { timeout: 60000 });
  await expect(guest.locator('#status-text')).toHaveText('みんなで探索中 · 2人', { timeout: 60000 });
  await expect.poll(async () => (await remotes(guest)).filter(p => p.avatar && p.visible).length, { timeout: 60000 }).toBe(1);
  await expect.poll(async () => (await remotes(host)).filter(p => !p.avatar && p.visible).length, { timeout: 30000 }).toBe(1);
  await expect(guest.locator('#open-room')).toBeDisabled();
  const before = (await remotes(guest))[0];
  await host.locator('#close-settings').click();
  await host.locator('canvas').focus(); await host.keyboard.down('KeyD'); await host.waitForTimeout(1400); await host.keyboard.up('KeyD');
  await expect.poll(async () => Math.abs((await remotes(guest))[0].x - before.x), { timeout: 20000 }).toBeGreaterThan(0.2);
  const third = await page('3人目');
  await third.locator('#invite-input').fill(invite); await third.locator('#join-room').click();
  await expect(third.locator('#status-text')).toHaveText('みんなで探索中 · 3人', { timeout: 60000 });
  await expect.poll(async () => (await remotes(third)).filter(p => p.visible).length, { timeout: 30000 }).toBe(2);
  const guestBefore = (await remotes(third)).find(p => !p.avatar)!;
  await guest.locator('#close-settings').click();
  await guest.locator('canvas').focus(); await guest.keyboard.down('KeyA'); await guest.waitForTimeout(1200); await guest.keyboard.up('KeyA');
  await expect.poll(async () => Math.abs((await remotes(third)).find(p => !p.avatar)!.x - guestBefore.x), { timeout: 20000 }).toBeGreaterThan(0.2);
  await host.screenshot({ path: 'test-results/multiplayer.png' });
  if (process.argv.includes('--relay')) {
    const types = await host.evaluate(async () => {
      const peers = (window as unknown as { testPeers: RTCPeerConnection[] }).testPeers;
      const result: string[] = [];
      for (const pc of peers) {
        const stats = await pc.getStats();
        stats.forEach(report => { if (report.type === 'transport' && report.selectedCandidatePairId) {
          const pair = stats.get(report.selectedCandidatePairId);
          result.push(stats.get(pair.localCandidateId).candidateType, stats.get(pair.remoteCandidateId).candidateType);
        } });
      }
      return result;
    });
    expect(types.length).toBeGreaterThanOrEqual(4);
    expect(types.every(type => type === 'relay')).toBe(true);
    console.log('PASS: selected WebRTC candidate pairs use TURN relay on both ends');
  }
  await third.locator('#leave-room').click();
  await expect(host.locator('#member-count')).toHaveText('2 / 6人');
  await expect.poll(async () => (await remotes(host)).length).toBe(1);
  await third.locator('#join-room').click();
  await expect(third.locator('#status-text')).toHaveText('みんなで探索中 · 3人', { timeout: 60000 });
  await host.locator('#online-button').click();
  await guest.locator('#online-button').click();
  await host.locator('#leave-room').click();
  await expect(guest.locator('#session-entry')).toBeVisible({ timeout: 15000 });
  await expect(third.locator('#session-entry')).toBeVisible({ timeout: 15000 });
  await expect(guest.locator('#room-title')).toHaveText('こもれびのラウンジ');
  await expect.poll(async () => (await remotes(guest)).length).toBe(0);
  await guest.locator('#join-room').click();
  await expect(guest.locator('#toast-message')).toContainText('終了');
  expect(errors).toEqual([]);
  console.log('PASS: 3 browser contexts, custom room, opt-in VRM, private avatar not shared, host/guest movement, leave/rejoin, host closure, expired invite');
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) console.error(await page.locator('#session-status, #status-text, #toast-message').allTextContents());
  throw error;
} finally { await browser.close(); }
