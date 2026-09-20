import { mkdir, writeFile } from 'node:fs/promises';
import { createBuilder } from './glb';

const b = createBuilder();
const cream = b.material('Warm plaster', '#e8e2d5');
const oak = b.material('Natural oak', '#b59068');
const dark = b.material('Graphite', '#303c40');
const sage = b.material('Sage upholstery', '#9ba98b');
const ivory = b.material('Ivory cushions', '#ede5d7');
const rug = b.material('Woven sand', '#cfbea4');
const green = b.material('Leaf green', '#627d54');
const terra = b.material('Terracotta', '#bb795a');
const blue = b.material('Artwork blue', '#728e9b');
const gold = b.material('Artwork ochre', '#cfac65');
const white = b.material('Porcelain', '#f3f0e9');
b.json.extensionsUsed = ['OPENVROOM_room', 'OPENVROOM_components'];
b.json.extensions = { OPENVROOM_room: { version: '0.1', title: 'こもれびのラウンジ', author: 'OpenVRoom', description: '光の差し込む、小さな居場所。まずは自由に歩いてみよう。', units: 'meters', background: '#cbd8d7' } };
b.object('Floor', 'box', oak, [0, -0.16, 0], [12, 0.32, 10], true);
for (let x = -5.5; x < 6; x += 1) b.object('Floor joint', 'box', rug, [x, 0.002, 0], [0.016, 0.003, 10]);
b.object('Back wall', 'box', cream, [0, 1.8, -5], [12, 3.6, 0.2], true);
b.object('Left wall', 'box', cream, [-6, 1.8, 0], [0.2, 3.6, 10], true);
b.object('Right sill', 'box', cream, [6, 0.35, 0], [0.18, 0.7, 10], true);
b.object('Front boundary', 'box', cream, [0, 0.2, 5], [12, 0.4, 0.18], true);
for (const z of [-4.8, -1.6, 1.6, 4.8]) b.object('Window mullion', 'box', oak, [6, 2.15, z], [0.13, 2.9, 0.12], true);
b.object('Window top', 'box', oak, [6, 3.57, 0], [0.16, 0.14, 10]);
b.object('Window collision', 'box', cream, [6.12, -0.2, 0], [0.02, 0.01, 10]);
// Invisible pane collision is defined on a separate, non-mesh node.
b.json.scenes[0].nodes.push(b.json.nodes.push({ name: 'Window boundary', translation: [6.12, 1.8, 0], extensions: { OPENVROOM_components: { components: [{ type: 'collider', size: [0.1, 3.6, 10], center: [0, 0, 0] }] } } }) - 1);
b.object('Rug', 'box', rug, [-0.9, 0.015, -0.6], [5.7, 0.025, 4.3]);
b.object('Sofa base', 'box', sage, [-1.4, 0.42, -3.25], [3.5, 0.7, 1.1], true);
b.object('Sofa back', 'box', sage, [-1.4, 0.93, -3.72], [3.5, 0.9, 0.28], true);
for (const x of [-3.12, 0.32]) b.object('Sofa arm', 'box', sage, [x, 0.71, -3.25], [0.25, 0.8, 1.16], true);
for (const x of [-2.5, -1.4, -0.3]) b.object('Seat cushion', 'box', ivory, [x, 0.81, -3.17], [1.02, 0.16, 0.82]);
b.object('Coffee table', 'cylinder', oak, [-1.2, 0.58, -0.75], [1.8, 0.12, 1.8], true);
b.object('Table foot', 'cylinder', dark, [-1.2, 0.28, -0.75], [0.65, 0.55, 0.65], true);
b.object('Book', 'box', blue, [-1.4, 0.67, -0.7], [0.5, 0.055, 0.35]);
b.object('Cup', 'cylinder', white, [-0.82, 0.72, -0.7], [0.15, 0.19, 0.15]);
b.object('Side table', 'cylinder', dark, [1.55, 0.4, -3.1], [0.85, 0.8, 0.85], true);
b.object('Vase', 'sphere', terra, [1.55, 0.98, -3.1], [0.32, 0.42, 0.32]);
b.object('Artwork frame', 'box', oak, [-1.5, 2.35, -4.83], [2.65, 1.3, 0.09]);
b.object('Artwork canvas', 'box', ivory, [-1.5, 2.35, -4.77], [2.5, 1.17, 0.025]);
b.object('Artwork sun', 'sphere', gold, [-1.95, 2.54, -4.73], [0.67, 0.67, 0.02]);
b.object('Artwork horizon', 'box', blue, [-1.12, 2.1, -4.72], [1.5, 0.45, 0.025]);
for (const [x, z] of [[4.9, -4], [-4.9, -3.8], [4.8, 3.8]]) {
  b.object('Plant pot', 'cylinder', terra, [x, 0.29, z], [0.62, 0.58, 0.62], true);
  b.object('Plant stem', 'cylinder', oak, [x, 0.95, z], [0.055, 1.2, 0.055]);
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.4;
    b.object('Leaf', 'sphere', green, [x + Math.cos(angle) * 0.27, 0.95 + i * 0.1, z + Math.sin(angle) * 0.27], [0.6, 0.24, 0.48]);
  }
}
b.object('Bench', 'box', oak, [-5.25, 0.47, 1.1], [0.8, 0.16, 2.6], true);
for (const z of [0.1, 2.1]) b.object('Bench leg', 'box', dark, [-5.25, 0.22, z], [0.6, 0.44, 0.1], true);
b.json.scenes[0].nodes.push(b.json.nodes.push({ name: 'Arrival', translation: [0, 0.03, 2.4], extensions: { OPENVROOM_components: { components: [{ type: 'spawn', yaw: Math.PI }] } } }) - 1);
await mkdir('public', { recursive: true });
await writeFile('public/starter-room.vroom', new Uint8Array(b.finish()));
console.log('Created public/starter-room.vroom');
