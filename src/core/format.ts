import { z } from 'zod';

export const ROOM_EXTENSION = 'OPENVROOM_room';
export const COMPONENT_EXTENSION = 'OPENVROOM_components';
export const MAX_ASSET_BYTES = 64 * 1024 * 1024;
const vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const component = z.discriminatedUnion('type', [
  z.object({ type: z.literal('spawn'), yaw: z.number().finite().default(0) }).strict(),
  z.object({ type: z.literal('collider'), size: vec3.refine(v => v.every(n => n > 0 && n <= 1000)), center: vec3.default([0, 0, 0]) }).strict(),
]);
export const roomMetadataSchema = z.object({
  version: z.literal('0.1'),
  title: z.string().min(1).max(80),
  author: z.string().min(1).max(80),
  description: z.string().max(500),
  units: z.literal('meters'),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
}).strict();
export type RoomMetadata = z.infer<typeof roomMetadataSchema>;
export type RoomComponent = z.infer<typeof component>;
export type GltfDocument = Record<string, any>;
export interface ValidatedAsset {
  json: GltfDocument;
  metadata?: RoomMetadata;
  components: Map<number, RoomComponent[]>;
}

function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

/** GLB-only, embedded assets only. Run before GLTFLoader sees any bytes. */
export function validateAsset(bytes: ArrayBuffer, kind: 'room' | 'avatar'): ValidatedAsset {
  ensure(bytes.byteLength <= MAX_ASSET_BYTES, 'ファイルは64 MiB以下にしてください。');
  ensure(bytes.byteLength >= 20, 'GLBファイルのヘッダーが壊れています。');
  const view = new DataView(bytes);
  ensure(view.getUint32(0, true) === 0x46546c67, '.vroom / .vrm はGLB形式である必要があります。');
  ensure(view.getUint32(4, true) === 2, 'GLB 2.0のみ対応しています。');
  ensure(view.getUint32(8, true) === bytes.byteLength, 'ファイルサイズがヘッダーと一致しません。');
  let offset = 12;
  let json: GltfDocument | undefined;
  let binaryLength = 0;
  let chunks = 0;
  while (offset < bytes.byteLength) {
    ensure(offset + 8 <= bytes.byteLength, 'GLBチャンクが途中で切れています。');
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    ensure(length % 4 === 0 && offset + 8 + length <= bytes.byteLength, 'GLBチャンクの長さが不正です。');
    if (chunks === 0) {
      ensure(type === 0x4e4f534a && length <= 8 * 1024 * 1024, 'JSONチャンクが不正、または大きすぎます。');
      try { json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes, offset + 8, length))); }
      catch { throw new Error('GLBのJSONを読み取れません。'); }
    } else {
      ensure(chunks === 1 && type === 0x004e4942, '未対応のGLBチャンクです。');
      binaryLength = length;
    }
    offset += 8 + length;
    chunks++;
  }
  ensure(json && typeof json === 'object' && !Array.isArray(json), 'glTFデータがありません。');
  ensure(json.asset?.version === '2.0', 'glTF 2.0のみ対応しています。');
  // Recursion and URL checks also cover extension-provided textures and thumbnails.
  function inspect(value: unknown, depth = 0): void {
    ensure(depth < 64, 'JSONの階層が深すぎます。');
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      ensure(key !== 'uri', '外部参照・data URIは使用できません。すべてGLBに埋め込んでください。');
      ensure(!['__proto__', 'prototype', 'constructor'].includes(key), '不正なJSONキーです。');
      inspect(child, depth + 1);
    }
  }
  inspect(json);
  const allowed = new Set([
    ROOM_EXTENSION, COMPONENT_EXTENSION, 'KHR_lights_punctual', 'KHR_materials_unlit',
    'KHR_texture_transform', 'KHR_materials_emissive_strength',
    ...(kind === 'avatar' ? ['VRM', 'VRMC_vrm', 'VRMC_materials_mtoon', 'VRMC_springBone', 'VRMC_node_constraint', 'VRMC_materials_hdr_emissiveMultiplier'] : []),
  ]);
  const extensions = new Set<string>();
  function collect(value: any): void {
    if (!value || typeof value !== 'object') return;
    if (value.extensions) for (const key of Object.keys(value.extensions)) extensions.add(key);
    for (const child of Object.values(value)) collect(child);
  }
  collect(json);
  ensure(Array.isArray(json.extensionsUsed ?? []) && Array.isArray(json.extensionsRequired ?? []), 'Extension宣言が不正です。');
  for (const name of [...extensions, ...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])]) {
    ensure(allowed.has(name), `未対応のExtension: ${String(name)}`);
  }
  for (const field of ['nodes', 'scenes', 'meshes', 'materials', 'buffers', 'bufferViews', 'accessors', 'images', 'textures', 'animations', 'skins']) {
    ensure(json[field] === undefined || Array.isArray(json[field]), `${field}は配列である必要があります。`);
  }
  ensure(Array.isArray(json.nodes) && json.nodes.length > 0 && json.nodes.length <= 10000, 'ノード数が不正です（最大10,000）。');
  const validIndex = (i: unknown, a: any[]) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < a.length;
  ensure(validIndex(json.scene ?? 0, json.scenes ?? []), '開始シーンが不正です。');
  ensure(json.scenes.length === 1, 'この版ではGLB内のシーンは1つにしてください。');
  ensure((json.buffers?.length ?? 0) <= 1, '埋め込みバッファは1つのみ対応します。');
  const bufferLength = json.buffers?.[0]?.byteLength ?? 0;
  ensure(Number.isInteger(bufferLength) && bufferLength >= 0 && bufferLength <= binaryLength && binaryLength - bufferLength <= 3, 'バッファサイズが不正です。');
  for (const b of json.bufferViews ?? []) {
    ensure(b.buffer === 0 && Number.isInteger(b.byteLength) && b.byteLength > 0 && Number.isInteger(b.byteOffset ?? 0) && (b.byteOffset ?? 0) >= 0 && (b.byteOffset ?? 0) + b.byteLength <= bufferLength, 'bufferViewがバッファの範囲外です。');
  }
  let vertices = 0;
  let decodedBytes = 0;
  for (const accessor of json.accessors ?? []) {
    ensure(Number.isInteger(accessor.count) && accessor.count > 0 && accessor.count <= 2000000, 'アクセサーの要素数が上限を超えています。');
    ensure([5120, 5121, 5122, 5123, 5125, 5126].includes(accessor.componentType), 'アクセサーのデータ型が不正です。');
    ensure(['SCALAR', 'VEC2', 'VEC3', 'VEC4', 'MAT2', 'MAT3', 'MAT4'].includes(accessor.type), 'アクセサーの型が不正です。');
    const width: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
    const dimensions: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
    const elementBytes = width[accessor.componentType] * dimensions[accessor.type];
    decodedBytes += accessor.count * dimensions[accessor.type] * 4;
    ensure(decodedBytes <= 128 * 1024 * 1024, '展開後のアクセサー容量が上限を超えています。');
    ensure(Number.isInteger(accessor.byteOffset ?? 0) && (accessor.byteOffset ?? 0) >= 0, 'アクセサーのオフセットが不正です。');
    if (accessor.bufferView !== undefined) {
      ensure(validIndex(accessor.bufferView, json.bufferViews ?? []), 'アクセサーのバッファ参照が不正です。');
      const b = json.bufferViews[accessor.bufferView];
      const stride = b.byteStride ?? elementBytes;
      ensure(Number.isInteger(stride) && stride >= elementBytes && (b.byteStride === undefined || stride <= 252), 'アクセサーのストライドが不正です。');
      ensure((accessor.byteOffset ?? 0) + (accessor.count - 1) * stride + elementBytes <= b.byteLength, 'アクセサーがバッファの範囲外です。');
    }
    if (accessor.sparse) {
      const sparse = accessor.sparse;
      ensure(Number.isInteger(sparse.count) && sparse.count > 0 && sparse.count <= accessor.count, 'Sparseアクセサーの要素数が不正です。');
      ensure([5121, 5123, 5125].includes(sparse.indices?.componentType), 'Sparseインデックスの型が不正です。');
      for (const [entry, size] of [[sparse.indices, width[sparse.indices.componentType]], [sparse.values, elementBytes]]) {
        ensure(entry && validIndex(entry.bufferView, json.bufferViews ?? []) && Number.isInteger(entry.byteOffset ?? 0) && (entry.byteOffset ?? 0) >= 0, 'Sparseバッファ参照が不正です。');
        ensure((entry.byteOffset ?? 0) + sparse.count * size <= json.bufferViews[entry.bufferView].byteLength, 'Sparseアクセサーがバッファの範囲外です。');
      }
    }
  }
  for (const mesh of json.meshes ?? []) {
    ensure(Array.isArray(mesh.primitives), 'メッシュが不正です。');
    for (const primitive of mesh.primitives) {
      ensure(validIndex(primitive.attributes?.POSITION, json.accessors ?? []), 'メッシュの頂点参照が不正です。');
      for (const i of Object.values(primitive.attributes)) ensure(validIndex(i, json.accessors ?? []), 'メッシュ属性の参照が不正です。');
      if (primitive.indices !== undefined) ensure(validIndex(primitive.indices, json.accessors ?? []), 'メッシュのインデックス参照が不正です。');
      if (primitive.material !== undefined) ensure(validIndex(primitive.material, json.materials ?? []), 'マテリアル参照が不正です。');
      vertices += json.accessors[primitive.attributes.POSITION].count;
    }
  }
  ensure(vertices <= 2000000, '頂点数の上限（200万）を超えています。');
  for (const image of json.images ?? []) {
    ensure(validIndex(image.bufferView, json.bufferViews ?? []) && ['image/png', 'image/jpeg'].includes(image.mimeType), '画像はGLB内のPNG/JPEGのみ対応します。');
  }
  const parents = new Map<number, number>();
  json.nodes.forEach((node: any, index: number) => {
    ensure(node && typeof node === 'object', 'ノードが不正です。');
    for (const [key, count] of [['translation', 3], ['rotation', 4], ['scale', 3], ['matrix', 16]] as const) {
      if (node[key] !== undefined) ensure(Array.isArray(node[key]) && node[key].length === count && node[key].every((n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 100000), 'ノードの変換値が不正です。');
    }
    ensure(node.children === undefined || Array.isArray(node.children), '子ノードが不正です。');
    for (const child of node.children ?? []) {
      ensure(validIndex(child, json.nodes) && child !== index && !parents.has(child), 'ノード参照が不正、または親が重複しています。');
      parents.set(child, index);
    }
    if (node.mesh !== undefined) ensure(validIndex(node.mesh, json.meshes ?? []), 'ノードのメッシュ参照が不正です。');
  });
  for (const skin of json.skins ?? []) {
    ensure(Array.isArray(skin.joints) && skin.joints.length <= 256 && skin.joints.every((i: unknown) => validIndex(i, json!.nodes)), 'スキンのジョイントが不正です（最大256）。');
    if (skin.inverseBindMatrices !== undefined) ensure(validIndex(skin.inverseBindMatrices, json.accessors ?? []), 'スキンのアクセサー参照が不正です。');
  }
  for (let i = 0; i < json.nodes.length; i++) {
    let cursor: number | undefined = i;
    let depth = 0;
    while (cursor !== undefined) { ensure(depth++ < 128, 'ノード階層が循環しているか、深すぎます。'); cursor = parents.get(cursor); }
  }
  const active = new Set<number>();
  function visit(i: number): void {
    ensure(validIndex(i, json!.nodes) && !active.has(i), 'シーンのルート参照が不正です。');
    active.add(i);
    for (const child of json!.nodes[i].children ?? []) visit(child);
  }
  for (const root of json.scenes[json.scene ?? 0].nodes ?? []) { ensure(!parents.has(root), 'シーンルートに親があります。'); visit(root); }
  const components = new Map<number, RoomComponent[]>();
  let metadata: RoomMetadata | undefined;
  if (kind === 'room') {
    const parsed = roomMetadataSchema.safeParse(json.extensions?.[ROOM_EXTENSION]);
    ensure(parsed.success, 'OPENVROOM_roomのメタデータが不正です（version 0.1 / metersが必要）。');
    metadata = parsed.data;
    let spawns = 0;
    json.nodes.forEach((node: any, index: number) => {
      const extension = node.extensions?.[COMPONENT_EXTENSION];
      if (!extension) return;
      const result = z.object({ components: z.array(component).max(8) }).strict().safeParse(extension);
      ensure(result.success, `ノード${index}: 未対応または不正なComponentです。`);
      ensure(active.has(index), `ノード${index}: Componentは開始シーン内に配置してください。`);
      components.set(index, result.data.components);
      spawns += result.data.components.filter(c => c.type === 'spawn').length;
    });
    ensure(spawns === 1, '開始シーンにはSpawnを1つ配置してください。');
    const fixed = new Set<number>();
    for (const index of components.keys()) {
      let ancestor: number | undefined = index;
      while (ancestor !== undefined) { fixed.add(ancestor); ancestor = parents.get(ancestor); }
    }
    for (const animation of json.animations ?? []) {
      ensure(Array.isArray(animation.channels), 'アニメーションのチャンネルが不正です。');
      for (const channel of animation.channels) ensure(!fixed.has(channel.target?.node), 'Spawn / Colliderとその親のアニメーションは未対応です。');
    }
  } else {
    const modern = json.extensions?.VRMC_vrm;
    const legacy = json.extensions?.VRM;
    ensure(modern?.specVersion === '1.0' || (!modern && typeof legacy?.specVersion === 'string' && /^0\./.test(legacy.specVersion)), 'VRM 1.0または0.xのアバターを選択してください。');
    const bones = modern ? modern.humanoid?.humanBones : Object.fromEntries((legacy.humanoid?.humanBones ?? []).map((bone: any) => [bone.bone, bone]));
    for (const bone of ['hips', 'spine', 'head', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot']) {
      ensure(validIndex(bones?.[bone]?.node, json.nodes) && active.has(bones[bone].node), `VRMの必須ボーンが不正です: ${bone}`);
    }
  }
  return { json, metadata, components };
}
