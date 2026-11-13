import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { renderAndroidBuild, renderIosBuild } from './react-native-template-scripts.js';
import { renderReactNativePrepare } from './react-native-prepare.js';
import {
  renderAndroidModule,
  renderAndroidPackage,
  renderCmake,
  renderGradle,
} from './react-native-template-android.js';
import {
  renderModuleIndex,
  renderPackageJson,
  renderPodspec,
  renderReactNativeConfig,
} from './react-native-template-common.js';

export const GENERATED_REACT_NATIVE_PACKAGE = '@unikit-bridge/generated-react-native';
const NATIVE_FILES = [
  'android/unikit-jsi-jni.cpp',
  'cpp/UnikitJSIBridge.cpp',
  'cpp/UnikitJSIBridge.hpp',
  'cpp/unikit-codec.hpp',
  'ios/UnikitJSIModule.mm',
] as const;

export type ReactNativeScaffoldOptions = {
  appRoot: string;
  moduleDir: string;
  cppOutputPath: string;
  rustManifestPath: string;
  rustPackage: string;
  rustLibrary: string;
  adapterRange: string;
};

function portableRelative(from: string, to: string): string {
  const value = relative(from, to).split(sep).join('/');
  return value.length === 0 ? '.' : value;
}

function parseVersion(value: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function satisfiesAdapterRange(version: string, range: string): boolean {
  const candidate = parseVersion(version);
  const match = /^(\^|~|=)?(\d+)\.(\d+)(?:\.(\d+))?$/.exec(range.trim());
  if (!candidate || !match) return false;
  const base: [number, number, number] = [
    Number(match[2]),
    Number(match[3]),
    Number(match[4] ?? 0),
  ];
  const compare = (left: [number, number, number], right: [number, number, number]) =>
    left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
  if (match[1] === '^') {
    const upper: [number, number, number] =
      base[0] > 0 ? [base[0] + 1, 0, 0] : base[1] > 0 ? [0, base[1] + 1, 0] : [0, 0, base[2] + 1];
    return compare(candidate, base) >= 0 && compare(candidate, upper) < 0;
  }
  if (match[1] === '~')
    return compare(candidate, base) >= 0 && compare(candidate, [base[0], base[1] + 1, 0]) < 0;
  if (match[1] === '=') return compare(candidate, base) === 0;
  return match[4] === undefined
    ? candidate[0] === base[0] && candidate[1] === base[1]
    : compare(candidate, base) === 0;
}

export function findReactNativeAdapterNative(
  appRoot: string,
  adapterRange: string,
): string | undefined {
  let searchRoot = resolve(appRoot);
  const rejected: string[] = [];
  while (true) {
    const packageRoot = resolve(searchRoot, 'node_modules/@unikit-bridge/rustra');
    const candidate = resolve(packageRoot, 'native');
    if (NATIVE_FILES.every((file) => existsSync(resolve(candidate, file)))) {
      try {
        const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
          name?: string;
          version?: string;
        };
        if (
          manifest.name === '@unikit-bridge/rustra' &&
          manifest.version &&
          satisfiesAdapterRange(manifest.version, adapterRange)
        )
          return candidate;
        rejected.push(
          `${packageRoot} (version ${manifest.version ?? 'unknown'}, expected ${adapterRange})`,
        );
      } catch {
        rejected.push(
          `${packageRoot} (package.json is missing or invalid, expected ${adapterRange})`,
        );
      }
    }
    const parent = dirname(searchRoot);
    if (parent === searchRoot) break;
    searchRoot = parent;
  }
  if (rejected.length > 0)
    throw new Error(
      `Found a complete but incompatible @unikit-bridge/rustra package: ${rejected.join('; ')}. Install a version satisfying ${adapterRange} and regenerate.`,
    );
  return undefined;
}

function resolveReactNativeAdapterNative(appRoot: string, adapterRange: string): string {
  const installed = findReactNativeAdapterNative(appRoot, adapterRange);
  if (installed) return installed;
  // 미설치(경로 자체가 없음)는 조용히 기본 경로를 반환하지 않는다(감사 A11) —
  // 생성된 podspec/gradle 이 존재하지 않는 경로를 가리키면 첫 loud 실패는
  // pod install 시점으로 미뤄진다. codegen 시점에 설치 안내로 실패한다.
  const fallback = resolve(appRoot, 'node_modules/@unikit-bridge/rustra/native');
  throw new Error(
    `@unikit-bridge/rustra adapter not installed: ${fallback} was not found. ` +
      `Run "bun install" to install @unikit-bridge/rustra@${adapterRange} first, then regenerate.`,
  );
}

export function renderReactNativeModule(
  options: ReactNativeScaffoldOptions,
): Record<string, string> {
  const moduleRoot = resolve(options.moduleDir);
  // 파일에 박히는 경로는 앱 레이아웃 기준의 결정적 값이다 — 호이스트 위치를
  // 따라가면 동일 커밋이 환경마다 다른 바이트를 낸다. 따라서 검증에 통과한
  // 어댑터도 앱 로컬 node_modules 경로와 일치해야 한다(호이스트만으로는
  // pod/gradle 이 가리킬 앱 로컬 native 가 비거나 잘못된 버전일 수 있다).
  const installedNative = resolveReactNativeAdapterNative(options.appRoot, options.adapterRange);
  const adapterInstallRoot = resolve(options.appRoot, 'node_modules/@unikit-bridge/rustra/native');
  if (resolve(installedNative) !== resolve(adapterInstallRoot)) {
    throw new Error(
      `@unikit-bridge/rustra must be installed in the app's own node_modules ` +
        `(${adapterInstallRoot}). A hoisted workspace install alone is not enough — ` +
        `install @unikit-bridge/rustra@${options.adapterRange} in the app package (or disable hoist / use nohoist), then regenerate.`,
    );
  }
  const adapterFromIos = portableRelative(moduleRoot, adapterInstallRoot);
  const generatedFromIos = portableRelative(moduleRoot, options.cppOutputPath);
  const adapterFromAndroid = portableRelative(resolve(moduleRoot, 'android'), adapterInstallRoot);
  const generatedFromAndroid = portableRelative(
    resolve(moduleRoot, 'android'),
    options.cppOutputPath,
  );
  const manifestFromModule = portableRelative(moduleRoot, options.rustManifestPath);
  const values = {
    adapterFromIos,
    generatedFromIos,
    adapterFromAndroid,
    generatedFromAndroid,
    manifestFromModule,
    rustPackage: options.rustPackage,
    rustLibrary: options.rustLibrary,
  };
  return {
    'package.json': renderPackageJson(options.adapterRange),
    'react-native.config.js': renderReactNativeConfig(),
    'src/index.ts': renderModuleIndex(),
    'scripts/prepare-native.cjs': renderReactNativePrepare(
      portableRelative(resolve(moduleRoot, 'scripts'), options.appRoot),
    ),
    'UnikitBridge.podspec': renderPodspec(values),
    'ios/UnikitBridge.cpp':
      '#include "UnikitJSIBridge.cpp"\n#include "unikit-generated-codecs.cpp"\n',
    'ios/UnikitBridgeModule.mm': '#include "UnikitJSIModule.mm"\n',
    'ios/build-rust-ios.sh': renderIosBuild(values),
    'android/build.gradle': renderGradle(values),
    'android/CMakeLists.txt': renderCmake(),
    'android/build-rust-android.sh': renderAndroidBuild(values),
    'android/src/main/AndroidManifest.xml':
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android" />\n',
    'android/src/main/java/dev/unikit/bridge/UnikitBridgeModule.kt': renderAndroidModule(),
    'android/src/main/java/dev/unikit/bridge/UnikitBridgePackage.kt': renderAndroidPackage(),
  };
}
