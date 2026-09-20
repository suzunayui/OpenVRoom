import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5180/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
  for(const [id,title] of [['lounge','こもれびのラウンジ'],['cafe','ボタニカルカフェ'],['library','雨音の書斎'],['garden','月庭の和室']]) {
    await page.locator('#settings-button').click(); await page.locator('#tab-room').click();
    await page.locator(`[data-sample=${id}]`).click();
    await expect(page.locator('#settings-dialog')).toBeHidden();
    await expect(page.locator('#room-title')).toHaveText(title);
    await expect(page.locator('#loading')).toBeHidden();
    await page.locator('canvas').focus();const before=await page.locator('#coordinates').textContent();
    await page.keyboard.down('KeyW');await page.waitForTimeout(900);await page.keyboard.up('KeyW');
    await expect(page.locator('#coordinates')).not.toHaveText(before!);
    await page.locator('#reset-position').click();await page.locator('#toast-close').click();
    await page.mouse.move(800,500);await page.mouse.wheel(0,220);await page.mouse.down();await page.mouse.move(850,520,{steps:10});await page.mouse.up();await page.waitForTimeout(1200);
    await page.evaluate(async ({id}) => {
      const modulePath = '/src/core/world.ts';
      const { World } = await import(/* @vite-ignore */ modulePath);
      const container = document.createElement('div'); container.id = 'sample-capture';
      Object.assign(container.style, { position:'fixed', inset:'0', zIndex:'1000', background:'#222' });
      document.body.append(container);
      const world = new World(container);
      await world.loadRoom(await (await fetch(id === 'lounge' ? '/starter-room.vroom' : `/rooms/${id}.vroom`)).arrayBuffer());
      world.player.visible = false;
      world.player.position.set(0, 0, 0);
      Object.assign(world, { yaw: .42, pitch: .67, distance: 12.2 });
      Object.assign(window, { sampleCapture: world });
    }, {id});
    await page.waitForTimeout(1200);
    await page.locator('#sample-capture').screenshot({path:`public/rooms/${id}.jpg`,type:'jpeg',quality:86});
    await page.evaluate(() => { (window as any).sampleCapture.dispose(); document.getElementById('sample-capture')!.remove(); });
    console.log('PASS room load, movement and capture:',id);
  }
  expect(errors).toEqual([]);
}finally{await browser.close();}
