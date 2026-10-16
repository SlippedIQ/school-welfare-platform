/**
 * Copies MediaPipe's WebAssembly runtime from node_modules into public/ so
 * the deployed app loads it from its own origin (no CDN dependency).
 *
 * Runs from postinstall; the face-landmarker model in public/models is
 * committed to the repository instead (it is not published in the package).
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const target = join(root, 'public', 'vision', 'wasm');

if (!existsSync(source)) {
  console.error('[@mediapipe/tasks-vision] package missing — run `npm install` first.');
  process.exit(1);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log('Vision wasm assets copied to public/vision/wasm');
