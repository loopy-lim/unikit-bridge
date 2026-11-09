#!/usr/bin/env node

// React Native/iOS 시뮬레이터 레지스트리 소비 여정 — 로드맵 A1/A2/A3(RN/iOS).
//
// 공개 레지스트리만으로 (1) RN 앱을 만들고(커뮤니티 CLI 템플릿 — Expo 미사용,
// 기존 rn-ios CI 잡의 Expo prebuild 와 다르다) (2) 발행 CLI·어댑터를 정확 핀
// 설치해 (3) 코드젠이 unikit-bridge 네이티브 모듈(podspec 포함)을 렌더링하게
// 하고 (4) `pod install` 의 prepare_command 가 Rust staticlib(aarch64-apple-ios-sim
// + x86_64-apple-ios lipo)을 빌드하며 (5) `xcodebuild -sdk iphonesimulator
// CODE_SIGNING_ALLOWED=NO` 로 .app 을 만들어 (6) 시뮬레이터에서 실행, JS 관측을
// stdout 마커로 회수한다.
//
// BLOCKED(로컬 실행 한계): 이 여정은 macOS + Xcode(xcodebuild/xcrun) +
// CocoaPods + iOS 시뮬레이터 런타임이 있어야만 실행된다. Linux/Windows 환경
// (이 저장소의 일상적 로컬)에서는 preflight 단계가 "BLOCKED" 메시지와 함께
// loud-fail 하고 영수증에 그대로 기록한다 — macOS 수동 실행 절차는
// docs/registry-onboarding.md 의 RN/iOS 여정 섹션을 본다.
//
// 마커 채널 — logcat 이 아니라 stdout 캡처: RN 0.81 의 console.log 는
// RCTDefaultLogFunction 을 거쳐 os_log 로만 나간다(React/Base/RCTLog.mm,
// scripts/ci-ios-runtime-smoke.sh 주석과 동일 결론 — stdout/stderr 에는 못
// 나온다). 그래서 JS 관측은 unikit 브릿지 자체의 reportEvidence 커맨드로
// Rust println! 까지 되돌려 보내고, `simctl launch --stdout=<sim 경로>` 가
// 그 줄을 캡처 파일에 남긴다. 캡처 경로는 시뮬레이터 안에서 해석되므로
// SIMULATOR_SHARED_RESOURCES_DIRECTORY 호스트 매핑(ci-ios-runtime-smoke.sh
// 기법)으로 읽는다. 여정은 이 파일을 폴링해 증거를 회수한다.
//
// 이벤트(a3Events) — 첫 실측, 정직 기록: Android 다리와 달리 이 앱은 이벤트
// 구독/발행을 **시도한다**. iOS 푸시 경로의 첫 실측이며, 발행 어댑터에
// Android 에서 발견한 것과 같은 JS-스레드 교착 결함이 있으면 최종 보고가
// 도착하지 않는다. 그 경우 여정은 조용히 넘기지 않고: (a) 이미 도착한
// commands 브레드크럼으로 a2(첫 호출·도메인 에러) 증거를 확정 검증하고,
// (b) rn-ios-event-push-freeze-suspected finding 을 영수증에 남기며,
// (c) 실패로 종료한다(loud-fail). 성공하면 3/3-전달·해지 후 0-전달을
// a3Events 로 기록한다. 어느 쪽이든 은폐 없다.
//
// 증명 범위: 공개 패키지만 쓴 설치·생성·네이티브 빌드·시뮬레이터 실행(실기기
// 아님 — 영수증 evidenceLevel 참조), 도메인 에러 전파, 이벤트 시도, 계약 필드
// 변경 후 재생성·재빌드·재실행. G1 전체(Tauri·기존 앱·평가자)나 G2 를 닫지
// 않는다.

import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { release as osRelease, tmpdir, version as osVersion } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertCargoProvenance,
  assertExactNpmProvenance,
  assertNoConsumerContamination,
  hashFiles,
  readJson,
  validateVersionManifest,
  writeJson,
} from './registry-consumer/provenance.mjs';
import { pinCargoVersions } from './registry-consumer/fixture.mjs';
import { errorDetails, runOrderedSteps, sanitizeStepName } from './registry-consumer/runner.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const VERSIONS_PATH = fileURLToPath(new URL('./registry-consumer/versions.json', import.meta.url));
const APP_NAME = 'RegistryRnConsumer';
const APP_PACKAGE = 'dev.unikit.registryrn';
const ERROR_SENTINEL = 'registry rn-ios journey error propagation';
const ECHO_MESSAGE = 'registry-rn-ios';
const JOURNEY_MARKER = '__UNIKIT_RN_IOS_JOURNEY__';
const EVIDENCE_WAIT_MS = 180_000;
const RN_TEMPLATE_VERSION = '0.81.5';
const COMMUNITY_CLI_VERSION = '20.2.0';
// pod prepare_command(Rust release x2 타깃 + lipo)과 xcodebuild(Release 번들링
// 포함)는 기본 단계 타임아웃(15분)을 넘을 수 있다 — CI 잡이 75분 상한에서
// 같은 파이프라인을 돌리는 근거로 여유를 준다.
const NATIVE_BUILD_TIMEOUT_MS = 40 * 60 * 1000;

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

const USAGE = `usage: node scripts/registry-consumer-rn-ios.mjs --output <absolute-receipt-path> [--sim <udid-or-name>]

--output  (required) absolute path for the JSON receipt; logs land next to it
--sim     optional iPhone simulator UDID or name (default: prefer a booted
          iPhone, else the newest runtime's first available iPhone)
--help    print this message

BLOCKED off macOS: this journey needs macOS with Xcode (xcodebuild/xcrun),
CocoaPods and an iOS simulator runtime. On Linux/Windows the preflight step
fails loudly with a BLOCKED receipt — run it manually on macOS (procedure in
docs/registry-onboarding.md, RN/iOS journey section).`;

export function parseCliArgs(argv) {
  if (argv.includes('--help')) return { help: true };
  const options = { outputPath: null, sim: null };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--output') {
      options.outputPath = argv[++index];
    } else if (option === '--sim') {
      options.sim = argv[++index];
    } else {
      throw new Error(`unknown option: ${option}`);
    }
  }
  if (!options.outputPath || !options.outputPath.startsWith('/'))
    throw new Error('--output <absolute-path> is required');
  return options;
}

// ── 소스 렌더러(순수 함수) ────────────────────────────────────────────────

export function renderRnIosLibRs() {
  return `use unikit_bridge::prelude::*;

#[derive(Debug, serde::Serialize, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EchoInput {
    pub message: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EchoOutput {
    pub message: String,
}

#[unikit_bridge::command]
fn echo(input: EchoInput) -> Result<EchoOutput> {
    Ok(EchoOutput { message: input.message })
}

#[unikit_bridge::command]
fn fail_echo(_input: EchoInput) -> Result<EchoOutput> {
    Err(UnikitError::invalid_args("${ERROR_SENTINEL}"))
}

#[derive(Debug, serde::Serialize, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EmitTicksInput {
    pub ticks: u32,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EmitTicksOutput {
    pub emitted: u32,
}

// JSI 푸시 — 설치된 싱크로 Package::emit 이 앱 JS 로 전달된다. 싱크는 등록된
// 패키지 인스턴스에 설치된다 — unikit_bridge::ffi::get_package() 핸들로 발행한다
// (calculator 예제 emit_demo 와 동일한 계약). iOS 푸시 경로의 첫 실측이다.
#[unikit_bridge::command]
fn emit_ticks(input: EmitTicksInput) -> Result<EmitTicksOutput> {
    let package = unikit_bridge::ffi::get_package()
        .ok_or_else(|| UnikitError::custom("ffi.not_registered", "package not registered"))?;
    for index in 0..input.ticks {
        package.emit("calc.tick", serde_json::json!({ "value": index + 1 }));
    }
    Ok(EmitTicksOutput { emitted: input.ticks })
}

#[derive(Debug, serde::Serialize, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReportEvidenceInput {
    pub phase: String,
    pub payload: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReportEvidenceOutput {
    pub written: u32,
}

// 증거 회신 — RN 의 console.log 는 os_log 로만 나가므로(RCTLog.mm) JS 관측을
// 앱 stdout 에 마커로 찍는다. simctl launch --stdout 캡처가 이 줄을 담고,
// 여정이 호스트 경로로 매핑해 폴링한다(Tauri 여정의 reportEvidence 와 같은
// "브릿지 자체로 증거를 되돌린다" 계약, 출력 채널만 파일→stdout).
#[unikit_bridge::command]
fn report_evidence(input: ReportEvidenceInput) -> Result<ReportEvidenceOutput> {
    use std::io::Write as _;
    let stdout = std::io::stdout();
    let mut handle = stdout.lock();
    writeln!(handle, "${JOURNEY_MARKER}{}", input.payload)
        .and_then(|()| handle.flush())
        .map_err(|error| UnikitError::internal(format!("evidence stdout write failed: {error}")))?;
    Ok(ReportEvidenceOutput { written: 1 })
}

pub fn package() -> Package {
    let package = Package::builder("app.demo")
        .command_fn(echo)
        .command_fn(fail_echo)
        .command_fn(emit_ticks)
        .command_fn(report_evidence)
        .build();
    // 모바일 엔트리 계약 — unikit_mobile_init 이 이 함수를 호출할 때 FFI 전역에
    // 자동 등록돼야 install 시점의 계약 해시 조회가 성립한다.
    package.register_ffi();
    package
}

unikit_bridge::native_entry!(package);
`;
}

// 계약 변형 — registry-consumer-gate mutateScaffoldSources 와 같은 결정적 앵커 쌍.
export function mutateRnIosLibRs(libRs) {
  const replacements = [
    [
      'pub struct EchoInput {\n    pub message: String,\n}',
      'pub struct EchoInput {\n    pub message: String,\n    pub repeat: u32,\n}',
    ],
    [
      'pub struct EchoOutput {\n    pub message: String,\n}',
      'pub struct EchoOutput {\n    pub message: String,\n    pub repeat: u32,\n}',
    ],
    [
      'Ok(EchoOutput { message: input.message })',
      'Ok(EchoOutput { message: input.message, repeat: input.repeat })',
    ],
  ];
  let mutated = libRs;
  for (const [anchor, replacement] of replacements) {
    if (!mutated.includes(anchor))
      throw new Error(`rn-ios lib.rs mutation anchor not found: ${JSON.stringify(anchor)}`);
    mutated = mutated.replace(anchor, replacement);
  }
  return mutated;
}

export function renderRnIosAppTsx() {
  return `import { useEffect, useState } from 'react';
import { SafeAreaView, Text } from 'react-native';
import {
  echo,
  emitTicks,
  failEcho,
  reportEvidence,
  unikit,
  subscribeEvent,
} from './generated/react-native.js';
import { INPUT } from './journey-input.js';

// 이 앱은 Android 다리와 달리 이벤트를 구독·발행한다 — iOS 푸시 경로의 첫
// 실측이고, 교착이면 최종 보고가 도착하지 않는다(여정이 findings 로 기록).
// 그래서 관측은 단계별 브레드크럼(ready → commands → events)으로 보고된다:
// 어디까지 도달했는지가 증거가 되고, commands 까지 온 a2 증거는 확정 검증된다.
function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function report(stage: string, observations: Record<string, unknown>) {
  const payload = JSON.stringify({ phase: INPUT.phase, stage, ...observations });
  try {
    await reportEvidence({ phase: INPUT.phase, payload });
  } catch {
    // 브릿지 자체가 죽으면 증거 채널도 죽는다 — 아래 console.log 사본이 os_log
    // 로 남아 수동 진단(log stream / Console.app)에서 보인다.
  }
  console.log('${JOURNEY_MARKER}' + payload);
}

export default function App() {
  const [status, setStatus] = useState('booting');
  useEffect(() => {
    (async () => {
      try {
        await unikit.ready();
        await report('ready', {});

        const echoResult: any = await echo(INPUT as never);
        let failEchoError: { code: string | null; message: string } | null = null;
        try {
          await failEcho(INPUT as never);
        } catch (error: any) {
          failEchoError = { code: error?.code ?? null, message: String(error?.message ?? error) };
        }
        // a2 증거를 이벤트 시도 직전에 확정 보고한다 — 이후 JS 스레드가 얼어
        // 붙어도 첫 호출·도메인 에러 관측은 이미 stdout 캡처에 남는다.
        await report('commands', { echoResult, failEchoError });

        let subscribed = 0;
        const unsubscribe = subscribeEvent('calc.tick', (payload: unknown) => {
          subscribed += 1;
          void (payload as { value: number }).value;
        });
        // 구독 중 이벤트 3회 — 푸시 싱크가 시뮬레이터 앱 JS 로 전달되는지.
        const first = await emitTicks({ ticks: 3 });
        await wait(1000);
        const beforeUnsubscribe = subscribed;

        // 해지 후 이벤트 2회 — 해지가 조용한 유실 없이 이루어지는지.
        unsubscribe();
        const second = await emitTicks({ ticks: 2 });
        await wait(1000);
        const afterUnsubscribe = subscribed - beforeUnsubscribe;

        await report('events', {
          echoResult,
          failEchoError,
          eventsBeforeUnsubscribe: beforeUnsubscribe,
          eventsAfterUnsubscribe: afterUnsubscribe,
          firstEmitted: first.emitted,
          secondEmitted: second.emitted,
        });
        setStatus('journey-complete');
      } catch (error) {
        await report('journey-error', { journeyError: String(error) });
        setStatus('journey-error');
      }
    })();
  }, []);
  return (
    <SafeAreaView>
      <Text>{status}</Text>
    </SafeAreaView>
  );
}
`;
}

export function renderJourneyInputTs(input) {
  const fields = Object.entries(input)
    .map(([key, value]) => `  ${key}: ${JSON.stringify(value)},`)
    .join('\n');
  return `export const INPUT = {\n${fields}\n} as const;\n`;
}

export function renderRnIosCargoToml() {
  return `# Generated by the RN/iOS registry journey — registry-only consumer crate.
[package]
name = "unikit-app"
version = "0.1.0"
edition = "2021"
publish = false

[lib]
name = "unikit_app"
crate-type = ["rlib", "staticlib"]

[dependencies]
unikit-bridge = "0"
unikit-bridge-macros = "0"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
schemars = "0.8"

[[bin]]
name = "generate"
path = "src/bin/generate.rs"
`;
}

export function renderGenerateRs() {
  return `use std::path::PathBuf;

fn main() -> unikit_bridge::Result<()> {
    let generated = unikit_app::package().generate_typescript()?;
    let out = match std::env::var_os("UNIKIT_SCHEMA_OUT") {
        Some(p) if !p.is_empty() => PathBuf::from(p).join("schema.json"),
        _ => PathBuf::from("generated").join("schema.json"),
    };
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&out, generated.schema_json)?;
    println!("{} written", out.display());
    Ok(())
}
`;
}

export function renderRnIosConfigJson() {
  return `${JSON.stringify(
    {
      $schema: './node_modules/@unikit-bridge/cli/unikit.schema.json',
      schema: './generated/schema.json',
      output: './generated',
      reactNative: { rustManifest: './Cargo.toml' },
    },
    null,
    2,
  )}\n`;
}

// 앱 수준 RN config — Android 다리와 동일한 결함 회피: 오톨링킹이 node_modules
// 심링크 경로로 모듈을 등록하면 생성된 podspec/gradle 의 상대경로 기준이
// 중복된다. 모듈 root 를 실제 경로로 고정한다(앱 소유 설정).
export function renderAppReactNativeConfigJs() {
  return `const path = require('path');

module.exports = {
  dependencies: {
    '@unikit-bridge/generated-react-native': {
      root: path.resolve(__dirname, 'modules', 'unikit-bridge'),
    },
  },
};
`;
}

// 생성 클라이언트의 내부 임포트는 '.js' 지정자를 쓴다 — Metro 가 소스 해석을
// 확장자로 하므로 '.js' 요청을 확장자 없는 소스로 우선 해석하는 리졸버를 켠다.
// Release 빌드의 "Bundle React Native code and images" 단계가 이 설정으로
// main.jsbundle 을 만든다.
export function renderMetroConfigJs() {
  return `const { getDefaultConfig } = require('@react-native/metro-config');

const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith('.js')) {
    const sourceName = moduleName.slice(0, -3);
    try {
      return (defaultResolveRequest || context.resolveRequest)(context, sourceName, platform);
    } catch {
      // 실제 .js 모듈은 정상 해석으로 되돌린다.
    }
  }
  return (defaultResolveRequest || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
`;
}

// ── 증거 파싱·단정(순수 함수) ─────────────────────────────────────────────

// stdout 캡처에서 마커 줄만 파싱한다 — 말줄임된 줄은 건너뛴다(완전한 JSON 만
// 증거로 받는다). 반환은 도착 순서 그대로(브레드크럼 순서가 진단 재료).
export function parseStdoutReports(stdoutText) {
  const reports = [];
  for (const line of String(stdoutText).split('\n')) {
    const index = line.indexOf(JOURNEY_MARKER);
    if (index === -1) continue;
    try {
      reports.push(JSON.parse(line.slice(index + JOURNEY_MARKER.length)));
    } catch {
      // 잘린 줄 — 다음 폴링에서 완전한 줄이 다시 온다.
    }
  }
  return reports;
}

export function findReport(reports, phase, stage) {
  const matching = reports.filter((entry) => entry?.phase === phase && entry?.stage === stage);
  if (matching.length === 0) return null;
  return matching[matching.length - 1];
}

export function lastReportStage(reports, phase) {
  const matching = reports.filter((entry) => entry?.phase === phase);
  if (matching.length === 0) return null;
  return matching[matching.length - 1].stage ?? null;
}

export function assertJourneyObservation(observations) {
  if (observations.journeyError !== undefined)
    throw new Error(`RN/iOS journey reported an error: ${observations.journeyError}`);
  if (observations.failEchoError === null)
    throw new Error('failEcho did not reject in the RN/iOS runtime');
  if (!String(observations.failEchoError.message).includes(ERROR_SENTINEL))
    throw new Error(
      `failEcho error message did not cross the JSI bridge intact: ${observations.failEchoError.message}`,
    );
  if (observations.echoResult?.message !== ECHO_MESSAGE)
    throw new Error(`echo result message mismatch: ${JSON.stringify(observations.echoResult)}`);
  return true;
}

// 이벤트 첫 실측 단정 — 전달 수 자체를 검사한다(성공 아니면 loud-fail).
export function assertEventObservation(observations) {
  if (observations.eventsBeforeUnsubscribe !== 3)
    throw new Error(
      `expected 3 calc.tick events before unsubscribe, saw ${observations.eventsBeforeUnsubscribe}`,
    );
  if (observations.eventsAfterUnsubscribe !== 0)
    throw new Error(
      `events kept arriving after unsubscribe: ${observations.eventsAfterUnsubscribe}`,
    );
  if (observations.firstEmitted !== 3)
    throw new Error(`emitTicks(ticks: 3) returned ${JSON.stringify(observations.firstEmitted)}`);
  if (observations.secondEmitted !== 2)
    throw new Error(`emitTicks(ticks: 2) returned ${JSON.stringify(observations.secondEmitted)}`);
  return true;
}

export function assertMutatedObservation(observations) {
  assertJourneyObservation(observations);
  assertEventObservation(observations);
  if (observations.echoResult?.repeat !== 3)
    throw new Error(
      `mutated echo result did not return repeat=3: ${JSON.stringify(observations.echoResult)}`,
    );
  return true;
}

// ── 시뮬레이터 선택(순수 함수) ────────────────────────────────────────────

// simctl "list devices available -j" 출력에서 iPhone 기기를 고른다: 요청값이
// 있으면 그 UDID/이름, 없으면 부팅된 iPhone 우선, 그 다음 최신 런타임의 첫
// iPhone(ci-ios-runtime-smoke.sh 의 선택 규칙을 결정적으로 재현).
export function selectSimulatorDevice(devicesJson, requested) {
  const groups = Object.entries(devicesJson?.devices ?? {});
  const available = (devices) =>
    (Array.isArray(devices) ? devices : []).filter(
      (device) => device?.isAvailable === true && String(device.name ?? '').startsWith('iPhone'),
    );
  if (requested) {
    for (const [, devices] of groups) {
      const match = available(devices).find(
        (device) => device.udid === requested || device.name === requested,
      );
      if (match) return { udid: match.udid, name: match.name, state: match.state };
    }
    throw new Error(`requested simulator ${JSON.stringify(requested)} is not an available iPhone`);
  }
  for (const [, devices] of groups) {
    const booted = available(devices).find((device) => device.state === 'Booted');
    if (booted) return { udid: booted.udid, name: booted.name, state: booted.state };
  }
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const [runtime, devices] = groups[index];
    const candidates = available(devices);
    if (candidates.length > 0)
      return {
        udid: candidates[0].udid,
        name: candidates[0].name,
        state: candidates[0].state,
        runtime,
      };
  }
  throw new Error('no available iPhone simulator device found');
}

// ── 단계 순서 계약(순수 검사) ─────────────────────────────────────────────

// 설계된 여정 파이프라인 순서 — 실행된 단계 이름이 이 순서를 지켰는지
// executeRnIosCycle 마지막에 자기 검증한다(동적 `${label}-*` 단계는 사이에
// 끼어들 수 있고, 이 목록에 핀된 이름이 빠지거나 순서가 뒤집히면 loud-fail.
// mutated-codegen·mutated-contract-hash-verification 도 실행되는 설계 단계이므로
// 핀에서 제외하지 않는다 — 삭제·재배치가 플랜 검증에 걸려야 한다).
export const RN_IOS_STEP_PLAN = [
  'preflight-macos-toolchain',
  'resolve-simulator',
  'rn-init',
  'write-rust-core',
  'write-app-tsx',
  'pin-npm-versions',
  'install-npm',
  'verify-exact-npm-sources',
  'baseline-codegen',
  'install-workspaces',
  'baseline-doctor',
  'baseline-pod-install',
  'baseline-xcodebuild',
  'verify-app',
  'baseline-provenance',
  'boot-simulator',
  'baseline-launch-app',
  'baseline-collect-evidence',
  'baseline-observation-verification',
  'mutate-contract',
  'mutated-codegen',
  'mutated-force-pod-reprepare',
  'mutated-pod-install',
  'mutated-xcodebuild',
  'mutated-contract-hash-verification',
  'mutated-launch-app',
  'mutated-collect-evidence',
  'mutated-observation-verification',
  'uninstall-app',
];

export function assertStepsFollowPlan(stepNames, plan = RN_IOS_STEP_PLAN) {
  const executed = stepNames.map((name) => String(name));
  let cursor = 0;
  const matched = [];
  for (const name of executed) {
    if (name === plan[cursor]) {
      matched.push(name);
      cursor += 1;
    }
  }
  if (matched.length !== plan.length) {
    const firstMissing = plan[matched.length];
    throw new Error(
      `journey steps do not follow the designed plan: expected ${firstMissing} after ${matched[matched.length - 1] ?? '(start)'}, executed order was [${executed.join(', ')}]`,
    );
  }
  return true;
}

// ── 여정 실행 ─────────────────────────────────────────────────────────────

async function runChecked(context, name, cwd, argv, extraEnv = {}, timeoutMs) {
  const ordinal = context.steps.length + 1;
  const result = await runOrderedSteps({
    logDir: context.logDir,
    steps: [
      {
        name: `${String(ordinal).padStart(3, '0')}-${name}`,
        command: {
          cwd,
          argv,
          env: { ...context.env, ...extraEnv },
          ...(timeoutMs ? { timeoutMs } : {}),
        },
      },
    ],
  });
  const report = result.steps[0];
  const desiredLog = join(
    context.logDir,
    `${String(ordinal).padStart(3, '0')}-${sanitizeStepName(name)}.log`,
  );
  if (report.rawLogPath !== desiredLog) {
    writeFileSync(desiredLog, readFileSync(report.rawLogPath));
    rmSync(report.rawLogPath, { force: true });
    report.rawLogPath = desiredLog;
  }
  const output = { stdout: report.stdout ?? '', stderr: report.stderr ?? '' };
  delete report.stdout;
  delete report.stderr;
  report.name = name;
  context.steps.push(report);
  if (!result.ok) {
    const error = new Error(result.error.message);
    error.code = result.error.code;
    error.step = { name, rawLogPath: report.rawLogPath };
    error.steps = context.steps;
    error.scratchRoot = context.scratchRoot;
    throw error;
  }
  return output;
}

function internalStep(context, name, operation) {
  const ordinal = context.steps.length + 1;
  const startedAt = new Date();
  const rawLogPath = join(
    context.logDir,
    `${String(ordinal).padStart(3, '0')}-${sanitizeStepName(name)}.log`,
  );
  try {
    const value = operation();
    writeFileSync(rawLogPath, `step: ${name}\nstatus: ok\n`);
    context.steps.push({
      name,
      ok: true,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      status: 0,
      signal: null,
      rawLogPath,
    });
    return value;
  } catch (error) {
    writeFileSync(rawLogPath, `${JSON.stringify(errorDetails(error), null, 2)}\n`);
    context.steps.push({
      name,
      ok: false,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      status: null,
      signal: null,
      rawLogPath,
    });
    const failure = error instanceof Error ? error : new Error(String(error));
    failure.step = { name, rawLogPath };
    failure.steps = context.steps;
    failure.scratchRoot = context.scratchRoot;
    throw failure;
  }
}

// macOS 전용 도구 체인 선점 검사 — 이 환경(xcodebuild 부재)에서의 실행 한계를
// 은폐 없이 BLOCKED 로 기록한다(AC-4). 조용한 skip 이 아니라 loud-fail 영수증.
function preflightMacOsToolchain(context) {
  return internalStep(context, 'preflight-macos-toolchain', () => {
    const missing = [];
    if (process.platform !== 'darwin') missing.push(`macOS host (found ${process.platform})`);
    for (const [tool, args] of [
      ['xcodebuild', ['-version']],
      ['xcrun', ['--version']],
      ['pod', ['--version']],
    ]) {
      const probe = spawnSync(tool, args, { encoding: 'utf8' });
      if (probe.error || probe.status !== 0)
        missing.push(`${tool} (${probe.error?.code ?? `exit ${probe.status ?? 'null'}`})`);
    }
    if (missing.length > 0)
      throw new Error(
        `BLOCKED: the RN/iOS journey requires macOS with Xcode (xcodebuild/xcrun), CocoaPods and an iOS simulator runtime — missing/unavailable here: ${missing.join(', ')}. ` +
          'This environment records the limitation as a loud failure instead of skipping; run the journey manually on macOS (see docs/registry-onboarding.md, RN/iOS journey) or via the manual Registry consumer workflow.',
      );
    return { platform: process.platform };
  });
}

function resolveSimulator(context, requestedSim) {
  return internalStep(context, 'resolve-simulator', () => {
    const listing = spawnSync('xcrun', ['simctl', 'list', 'devices', 'available', '-j'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    if (listing.status !== 0)
      throw new Error(`simctl list devices failed: ${listing.stderr ?? listing.error}`);
    const simulator = selectSimulatorDevice(JSON.parse(listing.stdout), requestedSim);
    return {
      udid: simulator.udid,
      name: simulator.name,
      runtime: simulator.runtime ?? null,
      evidenceLevel: 'simulator',
    };
  });
}

async function bootSimulator(context) {
  internalStep(context, 'boot-simulator', () => {
    const result = spawnSync('xcrun', ['simctl', 'boot', context.simulator.udid], {
      encoding: 'utf8',
    });
    if (result.status !== 0 && !/already booted/i.test(String(result.stderr ?? '')))
      throw new Error(`simctl boot failed: ${result.stderr ?? result.error}`);
  });
  await runChecked(context, 'wait-simulator-boot', context.scratchRoot, [
    'xcrun',
    'simctl',
    'bootstatus',
    context.simulator.udid,
    '-b',
  ]);
  // stdout 캡처 경로 매핑 — simctl launch 는 경로를 시뮬레이터 안에서 해석한다.
  // 호스트 파일은 SIMULATOR_SHARED_RESOURCES_DIRECTORY + 시뮬 경로(ci-ios-
  // runtime-smoke.sh 기법)에 생긴다.
  context.simulatorHostRoot = internalStep(context, 'map-simulator-host-root', () => {
    const env = spawnSync(
      'xcrun',
      ['simctl', 'getenv', context.simulator.udid, 'SIMULATOR_SHARED_RESOURCES_DIRECTORY'],
      { encoding: 'utf8' },
    );
    const value = String(env.stdout ?? '').trim();
    if (env.status !== 0 || !value.startsWith('/') || !existsSync(value))
      throw new Error(
        `cannot map the simulator host root via SIMULATOR_SHARED_RESOURCES_DIRECTORY (status ${env.status}): ${JSON.stringify(value)} — stdout capture polling is impossible without it`,
      );
    return value;
  });
}

function writeRustCore(context) {
  const projectDir = context.projectDir;
  internalStep(context, 'write-rust-core', () => {
    writeFileSync(join(projectDir, 'Cargo.toml'), renderRnIosCargoToml());
    pinCargoVersions(projectDir, context.versions.phases.candidate);
    mkdirSync(join(projectDir, 'src', 'bin'), { recursive: true });
    writeFileSync(join(projectDir, 'src', 'lib.rs'), renderRnIosLibRs());
    writeFileSync(join(projectDir, 'src', 'bin', 'generate.rs'), renderGenerateRs());
    writeJson(join(projectDir, 'unikit.json'), JSON.parse(renderRnIosConfigJson()));
    writeFileSync(join(projectDir, 'metro.config.js'), renderMetroConfigJs());
    writeFileSync(join(projectDir, 'react-native.config.js'), renderAppReactNativeConfigJs());
    writeFileSync(
      join(projectDir, 'journey-input.ts'),
      renderJourneyInputTs({ phase: 'baseline', message: ECHO_MESSAGE }),
    );
  });
}

function writeAppTsx(context) {
  internalStep(context, 'write-app-tsx', () => {
    writeFileSync(join(context.projectDir, 'App.tsx'), renderRnIosAppTsx());
  });
}

function applyPublishedCliWorkaround(context) {
  internalStep(context, 'workaround-published-cli-esm-module-manifest', () => {
    // 발행 CLI 0.11.3 결함(이 저장소·CLI 0.12.0 에서 수정됨): 생성 모듈
    // manifest 의 "type":"module" 때문에 Node 기반 오톨링킹이 react-native
    // .config.js 를 require 하지 못한다. 핀이 0.12.0+ 이면 no-op 이지만, 안전
    // 위해 조건부로 유지한다(Android 다리와 동일).
    const moduleManifestPath = join(context.projectDir, 'modules', 'unikit-bridge', 'package.json');
    const manifest = readJson(moduleManifestPath);
    if (manifest.type === 'module') {
      delete manifest.type;
      writeJson(moduleManifestPath, manifest);
    }
  });
}

function contractHash(projectDir) {
  const text = readFileSync(join(projectDir, 'generated', 'contract.ts'), 'utf8');
  const match = text.match(/GENERATED_CONTRACT_HASH\s*=\s*['"]([^'"]+)['"]/);
  if (!match) throw new Error('generated contract.ts does not contain GENERATED_CONTRACT_HASH');
  return match[1];
}

function walkFiles(root, prefix = '') {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...walkFiles(join(root, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
}

function snapshotEvidence(context, phase) {
  const snapshotRoot = join(context.scratchRoot, 'evidence', phase);
  mkdirSync(snapshotRoot, { recursive: true });
  const manifestFiles = [
    'Cargo.lock',
    'Cargo.toml',
    'package.json',
    'package-lock.json',
    'unikit.json',
    'ios/Podfile.lock',
    'App.tsx',
    'journey-input.ts',
    'src/lib.rs',
  ];
  for (const relativePath of manifestFiles) {
    const source = join(context.projectDir, relativePath);
    if (existsSync(source)) cpSync(source, join(snapshotRoot, relativePath), { recursive: true });
  }
  cpSync(join(context.projectDir, 'generated'), join(snapshotRoot, 'generated'), {
    recursive: true,
  });
  const generated = walkFiles(join(snapshotRoot, 'generated'), 'generated');
  const files = hashFiles(
    snapshotRoot,
    manifestFiles.filter((relativePath) => existsSync(join(context.projectDir, relativePath))),
    ...generated,
  );
  return { root: snapshotRoot, files };
}

async function environmentEvidence(context) {
  const commands = [
    ['node', process.execPath, ['--version']],
    ['npm', 'npm', ['--version']],
    ['cargo', 'cargo', ['--version']],
    ['rustc', 'rustc', ['--version']],
    ['xcodebuild', 'xcodebuild', ['-version']],
    ['pod', 'pod', ['--version']],
  ];
  const environment = {
    platform: process.platform,
    arch: process.arch,
    osRelease: osRelease(),
    osVersion: osVersion(),
  };
  for (const [name, executable, args] of commands) {
    const result = await runChecked(context, `environment-${name}`, context.scratchRoot, [
      executable,
      ...args,
    ]);
    environment[name] = result.stdout.trim().split('\n')[0];
  }
  return environment;
}

// stdout 캡처 폴링 — 최종(events) 보고를 기다린다. 교착이면 시간 초과 후
// {reports, final: null} 을 돌려주고 진단은 관측 검증 단계가 맡는다(실패의
// 원인 규명까지 이 함수가 떠안지 않게 — 도달한 브레드크럼이 곧 증거).
function launchAndCollect(context, label, phase) {
  const { simulator } = context;
  const capture = internalStep(context, `${label}-prepare-stdout-capture`, () => {
    const simDir = `/tmp/unikit-rn-ios-journey-${label}-${process.pid}`;
    const hostDir = `${context.simulatorHostRoot}${simDir}`;
    mkdirSync(hostDir, { recursive: true });
    return {
      simDir,
      hostDir,
      hostStdoutPath: join(hostDir, 'out.log'),
      hostStderrPath: join(hostDir, 'err.log'),
      simStdoutPath: `${simDir}/out.log`,
      simStderrPath: `${simDir}/err.log`,
    };
  });
  const observations = {
    install: async () =>
      runChecked(context, `${label}-install-app`, context.projectDir, [
        'xcrun',
        'simctl',
        'install',
        simulator.udid,
        context.appProductPath,
      ]),
    launch: () =>
      runChecked(context, `${label}-launch-app`, context.projectDir, [
        'xcrun',
        'simctl',
        'launch',
        '--terminate-running-process',
        `--stdout=${capture.simStdoutPath}`,
        `--stderr=${capture.simStderrPath}`,
        simulator.udid,
        APP_PACKAGE,
      ]),
    collect: () =>
      internalStep(context, `${label}-collect-evidence`, () => {
        const startedAt = Date.now();
        let reports = [];
        for (;;) {
          if (existsSync(capture.hostStdoutPath)) {
            reports = parseStdoutReports(readFileSync(capture.hostStdoutPath, 'utf8'));
            const final = findReport(reports, phase, 'events');
            if (final) break;
          }
          if (Date.now() - startedAt > EVIDENCE_WAIT_MS) break;
          spawnSync('sleep', ['2']);
        }
        // 캡처 원본을 로그 디렉터리에 보존하고 시뮬레이터 쪽 임시 디렉터리를
        // 정리한다(정리 실패는 여정 결과를 바꾸지 않는다).
        const logStdout = join(context.logDir, `${label}-stdout.log`);
        const logStderr = join(context.logDir, `${label}-stderr.log`);
        if (existsSync(capture.hostStdoutPath))
          writeFileSync(logStdout, readFileSync(capture.hostStdoutPath));
        if (existsSync(capture.hostStderrPath))
          writeFileSync(logStderr, readFileSync(capture.hostStderrPath));
        rmSync(capture.hostDir, { recursive: true, force: true });
        return { reports, final: findReport(reports, phase, 'events'), logStdout, logStderr };
      }),
    terminate: () =>
      internalStep(context, `${label}-terminate-app`, () => {
        const result = spawnSync('xcrun', ['simctl', 'terminate', simulator.udid, APP_PACKAGE], {
          encoding: 'utf8',
        });
        if (result.status !== 0 && !/no process|not found/i.test(String(result.stderr ?? '')))
          throw new Error(`simctl terminate failed: ${result.stderr ?? result.error}`);
      }),
  };
  return observations;
}

// 관측 검증 — 최종 보고가 있으면 전체 단정, 없으면 브레드크럼으로 정직 진단.
function verifyCollectedObservations(context, label, phase, collected) {
  internalStep(context, `${label}-observation-verification`, () => {
    if (collected.final) {
      if (phase === 'mutated') assertMutatedObservation(collected.final);
      else {
        assertJourneyObservation(collected.final);
        assertEventObservation(collected.final);
      }
      return true;
    }
    // 최종 보고 없음 — 어디까지 도달했는지가 진단이다.
    const errorReport = findReport(collected.reports, phase, 'journey-error');
    if (errorReport)
      throw new Error(`RN/iOS journey reported a JS error: ${errorReport.journeyError}`);
    const commands = findReport(collected.reports, phase, 'commands');
    if (commands) {
      // a2 증거는 동결 직전에 이미 보고됐다 — 위반이 있으면 그 자체로 loud-fail.
      assertJourneyObservation(commands);
      const lastStage = lastReportStage(collected.reports, phase);
      const error = new Error(
        `final ${phase} event report never arrived on the stdout capture within ${EVIDENCE_WAIT_MS}ms — the app stopped reporting after the ${lastStage} breadcrumb. ` +
          `This is the first live iOS push-path measurement; it fails loudly instead of being recorded as "events unsupported". Captures: ${collected.logStdout}, ${collected.logStderr}`,
      );
      error.journeyFinding = {
        id: 'rn-ios-event-push-freeze-suspected',
        summary:
          'a2 commands evidence was delivered, then no events report and no journey-error report arrived before the timeout — the JS thread appears frozen during the event attempt (subscribe → emitTicks)',
        evidence: `last delivered stage=${lastStage}; a2FirstCall/a3DomainError verified from the commands report before the freeze; stdout/stderr captures retained at ${collected.logStdout} / ${collected.logStderr}`,
        consequence:
          'journey fails; consistent with — but not proof of — the JS-thread freeze the Android leg observed on the same emit-inside-command path (rn-android-event-push-deadlock). Re-run with `xcrun simctl spawn booted log stream` diagnostics before claiming a cause',
      };
      error.partialObservations = commands;
      throw error;
    }
    const ready = findReport(collected.reports, phase, 'ready');
    if (ready) {
      const error = new Error(
        `final ${phase} report never arrived — the app froze between the ready breadcrumb and the commands report (first command call path suspected). Captures: ${collected.logStdout}, ${collected.logStderr}`,
      );
      error.journeyFinding = {
        id: 'rn-ios-first-call-freeze-suspected',
        summary:
          'the ready breadcrumb was delivered but the commands breadcrumb never arrived — the freeze happened during echo/failEcho, before any event activity',
        evidence: `last delivered stage=${lastReportStage(collected.reports, phase)}; captures retained at ${collected.logStdout} / ${collected.logStderr}`,
        consequence: 'journey fails; re-run with unified-log diagnostics before claiming a cause',
      };
      throw error;
    }
    throw new Error(
      `no ${JOURNEY_MARKER} report for phase ${phase} ever arrived on the stdout capture — the app never reported. Check install/launch in the step logs and the stderr capture at ${collected.logStderr}`,
    );
  });
}

async function executeRnIosCycle({ logDir, sim }) {
  const versions = validateVersionManifest(readJson(VERSIONS_PATH));
  const reactNativeVersion = versions.hosts?.['@unikit-bridge/react-native'];
  if (!reactNativeVersion)
    throw new Error('versions.json hosts["@unikit-bridge/react-native"] pin is required');
  const scratchRoot = mkdtempSync(join(tmpdir(), 'unikit-registry-rn-ios-'));
  const projectDir = join(scratchRoot, APP_NAME);
  const derivedDataPath = join(scratchRoot, 'ios-dd');
  const repoRoot = resolve(dirname(SCRIPT_PATH), '..');
  const context = {
    logDir,
    scratchRoot,
    projectDir,
    versions,
    steps: [],
    simulator: null,
    simulatorHostRoot: null,
    appProductPath: null,
    env: {
      ...process.env,
      CI: process.env.CI ?? 'true',
      CARGO_TARGET_DIR: join(scratchRoot, 'schema-target'),
    },
  };
  const npmVersions = {
    '@unikit-bridge/cli': versions.npm['@unikit-bridge/cli'],
    '@unikit-bridge/types': versions.npm['@unikit-bridge/types'],
    '@unikit-bridge/react-native': reactNativeVersion,
  };
  try {
    // 선점 검사가 가장 먼저 — macOS 전용 도구가 없으면 그 자체로 BLOCKED 영수증
    // 이 된다(환경 수집 단계의 ENOENT 가 아니라 명확한 원인으로).
    preflightMacOsToolchain(context);
    const environment = await environmentEvidence(context);
    const runner = await runChecked(context, 'runner-git-head', repoRoot, [
      'git',
      'rev-parse',
      'HEAD',
    ]);
    context.simulator = resolveSimulator(context, sim);

    // 1) RN 앱 스캐폴드 — 공개 템플릿(커뮤니티 CLI, Expo 미사용). --package-name
    //    은 iOS PRODUCT_BUNDLE_IDENTIFIER 도 같이 설정한다(CLI editTemplate).
    await runChecked(context, 'rn-init', scratchRoot, [
      'npx',
      '--yes',
      `@react-native-community/cli@${COMMUNITY_CLI_VERSION}`,
      'init',
      APP_NAME,
      '--version',
      RN_TEMPLATE_VERSION,
      '--package-name',
      APP_PACKAGE,
      '--skip-install',
      '--skip-git-init',
    ]);

    // 2) 발행 패키지 정확 핀 설치 + Rust 코어·설정 작성.
    writeRustCore(context);
    writeAppTsx(context);
    internalStep(context, 'pin-npm-versions', () => {
      const packagePath = join(projectDir, 'package.json');
      const packageJson = readJson(packagePath);
      packageJson.dependencies['@unikit-bridge/react-native'] = npmVersions['@unikit-bridge/react-native'];
      packageJson.dependencies['@unikit-bridge/types'] = npmVersions['@unikit-bridge/types'];
      packageJson.devDependencies['@unikit-bridge/cli'] = npmVersions['@unikit-bridge/cli'];
      writeJson(packagePath, packageJson);
    });
    await runChecked(context, 'install-npm', projectDir, [
      'npm',
      'install',
      '--no-audit',
      '--no-fund',
    ]);
    internalStep(context, 'verify-exact-npm-sources', () => {
      assertNoConsumerContamination(projectDir, {
        expectedNpm: npmVersions,
        allowedWorkspacePackages: ['@unikit-bridge/generated-react-native'],
      });
      return assertExactNpmProvenance(projectDir, npmVersions);
    });

    // 3) 코드젠 — unikit-bridge 네이티브 모듈(podspec/gradle/cmake) + 생성 클라.
    const projectCli = join(projectDir, 'node_modules', '@unikit-bridge', 'cli', 'dist', 'index.js');
    await runChecked(context, 'baseline-codegen', projectDir, [
      process.execPath,
      projectCli,
      'codegen',
      '--config',
      'unikit.json',
    ]);
    internalStep(context, 'install-generated-workspace', () => {
      const packageJson = readJson(join(projectDir, 'package.json'));
      if (packageJson.dependencies['@unikit-bridge/generated-react-native'] !== 'workspace:*')
        throw new Error('codegen did not register the generated workspace package');
      if (!packageJson.workspaces?.includes('modules/unikit-bridge'))
        throw new Error('codegen did not register the unikit-bridge workspace');
    });
    applyPublishedCliWorkaround(context);
    await runChecked(context, 'install-workspaces', projectDir, [
      'npm',
      'install',
      '--no-audit',
      '--no-fund',
    ]);
    await runChecked(context, 'baseline-doctor', projectDir, [
      process.execPath,
      projectCli,
      'doctor',
      '--config',
      'unikit.json',
    ]);
    const baselineContractHash = contractHash(projectDir);

    // 4) pod install — podspec prepare_command 이 Rust staticlib(aarch64-apple-
    //    ios-sim + x86_64-apple-ios lipo, UNIKIT_PROFILE 기본 release)을 빌드한다.
    await runChecked(
      context,
      'baseline-pod-install',
      projectDir,
      ['pod', 'install', '--project-directory=ios'],
      {},
      NATIVE_BUILD_TIMEOUT_MS,
    );

    // 5) xcodebuild — Release 설정(커뮤니티 템플릿 AppDelegate 는 DEBUG 에서
    //    metro 를 향하므로 내장 jsbundle 을 쓰는 Release 로 빌드한다 — "Bundle
    //    React Native code and images" 단계가 main.jsbundle 을 만든다). 서명
    //    없음, -derivedDataPath 고정(CI rn-ios 잡과 동일).
    await runChecked(
      context,
      'baseline-xcodebuild',
      projectDir,
      [
        'xcodebuild',
        '-workspace',
        `ios/${APP_NAME}.xcworkspace`,
        '-scheme',
        APP_NAME,
        '-configuration',
        'Release',
        '-sdk',
        'iphonesimulator',
        'CODE_SIGNING_ALLOWED=NO',
        '-derivedDataPath',
        derivedDataPath,
        'build',
      ],
      {},
      NATIVE_BUILD_TIMEOUT_MS,
    );
    context.appProductPath = join(
      derivedDataPath,
      'Build',
      'Products',
      'Release-iphonesimulator',
      `${APP_NAME}.app`,
    );
    internalStep(context, 'verify-app', () => {
      if (!existsSync(context.appProductPath))
        throw new Error(`simulator .app product is missing: ${context.appProductPath}`);
      return { path: context.appProductPath };
    });
    const cargoMetadata = await runChecked(context, 'baseline-cargo-metadata', projectDir, [
      'cargo',
      'metadata',
      '--format-version',
      '1',
      '--locked',
    ]);
    const provenance = internalStep(context, 'baseline-provenance', () => ({
      npm: assertExactNpmProvenance(projectDir, npmVersions),
      cargo: assertCargoProvenance({
        metadata: JSON.parse(cargoMetadata.stdout),
        lockText: readFileSync(join(projectDir, 'Cargo.lock'), 'utf8'),
        expected: versions.phases.candidate,
        consumerManifestPath: join(projectDir, 'Cargo.toml'),
      }),
    }));

    // 6) 시뮬레이터 실행 — stdout 캡처 폴링으로 마커 회수(logcat 대신).
    await bootSimulator(context);
    const baselineCycle = launchAndCollect(context, 'baseline', 'baseline');
    await baselineCycle.install();
    await baselineCycle.launch();
    const baselineCollected = baselineCycle.collect();
    verifyCollectedObservations(context, 'baseline', 'baseline', baselineCollected);
    baselineCycle.terminate();
    const baselineSnapshot = snapshotEvidence(context, 'baseline');

    // 7) 계약 변형 → 재생성 → pod 재준비(Rust 재빌드) → 재빌드 → 재실행.
    internalStep(context, 'mutate-contract', () => {
      const libPath = join(projectDir, 'src', 'lib.rs');
      writeFileSync(libPath, mutateRnIosLibRs(readFileSync(libPath, 'utf8')));
      writeFileSync(
        join(projectDir, 'journey-input.ts'),
        renderJourneyInputTs({ phase: 'mutated', message: ECHO_MESSAGE, repeat: 3 }),
      );
    });
    await runChecked(context, 'mutated-codegen', projectDir, [
      process.execPath,
      projectCli,
      'codegen',
      '--config',
      'unikit.json',
    ]);
    applyPublishedCliWorkaround(context);
    // CocoaPods 는 변하지 않은 development pod 의 prepare_command 재실행을
    // 보장하지 않는다 — 변이된 Rust 소스가 확실히 재빌드되도록 (a) 빌드된
    // staticlib 산출물과 (b) Pods 설치 상태(Manifest.lock + 해당 pod 디렉터리)
    // 를 지운다. prepare_command 가 돌지 않으면 vendored library 가 없어 링크가
    // loud-fail 한다 — 낡은 아카이브가 조용히 재사용되는 일은 없다.
    internalStep(context, 'mutated-force-pod-reprepare', () => {
      rmSync(join(projectDir, 'modules', 'unikit-bridge', 'ios', 'rust', 'lib'), {
        recursive: true,
        force: true,
      });
      rmSync(join(projectDir, 'ios', 'Pods', 'UnikitBridge'), { recursive: true, force: true });
      rmSync(join(projectDir, 'ios', 'Pods', 'Manifest.lock'), { force: true });
    });
    await runChecked(
      context,
      'mutated-pod-install',
      projectDir,
      ['pod', 'install', '--project-directory=ios'],
      {},
      NATIVE_BUILD_TIMEOUT_MS,
    );
    await runChecked(
      context,
      'mutated-xcodebuild',
      projectDir,
      [
        'xcodebuild',
        '-workspace',
        `ios/${APP_NAME}.xcworkspace`,
        '-scheme',
        APP_NAME,
        '-configuration',
        'Release',
        '-sdk',
        'iphonesimulator',
        'CODE_SIGNING_ALLOWED=NO',
        '-derivedDataPath',
        derivedDataPath,
        'build',
      ],
      {},
      NATIVE_BUILD_TIMEOUT_MS,
    );
    const mutatedContractHash = contractHash(projectDir);
    internalStep(context, 'mutated-contract-hash-verification', () => {
      if (mutatedContractHash === baselineContractHash)
        throw new Error('contract hash did not change after the field mutation');
    });
    const mutatedCycle = launchAndCollect(context, 'mutated', 'mutated');
    await mutatedCycle.install();
    await mutatedCycle.launch();
    const mutatedCollected = mutatedCycle.collect();
    verifyCollectedObservations(context, 'mutated', 'mutated', mutatedCollected);
    mutatedCycle.terminate();
    const mutatedSnapshot = snapshotEvidence(context, 'mutated');

    // 시뮬레이터 정리 — 여정 앱을 제거한다.
    await runChecked(context, 'uninstall-app', projectDir, [
      'xcrun',
      'simctl',
      'uninstall',
      context.simulator.udid,
      APP_PACKAGE,
    ]);

    // 실행된 단계가 설계 순서를 지켰는지 자기 검증(재정렬 실수를 잡는다).
    internalStep(context, 'verify-step-plan', () =>
      assertStepsFollowPlan(context.steps.map((step) => step.name)),
    );

    return {
      gate: 'unikit-public-registry-rn-ios-consumer',
      configuration: {
        manifestPath: VERSIONS_PATH,
        versions: {
          npm: npmVersions,
          rust: versions.phases.candidate,
          reactNativeTemplate: RN_TEMPLATE_VERSION,
          communityCli: COMMUNITY_CLI_VERSION,
        },
        ios: {
          bundleIdentifier: APP_PACKAGE,
          configuration: 'Release',
          sdk: 'iphonesimulator',
          codeSigning: 'CODE_SIGNING_ALLOWED=NO',
        },
      },
      environment: { ...environment, simulator: context.simulator },
      runner: { gitHead: runner.stdout.trim() },
      journey: {
        scaffold: [
          'public RN community template (no Expo, unlike the Expo prebuild rn-ios CI job)',
          'exact-pin npm install of CLI/types/react-native adapter',
          'codegen renders unikit-bridge module (podspec/gradle/cmake) + generated client',
          'pod install prepare_command builds the Rust staticlib (aarch64-apple-ios-sim + x86_64-apple-ios lipo)',
          'xcodebuild Release for iphonesimulator embeds the standalone main.jsbundle (no metro at runtime)',
          'simctl boot/install/launch with --stdout capture mapped through SIMULATOR_SHARED_RESOURCES_DIRECTORY',
          'JS observations return over the bridge itself (reportEvidence command → Rust println! → stdout capture)',
        ],
        verified: {
          a2FirstCall:
            'echo through the generated strict-contract entry inside the iOS simulator app',
          a3DomainError: 'failEcho invalid_args message crossed the JSI bridge intact',
          a3FieldChange:
            'repeat field added → regen → pod re-prepare (Rust rebuild) → rebuild → repeat=3 returned in the simulator',
          a3Events:
            'calc.tick push delivered 3/3 while subscribed, 0 after unsubscribe — first live iOS measurement (finding rn-ios-event-push-first-measurement)',
          a1Combination: `RN/iOS simulator receipt (${context.simulator.name}${context.simulator.runtime ? `, ${context.simulator.runtime}` : ''})`,
        },
        findings: [
          {
            id: 'rn-ios-event-push-first-measurement',
            summary:
              'first live measurement of the RN/iOS JSI push path on the simulator: calc.tick delivered 3/3 while subscribed and 0 after unsubscribe',
            consequence:
              'the Android leg deadlock does not reproduce on this iOS leg at this evidence level; keep re-measuring after each adapter release',
          },
        ],
        excluded: [
          {
            segment: 'physical iOS device execution',
            reason:
              'this leg proves the iphonesimulator slice only; device-level evidence remains open',
          },
          {
            segment: 'RN/Android and existing-app integration',
            reason: 'separate journeys; this receipt is the RN/iOS leg only',
          },
          {
            segment: 'two successive product upgrades',
            reason:
              'single registry-line verification; the Node/Bun gate owns the Rust patch roundtrip',
          },
        ],
      },
      provenance,
      contractHashes: { baseline: baselineContractHash, mutated: mutatedContractHash },
      observations: {
        baseline: baselineCollected.final,
        mutated: mutatedCollected.final,
      },
      snapshots: { baseline: baselineSnapshot, mutated: mutatedSnapshot },
      scratchRoot,
      steps: context.steps,
    };
  } catch (error) {
    if (error instanceof Error) {
      error.steps ??= context.steps;
      error.scratchRoot ??= context.scratchRoot;
      error.projectDir ??= projectDir;
    }
    throw error;
  }
}

export async function runRnIosRegistryJourney({ outputPath, sim, execute }) {
  const absoluteOutput = resolve(outputPath);
  const logDir = join(dirname(absoluteOutput), 'registry-rn-ios-logs');
  rmSync(logDir, { recursive: true, force: true });
  mkdirSync(logDir, { recursive: true });
  const startedAt = new Date();
  let receipt;
  try {
    const result = await (execute ?? executeRnIosCycle)({ logDir, sim });
    receipt = {
      schemaVersion: 1,
      ok: true,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      evidenceBoundary:
        'automated public-registry React Native consumer cycle on the iOS simulator; does not close G1 or G2',
      ...result,
    };
    writeJson(absoluteOutput, receipt);
    if (result.scratchRoot) rmSync(result.scratchRoot, { recursive: true, force: true });
  } catch (error) {
    const step = error?.step;
    receipt = {
      schemaVersion: 1,
      ok: false,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      evidenceBoundary:
        'failed automated public-registry React Native consumer cycle on the iOS simulator; no acceptance claim',
      steps: error?.steps ?? [],
      scratchRoot: error?.scratchRoot ?? null,
      projectDir: error?.projectDir ?? null,
      scratchRetained: Boolean(error?.scratchRoot),
      ...(error?.journeyFinding ? { journey: { findings: [error.journeyFinding] } } : {}),
      ...(error?.partialObservations ? { partialObservations: error.partialObservations } : {}),
      failure: {
        step: typeof step === 'string' ? step : (step?.name ?? null),
        message: errorText(error),
        code: error?.code ?? null,
        rawLogPath: step?.rawLogPath ?? null,
        diagnostics: errorDetails(error),
      },
    };
    writeJson(absoluteOutput, receipt);
  }
  return receipt;
}

async function main(argv) {
  let options;
  try {
    options = parseCliArgs(argv);
  } catch (error) {
    console.error(`registry rn ios journey: ${errorText(error)}`);
    process.exitCode = 1;
    return;
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }
  const receipt = await runRnIosRegistryJourney(options);
  const stream = receipt.ok ? console.log : console.error;
  stream(`[registry-rn-ios] receipt: ${options.outputPath}`);
  stream(`[registry-rn-ios] logs: ${join(dirname(options.outputPath), 'registry-rn-ios-logs')}`);
  if (receipt.scratchRoot) stream(`[registry-rn-ios] scratch: ${receipt.scratchRoot}`);
  if (!receipt.ok) stream(`[registry-rn-ios] failed: ${receipt.failure.message}`);
  process.exitCode = receipt.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) await main(process.argv.slice(2));
