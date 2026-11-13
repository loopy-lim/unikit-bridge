import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEGACY_CRATES,
  LEGACY_RUSTRA_NPM,
  SUPERSEDED_NPM,
  npmPackageLookup,
  planCrateYanks,
  planNpmDeprecations,
  runDeprecation,
} from './deprecate-legacy-packages.mjs';

test('plans all superseded and legacy npm deprecations', () => {
  const planned = planNpmDeprecations([...SUPERSEDED_NPM, ...LEGACY_RUSTRA_NPM]);
  assert.equal(planned.length, SUPERSEDED_NPM.length + LEGACY_RUSTRA_NPM.length);
  assert.match(planned[0].message, /@unikit-bridge\/rustra/);
});

test('dry-run never executes npm deprecate', async () => {
  const lines = await runDeprecation({
    apply: false,
    npmLookup: () => 'exists',
  });
  assert.ok(lines.some((line) => line.startsWith('[dry-run]')));
  assert.ok(lines.every((line) => !line.startsWith('[apply]')));
});

test('prints cargo yank guidance without --crates', async () => {
  const lines = await runDeprecation({ apply: false, crates: false, npmLookup: () => 'missing' });
  for (const crate of LEGACY_CRATES) {
    assert.ok(lines.some((line) => line.includes(crate.name)));
  }
});

test('planCrateYanks includes version pin', () => {
  const yanks = planCrateYanks('1.2.3');
  assert.equal(yanks.length, LEGACY_CRATES.length);
  assert.match(yanks[0].instruction, /1\.2\.3/);
});

test('npmPackageLookup treats E404 as missing and other errors as unknown', () => {
  assert.equal(
    npmPackageLookup('@example/missing', {
      exec: () => {
        const error = new Error('npm view failed');
        error.stderr = Buffer.from('npm error code E404\nnpm error 404 Not Found');
        throw error;
      },
    }),
    'missing',
  );
  assert.equal(
    npmPackageLookup('@example/flaky', {
      exec: () => {
        const error = new Error('npm view failed');
        error.stderr = Buffer.from('npm error code ECONNREFUSED');
        throw error;
      },
    }),
    'unknown',
  );
  assert.equal(
    npmPackageLookup('@example/ok', {
      exec: () => '"1.0.0"',
    }),
    'exists',
  );
});

test('apply fails closed when npm registry lookup is unknown', async () => {
  await assert.rejects(
    () =>
      runDeprecation({
        apply: true,
        npmLookup: (name) => (name === '@unikit-bridge/types' ? 'unknown' : 'missing'),
        exec: () => {
          throw new Error('should not execute npm deprecate');
        },
      }),
    /registry lookup failed/,
  );
});

test('crates apply prefights and refuses unknown crates.io lookups before yank', async () => {
  const executed = [];
  await assert.rejects(
    () =>
      runDeprecation({
        apply: true,
        crates: true,
        crateVersion: '0.1.0',
        npmLookup: () => 'missing',
        crateLookup: async (name) => (name === 'rustra' ? 'unknown' : 'exists'),
        exec: (file, args) => {
          executed.push([file, ...args]);
        },
      }),
    /crates\.io lookup failed/,
  );
  assert.deepEqual(executed, []);
});

test('crates apply yanks only versions confirmed on crates.io', async () => {
  const executed = [];
  const lines = await runDeprecation({
    apply: true,
    crates: true,
    crateVersion: '0.1.0',
    npmLookup: () => 'missing',
    crateLookup: async (name) => (name === 'unikit-bridge-naming' ? 'exists' : 'missing'),
    exec: (file, args) => {
      executed.push([file, ...args]);
    },
  });
  assert.ok(lines.some((line) => line.includes('[apply] cargo yank --version 0.1.0 unikit-bridge-naming')));
  assert.ok(lines.some((line) => line.includes('[skip] rustra@0.1.0 not on crates.io')));
  assert.deepEqual(executed, [['cargo', 'yank', '--version', '0.1.0', 'unikit-bridge-naming']]);
});
