/**
 * Builds the extension into dist/ (load it unpacked in chrome://extensions)
 * and the preview harness into preview-dist/.
 *
 *   node scripts/build.mjs            production build
 *   node scripts/build.mjs --watch    rebuild on change
 *   node scripts/build.mjs --preview  build, watch and serve the preview page
 */

import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const watch = args.has('--watch') || args.has('--preview');
const preview = args.has('--preview');

const shared = {
  bundle: true,
  format: 'iife',
  target: 'chrome116',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
};

const extension = {
  ...shared,
  outdir: resolve(root, 'dist'),
  entryPoints: {
    panel: 'src/adapters/extension/panel/main.tsx',
    background: 'src/adapters/extension/background.ts',
    capture: 'src/capture/entry.ts',
  },
};

const previewBuild = {
  ...shared,
  outdir: resolve(root, 'preview-dist'),
  entryPoints: { preview: 'src/adapters/preview/main.tsx' },
};

async function copyStatic() {
  await rm(resolve(root, 'dist'), { recursive: true, force: true });
  await mkdir(resolve(root, 'dist'), { recursive: true });
  await cp(resolve(root, 'public/manifest.json'), resolve(root, 'dist/manifest.json'));
  await cp(resolve(root, 'public/panel.html'), resolve(root, 'dist/panel.html'));
  await cp(resolve(root, 'public/icons'), resolve(root, 'dist/icons'), { recursive: true });

  await mkdir(resolve(root, 'preview-dist'), { recursive: true });
  await cp(resolve(root, 'public/preview.html'), resolve(root, 'preview-dist/index.html'));
  await cp(resolve(root, 'fixtures/demo-page.html'), resolve(root, 'preview-dist/demo-page.html'));
}

process.chdir(root);
await copyStatic();

if (!watch) {
  await Promise.all([esbuild.build(extension), esbuild.build(previewBuild)]);
} else {
  const contexts = await Promise.all([esbuild.context(extension), esbuild.context(previewBuild)]);
  await Promise.all(contexts.map((c) => c.watch()));
  if (preview) {
    const { port } = await contexts[1].serve({ servedir: resolve(root, 'preview-dist'), port: 5173 });
    console.log(`Preview: http://localhost:${port}/`);
  }
}
