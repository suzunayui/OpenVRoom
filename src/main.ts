import './style.css';
import { World } from './core/world';
import { MAX_ASSET_BYTES } from './core/format';
import localAvatar from 'virtual:local-avatar';

const icons = {
  cube: '<path d="m12 3 9 5v8l-9 5-9-5V8l9-5Zm0 9 9-4M12 12 3 8m9 4v9M7.5 5.5l9 5"/>',
  folder: '<path d="M3 7V5h6l2 2h10v13H3V7Zm0 3h18"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  person: '<circle cx="12" cy="7" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
  home: '<path d="m3 10 9-7 9 7v11H3V10Zm6 11v-8h6v8"/>',
  reset: '<path d="M3 10a9 9 0 1 1 1 8M3 3v7h7"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3v.01"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
function icon(name: keyof typeof icons) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`; }
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="topbar">
    <a class="brand" href="./" aria-label="OpenVRoom ホーム"><span class="brand-mark">${icon('cube')}</span>Open<span>VRoom</span><small>EARLY ACCESS</small></a>
    <div class="top-right"><span class="local-badge"><i></i>ローカルセッション</span><button class="icon-button" id="help-button" aria-label="操作ガイド">${icon('help')}</button></div>
  </header>
  <main class="workspace">
    <aside class="sidebar">
      <div class="intro"><div class="eyebrow">YOUR SPACE, OPEN.</div><h1>あなたの居場所を、<br>ひらこう。</h1><p>好きな姿で、好きな空間へ。</p></div>
      <section class="room-panel">
        <div class="section-heading"><h2>ルーム</h2><span class="tiny-label">01 / LOCAL</span></div>
        <div class="room-card"><div class="room-art" aria-hidden="true"><div class="art-window"></div><div class="art-sofa"></div><div class="art-table"></div><span>STARTER ROOM</span></div>
          <div class="room-card-body"><div class="room-title-line"><span class="status-dot"></span><h3 id="room-title">ルームを準備中…</h3></div><p id="room-author">by OpenVRoom</p><div class="tags"><span>.vroom</span><span>1人用プレビュー</span></div></div>
        </div>
        <button class="primary-button" id="open-room">${icon('folder')}ルームを開く<span class="button-end">${icon('arrow')}</span></button>
        <div class="room-actions"><button class="text-button" id="starter-room">${icon('home')}サンプルに戻す</button><a class="text-button" href="./starter-room.vroom" download="starter-room.vroom" aria-label="サンプルルームを保存">${icon('download')}保存</a></div>
      </section>
      <section class="avatar-panel"><div class="section-heading"><h2>アバター</h2><span class="tiny-label">VRM 0.x / 1.0</span></div>
        <div class="avatar-current"><div class="avatar-symbol">${icon('person')}</div><div><h3 id="avatar-name">旅人</h3><p id="avatar-detail">標準アバター</p></div><span class="selected-check">${icon('check')}</span></div>
        <button class="secondary-button" id="open-avatar">${icon('upload')}VRMを読み込む</button>
        <button class="text-button default-avatar" id="default-avatar" hidden>標準アバターに戻す</button>
        <p class="privacy-note">${icon('lock')}ファイルはこの端末内で読み込みます。</p>
      </section>
      <div class="sidebar-footer"><span class="version">OPENVROOM <b>v0.1</b></span><p>まずは、ここから。<br>つながる機能はこれから。</p></div>
    </aside>
    <section class="stage" aria-label="ルームプレビュー">
      <div id="viewport">
        <div class="scene-top"><div class="scene-label"><span class="live-dot"></span><span id="scene-title">こもれびのラウンジ</span><span class="scene-divider"></span><span class="scene-subtitle">ROOM PREVIEW</span></div><button class="floating-button" id="reset-position" title="出現位置に戻る（R）" aria-label="出現位置に戻る">${icon('reset')}</button></div>
        <div class="welcome"><div class="eyebrow">MAKE YOURSELF AT HOME</div><h2>ようこそ、OpenVRoomへ。</h2><p id="room-description">光の差し込む、小さな居場所。</p></div>
        <div class="loading" id="loading" role="status"><span class="spinner"></span><span id="loading-text">ルームを読み込み中…</span></div>
        <div class="scene-bottom"><div class="movement-hint"><span class="key-group"><kbd>W</kbd><span><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span></span><span>自由に歩いてみよう<small>画面をクリックして移動</small></span></div><div class="view-hint"><span>ドラッグで見回す</span><i>·</i><span>スクロールでズーム</span></div></div>
        <div class="touch-pad" aria-label="タッチ移動"><button data-move="KeyW" aria-label="前進">↑</button><div><button data-move="KeyA" aria-label="左へ">←</button><button data-move="KeyS" aria-label="後退">↓</button><button data-move="KeyD" aria-label="右へ">→</button></div></div>
      </div>
      <footer class="statusbar"><span class="status-left"><span class="status-dot"></span><span id="status-text">準備中</span></span><span class="status-right"><span id="coordinates">X 0.0 · Z 0.0</span><span id="fps">— FPS</span><span class="renderer-label">WebGL</span></span></footer>
    </section>
  </main>
  <input type="file" id="room-file" accept=".vroom" hidden />
  <input type="file" id="avatar-file" accept=".vrm" hidden />
  <div class="toast" id="toast" role="status" hidden><span id="toast-message"></span><button id="toast-close" aria-label="通知を閉じる">${icon('close')}</button></div>
  <dialog id="help-dialog"><div class="dialog-heading"><span class="eyebrow">QUICK GUIDE</span><button class="icon-button" id="close-help" aria-label="ガイドを閉じる">${icon('close')}</button></div><h2>この空間で、できること。</h2><p>サンプルルームを歩いたり、お手持ちのVRM 0.x / 1.0アバターに着替えたりできます。</p><dl><div><dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / 矢印</dt><dd>移動</dd></div><div><dt><kbd>Shift</kbd> + 移動</dt><dd>走る</dd></div><div><dt>ドラッグ / スクロール</dt><dd>視点 / ズーム</dd></div><div><dt><kbd>R</kbd></dt><dd>出現位置に戻る</dd></div></dl><p class="dialog-note">3D画面をクリックするとキー操作が有効になります。ファイルは64 MiBまで。現在は一人用です。招待・音声・WebXRはまだ利用できません。</p><button class="primary-button" id="start-exploring">歩いてみる ${icon('arrow')}</button></dialog>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
if (import.meta.env.MODE === 'public') {
  const brand = document.querySelector<HTMLAnchorElement>('.brand')!;
  brand.href = '/'; brand.setAttribute('aria-label', 'OpenVRoom 公式ホームページ');
}
let world: World;
let pending = 0;
let toastTimer: ReturnType<typeof setTimeout>;
function notify(message: string, error = false) {
  clearTimeout(toastTimer); $('toast-message').textContent = message;
  $('toast').classList.toggle('error', error); $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 12000 : 4500);
}
async function busy(message: string, job: () => Promise<void>) {
  pending++; $('loading').hidden = false; $('loading-text').textContent = message;
  try { await job(); } catch (error) { notify(error instanceof Error ? error.message : '読み込みに失敗しました。', true); }
  finally { if (--pending === 0) $('loading').hidden = true; }
}
async function showRoom(bytes: ArrayBuffer) {
  const meta = await world.loadRoom(bytes);
  if (!meta) return;
  $('room-title').textContent = meta.title; $('scene-title').textContent = meta.title;
  $('room-author').textContent = `by ${meta.author}`; $('room-description').textContent = meta.description;
  $('status-text').textContent = '探索中 · この端末のみ';
}
async function starter() {
  await busy('ルームを読み込み中…', async () => {
    const response = await fetch('./starter-room.vroom');
    if (!response.ok) throw new Error('サンプルルームを取得できませんでした。');
    await showRoom(await response.arrayBuffer());
  });
}
function chooseFile(id: string) { const input = $<HTMLInputElement>(id); input.value = ''; input.click(); }
async function readFile(file: File, extension: string) {
  if (!file.name.toLowerCase().endsWith(extension)) throw new Error(`${extension}ファイルを選択してください。`);
  if (file.size > MAX_ASSET_BYTES) throw new Error('ファイルは64 MiB以下にしてください。');
  return file.arrayBuffer();
}
$('toast-close').onclick = () => { $('toast').hidden = true; };
const help = $<HTMLDialogElement>('help-dialog');
$('help-button').onclick = () => help.showModal();
$('close-help').onclick = () => help.close();
$('start-exploring').onclick = () => { help.close(); world?.focus(); };
help.addEventListener('click', event => { if (event.target === help) { const r = help.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) help.close(); } });

try {
  world = new World($('viewport'));
  world.onError = message => notify(message, true);
  world.onStats = stats => {
    $('coordinates').textContent = `X ${stats.x.toFixed(1)} · Z ${stats.z.toFixed(1)}`;
    $('fps').textContent = `${stats.fps} FPS`;
    $('viewport').dataset.motion = stats.motion;
    $('viewport').dataset.speed = stats.speed.toFixed(3);
  };
  $('open-room').onclick = () => chooseFile('room-file');
  $('open-avatar').onclick = () => chooseFile('avatar-file');
  $('starter-room').onclick = () => void starter();
  $('reset-position').onclick = () => { world.resetPosition(); world.focus(); notify('出現位置に戻りました。'); };
  $('default-avatar').onclick = () => {
    world.useDefaultAvatar(); $('avatar-name').textContent = '旅人'; $('avatar-detail').textContent = '標準アバター'; $('default-avatar').hidden = true;
    notify('標準アバターに戻しました。');
  };
  $('room-file').addEventListener('change', () => {
    const file = $<HTMLInputElement>('room-file').files?.[0]; if (!file) return;
    void busy('ルームを検証しています…', async () => { await showRoom(await readFile(file, '.vroom')); notify('ルームを読み込みました。'); });
  });
  $('avatar-file').addEventListener('change', () => {
    const file = $<HTMLInputElement>('avatar-file').files?.[0]; if (!file) return;
    void busy('アバターを読み込み中…', async () => {
      if (!await world.loadAvatar(await readFile(file, '.vrm'))) return;
      $('avatar-name').textContent = file.name.replace(/\.vrm$/i, ''); $('avatar-detail').textContent = 'VRM · ローカル'; $('default-avatar').hidden = false;
      notify('アバターを変更しました。3D画面をクリックして歩いてみましょう。');
    });
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-move]')) {
    button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); world.setMovement(button.dataset.move!, true); });
    const stop = () => world.setMovement(button.dataset.move!, false);
    button.addEventListener('pointerup', stop); button.addEventListener('pointercancel', stop); button.addEventListener('lostpointercapture', stop);
  }
  window.addEventListener('pagehide', () => world.dispose(), { once: true });
  await starter();
  if (localAvatar) {
    const config = localAvatar;
    await busy('あなたのアバターを読み込み中…', async () => {
    const response = await fetch(config.url);
    if (!response.ok) throw new Error('設定されたアバターを読み込めませんでした。');
    if (await world.loadAvatar(await response.arrayBuffer())) {
      $('avatar-name').textContent = config.name;
      $('avatar-detail').textContent = 'VRM · ローカル';
      $('default-avatar').hidden = false;
    }
  });
  }
} catch (error) {
  $('loading').hidden = true; $('status-text').textContent = '3D描画を開始できません';
  for (const id of ['open-room', 'open-avatar', 'starter-room', 'reset-position']) $<HTMLButtonElement>(id).disabled = true;
  notify(`3D描画を開始できません。WebGL 2対応のブラウザで開いてください。${error instanceof Error ? error.message : ''}`, true);
}
