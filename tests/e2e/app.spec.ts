import { test, expect } from '@playwright/test';
import { testVrm } from '../fixtures';
import { readFileSync } from 'node:fs';
import { packGlb } from '../../scripts/glb';
import { validateAsset } from '../../src/core/format';

test('room renders, keyboard movement works, reset and validation recover', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#status-text')).toHaveText('探索中 · この端末のみ');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#room-title')).toHaveText('こもれびのラウンジ');
  const canvas = page.locator('canvas'); await canvas.focus();
  await expect(page.locator('#coordinates')).toContainText('Z 2.4');
  const start = await page.locator('#coordinates').textContent();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1000); await page.keyboard.up('KeyW');
  await expect(page.locator('#coordinates')).not.toHaveText(start!);
  await page.getByRole('button', { name: '出現位置に戻る', exact: true }).click();
  await expect(page.locator('#coordinates')).toContainText('Z 2.4');
  await page.locator('#room-file').setInputFiles({ name: 'broken.vroom', mimeType: 'application/octet-stream', buffer: Buffer.from('broken') });
  await expect(page.locator('#toast')).toHaveClass(/error/);
  await expect(page.locator('#room-title')).toHaveText('こもれびのラウンジ');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#toast-close').click();
  await page.locator('#room-file').setInputFiles('public/starter-room.vroom');
  await expect(page.locator('#toast')).not.toHaveClass(/error/);
  await page.locator('#toast-close').click();
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('VRM 1.0 loads, animates, switches, and preserves avatar after a bad upload', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#avatar-file').setInputFiles({ name: 'test-humanoid.vrm', mimeType: 'application/octet-stream', buffer: Buffer.from(testVrm()) });
  await expect(page.locator('#avatar-name')).toHaveText('test-humanoid');
  await expect(page.locator('#avatar-detail')).toHaveText('VRM · ローカル');
  await page.locator('canvas').focus(); await page.keyboard.down('KeyD'); await page.waitForTimeout(500); await page.keyboard.up('KeyD');
  await page.locator('#avatar-file').setInputFiles({ name: 'bad.vrm', mimeType: 'application/octet-stream', buffer: Buffer.from('invalid') });
  await expect(page.locator('#toast')).toHaveClass(/error/);
  await expect(page.locator('#avatar-name')).toHaveText('test-humanoid');
  await page.screenshot({ path: 'test-results/vrm.png' });
  await page.getByRole('button', { name: '標準アバターに戻す' }).click();
  await expect(page.locator('#avatar-name')).toHaveText('旅人');
  await expect(page.locator('#default-avatar')).toBeHidden();
  expect(errors).toEqual([]);
});

test('custom room title is text, blocked asset makes no outbound requests', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:5173') && !request.url().startsWith('blob:')) requests.push(request.url()); });
  await page.goto('/'); await expect(page.locator('#loading')).toBeHidden();
  const file = readFileSync('public/starter-room.vroom');
  const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const json = validateAsset(bytes, 'room').json;
  const binary = new Uint8Array(bytes, 28 + new DataView(bytes).getUint32(12, true));
  json.extensions.OPENVROOM_room.title = '<img src=x onerror=alert(1)>';
  await page.locator('#room-file').setInputFiles({ name: 'custom.vroom', mimeType: 'application/octet-stream', buffer: Buffer.from(packGlb(json, binary)) });
  await expect(page.locator('#room-title')).toHaveText('<img src=x onerror=alert(1)>');
  expect(await page.locator('#room-title img').count()).toBe(0);
  json.buffers[0].uri = 'https://example.com/private';
  await page.locator('#room-file').setInputFiles({ name: 'external.vroom', mimeType: 'application/octet-stream', buffer: Buffer.from(packGlb(json, binary)) });
  await expect(page.locator('#toast-message')).toContainText('外部参照');
  expect(requests).toEqual([]);
});

test('mobile layout and guide stay usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await expect(page.locator('#loading')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: '操作ガイド' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '歩いてみる' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});
