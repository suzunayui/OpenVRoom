import { readFile } from 'node:fs/promises';
import { validateAsset } from '../src/core/format';

const [command, file] = process.argv.slice(2);
if (command !== 'validate' || !file) {
  console.error('Usage: npm run vroom -- validate path/to/room.vroom');
  process.exitCode = 2;
} else {
  try {
    const data = await readFile(file);
    const room = validateAsset(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), 'room');
    console.log(`VALID: ${room.metadata!.title} (v${room.metadata!.version}, ${room.json.nodes.length} nodes)`);
  } catch (error) {
    console.error(`INVALID: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
