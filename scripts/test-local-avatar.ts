import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile('src/local-avatar.json', 'utf8').then(text => text.replace(/^\uFEFF/, '')));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:5173/');
  await expect(page.locator('#avatar-name')).toHaveText(config.name, { timeout: 60000 });
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#coordinates')).toContainText('Z 2.4');
  await page.locator('canvas').focus();
  await page.keyboard.down('KeyW');
  await expect(page.locator('#viewport')).toHaveAttribute('data-motion', 'walk');
  await page.screenshot({ path: 'test-results/local-avatar-walk.png' });
  await page.keyboard.down('ShiftLeft');
  await expect(page.locator('#viewport')).toHaveAttribute('data-motion', 'run');
  await page.screenshot({ path: 'test-results/local-avatar-run.png' });
  await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
  await expect(page.locator('#viewport')).toHaveAttribute('data-motion', 'idle');
  await expect(page.locator('#coordinates')).not.toContainText('Z 2.4');
  await page.getByRole('button', { name: '出現位置に戻る', exact: true }).click();
  // Face the camera to inspect the imported model's orientation and materials.
  await page.locator('canvas').focus();
  await page.keyboard.down('KeyS'); await page.waitForTimeout(400); await page.keyboard.up('KeyS');
  await page.waitForTimeout(700);
  await page.locator('#toast-close').click();
  await page.screenshot({ path: 'test-results/local-avatar.png' });
  expect(errors).toEqual([]);
  console.log(`PASS: ${config.name} auto-loads and moves without runtime errors`);
} finally { await browser.close(); }
