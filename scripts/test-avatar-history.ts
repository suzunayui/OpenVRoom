import { chromium, expect } from '@playwright/test';
import { testVrm } from '../tests/fixtures';
import { packGlb } from './glb';
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.argv[2] ?? 'http://127.0.0.1:5180/');await expect(page.locator('#loading')).toBeHidden();
 const first=Buffer.from(testVrm());const length=first.readUInt32LE(12);const json=JSON.parse(first.subarray(20,20+length).toString());json.asset.generator='second-avatar';const second=Buffer.from(packGlb(json,first.subarray(28+length)));
 async function upload(name:string,buffer:Buffer) {await page.locator('#avatar-file').setInputFiles({name,mimeType:'application/octet-stream',buffer});await expect(page.locator('#loading')).toBeHidden();}
 await upload('one.vrm',first);await expect(page.locator('#avatar-history li')).toHaveCount(1);
 await upload('two.vrm',second);await expect(page.locator('#avatar-history li')).toHaveCount(2);
 await upload('one.vrm',first);await expect(page.locator('#avatar-history li')).toHaveCount(2);
 await upload('broken.vrm',Buffer.from('invalid'));await expect(page.locator('#avatar-history li')).toHaveCount(2);
 await page.reload();await expect(page.locator('#loading')).toBeHidden();await page.locator('#settings-button').click();await page.locator('#tab-avatar').click();
 await expect(page.locator('#avatar-history li')).toHaveCount(2);
 await page.locator('.avatar-history-select').filter({hasText:'two'}).click();await expect(page.locator('#avatar-name')).toHaveText('two');await expect(page.locator('#loading')).toBeHidden();
 await page.getByRole('button',{name:'twoを履歴から削除'}).click();await expect(page.locator('#avatar-history li')).toHaveCount(1);await expect(page.locator('#avatar-name')).toHaveText('two');
 await page.reload();await expect(page.locator('#loading')).toBeHidden();await expect(page.locator('#avatar-history li')).toHaveCount(1);
 await page.evaluate(()=>{indexedDB.open=()=>{throw new Error('Test storage unavailable');};});
 await upload('not-saved.vrm',second);await expect(page.locator('#avatar-name')).toHaveText('not-saved');await expect(page.locator('#toast-message')).toContainText('保存できません');
 expect(errors).toEqual([]);console.log('PASS: persistent VRM history, two selections, deduplication, invalid-file exclusion, individual deletion, storage-failure fallback');
}finally{await browser.close();}
