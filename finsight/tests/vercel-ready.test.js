import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, '..');

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

test('finsight vercel build config is valid', async () => {
  const vercelPath = path.join(appDir, 'vercel.json');
  const vercel = await readJson(vercelPath);

  assert.equal(vercel.framework, 'vite');
  assert.equal(vercel.buildCommand, 'npm run build');
  assert.equal(vercel.outputDirectory, 'dist');
  assert.ok(Array.isArray(vercel.routes) && vercel.routes.length > 0);
  assert.equal(vercel.routes[0]?.handle, 'filesystem');
  assert.ok(vercel.functions?.['api/[...path].js']);
});

test('finsight workspace includes build and test scripts', async () => {
  const pkgPath = path.join(appDir, 'package.json');
  const pkg = await readJson(pkgPath);

  assert.equal(pkg.scripts.build, 'vite build');
  assert.equal(pkg.scripts.test, 'node --test tests/vercel-ready.test.js');
});
