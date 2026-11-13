import assert from 'node:assert/strict';
import test from 'node:test';
import { unikitPlugin } from './vite.js';

test('unikitPlugin returns vite plugin with name and hooks', () => {
  const plugin = unikitPlugin({
    backendDir: 'custom-backend',
    generatedDir: 'custom-gen',
  });

  assert.equal(plugin.name, 'vite-plugin-unikit');
  assert.equal(typeof plugin.buildStart, 'function');
  assert.equal(typeof plugin.handleHotUpdate, 'function');
});

test('unikitPlugin handles buildStart gracefully when directory is absent', async () => {
  const plugin = unikitPlugin({
    backendDir: 'non-existent-dir-1234',
  });

  await assert.doesNotReject(async () => {
    await plugin.buildStart();
  });
});
