# OpenVRoom

公式サイト: https://openvroom.com/ — 公開Webアプリ: https://openvroom.com/room/

VPSへの公開・更新手順は [DEPLOY.md](DEPLOY.md)。公開時は個人用アバターを除外する `npm run build:public` を使用します。

VRMアバターで3Dルームを歩く、Web / Windows共通の初期クライアントです。
仕様書の第一段階「ルームを開き、VRMで歩く」を実装しています。

## 起動

Node.js 22.12以降が必要です。この開発環境ではNode.js 26で確認しています。

```powershell
npm ci
npm run dev
```

ブラウザで http://127.0.0.1:5173 を開きます。開発サーバーはこの端末のみに公開します。

Windowsアプリとして起動する場合:

```powershell
npm run desktop
```

実行ファイルを作る場合:

```powershell
npm run desktop:pack
```

`release/win-unpacked/OpenVRoom.exe` を起動します。フォルダ全体が必要です。
この版はインストーラー・コード署名・自動更新を含みません。
Electronのインストールがnpmのスクリプト制限で省略された場合は `node node_modules/electron/install.js` を一度実行してください。

## 操作

- 3D画面をクリック → WASD / 矢印キーで移動
- Shift + 移動で走る
- マウスをドラッグして見回す、ホイールでズーム
- R または右上のリセットで出現位置へ戻る
- 「VRMを読み込む」で端末上のVRM 0.x / 1.0を選択
- 「ルームを開く」でこの版の仕様に対応する `.vroom` を選択
- タッチ端末では画面内の方向ボタンで移動

VRMを持っていなくても、標準の「旅人」で歩けます。
画面から選んだファイルをアップロード・永続保存する処理はありません。
ローカル起動用アバターは `src/local-avatar.json` と `public/avatars/` 内のモデルで設定できます。両方ともGit管理対象外です。設定ファイルがなければ標準アバターで起動します。
ローカルのWindowsビルドには設定済みアバターも含まれます。将来アプリを配布・Web公開する際はこの個人用設定とモデルを除外してください。

## 実装済み

- GLB 2.0ベースの `.vroom` v0.1プロファイルと共通バリデーター
- ルームのメタデータ、Spawn、静的Box Collider
- 自作の `public/starter-room.vroom`（再生成可能）
- Three.jsでの描画、三人称カメラ、移動、重力、壁・家具の衝突、落下時の復帰
- three-vrmによるVRM 0.x / 1.0の読み込み、0.xの向き補正、待機・歩行・走行モーション・まばたき
- 体格に合わせたモーション変換、歩行／走行の滑らかな切り替え、実際の移動量に合わせた足運び
- ファイル切り替え、失敗時の元の状態保持、描画リソースの解放
- Webと同じビルドを使う、サンドボックス付きElectronクライアント

## 現在の範囲

一人用のローカルプレビューです。招待、Signaling、WebRTC、TURN、他ユーザーとの同期、音声、WebXR、ルームエディター、Importerは未実装です。仕様書全体の「最初の完成条件」を満たすのは、それらを実装した後です。

現在の `.vroom` は1シーンの自己完結GLBのみ。外部参照・data URI・未知のExtension / Componentは拒否します。PNG/JPEGはGLBに埋め込んでください。Draco / KTX2等の圧縮拡張はまだ対応していません。

物理は静的BoxのワールドAABBと固定サイズのプレイヤーによる簡易処理です。回転したBoxの判定は大きめになります。階段・坂道・ジャンプ・動的物体・着席には未対応です。アバターは約1.72mに合わせます。待機・歩行・走行はQuaterniusの制作済みモーションを各VRMの骨格へ変換して使い、膝・足首・腰・指も動かします。WASDは歩行、Shift併用は走行です。壁で実際の移動が止まれば待機へ戻ります。坂道への足裏接地IKはまだありません。

テスト用VRM 1.0リグと、この環境の指定VRM 0.xで確認しています。すべてのユーザー作成VRMの互換性を保証する段階ではありません。

## 検証・開発

```powershell
npm run build
npm test
npx playwright install chromium
npm run test:e2e
npm run test:desktop
npm run vroom -- validate public/starter-room.vroom
npm run generate:room
npm run generate:motions
```

- `src/core/format.ts`: Web / CLI共通のファイル検証とComponent定義
- `src/core/world.ts`: ルーム・VRM・描画・操作・リソース寿命
- `src/core/physics.ts`: 移動と床・壁判定
- `src/core/locomotion.ts`: 骨格へのモーション変換と待機・歩行・走行のブレンド
- `scripts/prepare-motions.ts`: 配布元のモーションから使用する3クリップを抽出・変換
- `src/main.ts`, `src/style.css`: 日本語UI
- `scripts/generate-room.ts`: サンプルルーム生成
- `electron/main.cjs`: Windowsアプリの起動と権限制限
- `tests/`: ファイル検証、物理、ブラウザでの操作テスト
- `docs/VROOM_FORMAT.md`: 実装中の形式仕様
- `docs/ROADMAP.md`: 次の開発段階

サンプルルームと標準アバターはコードから生成したオリジナルです。テスト用VRMは第三者のモデルを含みません。

歩行素材はQuaternius「Universal Animation Library / Standard」のCC0素材です。使用クリップ・配布元・変更内容は `public/motions/README.md`、ライセンス全文は `public/motions/LICENSE-CC0.txt` を参照してください。素材はアプリ内に同梱され、実行時に外部からダウンロードしません。

技術資料: [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)、[three-vrm VRMLoaderPlugin](https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMLoaderPlugin.html)。
