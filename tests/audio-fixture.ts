import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Synthetic tone for virtual-device tests. No recording or physical capture. */
export async function testAudioFile() {
  const samples = 48000 * 2, wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(96000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / 48000) * 7000), 44 + i * 2);
  await mkdir('.cache', { recursive: true }); await writeFile('.cache/voice-test.wav', wav);
  return resolve('.cache/voice-test.wav');
}
