# VRoom v0.1 — 実装プロファイル

この文書は最初のクライアントが読み込める範囲を定義します。将来の形式全体を確定するものではありません。

## コンテナ

拡張子 `.vroom`、内容はglTF 2.0のGLBバイナリです。1ファイル・1シーン・1ルーム。右手座標、Y-up、1 unit = 1 mです。

最大64 MiB、JSONチャンク最大8 MiB、ノード最大10,000、階層最大128未満、メッシュ定義の頂点合計最大200万、展開後アクセサー合計最大128 MiB。バッファはGLB内の1つだけにし、画像はbufferView経由のPNG/JPEGにします。URIを使う外部参照やdata URIは受け付けません。

通常のglTFシーン・メッシュ・PBRマテリアル・テクスチャ・スキン・アニメーションはGLTFLoaderで読み込みます。Spawn / Colliderとその祖先のアニメーションは拒否します。Colliderは静的だからです。

`extensionsUsed` に `OPENVROOM_room` と `OPENVROOM_components` を宣言します。これらは本プロジェクト内の仮の名前で、Khronos登録済みExtensionではありません。

## ルーム情報

ルート `extensions.OPENVROOM_room`:

```json
{
  "version": "0.1",
  "title": "こもれびのラウンジ",
  "author": "OpenVRoom",
  "description": "光の差し込む、小さな居場所。",
  "units": "meters",
  "background": "#cbd8d7"
}
```

タイトル・作者は1〜80文字、説明は500文字以下。背景は6桁の16進カラーです。すべて必須とし、未知のキーは拒否します。UIでは文字列をHTMLとして解釈しません。

## ノードComponent

`nodes[i].extensions.OPENVROOM_components.components` は最大8個のComponentを持つ配列です。Componentを持つノードは開始シーン内に必要です。

### Spawn

```json
{
  "name": "Arrival",
  "translation": [0, 0.03, 2.4],
  "extensions": {
    "OPENVROOM_components": {
      "components": [{ "type": "spawn", "yaw": 3.141592653589793 }]
    }
  }
}
```

ルームに1個必須。ノードのワールド位置が足元になります。`yaw` はラジアン、ノードのワールドY回転へ加算します。0は+Z向きです。
ランタイムでは、SpawnがColliderに重ならず、下3m以内に床Colliderがあることも確認します。

### Collider

```json
{
  "type": "collider",
  "size": [1, 1, 1],
  "center": [0, 0, 0]
}
```

`size` は各軸0超〜1,000以下、`center` は省略時 `[0,0,0]`。ノードのローカル座標でBoxを定義し、階層の変換を適用してワールドAABBへ変換します。メッシュなしの不可視Colliderも使用できます。

## その他のExtension

現在は `KHR_lights_punctual`、`KHR_materials_unlit`、`KHR_texture_transform`、`KHR_materials_emissive_strength` を許可します。
VRMの読み込みに限り `VRMC_vrm`、`VRMC_materials_mtoon`、`VRMC_springBone`、`VRMC_node_constraint`、`VRMC_materials_hdr_emissiveMultiplier` を追加で許可します。

未知のExtension / Componentを黙って無視せず、読み込みを拒否します。Mirror / Audio / Seat / Pickup / Interaction / Network Syncはまだこのプロファイルに含まれません。独自JavaScriptの実行機構はありません。

## 検証の位置付け

`npm run vroom -- validate <file.vroom>` はこのプロファイルの検証です。一般のglTF仕様全体の適合性検証を置き換えるものではありません。制作時にはKhronos glTF Validatorによる検証も推奨します。サンプルルームは同Validatorでもエラー・警告ゼロを確認しています（独自Extensionは検証対象外という情報メッセージが出ます）。
