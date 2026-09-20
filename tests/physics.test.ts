import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { groundHeight, intersectsPlayer, movePlayer } from '../src/core/physics';
const wall = new Box3(new Vector3(1, 0, -10), new Vector3(1.2, 3, 10));
const floor = new Box3(new Vector3(-10, -0.2, -10), new Vector3(10, 0, 10));
test('a standing player touches the floor without being blocked', () => {
  assert.equal(intersectsPlayer(new Vector3(), [floor]), false);
  assert.equal(groundHeight(new Vector3(0, 0.03, 0), [floor], 0.03), 0);
});
test('large steps cannot tunnel through a thin wall; diagonal movement slides', () => {
  const position = new Vector3();
  movePlayer(position, new Vector3(5, 0, 2), [floor, wall]);
  assert.ok(position.x < 0.75 && position.x > 0.5);
  assert.ok(Math.abs(position.z - 2) < 0.001);
});
test('ground lookup does not teleport the player onto overhead furniture', () => {
  const table = new Box3(new Vector3(-1, 0.5, -1), new Vector3(1, 0.7, 1));
  assert.equal(groundHeight(new Vector3(), [floor, table], 0), 0);
  assert.equal(groundHeight(new Vector3(20, 0, 0), [floor], 0), undefined);
});
