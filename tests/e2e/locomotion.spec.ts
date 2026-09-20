import { test, expect } from '@playwright/test';
import { testVrm } from '../fixtures';

test('movement blends idle, walk and run, then stops against a wall', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/'); await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#avatar-file').setInputFiles({ name: 'gait-test.vrm', mimeType: 'application/octet-stream', buffer: Buffer.from(testVrm()) });
  await expect(page.locator('#avatar-name')).toHaveText('gait-test');
  const viewport = page.locator('#viewport');
  await expect(viewport).toHaveAttribute('data-motion', 'idle');
  await page.locator('canvas').focus();
  await page.keyboard.down('KeyD');
  await expect(viewport).toHaveAttribute('data-motion', 'walk');
  await page.keyboard.down('ShiftLeft');
  await expect(viewport).toHaveAttribute('data-motion', 'run');
  await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyD');
  await expect(viewport).toHaveAttribute('data-motion', 'idle');
  await page.getByRole('button', { name: '出現位置に戻る', exact: true }).click();
  await page.keyboard.down('KeyS'); await page.keyboard.down('ShiftLeft');
  await expect(viewport).toHaveAttribute('data-motion', 'run');
  // Hold long enough to hit the front/right corner; animation follows actual displacement.
  await expect(viewport).toHaveAttribute('data-motion', 'idle', { timeout: 20000 });
  await expect(viewport).toHaveAttribute('data-speed', '0.000');
  await page.keyboard.up('KeyS'); await page.keyboard.up('ShiftLeft');
  expect(errors).toEqual([]);
});
