/**
 * Builds the extension into dist/ (load it unpacked in chrome://extensions)
 * and the preview harness into preview-dist/.
 *
 *   node scripts/build.mjs            production build
 *   node scripts/build.mjs --watch    rebuild on change
 *   node scripts/build.mjs --preview  build, watch and serve the preview page
 *   node scripts/build.mjs --zip      also write system-audit-extension.zip (for the Web Store)
 */

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
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
  // package.json is the single source of the version: `npm version patch` bumps both.
  const manifest = JSON.parse(await readFile(resolve(root, 'public/manifest.json'), 'utf8'));
  const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  await writeFile(resolve(root, 'dist/manifest.json'), `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
  await cp(resolve(root, 'public/panel.html'), resolve(root, 'dist/panel.html'));
  await cp(resolve(root, 'public/icons'), resolve(root, 'dist/icons'), { recursive: true });

  await mkdir(resolve(root, 'preview-dist'), { recursive: true });
  await cp(resolve(root, 'public/preview.html'), resolve(root, 'preview-dist/index.html'));
  for (const page of ['demo-page.html', 'demo-pricing.html']) {
    await cp(resolve(root, 'fixtures', page), resolve(root, 'preview-dist', page));
  }
}

process.chdir(root);
await copyStatic();

if (!watch) {
  await Promise.all([esbuild.build(extension), esbuild.build(previewBuild)]);
  if (args.has('--zip')) {
    const zip = resolve(root, 'system-audit-extension.zip');
    await rm(zip, { force: true });
    execFileSync('zip', ['-qr', zip, '.'], { cwd: resolve(root, 'dist') });
    console.log(`Packed ${zip}`);
  }
} else {
  const contexts = await Promise.all([esbuild.context(extension), esbuild.context(previewBuild)]);
  await Promise.all(contexts.map((c) => c.watch()));
  if (preview) {
    const { port } = await contexts[1].serve({ servedir: resolve(root, 'preview-dist'), port: 5173 });
    console.log(`Preview: http://localhost:${port}/`);
  }
}
