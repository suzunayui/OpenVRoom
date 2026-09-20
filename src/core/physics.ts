import { Box3, Vector3 } from 'three';

export const PLAYER_RADIUS = 0.26;
export const PLAYER_HEIGHT = 1.65;
const bounds = new Box3();
export function intersectsPlayer(position: Vector3, colliders: Box3[]): boolean {
  bounds.min.set(position.x - PLAYER_RADIUS, position.y + 0.025, position.z - PLAYER_RADIUS);
  bounds.max.set(position.x + PLAYER_RADIUS, position.y + PLAYER_HEIGHT, position.z + PLAYER_RADIUS);
  return colliders.some(box => bounds.intersectsBox(box));
}
export function movePlayer(position: Vector3, delta: Vector3, colliders: Box3[]): void {
  // Substeps prevent tunneling when a frame is slow.
  const steps = Math.max(1, Math.ceil(delta.length() / 0.1));
  for (let step = 0; step < steps; step++) {
    for (const axis of ['x', 'z'] as const) {
      const previous = position[axis];
      position[axis] += delta[axis] / steps;
      if (intersectsPlayer(position, colliders)) position[axis] = previous;
    }
  }
}
export function groundHeight(position: Vector3, colliders: Box3[], maxY: number): number | undefined {
  let height: number | undefined;
  for (const box of colliders) {
    if (position.x + PLAYER_RADIUS > box.min.x && position.x - PLAYER_RADIUS < box.max.x &&
        position.z + PLAYER_RADIUS > box.min.z && position.z - PLAYER_RADIUS < box.max.z && box.max.y <= maxY + 0.05) {
      height = Math.max(height ?? -Infinity, box.max.y);
    }
  }
  return height;
}
