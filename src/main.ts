import './style.css';
import { listAvatars, saveAvatar, readAvatar, deleteAvatar } from './storage/avatar-history';
import { World } from './core/world';
import { MAX_ASSET_BYTES } from './core/format';
import localAvatar from 'virtual:local-avatar';
import { RoomSession } from './network/session';
import { displayName, inviteToken } from './network/protocol';
import { VoiceController, type VoiceState, type VoiceLevels } from './audio/voice';

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
    <div class="top-right"><button class="text-button" id="online-button">友だちと遊ぶ</button><button class="settings-button" id="settings-button" aria-haspopup="dialog">設定</button><button class="text-button" id="quick-mic" hidden aria-pressed="false">マイクをオン</button><span class="local-badge" id="session-badge"><i></i><span id="session-label">ローカルセッション</span></span><button class="icon-button" id="help-button" aria-label="操作ガイド">${icon('help')}</button></div>
  </header>
  <main class="workspace">

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
  <dialog id="settings-dialog" aria-labelledby="settings-title">
    <div class="settings-heading"><div><span class="eyebrow">MAKE IT YOURS</span><h2 id="settings-title">設定</h2></div><button class="icon-button" id="close-settings" aria-label="設定を閉じる">${icon('close')}</button></div>
    <div class="settings-tabs" role="tablist" aria-label="設定の種類">
      <button role="tab" id="tab-room" aria-controls="panel-room" aria-selected="true" tabindex="0">ルーム</button>
      <button role="tab" id="tab-avatar" aria-controls="panel-avatar" aria-selected="false" tabindex="-1">アバター</button>
      <button role="tab" id="tab-social" aria-controls="panel-social" aria-selected="false" tabindex="-1">交流・音声</button>
    </div><div class="settings-content">
      <section id="panel-room" role="tabpanel" aria-labelledby="tab-room" tabindex="0" class="room-panel">
        <div class="section-heading"><h2>ルーム</h2><span class="tiny-label">01 / LOCAL</span></div>
        <div class="room-card"><div class="room-art" aria-hidden="true"><div class="art-window"></div><div class="art-sofa"></div><div class="art-table"></div><span>STARTER ROOM</span></div>
          <div class="room-card-body"><div class="room-title-line"><span class="status-dot"></span><h3 id="room-title">ルームを準備中…</h3></div><p id="room-author">by OpenVRoom</p><div class="tags"><span>.vroom</span><span>最大6人で参加</span></div></div>
        </div>
        <button class="primary-button" id="open-room">${icon('folder')}ルームを開く<span class="button-end">${icon('arrow')}</span></button>
        <div class="room-actions"><button class="text-button" id="starter-room">${icon('home')}サンプルに戻す</button><a class="text-button" href="./starter-room.vroom" download="starter-room.vroom" aria-label="サンプルルームを保存">${icon('download')}保存</a></div>
        <div class="sample-heading"><h3>サンプルルーム</h3><p>部屋を選んで探索。招待すれば友だちとも遊べます。</p></div>
        <div class="sample-rooms">
          <button class="sample-room" data-sample="cafe"><img src="./rooms/cafe.jpg" alt="" loading="lazy"><span>ボタニカルカフェ<small>植物・真鍮・コーヒー</small></span></button>
          <button class="sample-room" data-sample="library"><img src="./rooms/library.jpg" alt="" loading="lazy"><span>雨音の書斎<small>本棚・暖炉・読書の席</small></span></button>
          <button class="sample-room" data-sample="garden"><img src="./rooms/garden.jpg" alt="" loading="lazy"><span>月庭の和室<small>畳・池・竹の庭</small></span></button>
        </div>
      </section>
      <section id="panel-avatar" role="tabpanel" aria-labelledby="tab-avatar" tabindex="0" hidden class="avatar-panel"><div class="section-heading"><h2>アバター</h2><span class="tiny-label">VRM 0.x / 1.0</span></div>
        <div class="avatar-current"><div class="avatar-symbol">${icon('person')}</div><div><h3 id="avatar-name">旅人</h3><p id="avatar-detail">標準アバター</p></div><span class="selected-check">${icon('check')}</span></div>
        <button class="secondary-button" id="open-avatar">${icon('upload')}VRMを読み込む</button>
        <button class="text-button default-avatar" id="default-avatar" hidden>標準アバターに戻す</button>
        <p class="privacy-note">${icon('lock')}共有を選ぶまで、この端末内で読み込みます。</p>
        <div class="avatar-history-heading"><h3>この端末のアバター履歴</h3><p>読み込んだVRMを最大20件・合計256 MiBまで保存します。サーバーには保存しません。ブラウザのデータを消すと履歴も消えます。</p></div>
        <p id="avatar-history-status" role="status">履歴を読み込み中…</p>
        <ul id="avatar-history" aria-label="保存したアバター"></ul>
      </section>
      <section id="panel-social" role="tabpanel" aria-labelledby="tab-social" tabindex="0" hidden class="multiplayer-panel" aria-label="みんなで遊ぶ">
        <div class="section-heading"><h2>みんなで遊ぶ</h2><span class="tiny-label" id="member-count">最大6人</span></div>
        <div id="session-entry">
          <label class="field-label" for="player-name">表示名</label><input id="player-name" maxlength="24" value="旅人" autocomplete="off" />
          <label class="share-choice"><input id="share-avatar" type="checkbox" />選択中のVRMを参加者に共有する</label>
          <p class="session-note">オフなら相手には標準アバターで表示されます。共有できるVRMを選んでください。</p>
          <button class="primary-button" id="create-room">ルームを作って招待</button>
          <label class="field-label" for="invite-input">招待リンク</label><input id="invite-input" type="text" placeholder="招待リンクを貼り付け" autocomplete="off" spellcheck="false" />
          <button class="secondary-button" id="join-room">招待されたルームに参加</button>
          <p class="session-note">入室すると位置を共有します。作成時は今のルームも参加者に送ります。マイクは入室時オフです。</p>
        </div>
        <div id="session-active" hidden>
          <p id="session-status" role="status">接続中…</p>
          <label class="field-label" for="invite-link">友だちに送るリンク</label><input id="invite-link" readonly aria-label="友だちに送るリンク" />
          <button class="secondary-button" id="copy-invite">招待リンクをコピー</button>
          <div class="voice-controls" id="voice-controls">
            <h3>音声通話</h3>
            <button class="secondary-button" id="mic-toggle" aria-pressed="false" disabled>マイクをオン</button>
            <p id="mic-status" role="status">マイクはオフです</p>
            <label class="field-label" for="mic-device">使用するマイク</label>
            <select id="mic-device"><option value="">システム既定のマイク</option></select>
            <button class="text-button" id="refresh-mics">マイク一覧を取得</button>
            <label class="field-label" for="mic-level">入力レベル</label><meter id="mic-level" min="0" max="1" value="0" aria-label="マイク入力レベル"></meter>
            <button class="secondary-button" id="resume-audio" hidden>音声の再生を有効にする</button>
            <p class="session-note">初回はマイクの許可が必要です。一覧取得だけでは送信しません。声は距離に応じて聞こえます。録音はしません。</p>
          </div>
          <ul id="member-list" aria-label="参加者"></ul>
          <button class="secondary-button" id="leave-room">退出する</button>
          <p class="session-note">ホストが退出すると終了します。着替え・ルーム変更は退出後にできます。</p>
        </div>
      </section>
    </div><div class="settings-footer">設定中もルームへの接続・音声通話は続きます。</div></dialog>
  <input type="file" id="room-file" accept=".vroom" hidden />
  <input type="file" id="avatar-file" accept=".vrm" hidden />
  <div class="toast" id="toast" role="status" hidden><span id="toast-message"></span><button id="toast-close" aria-label="通知を閉じる">${icon('close')}</button></div>
  <dialog id="help-dialog"><div class="dialog-heading"><span class="eyebrow">QUICK GUIDE</span><button class="icon-button" id="close-help" aria-label="ガイドを閉じる">${icon('close')}</button></div><h2>この空間で、できること。</h2><p>サンプルルームを歩いたり、お手持ちのVRM 0.x / 1.0アバターに着替えたりできます。</p><dl><div><dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / 矢印</dt><dd>移動</dd></div><div><dt><kbd>Shift</kbd> + 移動</dt><dd>走る</dd></div><div><dt>ドラッグ / スクロール</dt><dd>視点 / ズーム</dd></div><div><dt><kbd>R</kbd></dt><dd>出現位置に戻る</dd></div></dl><p class="dialog-note">3D画面をクリックするとキー操作が有効になります。ファイルは64 MiBまで。招待リンクで最大6人が参加できます。VRM共有は入室前に選択できます。音声通話は入室後にマイクをオンにすると使えます。WebXRはまだ利用できません。</p><button class="primary-button" id="start-exploring">歩いてみる ${icon('arrow')}</button></dialog>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
if (import.meta.env.MODE === 'public') {
  const brand = document.querySelector<HTMLAnchorElement>('.brand')!;
  brand.href = '/'; brand.setAttribute('aria-label', 'OpenVRoom 公式ホームページ');
}
let world: World;
let pending = 0;
let roomBytes: ArrayBuffer | undefined;
let avatarBytes: ArrayBuffer | undefined;
let selectedAvatarId: string | undefined;
let session: RoomSession | undefined;
let voice: VoiceController | undefined;
let sessionTimer: ReturnType<typeof setInterval> | undefined;
let sessionRestoring = false;
let toastTimer: ReturnType<typeof setTimeout>;
function notify(message: string, error = false) {
  clearTimeout(toastTimer); $('toast-message').textContent = message;
  $('toast').classList.toggle('error', error); $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 12000 : 4500);
}
async function refreshAvatarHistory() {
  try {
    const entries = await listAvatars();
    $('avatar-history-status').textContent = entries.length ? `${entries.length}件 · このブラウザ／アプリ内に保存` : 'まだ履歴はありません。VRMを読み込むと追加されます。';
    $('avatar-history').replaceChildren(...entries.map(entry => {
      const item = document.createElement('li');
      const select = document.createElement('button'); select.className = 'avatar-history-select';
      select.disabled = !!session || pending > 0; select.setAttribute('aria-pressed', String(entry.id === selectedAvatarId));
      const name = document.createElement('span'); name.textContent = entry.name;
      const detail = document.createElement('small'); detail.textContent = `${(entry.size / 1048576).toFixed(1)} MiB${entry.id === selectedAvatarId ? ' · 選択中' : ''}`;
      select.append(name, detail);
      select.onclick = () => {
        if (session || pending) return;
        void busy('履歴からアバターを読み込み中…', async () => {
          const bytes = await readAvatar(entry.id);
          if (!await world.loadAvatar(bytes)) return;
          avatarBytes = bytes; selectedAvatarId = entry.id;
          $('avatar-name').textContent = entry.name; $('avatar-detail').textContent = 'VRM · ローカル'; $('default-avatar').hidden = false;
          notify('保存したアバターに変更しました。');
        });
      };
      const remove = document.createElement('button'); remove.className = 'text-button'; remove.textContent = '削除';
      remove.setAttribute('aria-label', `${entry.name}を履歴から削除`);
      remove.disabled = pending > 0;
      remove.onclick = async () => {
        remove.disabled = true;
        try { await deleteAvatar(entry.id); if (selectedAvatarId === entry.id) selectedAvatarId = undefined; await refreshAvatarHistory(); notify('履歴から削除しました。元のVRMファイルは残ります。'); }
        catch { remove.disabled = false; notify('履歴を削除できませんでした。', true); }
      };
      item.append(select, remove); return item;
    }));
  } catch { $('avatar-history-status').textContent = 'この環境では履歴を利用できません。VRMファイルからは読み込めます。'; }
}
async function busy(message: string, job: () => Promise<void>) {
  pending++; for (const button of document.querySelectorAll<HTMLButtonElement>('#avatar-history button')) button.disabled = true; $('loading').hidden = false; $('loading-text').textContent = message;
  try { await job(); } catch (error) { notify(error instanceof Error ? error.message : '読み込みに失敗しました。', true); }
  finally { if (--pending === 0) { $('loading').hidden = true; void refreshAvatarHistory(); } }
}
async function showRoom(bytes: ArrayBuffer, sample?: string) {
  const meta = await world.loadRoom(bytes);
  if (!meta) return;
  $('room-title').textContent = meta.title; $('scene-title').textContent = meta.title;
  $('room-author').textContent = `by ${meta.author}`; $('room-description').textContent = meta.description;
  roomBytes = bytes;
  const art = document.querySelector<HTMLElement>('.room-art')!;
  art.classList.toggle('room-photo', !!sample);
  art.style.backgroundImage = sample ? `url(./rooms/${sample}.jpg)` : '';
  art.style.backgroundSize = sample ? 'cover' : '';
  art.style.backgroundPosition = sample ? 'center' : '';
  if (!session) $('status-text').textContent = '探索中 · この端末のみ';
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
const settings = $<HTMLDialogElement>('settings-dialog');
const settingsTabs = [...settings.querySelectorAll<HTMLButtonElement>('[role=tab]')];
function selectSettings(tab: string) {
  if (tab === 'avatar') void refreshAvatarHistory();
  for (const button of settingsTabs) {
    const selected = button.id === `tab-${tab}`;
    button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    $(button.getAttribute('aria-controls')!).hidden = !selected;
  }
}
function openSettings(tab?: string) {
  if (tab) selectSettings(tab);
  world?.clearMovement();
  settings.append($('toast'));
  if (!settings.open) settings.showModal();
}
$('settings-button').onclick = () => openSettings();
$('close-settings').onclick = () => settings.close();
settings.addEventListener('close', () => { document.querySelector('#app')!.append($('toast')); });
settings.addEventListener('click', event => {
  if (event.target !== settings) return;
  const r = settings.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) settings.close();
});
for (const [index, button] of settingsTabs.entries()) {
  button.onclick = () => selectSettings(button.id.slice(4));
  button.onkeydown = event => {
    const next = event.key === 'ArrowRight' ? (index + 1) % settingsTabs.length : event.key === 'ArrowLeft' ? (index + settingsTabs.length - 1) % settingsTabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? settingsTabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); settingsTabs[next].click(); settingsTabs[next].focus();
  };
}
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
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-sample]')) {
    button.onclick = () => {
      if (session || pending) return;
      void busy('サンプルルームを読み込み中…', async () => {
        const response = await fetch(`./rooms/${button.dataset.sample}.vroom`);
        if (!response.ok) throw new Error('サンプルルームを取得できませんでした。');
        await showRoom(await response.arrayBuffer(), button.dataset.sample);
        settings.close(); world.focus(); notify('ルームを変更しました。自由に探索してみましょう。');
      });
    };
  }

  $('reset-position').onclick = () => { world.resetPosition(); world.focus(); notify('出現位置に戻りました。'); };
  $('default-avatar').onclick = () => {
    if (session || pending) return;
    selectedAvatarId = undefined; void refreshAvatarHistory();
    avatarBytes = undefined; world.useDefaultAvatar(); $('avatar-name').textContent = '旅人'; $('avatar-detail').textContent = '標準アバター'; $('default-avatar').hidden = true;
    notify('標準アバターに戻しました。');
  };
  $('room-file').addEventListener('change', () => {
    const file = $<HTMLInputElement>('room-file').files?.[0]; if (!file || session) return;
    void busy('ルームを検証しています…', async () => { await showRoom(await readFile(file, '.vroom')); notify('ルームを読み込みました。'); });
  });
  $('avatar-file').addEventListener('change', () => {
    const file = $<HTMLInputElement>('avatar-file').files?.[0]; if (!file || session || pending) return;
    void busy('アバターを読み込み中…', async () => {
      const bytes = await readFile(file, '.vrm');
      if (!await world.loadAvatar(bytes)) return;
      avatarBytes = bytes;
      $('avatar-name').textContent = file.name.replace(/\.vrm$/i, ''); $('avatar-detail').textContent = 'VRM · ローカル'; $('default-avatar').hidden = false;
      selectedAvatarId = undefined;
      try { selectedAvatarId = await saveAvatar(file.name.replace(/\.vrm$/i, ''), bytes); notify('アバターを変更し、この端末の履歴に保存しました。'); }
      catch { notify('アバターは変更しましたが、履歴に保存できませんでした。保存容量やブラウザの設定を確認してください。', true); }
    });
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-move]')) {
    button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); world.setMovement(button.dataset.move!, true); });
    const stop = () => world.setMovement(button.dataset.move!, false);
    button.addEventListener('pointerup', stop); button.addEventListener('pointercancel', stop); button.addEventListener('lostpointercapture', stop);
  }
  window.addEventListener('pagehide', () => { session?.close(); world.dispose(); }, { once: true });
  await starter();
  if (localAvatar) {
    const config = localAvatar;
    await busy('あなたのアバターを読み込み中…', async () => {
    const response = await fetch(config.url);
    if (!response.ok) throw new Error('設定されたアバターを読み込めませんでした。');
    const bytes = await response.arrayBuffer();
    if (await world.loadAvatar(bytes)) {
      avatarBytes = bytes;
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

function lockAssets(locked: boolean) {
  void refreshAvatarHistory();
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-sample]')) button.disabled = locked;
  for (const id of ['open-room', 'starter-room', 'open-avatar', 'default-avatar', 'create-room', 'join-room']) $<HTMLButtonElement>(id).disabled = locked;
}
function readInvitation(value: string): string {
  let token = value.trim();
  if (token.includes('#')) token = new URLSearchParams(token.slice(token.indexOf('#') + 1)).get('invite') ?? '';
  else if (token.includes('/')) {
    try { token = new URL(token.includes('://') ? token : `https://${token}`).pathname.match(/^\/room\/([A-Za-z0-9_-]+)\/?$/)?.[1] ?? ''; }
    catch { token = ''; }
  }
  const parsed = inviteToken.safeParse(token);
  if (!parsed.success) throw new Error('有効な招待リンクを貼り付けてください。');
  return parsed.data;
}
function enterSession(join: boolean) {
  if (session || pending || sessionRestoring || !roomBytes) return;
  const parsed = displayName.safeParse($<HTMLInputElement>('player-name').value);
  if (!parsed.success) { notify('表示名を1〜24文字で入力してください（記号 < > や改行は使えません）。', true); return; }
  let token: string | undefined;
  try { token = join ? readInvitation($<HTMLInputElement>('invite-input').value) : undefined; }
  catch (error) { notify((error as Error).message, true); return; }
  const originalRoom = roomBytes;
  const members = new Set<string>();
  let selfId = '';
  function voiceLevels(levels: VoiceLevels) {
    $<HTMLMeterElement>('mic-level').value = levels.local;
    const own = document.querySelector<HTMLElement>(`[data-member-id="${selfId}"] .talk-state`);
    if (own) { own.textContent = $('mic-toggle').getAttribute('aria-pressed') === 'true' ? levels.local > 0.03 ? '発話中' : 'マイクON' : 'マイクOFF'; own.dataset.speaking = String(levels.local > 0.03); }
    for (const peer of levels.peers) {
      const row = document.querySelector<HTMLElement>(`[data-member-id="${peer.id}"]`);
      if (!row) continue;
      row.dataset.voiceEnabled = String(peer.enabled); row.dataset.voiceLevel = peer.level.toFixed(3);
      const label = row.querySelector<HTMLElement>('.talk-state')!;
      label.textContent = peer.muted ? '消音中' : !peer.enabled ? 'マイクOFF' : peer.level > 0.03 ? '発話中' : 'マイクON';
      label.dataset.speaking = String(peer.level > 0.03 && !peer.muted);
    }
  }
  const sharedAvatar = $<HTMLInputElement>('share-avatar').checked ? avatarBytes : undefined;
  if (avatarBytes) $('avatar-detail').textContent = sharedAvatar ? 'VRM · 参加者に共有' : 'VRM · 自分のみ';
  lockAssets(true);
  $('session-entry').hidden = true; $('session-active').hidden = false;
  $('session-status').textContent = '接続中…'; $('session-label').textContent = 'オンライン接続中';
  $('member-list').replaceChildren(); $<HTMLInputElement>('invite-link').value = '';
  $('status-text').textContent = '接続中…';
  const current = new RoomSession({ room: originalRoom, avatar: sharedAvatar }, {
    audio: (id, track) => { if (session === current) voice?.addTrack(id, track); else track.stop(); },
    voice: (id, enabled) => { if (session === current) voice?.setEnabled(id, enabled); },
    room: async bytes => { if (session === current) await showRoom(bytes); },
    avatar: async (id, bytes) => { if (session === current) await world.loadRemoteAvatar(id, bytes); },
    members: (list, self, host, ready) => {
      if (session !== current) return;
      selfId = self; voice?.setReady(ready.has(self));
      for (const member of list) if (member.id !== self) { world.addRemote(member.id, member.name); members.add(member.id); voice?.setPeerReady(member.id, ready.has(member.id)); }
      $('member-list').replaceChildren(...list.map(member => {
        const li = document.createElement('li'); li.dataset.memberId = member.id;
        const name = document.createElement('span');
        name.textContent = `${member.name}${member.id === self ? '（あなた）' : ''}${member.id === host ? ' · ホスト' : ''} · ${ready.has(member.id) ? '参加中' : '準備中'}`;
        const talking = document.createElement('span'); talking.className = 'talk-state'; talking.textContent = 'マイクOFF';
        li.append(name, talking);
        if (member.id !== self) {
          const controls = document.createElement('div'); controls.className = 'voice-member-controls';
          const mute = document.createElement('button'); mute.className = 'text-button'; mute.textContent = '消音'; mute.setAttribute('aria-label', `${member.name}をミュート`); mute.setAttribute('aria-pressed', String(voice?.isMuted(member.id) ?? false));
          mute.onclick = () => { const muted = !(voice?.isMuted(member.id) ?? false); voice?.setMuted(member.id, muted); mute.setAttribute('aria-pressed', String(muted)); };
          const volume = document.createElement('input'); volume.type = 'range'; volume.min = '0'; volume.max = '200'; volume.step = '5'; volume.value = String((voice?.volume(member.id) ?? 1) * 100); volume.setAttribute('aria-label', `${member.name}の音量`);
          const value = document.createElement('output'); value.textContent = `${volume.value}%`;
          volume.oninput = () => { voice?.setVolume(member.id, Number(volume.value) / 100); value.textContent = `${volume.value}%`; };
          controls.append(mute, volume, value); li.append(controls);
        }
        return li;
      }));
      $('member-count').textContent = `${list.length} / 6人`;
      $('session-label').textContent = `オンライン · ${ready.size}人`;
      $('status-text').textContent = ready.has(self) ? `みんなで探索中 · ${ready.size}人` : 'ルームを受信中…';
      if (self === host) $('session-status').textContent = ready.size > 1 ? '同じルームでつながっています。' : '招待リンクを送って、友だちを待ちましょう。';
      $('leave-room').textContent = self === host ? 'ルームを終了する' : '退出する';
    },
    pose: (id, pose) => { if (session === current) { world.updateRemote(id, pose); voice?.positionPeer(id, pose); } },
    remove: id => { world.removeRemote(id); voice?.remove(id); members.delete(id); },
    status: message => { if (session === current) $('session-status').textContent = message; },
    invitation: value => {
      const url = new URL(location.protocol === 'file:' ? 'https://openvroom.com/room/' : location.href);
      url.pathname = `/room/${value}/`; url.search = ''; url.hash = '';
      $<HTMLInputElement>('invite-link').value = url.href;
    },
    closed: reason => {
      if (session !== current) return;
      session = undefined; clearInterval(sessionTimer);
      voice?.dispose(); voice = undefined; $<HTMLMeterElement>('mic-level').value = 0;
      renderVoice({ enabled: false, busy: false, ready: false, selected: '', devices: [], playbackBlocked: false });
      for (const id of members) world.removeRemote(id);
      $('session-active').hidden = true; $('session-entry').hidden = false;
      $('session-label').textContent = 'ローカルセッション'; $('member-count').textContent = '最大6人';
      $('member-list').replaceChildren(); $<HTMLInputElement>('invite-link').value = '';
      $('status-text').textContent = '探索中 · この端末のみ';
      if (avatarBytes) $('avatar-detail').textContent = 'VRM · ローカル';
      sessionRestoring = true;
      void (async () => {
        try { if (join) await showRoom(originalRoom); }
        catch { notify('元のルームを復元できませんでした。サンプルに戻してください。', true); }
        finally { sessionRestoring = false; lockAssets(false); }
      })();
      notify(reason);
    },
  });
  session = current;
  try {
    voice = new VoiceController(track => current.setVoiceTrack(track), state => { if (session === current) renderVoice(state); }, levels => { if (session === current) voiceLevels(levels); }, message => notify(message, true));
    void voice.resume();
  } catch { notify('音声の初期化に失敗しました。マイクはオフのまま入室します。', true); }
  try { current.connect(parsed.data, token); sessionTimer = setInterval(() => {
    const pose = world.networkPose(); current.update(pose);
    voice?.positionListener(pose, world.audioForward());
  }, 50); }
  catch { current.close('通信を開始できませんでした。WebRTC対応ブラウザで再試行してください。'); }
}
$('create-room').onclick = () => enterSession(false);
$('join-room').onclick = () => enterSession(true);
$('online-button').onclick = () => {
  openSettings('social');
  (session ? $('leave-room') : $('player-name')).focus({ preventScroll: true });
};
$('leave-room').onclick = () => session?.close();
$('copy-invite').onclick = async () => {
  const input = $<HTMLInputElement>('invite-link'); if (!input.value) return;
  try { await navigator.clipboard.writeText(input.value); notify('招待リンクをコピーしました。友だちに送ってください。'); }
  catch { input.focus(); input.select(); notify('リンクを選択しました。コピーして送ってください。'); }
};
if (location.hash.startsWith('#invite=') || /^\/room\/(?:[A-Za-z0-9_-]{12}|[A-Za-z0-9_-]{32})\/?$/.test(location.pathname)) {
  $<HTMLInputElement>('invite-input').value = location.href;
  openSettings('social');
  notify('招待されています。表示名とVRM共有を確認して「参加」を押してください。');
}

function renderVoice(state: VoiceState) {
  const toggle = $<HTMLButtonElement>('mic-toggle');
  toggle.disabled = !state.ready; toggle.setAttribute('aria-pressed', String(state.enabled));
  toggle.textContent = state.busy ? 'マイクの操作をキャンセル' : state.enabled ? 'マイクをオフ' : 'マイクをオン';
  const quick = $<HTMLButtonElement>('quick-mic');
  quick.hidden = !session; quick.disabled = toggle.disabled; quick.textContent = toggle.textContent; quick.setAttribute('aria-pressed', String(state.enabled));
  $('mic-status').textContent = state.busy ? 'マイクの許可・接続を確認中…' : state.enabled ? 'マイクON · 参加者に送信しています' : 'マイクはオフです';
  const select = $<HTMLSelectElement>('mic-device'); select.disabled = state.busy;
  const devices = [{ id: '', label: 'システム既定のマイク' }, ...state.devices];
  if (state.selected && !devices.some(d => d.id === state.selected)) devices.push({ id: state.selected, label: '選択したマイク（未接続）' });
  const signature = JSON.stringify(devices);
  if (select.dataset.options !== signature) {
    select.replaceChildren(...devices.map(d => { const option = document.createElement('option'); option.value = d.id; option.textContent = d.label; return option; }));
    select.dataset.options = signature;
  }
  select.value = state.selected;
  $('resume-audio').hidden = !state.playbackBlocked;
}
$('quick-mic').onclick = () => voice?.toggleMic();
$('mic-toggle').onclick = () => voice?.toggleMic();
$('mic-device').onchange = () => { void voice?.selectDevice($<HTMLSelectElement>('mic-device').value); };
$('refresh-mics').onclick = async () => {
  const button = $<HTMLButtonElement>('refresh-mics'); button.disabled = true;
  try { await voice?.refreshDevices(true); } finally { button.disabled = false; }
};
$('resume-audio').onclick = () => { void voice?.resume(); };
