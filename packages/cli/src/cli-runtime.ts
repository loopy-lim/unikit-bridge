import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export interface CliManifest {
  version: string;
  dependencies: { '@unikit/types': string };
  unikitTemplate: {
    cargoRange: string;
    reactNativeRange: string;
    nodeRange: string;
    bunRange: string;
    tauriRange: string;
  };
}

export const cliManifest = createRequire(import.meta.url)('../package.json') as CliManifest;
export const cliVersion = cliManifest.version;
export const hostDependencyRanges: Record<string, string> = {
  '@unikit/types': cliManifest.dependencies['@unikit/types'],
  '@unikit/node': cliManifest.unikitTemplate.nodeRange,
  '@unikit/bun': cliManifest.unikitTemplate.bunRange,
  '@unikit/tauri': cliManifest.unikitTemplate.tauriRange,
};
export const CLI_COMMANDS = [
  'generate',
  'codegen',
  'init',
  'setup',
  'diff',
  'doctor',
  'inspect',
  'dev',
] as const;

export function isCliEntry(): boolean {
  if (!process.argv[1]) return false;
  try {
    const entry = realpathSync(resolve(process.argv[1]));
    const candidates = ['./index.js', './index.ts'].map((path) =>
      fileURLToPath(new URL(path, import.meta.url)),
    );
    return candidates.some((path) => {
      try {
        return realpathSync(path) === entry;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}
