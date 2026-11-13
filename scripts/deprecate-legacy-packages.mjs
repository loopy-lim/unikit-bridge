#!/usr/bin/env node
/**
 * Deprecation helper for superseded npm packages and legacy rustra crates.
 * Dry-run by default; pass --apply to execute npm deprecate / cargo yank.
 *
 * Reliability notes:
 * - npm view failures that are not clear 404s fail closed (especially with --apply).
 * - cargo yank is not transactional; we preflight crates.io versions before any yank.
 */

import { execFileSync } from 'node:child_process';

export const SUPERSEDED_NPM = [
  { name: '@unikit-bridge/types', hint: '@unikit-bridge/rustra/types' },
  { name: '@unikit-bridge/node', hint: '@unikit-bridge/rustra/node' },
  { name: '@unikit-bridge/bun', hint: '@unikit-bridge/rustra/bun' },
  { name: '@unikit-bridge/tauri', hint: '@unikit-bridge/rustra/tauri' },
  { name: '@unikit-bridge/react-native', hint: '@unikit-bridge/rustra/react-native' },
  { name: '@unikit-bridge/react', hint: '@unikit-bridge/rustra/react' },
  { name: '@unikit-bridge/testing', hint: '@unikit-bridge/rustra/testing' },
  { name: '@unikit-bridge/devtools', hint: '@unikit-bridge/rustra/devtools' },
  { name: '@unikit-bridge/cli', hint: '@unikit-bridge/rustra (bin: unikit)' },
];

export const LEGACY_RUSTRA_NPM = [
  { name: 'rustra', hint: '@unikit-bridge/rustra' },
  { name: '@rustra/types', hint: '@unikit-bridge/rustra/types' },
  { name: '@rustra/node', hint: '@unikit-bridge/rustra/node' },
  { name: '@rustra/bun', hint: '@unikit-bridge/rustra/bun' },
  { name: '@rustra/tauri', hint: '@unikit-bridge/rustra/tauri' },
  { name: '@rustra/react-native', hint: '@unikit-bridge/rustra/react-native' },
  { name: '@rustra/react', hint: '@unikit-bridge/rustra/react' },
  { name: '@rustra/testing', hint: '@unikit-bridge/rustra/testing' },
  { name: '@rustra/devtools', hint: '@unikit-bridge/rustra/devtools' },
  { name: '@rustra/cli', hint: '@unikit-bridge/rustra (bin: unikit)' },
];

export const LEGACY_CRATES = [
  { name: 'unikit-bridge-naming', successor: 'unikit-bridge' },
  { name: 'rustra', successor: 'unikit-bridge' },
  { name: 'rustra-macros', successor: 'unikit-bridge-macros' },
  { name: 'rustra-naming', successor: 'unikit-bridge' },
];

function deprecationMessage(hint) {
  return `Package consolidated into ${hint}. See https://github.com/loopy-lim/unikit-bridge/blob/main/docs/migrations/package-consolidation.md`;
}

export function planNpmDeprecations(packages) {
  return packages.map(({ name, hint }) => ({
    name,
    message: deprecationMessage(hint),
    command: ['npm', 'deprecate', name, deprecationMessage(hint)],
  }));
}

export function planCrateYanks(crateVersion) {
  return LEGACY_CRATES.map(({ name, successor }) => ({
    name,
    version: crateVersion,
    successor,
    command: ['cargo', 'yank', '--version', crateVersion, name],
    instruction: `cargo yank --version ${crateVersion} ${name}  # use ${successor} instead`,
  }));
}

function stderrText(error) {
  if (!error || typeof error !== 'object') return String(error ?? '');
  const stderr = 'stderr' in error ? error.stderr : null;
  if (Buffer.isBuffer(stderr)) return stderr.toString('utf8');
  if (typeof stderr === 'string') return stderr;
  return error instanceof Error ? error.message : String(error);
}

/** @returns {'exists' | 'missing' | 'unknown'} */
export function npmPackageLookup(name, { exec = execFileSync } = {}) {
  try {
    exec('npm', ['view', name, 'version', '--json'], { stdio: 'pipe' });
    return 'exists';
  } catch (error) {
    const text = stderrText(error);
    // npm prints E404 / "404 Not Found" / "code E404" for unpublished names.
    if (/\bE404\b|404[\s-]*Not Found|is not in this registry/i.test(text)) return 'missing';
    return 'unknown';
  }
}

/** @returns {'exists' | 'missing' | 'unknown'} */
export function cratesIoVersionLookup(name, version, { fetchImpl = fetch } = {}) {
  // crates.io API: 200 = published version, 404 = absent, other = treat unknown.
  return fetchImpl(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}/${encodeURIComponent(version)}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'unikit-bridge-deprecate-legacy-packages' },
  })
    .then(async (response) => {
      if (response.status === 200) return 'exists';
      if (response.status === 404) return 'missing';
      return 'unknown';
    })
    .catch(() => 'unknown');
}

export async function runDeprecation({
  apply = false,
  crates = false,
  crateVersion = null,
  exec = execFileSync,
  npmLookup = npmPackageLookup,
  crateLookup = cratesIoVersionLookup,
} = {}) {
  const actions = [];
  const allNpm = [...SUPERSEDED_NPM, ...LEGACY_RUSTRA_NPM];
  const planned = planNpmDeprecations(allNpm);
  const preflight = planned.map((entry) => ({
    entry,
    status: npmLookup(entry.name, { exec }),
  }));
  const queryFailures = preflight
    .filter((item) => item.status === 'unknown')
    .map((item) => item.entry.name);

  for (const { entry, status } of preflight) {
    if (status === 'unknown') {
      actions.push(`[error] ${entry.name} registry lookup failed (not a clean 404)`);
      continue;
    }
    if (status === 'missing') {
      actions.push(`[skip] ${entry.name} not on registry (404 OK)`);
      continue;
    }
    actions.push(apply ? `[apply] ${entry.command.join(' ')}` : `[dry-run] ${entry.command.join(' ')}`);
  }

  if (queryFailures.length > 0) {
    const message = `npm registry lookup failed for: ${queryFailures.join(', ')}. Refusing to treat as unpublished.`;
    if (apply) throw new Error(message);
    actions.push(`[error] ${message}`);
  } else if (apply) {
    // Apply only after every lookup succeeded or cleanly 404'd — avoids partial
    // deprecates when a later package lookup is unknown.
    for (const { entry, status } of preflight) {
      if (status !== 'exists') continue;
      exec(entry.command[0], entry.command.slice(1), { stdio: 'inherit' });
    }
  }

  if (crates) {
    if (!crateVersion) throw new Error('--crates requires --crate-version <ver>');
    const yanks = planCrateYanks(crateVersion);
    const preflight = [];
    for (const yank of yanks) {
      const status = await crateLookup(yank.name, yank.version);
      preflight.push({ yank, status });
      if (status === 'unknown') {
        actions.push(`[error] crates.io lookup failed for ${yank.name}@${yank.version}`);
      } else if (status === 'missing') {
        actions.push(`[skip] ${yank.name}@${yank.version} not on crates.io`);
      } else {
        actions.push(apply ? `[apply] ${yank.command.join(' ')}` : `[dry-run] ${yank.instruction}`);
      }
    }

    const unknown = preflight.filter((item) => item.status === 'unknown');
    if (unknown.length > 0) {
      throw new Error(
        `crates.io lookup failed for: ${unknown.map((item) => `${item.yank.name}@${item.yank.version}`).join(', ')}. Refusing partial yank.`,
      );
    }

    const toYank = preflight.filter((item) => item.status === 'exists').map((item) => item.yank);
    if (apply) {
      // cargo yank is not transactional across crates — preflight above avoids
      // starting the loop when any target version is unknown.
      for (const yank of toYank) {
        exec(yank.command[0], yank.command.slice(1), { stdio: 'inherit' });
      }
    }
  } else {
    for (const yank of planCrateYanks('<version>')) {
      actions.push(`[guidance] ${yank.instruction}`);
    }
  }

  return actions;
}

function parseArgs(argv) {
  const crateIdx = argv.indexOf('--crate-version');
  return {
    apply: argv.includes('--apply'),
    crates: argv.includes('--crates'),
    crateVersion: crateIdx >= 0 ? (argv[crateIdx + 1] ?? null) : null,
  };
}

if (process.argv[1]?.endsWith('deprecate-legacy-packages.mjs')) {
  const options = parseArgs(process.argv.slice(2));
  try {
    const actions = await runDeprecation(options);
    for (const line of actions) console.log(line);
    if (actions.some((line) => line.startsWith('[error]'))) process.exitCode = 1;
    if (!options.apply) {
      console.log('\nDry-run only. Pass --apply to execute npm deprecate.');
      if (options.crates) {
        console.log(
          'With --crates --crate-version <ver> --apply, runs cargo yank after crates.io preflight (not transactional across crates).',
        );
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
