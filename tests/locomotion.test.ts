import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm';
import { Quaternion } from 'three';
import { AvatarLocomotion, type MotionLibrary } from '../src/core/locomotion';
import { testVrm } from './fixtures';

const library = JSON.parse(readFileSync('public/motions/locomotion.json', 'utf8')) as MotionLibrary;
async function avatar() {
  const loader = new GLTFLoader(); loader.register(parser => new VRMLoaderPlugin(parser));
  return (await loader.parseAsync(testVrm(), '')).userData.vrm as VRM;
}
test('authored clips are finite, loop seamlessly, and articulate knees and ankles', () => {
  for (const clip of Object.values(library.clips)) {
    assert.ok(clip.duration > 0 && clip.times.length > 20);
    for (const values of Object.values(clip.rotations)) {
      assert.equal(values.length, clip.times.length * 4);
      assert.ok(values.every(Number.isFinite));
      assert.deepEqual(values.slice(0, 4), values.slice(-4));
      for (let i = 0; i < values.length; i += 4) assert.ok(Math.abs(new Quaternion().fromArray(values, i).length() - 1) < 0.00001);
    }
  }
  for (const bone of ['leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'hips', 'spine']) {
    const values = library.clips.walk.rotations[bone];
    const start = new Quaternion().fromArray(values);
    assert.ok(Array.from({ length: values.length / 4 }, (_, i) => start.angleTo(new Quaternion().fromArray(values, i * 4))).some(angle => angle > 0.05), bone);
  }
});
test('retargeting works with missing optional bones and produces smooth idle/walk/run/stop', async () => {
  const vrm = await avatar(); const locomotion = new AvatarLocomotion(vrm, library);
  const hips = vrm.humanoid.getNormalizedBoneNode('hips')!;
  const knee = vrm.humanoid.getNormalizedBoneNode('leftLowerLeg')!;
  const startKnee = knee.quaternion.clone();
  let changed = false;
  for (let i = 0; i < 120; i++) {
    const previous = knee.quaternion.clone();
    locomotion.update(1 / 60, 1.4, false); vrm.update(1 / 60);
    if (startKnee.angleTo(knee.quaternion) > 0.2) changed = true;
    assert.ok(previous.angleTo(knee.quaternion) < 0.5, 'No per-frame joint snapping');
    assert.ok(Math.abs(hips.position.x) < 0.2 && Math.abs(hips.position.z) < 0.2, 'Root motion does not drift');
  }
  assert.ok(changed, 'Knee actually bends'); assert.equal(locomotion.state, 'walk');
  for (let i = 0; i < 90; i++) locomotion.update(1 / 60, 3.2, true);
  assert.equal(locomotion.state, 'run'); assert.ok(locomotion.weights.run > 0.99);
  // A blocked character has speed zero even while its movement key remains held.
  for (let i = 0; i < 120; i++) locomotion.update(1 / 60, 0, true);
  assert.equal(locomotion.state, 'idle'); assert.ok(locomotion.weights.idle > 0.99);
  locomotion.reset(); assert.equal(locomotion.weights.idle, 1);
  locomotion.dispose();
});
