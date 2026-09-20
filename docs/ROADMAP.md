# 開発状況

## 1. ローカルで歩く — 実装済み

`.vroom`の最小仕様、Validator、Three.js Loader、サンプルルーム、VRM 1.0、Web / Windows共通クライアント。

## 2. 複数人で集まる — 実装済み

1. 共有Message SchemaとNode.js / TypeScriptのWebSocket Signaling
2. 暗号学的Invite Token、Host作成・招待・入退出、最大6人
3. WebRTC接続とTURN fallback
4. Host経由のPoseと入室時のルーム共有、入室後だけのVRM共有
5. 切断・Host終了時の後始末、サイズ上限・レート制限
6. 2クライアント以上の統合テストとDocker Compose / DEPLOY.md

## 3. 音声とVR

明示操作からのマイク利用、空間音声、Mute・ユーザー別音量・Speaking Indicator、WebXR。実機・別ネットワークで通信とVR入力を確認する。

## 4. ルームを制作する

エディター、GLBインポート・配置・Component編集・エクスポート。続いてImporterの対応範囲を広げ、Shader / Script / Udonなどの変換不能項目をレポートする。

仕様書にある最初の完成条件は、段階3まで完了し、Web / Windows / WebXR参加者間でAvatar / Pose / Voiceが同期した時点で達成する。
