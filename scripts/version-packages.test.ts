import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { caretMinorRange, syncLockWorkspaceMetadata, syncNpmRange } from './version-packages.mjs';

void test('caretMinorRange tracks the minor on 0.x and keeps major bumps on 1.x+', () => {
  assert.equal(caretMinorRange('0.4.0'), '^0.4.0');
  assert.equal(caretMinorRange('0.4.2'), '^0.4.0');
  assert.equal(caretMinorRange('1.2.3'), '^1.2.0');
  assert.throws(() => caretMinorRange('0.4'), /not a released x\.y\.z version/);
});

void test('syncNpmRange rewrites only the range value and preserves formatting', () => {
  const root = mkdtempSync(join(tmpdir(), 'unikit-version-packages-'));
  try {
    const manifestPath = join(root, 'package.json');
    const original = [
      '{',
      '  "name": "@unikit-bridge/rustra",',
      '  "unikitTemplate": {',
      '    "cargoRange": "^0.9.0",',
      '    "npmRange": "^0.7.0"',
      '  }',
      '}',
      '',
    ].join('\n');
    writeFileSync(manifestPath, original);

    assert.equal(syncNpmRange(manifestPath, '0.8.0'), true, 'range moved');
    assert.deepEqual(
      readFileSync(manifestPath, 'utf8').split('\n'),
      original.replace('"npmRange": "^0.7.0"', '"npmRange": "^0.8.0"').split('\n'),
      'byte-identical except the range value',
    );

    assert.equal(syncNpmRange(manifestPath, '0.8.1'), false, 'already in range — no-op');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('syncLockWorkspaceMetadata rewrites workspace version only', () => {
  const root = mkdtempSync(join(tmpdir(), 'unikit-version-packages-'));
  try {
    const lockPath = join(root, 'bun.lock');
    const lock = [
      '{',
      '  "workspaces": {',
      '    "packages/rustra": {',
      '      "name": "@unikit-bridge/rustra",',
      '      "version": "0.8.0",',
      '    },',
      '  },',
      '  "packages": {',
      '    "typescript@5.9.0": {',
      '      "version": "5.9.0",',
      '    },',
      '  },',
      '}',
      '',
    ].join('\n');
    writeFileSync(lockPath, lock);

    const manifests = {
      'packages/rustra': { version: '0.9.0' },
    };
    assert.equal(syncLockWorkspaceMetadata(lockPath, manifests), true);
    const updated = readFileSync(lockPath, 'utf8');
    assert.match(
      updated,
      /"packages\/rustra": \{\n      "name": "@unikit-bridge\/rustra",\n      "version": "0\.9\.0"/,
    );
    assert.equal(syncLockWorkspaceMetadata(lockPath, manifests), false, 'already synced — no-op');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
