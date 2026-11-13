import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RULES = {
  unikitLibSize: 'unikit-lib-size',
  typesIndexSize: 'types-index-size',
  cliIndexSize: 'cli-index-size',
  sharedRustNaming: 'shared-rust-naming',
  sharedJsonEngine: 'shared-json-engine',
  watcherBoundary: 'watcher-boundary',
  rnRuntimeDuplication: 'rn-runtime-duplication',
  sourceModuleSize: 'source-module-size',
};

const FACADE_LIMITS = {
  'crates/unikit-bridge/src/lib.rs': 200,
  'packages/rustra/src/types/index.ts': 200,
  'packages/rustra/src/cli/index.ts': 200,
};

const NAMING_PATHS = [
  'crates/unikit-bridge/src/naming.rs',
  'crates/unikit-bridge-macros/src/naming.rs',
];

const RECOMMENDED_MODULE_LINES = 200;
const HARD_MODULE_LINES = 400;

function readIfPresent(root, path) {
  const absolutePath = join(root, path);
  if (!existsSync(absolutePath)) return null;
  return readFileSync(absolutePath, 'utf8');
}

function readDirectorySources(root, directory) {
  const absoluteDirectory = join(root, directory);
  if (!existsSync(absoluteDirectory)) return '';
  return readdirSync(absoluteDirectory)
    .filter((entry) => entry.endsWith('.ts'))
    .map((entry) => readIfPresent(root, `${directory}/${entry}`) ?? '')
    .join('\n');
}

function lineCount(source) {
  return source.split(/\r?\n/).length;
}

function collectFiles(roots, include) {
  const files = [];
  const visit = (directory) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      const stats = statSync(path);
      if (stats.isDirectory()) visit(path);
      else if (include(entry, path)) files.push(path);
    }
  };

  for (const root of roots) visit(root);
  return files;
}

function rustSourceFiles(root) {
  return collectFiles([join(root, 'crates')], (entry) => entry.endsWith('.rs'));
}

function productionSourceFiles(root) {
  return collectFiles(
    [join(root, 'packages'), join(root, 'crates')],
    (entry, path) =>
      (entry.endsWith('.ts') || entry.endsWith('.rs')) &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('_tests.rs') &&
      !path.includes('/tests/'),
  );
}

function snakeToLowerCamelImpl(source) {
  const match = source.match(/fn\s+snake_to_lower_camel[\s\S]*?\{([\s\S]*?)\n\}/);
  return match?.[1]?.trim() ?? null;
}

function error(rule, path, message) {
  return { rule, path, message };
}

export function checkArchitectureBoundaries({ root }) {
  const errors = [];
  const warnings = [];

  for (const [path, limit] of Object.entries(FACADE_LIMITS)) {
    const source = readIfPresent(root, path);
    if (!source) continue;
    const lines = lineCount(source);
    if (lines > limit) {
      const rule = path === 'crates/unikit-bridge/src/lib.rs'
        ? RULES.unikitLibSize
        : path === 'packages/rustra/src/types/index.ts'
          ? RULES.typesIndexSize
          : RULES.cliIndexSize;
      errors.push(error(rule, path, `${lines} lines exceeds the ${limit}-line facade budget`));
    }
  }

  const moduleSizes = productionSourceFiles(root)
    .map((path) => ({ path: relative(root, path), lines: lineCount(readFileSync(path, 'utf8')) }))
    .sort((left, right) => right.lines - left.lines);
  for (const module of moduleSizes) {
    if (module.lines <= RECOMMENDED_MODULE_LINES || Object.hasOwn(FACADE_LIMITS, module.path)) continue;
    const violation = error(
      RULES.sourceModuleSize,
      module.path,
      `${module.lines} lines exceeds the recommended ${RECOMMENDED_MODULE_LINES}-line module budget`,
    );
    if (module.lines > HARD_MODULE_LINES) {
      violation.message += ` and the hard ${HARD_MODULE_LINES}-line ceiling; split by responsibility`;
      errors.push(violation);
    } else {
      violation.message += `; up to ${HARD_MODULE_LINES} lines is allowed when the responsibility remains cohesive`;
      warnings.push(violation);
    }
  }

  const namingBodies = NAMING_PATHS.map((path) => {
    const source = readIfPresent(root, path);
    return source ? { path, body: snakeToLowerCamelImpl(source) } : { path, body: null };
  });
  if (namingBodies.some(({ body }) => !body)) {
    errors.push(
      error(
        RULES.sharedRustNaming,
        NAMING_PATHS.join(', '),
        'expected snake_to_lower_camel in both unikit-bridge and unikit-bridge-macros naming.rs',
      ),
    );
  } else {
    const [left, right] = namingBodies;
    if (left.body !== right.body) {
      errors.push(
        error(
          RULES.sharedRustNaming,
          NAMING_PATHS.join(', '),
          'snake_to_lower_camel implementations drifted between bridge and macros copies',
        ),
      );
    }
  }

  for (const adapter of ['node', 'bun', 'tauri']) {
    const path = `packages/rustra/src/${adapter}/index.ts`;
    const source = readDirectorySources(root, `packages/rustra/src/${adapter}`);
    if (!source) continue;
    if (
      !/\bcreateJsonEngine\b/.test(source) ||
      !/from\s+['"]\.\.\/types/.test(source)
    ) {
      errors.push(
        error(
          RULES.sharedJsonEngine,
          path,
          'adapter must use createJsonEngine from relative ../types',
        ),
      );
    }
  }

  const cliIndex = readIfPresent(root, 'packages/rustra/src/cli/index.ts');
  if (cliIndex && /\b(?:setTimeout|setInterval|watch)\s*\(/.test(cliIndex)) {
    errors.push(
      error(
        RULES.watcherBoundary,
        'packages/rustra/src/cli/index.ts',
        'watcher timers and filesystem subscriptions belong in packages/rustra/src/cli/watch.ts',
      ),
    );
  }

  const rnIndex = readIfPresent(root, 'packages/rustra/src/react-native/index.ts');
  const rnUtf8 = readIfPresent(root, 'packages/rustra/src/react-native/utf8.ts');
  if (
    rnUtf8 ||
    (rnIndex &&
      /\braceAbortShallow\b|\b(?:function|const|let)\s+(?:encodeUtf8|decodeUtf8|exactArrayBuffer)\b/.test(
        rnIndex,
      ))
  ) {
    errors.push(
      error(
        RULES.rnRuntimeDuplication,
        'packages/rustra/src/react-native',
        'React Native must consume the shared types runtime helpers',
      ),
    );
  }

  return { errors, warnings, moduleSizes };
}

if (process.argv[1] && process.argv[1].endsWith('architecture-boundaries.mjs')) {
  const report = checkArchitectureBoundaries({ root: process.cwd() });
  if (report.errors.length > 0) {
    for (const violation of report.errors) {
      console.error(`[${violation.rule}] ${violation.path}: ${violation.message}`);
    }
    process.exitCode = 1;
  } else {
    console.log('Architecture boundaries: OK');
    for (const warning of report.warnings) {
      console.warn(`[${warning.rule}] ${warning.path}: ${warning.message}`);
    }
  }
}
