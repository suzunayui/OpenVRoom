import { _electron as electron, chromium, expect } from '@playwright/test';
import { testVrm } from '../tests/fixtures';
import { existsSync, readFileSync } from 'node:fs';
import { testAudioFile } from '../tests/audio-fixture';

const environment: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
environment.OPENVROOM_HEADLESS = '1';
delete environment.ELECTRON_RUN_AS_NODE;
const voiceArgs = process.argv.includes('--voice') ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--mute-audio', `--use-file-for-fake-audio-capture=${await testAudioFile()}`] : [];
const app = await electron.launch({
  ...(process.argv[2] && !process.argv[2].startsWith('--') ? { executablePath: process.argv[2] } : {}),
  // Keep Electron's actual permission handlers active; only the hardware is fake.
  args: [...(process.argv[2] && !process.argv[2].startsWith('--') ? [] : ['.']), '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--force-device-scale-factor=1', ...voiceArgs.filter(arg => arg !== '--use-fake-ui-for-media-stream')],
  env: environment,
});
try {
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); console.error(message.text()); } });
  await expect(page.locator('#status-text')).toHaveText('探索中 · この端末のみ', { timeout: 20000 });
  await expect(page.locator('#coordinates')).toContainText('Z 2.4', { timeout: 15000 });
  if (existsSync('src/local-avatar.json')) {
    const config = JSON.parse(readFileSync('src/local-avatar.json', 'utf8').replace(/^\uFEFF/, ''));
    await expect(page.locator('#avatar-name')).toHaveText(config.name, { timeout: 60000 });
    await expect(page.locator('#loading')).toBeHidden();
    await page.screenshot({ path: 'test-results/windows-local-avatar.png' });
  }
  await page.locator('#avatar-file').setInputFiles({ name: 'test-avatar.vrm', mimeType: 'application/octet-stream', buffer: Buffer.from(testVrm()) });
  await expect(page.locator('#avatar-name')).toHaveText('test-avatar');
  await page.locator('canvas').focus();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
  await expect(page.locator('#coordinates')).not.toContainText('Z 2.4');
  await page.screenshot({ path: 'test-results/windows.png' });
  if (process.argv.includes('--online')) {
    await page.locator('#online-button').click();
    await page.locator('#share-avatar').check();
    await page.locator('#create-room').click();
    await expect(page.locator('#invite-link')).toHaveValue(/https:\/\/openvroom.com\/room\/#invite=/, { timeout: 20000 });
    const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...voiceArgs] });
    try {
      const guest = await browser.newPage();
      await guest.goto(await page.locator('#invite-link').inputValue());
      await expect(guest.locator('#loading')).toBeHidden({ timeout: 30000 });
      await guest.locator('#join-room').click();
      await expect(guest.locator('#status-text')).toHaveText('みんなで探索中 · 2人', { timeout: 45000 });
      await expect.poll(async () => JSON.parse(await guest.locator('#viewport').getAttribute('data-remotes') ?? '[]').some((p: { avatar: boolean; visible: boolean }) => p.avatar && p.visible), { timeout: 30000 }).toBe(true);
      if (process.argv.includes('--voice')) {
        await expect(page.locator('#mic-toggle')).toHaveAttribute('aria-pressed', 'false');
        await page.locator('#refresh-mics').click();
        await expect.poll(() => page.locator('#mic-device option').count()).toBeGreaterThan(1);
        const device = await page.locator('#mic-device option').nth(1).getAttribute('value');
        await page.locator('#mic-device').selectOption(device!);
        await page.locator('#mic-toggle').click();
        await expect(page.locator('#mic-toggle')).toHaveAttribute('aria-pressed', 'true');
        await expect.poll(async () => Number(await guest.locator('[data-voice-enabled=true]').first().getAttribute('data-voice-level')), { timeout: 30000 }).toBeGreaterThan(0.02);
        await guest.locator('#mic-toggle').click();
        await expect.poll(async () => Number(await page.locator('[data-voice-enabled=true]').first().getAttribute('data-voice-level')), { timeout: 30000 }).toBeGreaterThan(0.02);
        await page.locator('#mic-toggle').click();
        await expect(guest.locator('[data-voice-enabled=true]')).toHaveCount(0);
        console.log('PASS: Windows microphone selection and bidirectional Web voice using synthetic audio');
      }
      await page.locator('#leave-room').click();
      await expect(guest.locator('#session-entry')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('#session-entry')).toBeVisible();
      console.log('PASS: Windows Electron + public Web client join, shared VRM, host closure');
    } finally { await browser.close(); }
  }
  expect(errors).toEqual([]);
  console.log('PASS: Windows Electron room load, VRM import, keyboard movement');
} finally { await app.close(); }
