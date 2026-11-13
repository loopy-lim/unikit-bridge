#!/usr/bin/env node
// 모노레포 예제 전용: bun의 file: 의존성은 소스를 캐시 스냅샷으로 '복사'한다.
// node_modules/@unikit-bridge/rustra 가 설치 시점 고정이 되면 어댑터
// 수정이 재설치 전까지 예제 네이티브 빌드에 반영되지 않는다.
import { existsSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const exampleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packages = {
  '@unikit-bridge/rustra': 'packages/rustra',
};

for (const [name, relative] of Object.entries(packages)) {
  const link = resolve(exampleRoot, 'node_modules', name);
  const target = resolve(exampleRoot, '..', '..', relative);
  if (!existsSync(resolve(exampleRoot, 'node_modules'))) continue;
  let linkedTo = null;
  try {
    linkedTo = resolve(dirname(link), readlinkSync(link));
  } catch {
    linkedTo = null;
  }
  if (linkedTo === target) continue;
  rmSync(link, { recursive: true, force: true });
  symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
}
