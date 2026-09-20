import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { AnimationClip, AnimationMixer, Group, InterpolateDiscrete, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three';

// CC0 Quaternius Universal Animation Library (Standard), pinned download.
const base = 'https://raw.githubusercontent.com/J-Ponzo/gltf-universal-animation-library/e24c23cf2a1323488a3faa226ea7ea21f644b73e/';
await mkdir('.cache/animations', { recursive: true });
await mkdir('public/motions', { recursive: true });
async function cached(name: string, remote: string) {
  try { return await readFile(`.cache/animations/${name}`); }
  catch {
    const response = await fetch(base + remote); if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer()); await writeFile(`.cache/animations/${name}`, bytes); return bytes;
  }
}
const json = JSON.parse((await cached('source.gltf', 'glTF/AnimationLibrary_Godot_Standard.gltf')).toString());
const binary = await cached('AnimationLibrary_Godot_Standard.bin', 'glTF/AnimationLibrary_Godot_Standard.bin');
await writeFile('public/motions/LICENSE-CC0.txt', await cached('LICENSE', 'LICENSE'));
const mapping: Record<string, string> = {
  'DEF-hips': 'hips', 'DEF-spine.001': 'spine', 'DEF-spine.002': 'chest', 'DEF-spine.003': 'upperChest', 'DEF-neck': 'neck', 'DEF-head': 'head',
};
for (const [side, suffix] of [['left', 'L'], ['right', 'R']]) {
  for (const [source, target] of Object.entries({ shoulder: 'Shoulder', upper_arm: 'UpperArm', forearm: 'LowerArm', hand: 'Hand', thigh: 'UpperLeg', shin: 'LowerLeg', foot: 'Foot', toe: 'Toes' })) mapping[`DEF-${source}.${suffix}`] = side + target;
  for (const finger of ['index', 'middle', 'ring', 'pinky', 'thumb']) {
    const name = finger === 'pinky' ? 'Little' : finger[0].toUpperCase() + finger.slice(1);
    const segments = finger === 'thumb' ? ['Metacarpal', 'Proximal', 'Distal'] : ['Proximal', 'Intermediate', 'Distal'];
    segments.forEach((segment, i) => { mapping[`DEF-${finger === 'thumb' ? 'thumb' : `f_${finger}`}.0${i + 1}.${suffix}`] = side + name + segment; });
  }
}
const root = new Group();
const nodes: Object3D[] = json.nodes.map((node: any, i: number) => {
  const object = new Object3D(); object.name = `source_${i}`;
  if (node.translation) object.position.fromArray(node.translation);
  if (node.rotation) object.quaternion.fromArray(node.rotation);
  if (node.scale) object.scale.fromArray(node.scale);
  return object;
});
json.nodes.forEach((node: any, i: number) => node.children?.forEach((child: number) => nodes[i].add(nodes[child])));
for (const node of nodes) if (!node.parent) root.add(node);
const mapped = json.nodes.flatMap((node: any, i: number) => mapping[node.name] ? [{ name: mapping[node.name], object: nodes[i] }] : []);
function accessor(i: number): number[] {
  const a = json.accessors[i], b = json.bufferViews[a.bufferView];
  if (a.componentType !== 5126 || b.byteStride) throw new Error('Unexpected accessor layout');
  const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type as string]; if (!size) throw new Error('Unsupported accessor');
  const offset = (b.byteOffset ?? 0) + (a.byteOffset ?? 0);
  return Array.from({ length: a.count * size }, (_, k) => binary.readFloatLE(offset + k * 4));
}
function sourceClip(name: string) {
  const animation = json.animations.find((a: any) => a.name === name); if (!animation) throw new Error(`Missing ${name}`);
  const tracks = animation.channels.map((channel: any) => {
    const sampler = animation.samplers[channel.sampler];
    if (sampler.interpolation && !['LINEAR', 'STEP'].includes(sampler.interpolation)) throw new Error('Unsupported interpolation');
    const times = accessor(sampler.input), values = accessor(sampler.output);
    const property = { rotation: 'quaternion', translation: 'position', scale: 'scale' }[channel.target.path as string];
    const name = `${nodes[channel.target.node].name}.${property}`;
    const track = property === 'quaternion' ? new QuaternionKeyframeTrack(name, times, values) : new VectorKeyframeTrack(name, times, values);
    if (sampler.interpolation === 'STEP') track.setInterpolation(InterpolateDiscrete);
    return track;
  });
  return new AnimationClip(name, -1, tracks);
}
const mixer = new AnimationMixer(root);
const tpose = mixer.clipAction(sourceClip('A_TPose')).play(); mixer.setTime(0); root.updateMatrixWorld(true);
const rest = new Map<string, Quaternion>(mapped.map(({ name, object }: any) => [name, object.getWorldQuaternion(new Quaternion()).invert()]));
const hips = mapped.find((bone: any) => bone.name === 'hips').object as Object3D;
const restHips = hips.getWorldPosition(new Vector3());
tpose.stop();
const result: any = { version: 1, author: 'Quaternius', sourceHipsHeight: restHips.y, clips: {} };
const round = (value: number) => Number(value.toFixed(6));
for (const [name, source] of Object.entries({ idle: 'Idle_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop' })) {
  const clip = sourceClip(source); const action = mixer.clipAction(clip).play();
  const frames = Math.round(clip.duration * 30);
  const rotations: Record<string, number[]> = Object.fromEntries(mapped.map((bone: any) => [bone.name, []]));
  const hipsPositions: number[] = []; const times: number[] = [];
  let minFootZ = Infinity, maxFootZ = -Infinity;
  for (let frame = 0; frame <= frames; frame++) {
    const time = frame === frames ? 0 : clip.duration * frame / frames;
    mixer.setTime(time); root.updateMatrixWorld(true);
    times.push(round(clip.duration * frame / frames));
    for (const { name, object } of mapped) {
      const rotation = object.getWorldQuaternion(new Quaternion()).multiply(rest.get(name)!);
      rotations[name].push(...rotation.toArray().map(round));
      if (name === 'leftFoot') { const z = object.getWorldPosition(new Vector3()).z; minFootZ = Math.min(minFootZ, z); maxFootZ = Math.max(maxFootZ, z); }
    }
    hipsPositions.push(...hips.getWorldPosition(new Vector3()).sub(restHips).toArray().map(round));
  }
  // Remove horizontal drift; retain the authored side-to-side sway and vertical bounce.
  const originX = hipsPositions[0], originZ = hipsPositions[2];
  for (let i = 0; i < hipsPositions.length; i += 3) { hipsPositions[i] = round(hipsPositions[i] - originX); hipsPositions[i + 2] = round(hipsPositions[i + 2] - originZ); }
  result.clips[name] = { source, duration: clip.duration, times, rotations, hipsPositions, referenceSpeed: name === 'idle' ? 0 : 2 * (maxFootZ - minFootZ) / clip.duration };
  action.stop();
  console.log(`${name}: ${frames + 1} samples, ${Object.keys(rotations).length} bones, ${result.clips[name].referenceSpeed.toFixed(2)} m/s`);
}
await writeFile('public/motions/locomotion.json', JSON.stringify(result));
