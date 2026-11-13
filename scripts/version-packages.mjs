#!/usr/bin/env node
/**
 * changesets version wrapper — after `changeset version`, sync
 * @unikit-bridge/rustra unikitTemplate.npmRange to the package version
 * and align bun.lock workspace metadata.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLISHED_PACKAGE_DIR } from './check-release-coherence.mjs';

/** caret minor range — on 0.x this is ^0.N.0 */
export function caretMinorRange(version) {
  const match = /^(\d+)\.(\d+)\.\d+/.exec(String(version).trim());
  if (!match) throw new Error(`not a released x.y.z version: ${version}`);
  const [, major, minor] = match;
  return `^${major}.${minor}.0`;
}

export function syncNpmRange(manifestPath, packageVersion) {
  const expected = caretMinorRange(packageVersion);
  const text = readFileSync(manifestPath, 'utf8');
  const pattern = /("npmRange"\s*:\s*")([^"]+)(")/;
  const match = pattern.exec(text);
  if (!match) throw new Error(`npmRange key not found in ${manifestPath}`);
  if (match[2] === expected) return false;
  writeFileSync(manifestPath, text.replace(pattern, `$1${expected}$3`));
  return true;
}

/** @deprecated consolidated layout — retained for tests importing the symbol. */
export function syncReactNativeRange(cliManifestPath, reactNativeVersion) {
  return syncNpmRange(cliManifestPath, reactNativeVersion);
}

/** @deprecated consolidated layout — retained for tests importing the symbol. */
export function syncHostRanges(cliManifestPath, versions) {
  const version = versions['react-native'] ?? versions.node ?? Object.values(versions)[0];
  return syncNpmRange(cliManifestPath, version);
}

export function syncLockWorkspaceMetadata(lockPath, manifests) {
  let text = readFileSync(lockPath, 'utf8');
  let changed = false;
  for (const [packageDir, manifest] of Object.entries(manifests)) {
    const blockPattern = new RegExp(
      `("${packageDir.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}"\\s*:\\s*\\{)([\\s\\S]*?)(\\n    \\},)`,
    );
    const blockMatch = blockPattern.exec(text);
    if (!blockMatch) continue;
    let block = blockMatch[2];
    const rewritten = block.replace(
      /("(?<depKey>@unikit-bridge\/[a-z-]+)"\s*:\s*")(?<depRange>[^"]+)(")|("version"\s*:\s*")(?<versionValue>[^"]+)(")/g,
      (whole, ...groups) => {
        const named = groups[groups.length - 1];
        if (named.depKey !== undefined) {
          const range = manifest.dependencies?.[named.depKey];
          return range !== undefined && range !== named.depRange
            ? `${groups[0]}${range}${groups[3]}`
            : whole;
        }
        return manifest.version !== undefined && manifest.version !== named.versionValue
          ? `${groups[4]}${manifest.version}${groups[6]}`
          : whole;
      },
    );
    if (rewritten !== block) {
      text = text.replace(blockMatch[0], `${blockMatch[1]}${rewritten}${blockMatch[3]}`);
      changed = true;
    }
  }
  if (changed) writeFileSync(lockPath, text);
  return changed;
}

function main() {
  const args = process.argv.slice(2);
  const root = join(import.meta.dirname, '..');
  execFileSync(
    process.platform === 'win32' ? 'bunx.cmd' : 'bunx',
    ['changeset', 'version', ...args],
    { stdio: 'inherit', cwd: root },
  );
  const manifestPath = join(root, 'packages', PUBLISHED_PACKAGE_DIR, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (syncNpmRange(manifestPath, manifest.version)) {
    console.log('[version] @unikit-bridge/rustra npmRange synced');
  }
  const manifests = {
    [`packages/${PUBLISHED_PACKAGE_DIR}`]: JSON.parse(readFileSync(manifestPath, 'utf8')),
  };
  if (syncLockWorkspaceMetadata(join(root, 'bun.lock'), manifests)) {
    console.log('[version] bun.lock workspace metadata synced to manifests');
  }
}

if (process.argv[1] === import.meta.filename || process.argv[1]?.endsWith('version-packages.mjs')) {
  main();
}
