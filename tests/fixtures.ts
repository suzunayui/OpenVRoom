import { createBuilder } from '../scripts/glb';

/** Original rigid test humanoid. No third-party model or licensed avatar is bundled. */
export function testVrm(): ArrayBuffer {
  const b = createBuilder();
  const material = b.material('Test avatar', '#70a6aa');
  const nodes = b.json.nodes;
  const bones: Record<string, { node: number }> = {};
  function bone(name: string, parent: string | undefined, translation: number[], shape?: string, size?: number[]) {
    const index = nodes.push({ name, translation, children: [] }) - 1;
    bones[name] = { node: index };
    if (parent) nodes[bones[parent].node].children.push(index);
    if (shape) {
      const mesh = b.object(`${name} visual`, shape, material, [0, 0, 0], size!);
      nodes[index].children.push(mesh);
    }
    return index;
  }
  const root = bone('hips', undefined, [0, 0.9, 0], 'box', [0.3, 0.2, 0.22]);
  bone('spine', 'hips', [0, 0.18, 0], 'box', [0.32, 0.25, 0.22]);
  bone('chest', 'spine', [0, 0.18, 0], 'box', [0.4, 0.2, 0.24]);
  bone('neck', 'chest', [0, 0.15, 0]);
  bone('head', 'neck', [0, 0.19, 0], 'sphere', [0.35, 0.4, 0.33]);
  for (const [prefix, side] of [['left', 1], ['right', -1]] as const) {
    bone(`${prefix}UpperArm`, 'chest', [side * 0.26, 0.04, 0], 'box', [0.2, 0.12, 0.12]);
    bone(`${prefix}LowerArm`, `${prefix}UpperArm`, [side * 0.24, 0, 0], 'box', [0.2, 0.1, 0.1]);
    bone(`${prefix}Hand`, `${prefix}LowerArm`, [side * 0.2, 0, 0], 'sphere', [0.12, 0.1, 0.12]);
    bone(`${prefix}UpperLeg`, 'hips', [side * 0.11, -0.22, 0], 'box', [0.14, 0.35, 0.14]);
    bone(`${prefix}LowerLeg`, `${prefix}UpperLeg`, [0, -0.34, 0], 'box', [0.12, 0.32, 0.12]);
    bone(`${prefix}Foot`, `${prefix}LowerLeg`, [0, -0.26, 0.05], 'box', [0.14, 0.12, 0.25]);
  }
  b.json.scenes = [{ nodes: [root] }];
  b.json.extensionsUsed = ['VRMC_vrm'];
  b.json.extensions = { VRMC_vrm: {
    specVersion: '1.0',
    meta: { name: 'Test humanoid', version: '1.0', authors: ['OpenVRoom'], licenseUrl: 'https://vrm.dev/licenses/1.0/', avatarPermission: 'everyone', commercialUsage: 'personalNonProfit', creditNotation: 'unnecessary', allowRedistribution: false, modification: 'allowModification' },
    humanoid: { humanBones: bones },
  } };
  return b.finish();
}
