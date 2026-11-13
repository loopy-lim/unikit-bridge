import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkReleaseCoherence } from './check-release-coherence.mjs';

function makeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'unikit-release-coherence-'));
  mkdirSync(join(root, 'packages', 'rustra'), { recursive: true });
  mkdirSync(join(root, 'crates', 'unikit-bridge'), { recursive: true });
  mkdirSync(join(root, '.changeset'), { recursive: true });

  writeFileSync(join(root, 'Cargo.toml'), '[workspace.package]\nversion = "0.4.0"\n');
  writeFileSync(join(root, 'LICENSE'), 'MIT\n');
  writeFileSync(join(root, '.changeset', 'config.json'), JSON.stringify({ fixed: [], linked: [] }));

  const manifest = {
    name: '@unikit-bridge/rustra',
    version: '0.4.0',
    files: ['LICENSE', 'dist', 'native/**/*'],
    unikitTemplate: {
      cargoRange: '^0.4.0',
      npmRange: '^0.4.0',
    },
  };
  writeFileSync(join(root, 'packages', 'rustra', 'package.json'), JSON.stringify(manifest));
  writeFileSync(join(root, 'packages', 'rustra', 'LICENSE'), 'MIT\n');
  writeFileSync(
    join(root, 'bun.lock'),
    `  "workspaces": {
    "packages/rustra": {
      "name": "@unikit-bridge/rustra",
      "version": "0.4.0",
    },
  },
`,
  );
  return root;
}

void test('accepts consolidated @unikit-bridge/rustra metadata', () => {
  const root = makeFixture();
  try {
    assert.deepEqual(checkReleaseCoherence(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('reports npmRange that no longer contains the package version', () => {
  const root = makeFixture();
  try {
    const manifestPath = join(root, 'packages', 'rustra', 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version: string };
    manifest.version = '0.5.0';
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const failures = checkReleaseCoherence(root);
    assert.match(failures.join('\n'), /npmRange=\^0\.4\.0 does not contain 0\.5\.0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('rejects release files that ship the experimental wasm backend', () => {
  const root = makeFixture();
  try {
    const manifestPath = join(root, 'packages', 'rustra', 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { files: string[] };
    manifest.files = ['LICENSE', 'dist', 'native/wasm3/**/*', 'engines/engine_v1.wasm'];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const failures = checkReleaseCoherence(root);
    assert.match(
      failures.join('\n'),
      /@unikit-bridge\/rustra.*wasm/,
      'shipping wasm3 sources or .wasm engines in a published package must fail',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('wasm backend guard tolerates unrelated native paths', () => {
  const root = makeFixture();
  try {
    const manifestPath = join(root, 'packages', 'rustra', 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { files: string[] };
    manifest.files = ['LICENSE', 'dist', 'native/**/*'];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.deepEqual(checkReleaseCoherence(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('rejects legacy unikitTemplate host range fields', () => {
  const root = makeFixture();
  try {
    const manifestPath = join(root, 'packages', 'rustra', 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      unikitTemplate: Record<string, string>;
    };
    manifest.unikitTemplate.nodeRange = '^0.4.0';
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.match(checkReleaseCoherence(root).join('\n'), /nodeRange/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
