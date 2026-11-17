import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'api');

await mkdir(apiDir, { recursive: true });

await build({
  entryPoints: [path.join(root, 'server', 'vercelApi.ts')],
  outfile: path.join(apiDir, 'index.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  minifySyntax: true
});
