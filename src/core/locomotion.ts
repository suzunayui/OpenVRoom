import { AnimationClip, AnimationMixer, MathUtils, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack, type AnimationAction } from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

export type MotionState = 'idle' | 'walk' | 'run';
export interface MotionClip {
  duration: number; times: number[]; rotations: Record<string, number[]>;
  hipsPositions: number[]; referenceSpeed: number;
}
export interface MotionLibrary { version: number; sourceHipsHeight: number; clips: Record<MotionState, MotionClip> }
let libraryPromise: Promise<MotionLibrary> | undefined;
export function loadMotionLibrary(): Promise<MotionLibrary> {
  return libraryPromise ??= fetch('./motions/locomotion.json?v=3').then(async response => {
    if (!response.ok) throw new Error('歩行モーションを読み込めませんでした。');
    const library = await response.json() as MotionLibrary;
    if (library.version !== 1 || !library.clips?.idle || !library.clips.walk || !library.clips.run) throw new Error('歩行モーションの形式が不正です。');
    return library;
  }).catch(error => { libraryPromise = undefined; throw error; });
}

/** Source rotations are world-space deltas from its T-pose, facing +Z.
 * Convert them to the target's normalized local axes (including VRM0), and
 * collapse missing optional joints by using the nearest mapped ancestor. */
export function retargetMotion(vrm: VRM, source: MotionClip, sourceHipsHeight: number, name: string): AnimationClip {
  vrm.scene.updateMatrixWorld(true);
  const entries = Object.keys(source.rotations).flatMap(name => {
    const node = vrm.humanoid.getNormalizedBoneNode(name as VRMHumanBoneName);
    return node ? [{ name, node }] : [];
  });
  const names = new Map<Object3D, string>(entries.map(({ name, node }) => [node, name]));
  const tracks: (QuaternionKeyframeTrack | VectorKeyframeTrack)[] = [];
  const own = new Quaternion(), parent = new Quaternion();
  for (const { name, node } of entries) {
    let ancestor = node.parent;
    while (ancestor && !names.has(ancestor)) ancestor = ancestor.parent;
    const parentSamples = ancestor ? source.rotations[names.get(ancestor)!] : undefined;
    const restWorld = node.getWorldQuaternion(new Quaternion());
    const parentRestInverse = node.parent?.getWorldQuaternion(new Quaternion()).invert() ?? new Quaternion();
    const values: number[] = [];
    for (let i = 0; i < source.times.length; i++) {
      own.fromArray(source.rotations[name], i * 4).normalize();
      if (parentSamples) parent.fromArray(parentSamples, i * 4).normalize().invert(); else parent.identity();
      own.premultiply(parent).premultiply(parentRestInverse).multiply(restWorld).normalize();
      values.push(...own.toArray());
    }
    tracks.push(new QuaternionKeyframeTrack(`${node.uuid}.quaternion`, source.times, values));
  }
  const hips = vrm.humanoid.getNormalizedBoneNode('hips')!;
  const root = vrm.humanoid.normalizedHumanBonesRoot;
  const ratio = Math.abs(hips.getWorldPosition(new Vector3()).y - root.getWorldPosition(new Vector3()).y) / sourceHipsHeight;
  const rest = hips.position.clone();
  const inverseParent = hips.parent!.matrixWorld.clone().invert();
  const origin = new Vector3().applyMatrix4(inverseParent);
  const position = new Vector3(); const positions: number[] = [];
  for (let i = 0; i < source.times.length; i++) {
    position.fromArray(source.hipsPositions, i * 3).multiplyScalar(ratio);
    position.applyMatrix4(inverseParent).sub(origin).add(rest);
    positions.push(...position.toArray());
  }
  tracks.push(new VectorKeyframeTrack(`${hips.uuid}.position`, source.times, positions));
  return new AnimationClip(name, source.duration, tracks);
}

export class AvatarLocomotion {
  readonly mixer: AnimationMixer;
  readonly clips: Record<MotionState, AnimationClip>;
  readonly weights = { idle: 1, walk: 0, run: 0 };
  readonly referenceSpeeds: { walk: number; run: number };
  private actions: Record<MotionState, AnimationAction>;
  private phase = 0;
  private speed = 0;
  state: MotionState = 'idle';

  constructor(private vrm: VRM, library: MotionLibrary) {
    const sourceHeight = library.sourceHipsHeight;
    const hips = vrm.humanoid.getNormalizedBoneNode('hips')!;
    vrm.scene.updateMatrixWorld(true);
    const targetHeight = Math.abs(hips.getWorldPosition(new Vector3()).y - vrm.humanoid.normalizedHumanBonesRoot.getWorldPosition(new Vector3()).y);
    const ratio = targetHeight / sourceHeight;
    this.referenceSpeeds = { walk: library.clips.walk.referenceSpeed * ratio, run: library.clips.run.referenceSpeed * ratio };
    this.clips = Object.fromEntries((['idle', 'walk', 'run'] as const).map(name => [name, retargetMotion(vrm, library.clips[name], sourceHeight, name)])) as Record<MotionState, AnimationClip>;
    this.mixer = new AnimationMixer(vrm.scene);
    this.actions = Object.fromEntries((['idle', 'walk', 'run'] as const).map(name => {
      const action = this.mixer.clipAction(this.clips[name]).play(); action.setEffectiveWeight(this.weights[name]);
      return [name, action];
    })) as Record<MotionState, AnimationAction>;
    this.mixer.update(0);
  }

  update(dt: number, actualSpeed: number, running: boolean): void {
    this.speed = MathUtils.damp(this.speed, actualSpeed, 14, dt);
    this.state = this.speed < 0.08 ? 'idle' : running ? 'run' : 'walk';
    const movement = MathUtils.smoothstep(this.speed, 0.025, 0.35);
    const run = MathUtils.damp(this.weights.run, running ? movement : 0, 9, dt);
    this.weights.run = run;
    this.weights.idle = MathUtils.damp(this.weights.idle, 1 - movement, 12, dt);
    this.weights.walk = Math.max(0, 1 - this.weights.idle - run);
    const sum = this.weights.idle + this.weights.walk + this.weights.run;
    const walkCycles = this.speed / Math.max(0.1, this.referenceSpeeds.walk) / this.clips.walk.duration;
    const runCycles = this.speed / Math.max(0.1, this.referenceSpeeds.run) / this.clips.run.duration;
    const runBlend = run / Math.max(0.001, this.weights.walk + run);
    this.phase = (this.phase + dt * MathUtils.lerp(walkCycles, runCycles, runBlend)) % 1;
    // Shared phase keeps the same foot planted through a walk/run transition.
    for (const name of ['idle', 'walk', 'run'] as const) {
      const action = this.actions[name];
      action.setEffectiveWeight(this.weights[name] / sum);
      if (name !== 'idle') { action.time = this.phase * this.clips[name].duration; action.setEffectiveTimeScale(0); }
    }
    this.mixer.update(dt);
  }

  reset(): void { this.speed = 0; this.phase = 0; this.state = 'idle'; this.weights.idle = 1; this.weights.walk = this.weights.run = 0; this.update(0, 0, false); }
  dispose(): void { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.vrm.scene); }
}
