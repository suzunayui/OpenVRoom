# openvroom.com の公開・運用

## 公開構成

- 公式ホームページ: https://openvroom.com/
- Webアプリ: https://openvroom.com/room/
- VPS: Ubuntu 24.04。SSHの接続先は手元の設定で管理します。
- Web配信: Nginx。サイト本体は静的ファイル。Signaling / TURNはDocker Composeで起動します。ホストOSへのNode.js導入は不要です。
- TLS: Let's Encrypt / Certbot、`certbot.timer`による自動更新。
- `http://openvroom.com` はHTTPSへ、`/room` は `/room/` へリダイレクト。
- `www.openvroom.com` はDNS未設定のため使用していない。
- Signaling: `127.0.0.1:8080`、Nginxの `/room/signal` からWebSocket転送。
- TURN: 3478 TCP/UDP、49160–50159 UDP。秘密鍵と設定は `/opt/openvroom/` 内のみ。

## 公開用ビルド

```powershell
npm ci
npm run build:public
```

`website/` のホームページと、`web-dist/room/` のアプリを `web-dist/` にまとめます。

公開モードは `src/local-avatar.json` を取り込まず、`public/` 全体のコピーも無効です。アプリへの同梱はサンプルルームとモーションだけを許可しています。出力全体を走査し、`.vrm`・個人用設定・個人用パスがあればビルドを失敗させます。**通常の `dist/` や個人用Windowsビルドを公開しないでください。** 公開版は標準アバターから始まります。

ローカル確認:

```powershell
npx vite preview --outDir web-dist --host 127.0.0.1 --port 5180 --strictPort
npx tsx scripts/test-public-site.ts http://127.0.0.1:5180
```

## 通常の更新

ビルド成功後に実行します。アーカイブには公開成果物のみが入ります。

```powershell
$deployHost = "your-ssh-host" # 手元で設定したSSH接続先に置き換える
tar -czf deploy/openvroom-public.tar.gz -C web-dist .
scp deploy/openvroom-public.tar.gz deploy/update-site.sh "${deployHost}:/tmp/"
ssh $deployHost "sudo sh /tmp/update-site.sh"
npx tsx scripts/test-public-site.ts https://openvroom.com
```

`/var/www/openvroom/releases/<UTC日時>/` に展開し、`current` シンボリックリンクを切り替えます。通常更新はNginxやTLS設定を変更しません。前のリリースは残るので、切り戻せます。更新コマンドが表示する `Previous` のディレクトリを確認し、`current.next` をそのパスへリンクして `mv -Tf` で `current` と置き換えてください。

ブラウザ内のアプリは更新時に再読み込みしてください。HTMLはキャッシュ再検証、ハッシュ付きJS/CSSは長期キャッシュです。`.vroom` とモーションは最大1時間キャッシュされます。

## 初回セットアップの記録

1. Aレコード `openvroom.com → 配信先サーバーのIPv4アドレス` を確認。
2. `nginx certbot python3-certbot-nginx` をaptで導入。
3. 公開アーカイブ、`deploy/openvroom.nginx.conf`、`deploy/openvroom.logrotate`、`deploy/install-initial.sh` を `/tmp/` へ転送。
4. `sudo sh /tmp/install-initial.sh` で配信を開始。
5. `sudo certbot --nginx -d openvroom.com --redirect --agree-tos --register-unsafely-without-email --non-interactive` でHTTPS化。

連絡用メールアドレスは未設定です。HTTPS化後のサーバー設定は `/etc/nginx/sites-available/openvroom` が正です。リポジトリ内のHTTP用初期設定で上書きしないでください。初回スクリプトにも再実行防止を入れています。

サーバーの22・80・443番ポートが到達可能である必要があります。既存のSSH接続・ホストのファイアウォール設定は変更していません。

## 証明書・ログ

```sh
sudo nginx -t
sudo systemctl status nginx certbot.timer
sudo certbot certificates
sudo certbot renew --dry-run
```

証明書・秘密鍵はサーバーの `/etc/letsencrypt/` で管理し、配布物やソースへコピーしません。

アクセス・エラーログは `/var/log/nginx/openvroom/`。`/etc/logrotate.d/openvroom` に毎日・6世代＋当日分、最大7日のローテーションを設定しています。広告・アクセス解析・サーバーへのVRMアップロード機能はありません。

## 検証

`scripts/test-public-site.ts` はPC/モバイル表示、画像読み込み、FAQ、`/room/` への遷移、標準アバター、VRM読み込みと歩行、ホームへの戻り、不要な外部通信や個人用アセット要求がないことを確認します。

本番ではHTTP→HTTPS、`/room`→`/room/`、存在しないページの404、個人用VRM URLが404であることも確認しています。


## マルチプレイサーバー

UbuntuホストにDocker EngineとComposeを用意し、`compose.yaml`、`server/`、`src/network/protocol.ts`、`.dockerignore`、`deploy/setup-multiplayer.sh` を `/opt/openvroom/` に配置します。ホストのNginx・TLSは既存構成を使用します。

```sh
sudo sh /opt/openvroom/deploy/setup-multiplayer.sh
```

初回実行時にサーバー内だけでランダムなTURN秘密情報を作り、`.env` に保存します。再実行でも同じ秘密情報を保ちます。スクリプトは既存HTTPS設定を保持したままWebSocketのlocationを追加します。`/opt/openvroom` はrootのみが参照できます。通常更新でも同じスクリプトを使いますが、進行中のセッションはSignaling再起動で終了します。

外部ファイアウォールでも3478 TCP/UDPと49160–50159 UDPを許可してください。8080を外部へ公開する必要はありません。現在の構成はLinuxのホストネットワークを使用します。TURNの待受・中継アドレスはデフォルト経路のIPv4です。NAT配下ではcoturnのexternal-ipを別途設定してください。

`.env.example` は設定項目の見本です。実際の `.env`、`turnserver.local.conf` はGit管理・公開ビルド対象外です。Composeのイメージはdigestで固定しています。

```sh
sudo docker compose --project-directory /opt/openvroom ps
curl --fail http://127.0.0.1:8080/health
```

通信内容やVRM・ルームはサーバーに保存しません。招待トークンはURLフラグメントに入れ、HTTPアクセスログへ送られません。Signaling経路のアクセスログとTURNの接続ログは無効です。TURN資格情報は入室者にのみ発行し、8時間で失効します。ルームは最大6時間です。直接接続が可能な場合はWebRTCで直接通信し、失敗時に暗号化された通信をTURN経由で中継します。TURNはTLS/443待受を提供しないため、厳しい企業ネットワーク等で接続できない場合があります。

位置は毎秒20回ホスト経由で同期します。ルームはホストから、VRMは共有を選んだ参加者からそれぞれ直接送信します。16 KiBごとの転送・バックプレッシャー・SHA-256照合・既存の形式検証・サイズ上限・タイムアウトを適用します。共有アセットの途中変更とホスト移譲は未対応です。

ブラウザ3セッションの検証:

```powershell
npx tsx scripts/test-multiplayer.ts https://openvroom.com/room/
npx tsx scripts/test-multiplayer.ts https://openvroom.com/room/ --relay
```

`--relay` はテスト用ブラウザだけでTURN経由を強制し、実際に選ばれた接続経路を確認します。本番設定は変更しません。


## 音声通話の配信設定

Signalingの接続プロトコルはv2です。古いクライアントには更新を案内します。サーバーとWebアプリは同じリリースで更新してください。`setup-multiplayer.sh` はNginxのPermissions-Policyを `microphone=(self)` に変更し、CSPに `media-src 'self' blob:` を追加します。カメラは許可しません。

音声は既存の参加者間WebRTC接続に予約した音声トラックで送ります。マイクの開始や切り替えは `replaceTrack` を使い、ファイル共有や位置同期を切断しません。Signalingサーバーに音声を送らず、TURNも音声を録音・保存しません。新しいポートを開ける必要はありません。

```powershell
npx tsx scripts/test-voice.ts http://127.0.0.1:5180/
npx tsx scripts/test-voice.ts https://openvroom.com/room/ --relay
```

テストは生成した合成音とブラウザの仮想マイクだけを使用します。実際のマイク音を取得・録音しません。マイク初期オフ、明示したdeviceId、通話中の切り替え、受信音声のエネルギー、拒否・切断・退出後の後始末を検証します。
