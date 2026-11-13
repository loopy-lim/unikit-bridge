import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { resolvePublishedCli, resolveRustraHostVersion } from './paths.mjs';

test('resolvePublishedCli points at consolidated rustra CLI entry', () => {
  assert.equal(
    resolvePublishedCli('/tmp/consumer'),
    join('/tmp/consumer', 'node_modules', '@unikit-bridge', 'rustra', 'dist', 'cli', 'index.js'),
  );
});

test('resolveRustraHostVersion prefers hosts pin then npm pin', () => {
  assert.equal(
    resolveRustraHostVersion({ hosts: { '@unikit-bridge/rustra': '0.13.0' } }),
    '0.13.0',
  );
  assert.equal(resolveRustraHostVersion({ npm: { '@unikit-bridge/rustra': '0.12.0' } }), '0.12.0');
  assert.throws(
    () => resolveRustraHostVersion({ hosts: { '@unikit-bridge/tauri': '0.10.0' } }),
    /hosts\["@unikit-bridge\/rustra"\]/,
  );
});
