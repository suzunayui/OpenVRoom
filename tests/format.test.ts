import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateAsset, MAX_ASSET_BYTES } from '../src/core/format';
import { packGlb } from '../scripts/glb';
import { testVrm } from './fixtures';

const file = readFileSync('public/starter-room.vroom');
const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
const source = validateAsset(bytes, 'room').json;
const jsonLength = new DataView(bytes).getUint32(12, true);
const binary = new Uint8Array(bytes, 28 + jsonLength);
function mutated(change: (json: any) => void) { const json = structuredClone(source); change(json); return packGlb(json, binary); }

test('starter is an embedded GLB room with one spawn and furniture colliders', () => {
  const room = validateAsset(bytes, 'room');
  assert.equal(room.metadata?.title, 'こもれびのラウンジ');
  assert.ok(room.components.size > 10);
});
test('valid VRM 1.0 humanoid passes, a room is not an avatar', () => {
  assert.ok(validateAsset(testVrm(), 'avatar'));
  assert.throws(() => validateAsset(bytes, 'avatar'), /VRM 1.0/);
});
test('legacy VRM 0.x humanoid is accepted and missing bones fail', () => {
  const bytes = testVrm();
  const json = validateAsset(bytes, 'avatar').json;
  const binary = new Uint8Array(bytes, 28 + new DataView(bytes).getUint32(12, true));
  const humanBones = Object.entries(json.extensions.VRMC_vrm.humanoid.humanBones).map(([bone, entry]: [string, any]) => ({ bone, node: entry.node }));
  json.extensionsUsed = ['VRM'];
  json.extensions = { VRM: { specVersion: '0.0', humanoid: { humanBones } } };
  assert.ok(validateAsset(packGlb(json, binary), 'avatar'));
  humanBones.splice(humanBones.findIndex(b => b.bone === 'hips'), 1);
  assert.throws(() => validateAsset(packGlb(json, binary), 'avatar'), /必須ボーン/);
});
test('truncation, forged lengths, oversized files and malformed JSON fail', () => {
  assert.throws(() => validateAsset(bytes.slice(0, 30), 'room'), /サイズ/);
  assert.throws(() => validateAsset(new ArrayBuffer(MAX_ASSET_BYTES + 1), 'room'), /64 MiB/);
  const broken = bytes.slice(0); new Uint8Array(broken)[20] = 0;
  assert.throws(() => validateAsset(broken, 'room'), /JSON/);
});
test('external URLs, data URIs and unknown extensions are rejected before loading', () => {
  for (const uri of ['https://example.com/private.glb', 'file:///C:/secret', 'data:image/png;base64,AA==']) {
    assert.throws(() => validateAsset(mutated(j => j.buffers[0].uri = uri), 'room'), /外部参照/);
  }
  assert.throws(() => validateAsset(mutated(j => j.nodes[0].extensions.DANGEROUS_script = { url: 'https://example.com' }), 'room'), /未対応のExtension/);
});
test('unsupported components and versions cannot be silently dropped', () => {
  assert.throws(() => validateAsset(mutated(j => j.extensions.OPENVROOM_room.version = '0.2'), 'room'), /メタデータ/);
  assert.throws(() => validateAsset(mutated(j => j.nodes[0].extensions.OPENVROOM_components.components[0].type = 'script'), 'room'), /Component/);
});
test('missing or duplicate spawn and invalid collider size fail', () => {
  assert.throws(() => validateAsset(mutated(j => delete j.nodes.at(-1).extensions), 'room'), /Spawn/);
  assert.throws(() => validateAsset(mutated(j => j.nodes[0].extensions.OPENVROOM_components.components.push({ type: 'spawn', yaw: 0 })), 'room'), /Spawn/);
  assert.throws(() => validateAsset(mutated(j => j.nodes[0].extensions.OPENVROOM_components.components[0].size = [-1, 1, 1]), 'room'), /Component/);
});
test('cycles, multiple parents, invalid buffer views and huge geometry fail', () => {
  assert.throws(() => validateAsset(mutated(j => { j.nodes[0].children = [1]; j.nodes[1].children = [0]; }), 'room'), /循環/);
  assert.throws(() => validateAsset(mutated(j => { j.nodes[0].children = [2]; j.nodes[1].children = [2]; }), 'room'), /親/);
  assert.throws(() => validateAsset(mutated(j => j.bufferViews[0].byteLength = 100000000), 'room'), /範囲外/);
  assert.throws(() => validateAsset(mutated(j => j.accessors[0].count = 99999999), 'room'), /上限/);
});
test('accessor overruns and moving collider animations fail', () => {
  assert.throws(() => validateAsset(mutated(j => j.accessors[0].byteOffset = 1000000), 'room'), /範囲外/);
  assert.throws(() => validateAsset(mutated(j => j.accessors[0].sparse = { count: 1, indices: { bufferView: 0, componentType: 5123 }, values: { bufferView: 0, byteOffset: 1000000 } }), 'room'), /範囲外/);
  assert.throws(() => validateAsset(mutated(j => j.animations = [{ channels: [{ target: { node: 0, path: 'translation' } }] }]), 'room'), /アニメーション/);
});
