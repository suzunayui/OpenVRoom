import { BoxGeometry, CylinderGeometry, SphereGeometry, type BufferGeometry } from 'three';

export function packGlb(json: Record<string, any>, binary = new Uint8Array()): ArrayBuffer {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(text.length / 4) * 4;
  const binLength = Math.ceil(binary.length / 4) * 4;
  const result = new ArrayBuffer(12 + 8 + jsonLength + (binLength ? 8 + binLength : 0));
  const view = new DataView(result);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, result.byteLength, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(result, 20, jsonLength).fill(32); new Uint8Array(result, 20, text.length).set(text);
  if (binLength) {
    view.setUint32(20 + jsonLength, binLength, true); view.setUint32(24 + jsonLength, 0x004e4942, true);
    new Uint8Array(result, 28 + jsonLength, binary.length).set(binary);
  }
  return result;
}

export function createBuilder() {
  const json: Record<string, any> = { asset: { version: '2.0', generator: 'OpenVRoom starter builder' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] };
  const blocks: Uint8Array[] = [];
  let byteLength = 0;
  function accessor(array: Float32Array | Uint16Array | Uint32Array, type: string, min?: number[], max?: number[]) {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4); padded.set(bytes);
    const bufferView = json.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, target: type === 'SCALAR' ? 34963 : 34962 }) - 1;
    blocks.push(padded); byteLength += padded.length;
    return json.accessors.push({ bufferView, componentType: array instanceof Float32Array ? 5126 : array instanceof Uint16Array ? 5123 : 5125, count: array.length / ({ SCALAR: 1, VEC2: 2, VEC3: 3 }[type]!), type, ...(min ? { min, max } : {}) }) - 1;
  }
  const geometries: Record<string, any> = {};
  function geometry(name: string, value: BufferGeometry) {
    value.computeBoundingBox();
    const attributes = {
      POSITION: accessor(value.getAttribute('position').array as Float32Array, 'VEC3', value.boundingBox!.min.toArray(), value.boundingBox!.max.toArray()),
      NORMAL: accessor(value.getAttribute('normal').array as Float32Array, 'VEC3'),
    };
    geometries[name] = { attributes, indices: accessor(value.index!.array as Uint16Array, 'SCALAR') };
    value.dispose();
  }
  geometry('box', new BoxGeometry(1, 1, 1));
  geometry('cylinder', new CylinderGeometry(0.5, 0.5, 1, 24));
  geometry('sphere', new SphereGeometry(0.5, 20, 12));
  function material(name: string, hex: string, roughness = 0.85) {
    const rgb = [1, 3, 5].map(i => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return json.materials.push({ name, pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], metallicFactor: 0, roughnessFactor: roughness } }) - 1;
  }
  const meshCache = new Map<string, number>();
  function object(name: string, shape: string, mat: number, position: number[], scale: number[], collider = false) {
    const key = `${shape}:${mat}`;
    if (!meshCache.has(key)) meshCache.set(key, json.meshes.push({ primitives: [{ ...geometries[shape], material: mat }] }) - 1);
    const node: any = { name, mesh: meshCache.get(key), translation: position, scale };
    if (collider) node.extensions = { OPENVROOM_components: { components: [{ type: 'collider', size: [1, 1, 1], center: [0, 0, 0] }] } };
    const index = json.nodes.push(node) - 1; json.scenes[0].nodes.push(index); return index;
  }
  function finish() {
    const binary = new Uint8Array(byteLength); let offset = 0;
    for (const block of blocks) { binary.set(block, offset); offset += block.length; }
    json.buffers = [{ byteLength }];
    return packGlb(json, binary);
  }
  return { json, material, object, finish };
}
