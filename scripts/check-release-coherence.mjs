import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLISHED_PACKAGE_DIR = 'rustra';

function readJson(root, relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8'));
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareVersions(left, right) {
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

function upperBoundForCaret(base) {
  if (base[0] > 0) return [base[0] + 1, 0, 0];
  if (base[1] > 0) return [0, base[1] + 1, 0];
  return [0, 0, base[2] + 1];
}

function rangeContainsVersion(range, version) {
  const parsedVersion = parseVersion(version);
  if (!parsedVersion) return false;
  const normalized = String(range).trim();
  if (!normalized || normalized === '*' || normalized === 'latest') return true;

  const comparatorParts = normalized.split(/\s+/).filter(Boolean);
  return comparatorParts.every((part) => {
    const match = /^(\^|~|>=|<=|>|<|=)?(\d+(?:\.\d+)?(?:\.\d+)?)$/.exec(part);
    if (!match) return false;
    const prefix = match[1] ?? '';
    const numbers = match[2].split('.').map(Number);
    const base = [numbers[0], numbers[1] ?? 0, numbers[2] ?? 0];
    if (prefix === '^') {
      return (
        compareVersions(parsedVersion, base) >= 0 &&
        compareVersions(parsedVersion, upperBoundForCaret(base)) < 0
      );
    }
    if (prefix === '~') {
      return (
        compareVersions(parsedVersion, base) >= 0 &&
        compareVersions(parsedVersion, [base[0], base[1] + 1, 0]) < 0
      );
    }
    if (prefix === '>=') return compareVersions(parsedVersion, base) >= 0;
    if (prefix === '<=') return compareVersions(parsedVersion, base) <= 0;
    if (prefix === '>') return compareVersions(parsedVersion, base) > 0;
    if (prefix === '<') return compareVersions(parsedVersion, base) < 0;
    if (prefix === '=') return compareVersions(parsedVersion, base) === 0;
    if (numbers.length === 1) return parsedVersion[0] === base[0];
    if (numbers.length === 2) return parsedVersion[0] === base[0] && parsedVersion[1] === base[1];
    return compareVersions(parsedVersion, base) === 0;
  });
}

function workspaceVersion(cargo) {
  const workspace = cargo.match(/\[workspace\.package\][\s\S]*?^version = "([^"]+)"/m)?.[1];
  if (!workspace) throw new Error('workspace.package.version not found');
  return workspace;
}

function isWasmBackendPath(publishPath) {
  return String(publishPath)
    .split('/')
    .some(
      (segment) =>
        segment === 'wasm3' ||
        segment === 'wasm-backend' ||
        segment.startsWith('wasm32') ||
        segment.endsWith('.wasm'),
    );
}

function wasmBackendFailures(packageName, files) {
  const leaked = (files ?? []).filter(isWasmBackendPath);
  return leaked.length > 0
    ? [
        `${packageName} release files include the experimental wasm backend (dev-only, not shipped): ${leaked.join(', ')}`,
      ]
    : [];
}

function lockWorkspaceBlock(lock, packageName) {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return lock.match(new RegExp(`"${escaped}"\\s*:\\s*\\{([\\s\\S]*?)\\n    \\},`))?.[1] ?? null;
}

function lockField(block, field) {
  return block?.match(new RegExp(`"${field}"\\s*:\\s*"([^"]+)"`))?.[1];
}

/**
 * Check release metadata for the consolidated @unikit-bridge/rustra package.
 */
export function checkReleaseCoherence(root = process.cwd()) {
  const cargo = readFileSync(join(root, 'Cargo.toml'), 'utf8');
  const cargoVersion = workspaceVersion(cargo);
  const packagePath = `packages/${PUBLISHED_PACKAGE_DIR}`;
  const manifest = readJson(root, `${packagePath}/package.json`);
  const changesets = readJson(root, '.changeset/config.json');
  const lock = readFileSync(join(root, 'bun.lock'), 'utf8');
  const rootLicense = readFileSync(join(root, 'LICENSE'), 'utf8');
  const failures = [];

  const legacyFixedGroup = changesets.fixed?.find(
    (group) =>
      Array.isArray(group) &&
      group.some((name) => typeof name === 'string' && name.startsWith('@unikit-bridge/')) &&
      !group.every((name) => name === '@unikit-bridge/rustra'),
  );
  if (legacyFixedGroup) {
    failures.push(
      'Changesets fixed groups must not reference legacy multi-package @unikit-bridge/* names',
    );
  }

  const cargoRange = manifest.unikitTemplate?.cargoRange;
  if (typeof cargoRange !== 'string' || !rangeContainsVersion(cargoRange, cargoVersion)) {
    failures.push(
      `@unikit-bridge/rustra unikitTemplate.cargoRange=${cargoRange} does not contain Rust ${cargoVersion}`,
    );
  }

  const npmRange = manifest.unikitTemplate?.npmRange;
  const npmVersion = manifest.version;
  if (typeof npmRange !== 'string' || !rangeContainsVersion(npmRange, npmVersion)) {
    failures.push(
      `@unikit-bridge/rustra unikitTemplate.npmRange=${npmRange} does not contain ${npmVersion}`,
    );
  }

  for (const hostKey of ['nodeRange', 'bunRange', 'tauriRange', 'reactNativeRange']) {
    if (manifest.unikitTemplate?.[hostKey] !== undefined) {
      failures.push(
        `@unikit-bridge/rustra unikitTemplate must not include legacy field ${hostKey} (use npmRange only)`,
      );
    }
  }

  if (!parseVersion(manifest.version ?? '')) {
    failures.push(`${manifest.name} has invalid version=${manifest.version}`);
  }
  if (!manifest.files?.includes('LICENSE')) {
    failures.push(`${manifest.name} package files omit LICENSE`);
  }
  failures.push(...wasmBackendFailures(manifest.name, manifest.files));
  try {
    const packageLicense = readFileSync(join(root, `${packagePath}/LICENSE`), 'utf8');
    if (packageLicense !== rootLicense) failures.push(`${manifest.name} LICENSE differs from root LICENSE`);
  } catch {
    failures.push(`${manifest.name} LICENSE is missing`);
  }

  const block = lockWorkspaceBlock(lock, packagePath);
  if (!block) {
    failures.push(`${manifest.name} is missing from bun.lock workspaces`);
  } else if (lockField(block, 'version') !== manifest.version) {
    failures.push(
      `${manifest.name} lock version=${lockField(block, 'version')} but manifest=${manifest.version}`,
    );
  }

  return failures;
}

function run() {
  const failures = checkReleaseCoherence();
  if (failures.length > 0) {
    console.error('release coherence failed:\n- ' + failures.join('\n- '));
    console.error(
      'Fix: version bumps flow through a version PR ("bun run version"); see docs/release-procedure.md and docs/versioning-policy.md.',
    );
    process.exitCode = 1;
    return;
  }
  const npmVersion = readJson(process.cwd(), `packages/${PUBLISHED_PACKAGE_DIR}/package.json`).version;
  console.log(
    `release coherence ok: @unikit-bridge/rustra ${npmVersion}, Rust ${workspaceVersion(readFileSync(resolve('Cargo.toml'), 'utf8'))}`,
  );
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) run();
