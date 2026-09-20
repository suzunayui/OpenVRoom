import { _electron as electron, expect } from '@playwright/test';
import { testVrm } from '../tests/fixtures';
import { existsSync, readFileSync } from 'node:fs';

const environment: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
environment.OPENVROOM_HEADLESS = '1';
delete environment.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  ...(process.argv[2] ? { executablePath: process.argv[2] } : {}),
  args: [...(process.argv[2] ? [] : ['.']), '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--force-device-scale-factor=1'],
  env: environment,
});
try {
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
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
  expect(errors).toEqual([]);
  console.log('PASS: Windows Electron room load, VRM import, keyboard movement');
} finally { await app.close(); }
