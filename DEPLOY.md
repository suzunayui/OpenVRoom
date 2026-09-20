# openvroom.com の公開・運用

## 公開構成

- 公式ホームページ: https://openvroom.com/
- Webアプリ: https://openvroom.com/room/
- VPS: Ubuntu 24.04。SSHの接続先は手元の設定で管理します。
- Web配信: Nginx。現在の版は静的ファイルのみで、サーバー上のNode.jsは不要。
- TLS: Let's Encrypt / Certbot、`certbot.timer`による自動更新。
- `http://openvroom.com` はHTTPSへ、`/room` は `/room/` へリダイレクト。
- `www.openvroom.com` はDNS未設定のため使用していない。
- Signaling / TURN / マルチプレイ用のサーバーはこの段階では未導入。

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
