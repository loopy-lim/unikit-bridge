import { join } from 'node:path';

/** Published CLI entry after installing `@unikit-bridge/rustra` into `root`. */
export function resolvePublishedCli(root) {
  return join(root, 'node_modules', '@unikit-bridge', 'rustra', 'dist', 'cli', 'index.js');
}

/** Schema v2 host pin — single package covering all adapters + CLI. */
export function resolveRustraHostVersion(versions) {
  const version = versions.hosts?.['@unikit-bridge/rustra'] ?? versions.npm?.['@unikit-bridge/rustra'];
  if (!version) {
    throw new Error(
      'versions.json hosts["@unikit-bridge/rustra"] (or npm["@unikit-bridge/rustra"]) exact pin is required',
    );
  }
  return version;
}
