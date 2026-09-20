import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('website/assets', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
  await page.goto('http://127.0.0.1:5173/');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 60000 });
  if (await page.locator('#default-avatar').isVisible()) await page.locator('#default-avatar').click();
  await expect(page.locator('#avatar-name')).toHaveText('旅人');
  await page.addStyleTag({ content: '.topbar,.sidebar,.statusbar,#viewport>div,.toast{display:none!important}.workspace{display:block!important;min-height:0!important}#viewport{height:100vh!important;min-height:0!important}.stage{height:100vh!important}' });
  await page.waitForTimeout(600);
  await page.locator('canvas').screenshot({ path: 'website/assets/lounge.png' });
} finally { await browser.close(); }
