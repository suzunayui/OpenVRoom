import { build } from 'vite';
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

await build({ mode: 'public', build: { outDir: 'web-dist/room', emptyOutDir: true } });
await cp('website', 'web-dist', { recursive: true });
await cp('public/starter-room.vroom', 'web-dist/room/starter-room.vroom');
await cp('public/motions', 'web-dist/room/motions', { recursive: true });
const roomHtml = (await readFile('web-dist/room/index.html', 'utf8'))
  .replace(' ws://127.0.0.1:5173', '')
  .replace('</head>', '<link rel="canonical" href="https://openvroom.com/room/"><link rel="icon" href="/favicon.svg"><meta name="description" content="VRMアバターで3Dルームを歩く、OpenVRoomのブラウザプレビュー。アカウント不要で体験できます。"></head>');
await writeFile('web-dist/room/index.html', roomHtml);
await mkdir('web-dist/room/assets', { recursive: true });
async function audit(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { if (entry.name === 'avatars') throw new Error(`Private directory: ${path}`); await audit(path); }
    else {
      if (/\.vrm$|local-avatar|\.env|\.map$/i.test(entry.name)) throw new Error(`Private file: ${path}`);
      if (/\.(js|html|json)$/.test(entry.name) && /avatars[\\/]|vroid-files|[A-Z]:[\\/]+Users[\\/]|\/Users\/|\/home\//i.test(await readFile(path, 'utf8'))) throw new Error(`Private reference: ${path}`);
    }
  }
}
await audit('web-dist');
console.log('Public website + /room/ built. Private avatar audit passed.');
