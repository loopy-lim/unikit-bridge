import assert from 'node:assert/strict';
import test from 'node:test';
import { createConsumerManifest } from './check-packed-react-native-consumer.mjs';

void test('pins the local @unikit-bridge/rustra tarball for transitive resolution', () => {
  const manifest = createConsumerManifest({
    rustraArchive: '/tmp/unikit-rustra-0.4.1.tgz',
  });

  assert.equal(manifest.dependencies['@unikit-bridge/rustra'], 'file:/tmp/unikit-rustra-0.4.1.tgz');
  assert.equal(manifest.overrides['@unikit-bridge/rustra'], 'file:/tmp/unikit-rustra-0.4.1.tgz');
});
