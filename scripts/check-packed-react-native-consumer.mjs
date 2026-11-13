import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function packPackage(destination) {
  const packageRoot = join(repositoryRoot, 'packages', 'rustra');
  execFileSync('bun', ['pm', 'pack', '--cwd', packageRoot, '--destination', destination], {
    stdio: 'pipe',
  });
  const archives = readdirSync(destination).filter((name) => name.endsWith('.tgz'));
  if (archives.length !== 1) {
    throw new Error(`Expected one rustra archive, found ${archives.length}`);
  }
  return join(destination, archives[0]);
}

export function createConsumerManifest({ rustraArchive }) {
  const rustraSpecifier = `file:${rustraArchive}`;
  return {
    name: 'unikit-packed-rn-consumer',
    private: true,
    type: 'module',
    dependencies: {
      '@unikit-bridge/rustra': rustraSpecifier,
    },
    overrides: {
      '@unikit-bridge/rustra': rustraSpecifier,
    },
  };
}

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'unikit-packed-rn-consumer-'));
  const archivesRoot = join(root, 'archives');
  try {
    const rustraArchive = packPackage(join(archivesRoot, 'rustra'));
    const rustraManifest = JSON.parse(
      readFileSync(join(repositoryRoot, 'packages/rustra/package.json'), 'utf8'),
    );
    const adapterRange = `^${rustraManifest.version}`;

    // Install into appRoot itself — codegen requires app-local
    // node_modules/@unikit-bridge/rustra/native (hoist-only parents fail).
    const appRoot = join(root, 'app');
    mkdirSync(appRoot, { recursive: true });
    writeFileSync(
      join(appRoot, 'package.json'),
      JSON.stringify(createConsumerManifest({ rustraArchive })),
    );
    execFileSync(
      'bun',
      ['install', '--cwd', appRoot, '--cache-dir', join(root, 'bun-cache'), '--no-progress'],
      { stdio: 'pipe' },
    );

    const types = await import(
      pathToFileURL(join(appRoot, 'node_modules/@unikit-bridge/rustra/dist/types/index.js')).href,
    );
    if (typeof types.createComplexCodec !== 'function') {
      throw new Error('packed @unikit-bridge/rustra/types does not expose createComplexCodec');
    }

    const { renderReactNativeModule } = await import(
      pathToFileURL(join(appRoot, 'node_modules/@unikit-bridge/rustra/dist/cli/index.js')).href,
    );
    const moduleDir = join(appRoot, 'modules/unikit-bridge');
    const files = renderReactNativeModule({
      appRoot,
      moduleDir,
      cppOutputPath: join(moduleDir, 'generated'),
      rustManifestPath: join(root, 'Cargo.toml'),
      rustPackage: 'packed-consumer',
      rustLibrary: 'packed_consumer',
      adapterRange,
    });
    const podspec = files['UnikitBridge.podspec'];
    const gradle = files['android/build.gradle'];
    if (!podspec?.includes('node_modules/@unikit-bridge/rustra/native')) {
      throw new Error('packed consumer podspec did not resolve installed React Native native sources');
    }
    if (!gradle?.includes('node_modules/@unikit-bridge/rustra/native')) {
      throw new Error('packed consumer Gradle file did not resolve installed React Native native sources');
    }
    if (podspec.includes(`${repositoryRoot}/packages/rustra`)) {
      throw new Error('packed consumer accidentally resolved the repository source package');
    }
    console.log(`packed React Native consumer ok: @unikit-bridge/rustra ${rustraManifest.version}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
