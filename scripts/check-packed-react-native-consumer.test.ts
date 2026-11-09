import assert from 'node:assert/strict';
import test from 'node:test';
import { createConsumerManifest } from './check-packed-react-native-consumer.mjs';

void test('pins the local types tarball for transitive 0.4.1 dependencies', () => {
  const manifest = createConsumerManifest({
    typesArchive: '/tmp/unikit-types-0.4.1.tgz',
    cliArchive: '/tmp/unikit-cli-0.4.1.tgz',
    reactNativeArchive: '/tmp/unikit-react-native-0.4.1.tgz',
  });

  assert.equal(manifest.dependencies['@unikit-bridge/types'], 'file:/tmp/unikit-types-0.4.1.tgz');
  assert.equal(manifest.overrides['@unikit-bridge/types'], 'file:/tmp/unikit-types-0.4.1.tgz');
});
