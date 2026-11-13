import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'bun:test';

import { checkArchitectureBoundaries } from './architecture-boundaries.mjs';

const repositoryRoot = join(import.meta.dir, '..');

const namingImpl = `pub fn snake_to_lower_camel(name: &str) -> String {
    let mut output = String::new();
    let mut uppercase_next = false;
    for character in name.chars() {
        if matches!(character, '_' | '-' | '.') {
            uppercase_next = true;
            continue;
        }
        if output.is_empty() {
            output.push(character.to_ascii_lowercase());
            uppercase_next = false;
        } else if uppercase_next {
            output.push(character.to_ascii_uppercase());
            uppercase_next = false;
        } else {
            output.push(character);
        }
    }
    output
}
`;

test('the repository satisfies the architecture boundaries', () => {
  const report = checkArchitectureBoundaries({ root: repositoryRoot });

  assert.deepEqual(report.errors, []);
  assert.ok(
    (report.moduleSizes.find((module) => module.path === 'crates/unikit-bridge/src/lib.rs')
      ?.lines ?? Infinity) <= 200,
  );
});

test('the checker reports boundary violations with stable rule ids', () => {
  const root = mkdtempSync(join(tmpdir(), 'unikit-architecture-'));

  try {
    mkdirSync(join(root, 'crates/unikit-bridge/src'), { recursive: true });
    mkdirSync(join(root, 'crates/unikit-bridge-macros/src'), { recursive: true });
    mkdirSync(join(root, 'packages/rustra/src/types'), { recursive: true });
    mkdirSync(join(root, 'packages/rustra/src/node'), { recursive: true });
    mkdirSync(join(root, 'packages/rustra/src/bun'), { recursive: true });
    mkdirSync(join(root, 'packages/rustra/src/tauri'), { recursive: true });
    mkdirSync(join(root, 'packages/rustra/src/cli'), { recursive: true });

    writeFileSync(join(root, 'crates/unikit-bridge/src/lib.rs'), `${'// large\n'.repeat(1_301)}\n`);
    writeFileSync(join(root, 'crates/unikit-bridge/src/naming.rs'), namingImpl);
    writeFileSync(
      join(root, 'crates/unikit-bridge-macros/src/naming.rs'),
      namingImpl.replace('pub fn', 'pub(crate) fn'),
    );
    writeFileSync(
      join(root, 'packages/rustra/src/types/index.ts'),
      `${'// large\n'.repeat(601)}\n`,
    );
    writeFileSync(
      join(root, 'packages/rustra/src/node/index.ts'),
      "import { createJsonEngine } from '../types/index.js';\nexport { createJsonEngine };\n",
    );
    writeFileSync(
      join(root, 'packages/rustra/src/bun/index.ts'),
      "import { createJsonEngine } from '../types/index.js';\nexport { createJsonEngine };\n",
    );
    writeFileSync(
      join(root, 'packages/rustra/src/tauri/index.ts'),
      "import { createJsonEngine } from '../types/index.js';\nexport { createJsonEngine };\n",
    );
    writeFileSync(join(root, 'packages/rustra/src/cli/index.ts'), 'setTimeout(() => {}, 100);\n');

    const report = checkArchitectureBoundaries({ root }) as {
      errors: Array<{ rule: string }>;
    };
    const ruleIds = report.errors.map((error) => error.rule);

    assert.ok(ruleIds.includes('unikit-lib-size'));
    assert.ok(ruleIds.includes('types-index-size'));
    assert.ok(ruleIds.includes('watcher-boundary'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the checker exposes oversized implementation modules as actionable warnings', () => {
  const root = mkdtempSync(join(tmpdir(), 'unikit-architecture-size-'));

  try {
    mkdirSync(join(root, 'packages/rustra/src/example'), { recursive: true });
    mkdirSync(join(root, 'crates/unikit-bridge/src'), { recursive: true });
    mkdirSync(join(root, 'crates/unikit-bridge-macros/src'), { recursive: true });
    writeFileSync(join(root, 'crates/unikit-bridge/src/naming.rs'), namingImpl);
    writeFileSync(
      join(root, 'crates/unikit-bridge-macros/src/naming.rs'),
      namingImpl.replace('pub fn', 'pub(crate) fn'),
    );
    writeFileSync(
      join(root, 'packages/rustra/src/example/large.ts'),
      `${'// large\n'.repeat(201)}\n`,
    );

    const report = checkArchitectureBoundaries({ root });
    assert.deepEqual(report.errors, []);
    assert.ok(report.warnings.some((warning) => warning.rule === 'source-module-size'));
    assert.equal(report.moduleSizes[0]?.path, 'packages/rustra/src/example/large.ts');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the checker rejects implementation modules above the hard 400-line ceiling', () => {
  const root = mkdtempSync(join(tmpdir(), 'unikit-architecture-hard-size-'));

  try {
    mkdirSync(join(root, 'crates/unikit-bridge/src'), { recursive: true });
    mkdirSync(join(root, 'crates/unikit-bridge-macros/src'), { recursive: true });
    mkdirSync(join(root, 'packages/rustra/src/example'), { recursive: true });
    writeFileSync(join(root, 'crates/unikit-bridge/src/naming.rs'), namingImpl);
    writeFileSync(
      join(root, 'crates/unikit-bridge-macros/src/naming.rs'),
      namingImpl.replace('pub fn', 'pub(crate) fn'),
    );
    writeFileSync(
      join(root, 'packages/rustra/src/example/large.ts'),
      `${'// large\n'.repeat(401)}\n`,
    );

    const report = checkArchitectureBoundaries({ root });
    assert.ok(report.errors.some((error) => error.rule === 'source-module-size'));
    assert.equal(
      report.errors.find((error) => error.rule === 'source-module-size')?.path,
      'packages/rustra/src/example/large.ts',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
