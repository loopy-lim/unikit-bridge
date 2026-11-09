import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkReleaseCoherence } from './check-release-coherence.mjs';

const published = [
  'bun',
  'cli',
  'devtools',
  'node',
  'react-native',
  'react',
  'tauri',
  'testing',
  'types',
];

function makeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'unikit-release-coherence-'));
  mkdirSync(join(root, 'packages'), { recursive: true });
  mkdirSync(join(root, 'crates', 'unikit-bridge'), { recursive: true });
  mkdirSync(join(root, 'crates', 'unikit-bridge-macros'), { recursive: true });
  mkdirSync(join(root, '.changeset'), { recursive: true });

  writeFileSync(join(root, 'Cargo.toml'), '[workspace.package]\nversion = "0.4.0"\n');
  writeFileSync(join(root, 'LICENSE'), 'MIT\n');
  writeFileSync(join(root, '.changeset', 'config.json'), JSON.stringify({ fixed: [], linked: [] }));

  const workspaceBlocks: string[] = [];
  for (const name of published) {
    const version = name === 'bun' ? '0.4.1' : '0.4.0';
    const manifest: Record<string, unknown> = {
      name: `@unikit-bridge/${name}`,
      version,
      files: ['LICENSE'],
    };
    if (name === 'cli') {
      manifest.unikitTemplate = {
        cargoRange: '^0.4.0',
        reactNativeRange: '^0.4.0',
        nodeRange: '^0.4.0',
        bunRange: '^0.4.0',
        tauriRange: '^0.4.0',
      };
    }
    if (name !== 'types') {
      manifest.dependencies = { '@unikit-bridge/types': '^0.4.0' };
    }
    mkdirSync(join(root, 'packages', name), { recursive: true });
    writeFileSync(join(root, 'packages', name, 'package.json'), JSON.stringify(manifest));
    writeFileSync(join(root, 'packages', name, 'LICENSE'), 'MIT\n');
    workspaceBlocks.push(
      `    "packages/${name}": {\n      "name": "@unikit-bridge/${name}",\n      "version": "${version}",\n${name === 'types' ? '' : '      "dependencies": {\n        "@unikit-bridge/types": "^0.4.0",\n      },\n'}    },`,
    );
  }

  writeFileSync(join(root, 'bun.lock'), `  "workspaces": {\n${workspaceBlocks.join('\n')}\n  },\n`);
  return root;
}

void test('accepts independently versioned packages with compatible dependencies', () => {
  const root = makeFixture();
  try {
    assert.deepEqual(checkReleaseCoherence(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('reports an incompatible internal dependency range', () => {
  const root = makeFixture();
  try {
    const manifestPath = join(root, 'packages', 'bun', 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      dependencies: { '@unikit-bridge/types': string };
    };
    manifest.dependencies['@unikit-bridge/types'] = '^0.3.0';
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.match(checkReleaseCoherence(root).join('\n'), /@unikit-bridge\/bun.*@unikit-bridge\/types/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── wasm 백엔드 배제 (Task A3) ───────────────────────────────────────────────
//
// wasm 백엔드는 dev/experimental 전용이다 — 릴리스 아티팩트(npm tarball 의 files
// 경로)에 wasm 엔진 계열 경로가 포함되면 fail 해야 한다.

void test('rejects release files that ship the experimental wasm backend', () => {
  const root = makeFixture();
  try {
    const manifestPath = join(root, 'packages', 'react-native', 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { files: string[] };
    manifest.files = ['LICENSE', 'dist', 'native/wasm3/**/*', 'engines/engine_v1.wasm'];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const failures = checkReleaseCoherence(root);
    assert.match(
      failures.join('\n'),
      /@unikit-bridge\/react-native.*wasm/,
      'shipping wasm3 sources or .wasm engines in a published package must fail',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('wasm backend guard tolerates unrelated native paths and conventional files', () => {
  const root = makeFixture();
  try {
    for (const name of ['react-native', 'bun']) {
      const manifestPath = join(root, 'packages', name, 'package.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { files: string[] };
      // native/**/* 는 네이티브 어댑터(JSI/FFI) 정상 발행 경로다 — wasm 계열이 아니다.
      manifest.files = ['LICENSE', 'dist', 'native/**/*'];
      writeFileSync(manifestPath, JSON.stringify(manifest));
    }
    assert.deepEqual(checkReleaseCoherence(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── reactNativeRange 불변식 (2026-09-10 RN 마이너 발행 교훈) ────────────────────
//
// 어댑터 버전이 version PR 로 먼저 움직이고 reactNativeRange 가 뒤처지면,
// 코드젠의 어댑터 버전 게이트가 새 버전을 거부해 main CI 가 깨진다. 범위는
// 항상 워크스페이스 어댑터 버전을 포함해야 한다.

void test('reports a reactNativeRange that no longer contains the adapter version', () => {
  const root = makeFixture();
  try {
    const manifestPath = join(root, 'packages', 'react-native', 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version: string };
    manifest.version = '0.5.0';
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const failures = checkReleaseCoherence(root);
    assert.match(
      failures.join('\n'),
      /reactNativeRange=\^0\.4\.0 does not contain @unikit-bridge\/react-native 0\.5\.0/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('codegen host ranges must contain independently published host versions', () => {
  const root = makeFixture();
  try {
    const path = join(root, 'packages/cli/package.json');
    const cli = JSON.parse(readFileSync(path, 'utf8')) as {
      unikitTemplate: Record<string, string>;
    };
    Object.assign(cli.unikitTemplate, {
      nodeRange: '^0.9.0',
      bunRange: '^0.9.0',
      tauriRange: '^0.9.0',
    });
    writeFileSync(path, JSON.stringify(cli));
    const failures = checkReleaseCoherence(root).join('\n');
    for (const host of ['node', 'bun', 'tauri']) assert.match(failures, new RegExp(`${host}Range`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
