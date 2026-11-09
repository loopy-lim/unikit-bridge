// scriptc 대규모 할당 스트레스 러너 — 11/1 플랜 후속 "JS 런타임 대규모 메모리
// 스트레스(55k 스타일)"의 실행 게이트(2026-11-07 계획 T5-2·AC-8).
//
// run-stress.mjs 와 같은 구조(버전 핀·fnm 폴백·영수증·로그)로 calculator 엔진
// staticlib 을 링크한 scriptc 네이티브 실행 파일을 만들고, alloc-stress-app.ts 가
// 라운드별 5,000노드 × 11라운드 = 55,000 객체(nitro 벤치마크 55k 상당)를 엔진
// 경유로 할당·해제하며 전 필드 정답을 단정한다. 러너는 실행별 출력에서 RSS 를
// 파싱해 상한을 재검증한다(이중 검증 — 바이너리 내부 즉시 검사 + 러너 재확인).
//
// ── RSS 상한 상수와 측정 근거 ─────────────────────────────────────────────
// 1) RSS_CEILING_MULTIPLIER = 12 — 스트레스 대상 프로세스(네이티브 실행 파일)의
//    시작 RSS 대비 peak RSS 상한 배수. 측정(2026-11-07, Linux 6.2.8 x86_64,
//    node 26.13 / scriptc 0.2.1, 연속 6회 실행): 시작 5.48–5.73MB, peak
//    41.0–42.5MB, peak/시작 비 7.19–7.75×. 최악 실측 7.75× 의 ~1.55배 여유로
//    12× 를 채택했다(환경·페이지 캐시 변동 흡수). 이 값이 여전히 누수를 잡는지:
//    라운드당 트리 전체가 누수라면(~7MB/라운드, 11라운드 누적 ~77MB) 상한
//    12×≈66MB 는 5라운드 내에 초과되어 loud-fail 한다.
// 2) RUNNER_RSS_CEILING_MULTIPLIER = 2 — 이 러너(node) 자체의
//    process.memoryUsage().rss 상한 배수(시작 대비 샘플 최댓값). 측정(같은 환경,
//    3회 실행 러너): 시작 55.4MB, peak 60.2MB = 1.09× — 2× 는 그 여유 배수다.
//    대상 바이너리는 scriptc 런타임이라 process.memoryUsage 가 없어(SC0001
//    실측) 1)의 측정은 /proc/self/statm FFI 로 바이너리가 스스로 보고하고,
//    러너 쪽 process.memoryUsage().rss 는 러너 자체 수집(자식 stdout 버퍼·영수증·
//    해시)의 gross 회귀를 묶는다. 입력 해시는 42MB 아카이브를 통째로 올리지
//    않도록 1MiB 스트리밍(readSync)으로 읽는다(run-stress.mjs 의 readFileSync
//    방식에서 의도적으로 벗어남 — 러너 RSS 를 낮게 유지하기 위함).
//
// 사용법: node examples/calculator/scriptc/run-alloc-stress.mjs [--runs=1..100]

import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RSS_CEILING_MULTIPLIER = 12;
const RUNNER_RSS_CEILING_MULTIPLIER = 2;
const EXPECTED_PASS =
  'scriptc alloc-stress PASS rounds=11 nodesPerRound=5000 objects=55000 echoOk=11 storeOk=11 residentOk=11 indexedOk=11 missOk=11 releaseOk=11';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const countFlag = process.argv.slice(2).find((value) => value.startsWith('--runs='));
const runs = countFlag ? Number(countFlag.slice(7)) : 3;
const unknown = process.argv.slice(2).filter((value) => value !== countFlag);
if (unknown.length || !Number.isInteger(runs) || runs < 1 || runs > 100) {
  throw new Error('usage: node run-alloc-stress.mjs [--runs=1..100]');
}
const buildRoot = resolve(root, 'target/scriptc-alloc', `${process.platform}-${process.arch}`);
const output = resolve(buildRoot, 'release');
mkdirSync(output, { recursive: true });
const runnerRss = () => process.memoryUsage().rss;
const runnerRssStart = runnerRss();
let runnerRssPeak = runnerRssStart;
function runnerRssSample() {
  const value = runnerRss();
  if (value > runnerRssPeak) runnerRssPeak = value;
  return value;
}
const receipt = {
  recordedAt: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  mode: 'release',
  runs,
  rssCeilingMultiplier: RSS_CEILING_MULTIPLIER,
  runnerRssCeilingMultiplier: RUNNER_RSS_CEILING_MULTIPLIER,
  status: 'running',
  sanitizerScope: 'none — ASan 레인은 run-stress.mjs --sanitize 소관(계측 시 RSS 배수 의미가 달라 이 게이트는 release 로 한정)',
  commands: [],
  sourceHashes: {},
  runsEvidence: [],
};
// 대용량 입력(33MB staticlib 등)도 러너 RSS 상한을 지키기 위해 청크로 스트리밍 해시.
function hash(path) {
  const digest = createHash('sha256');
  const chunk = Buffer.allocUnsafe(1024 * 1024);
  const fd = openSync(path, 'r');
  try {
    for (;;) {
      const read = readSync(fd, chunk, 0, chunk.length, null);
      if (read === 0) break;
      digest.update(read === chunk.length ? chunk : chunk.subarray(0, read));
    }
  } finally {
    closeSync(fd);
  }
  return digest.digest('hex');
}
function run(command, args, label, timeout = 120_000) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    detached: process.platform !== 'win32',
    killSignal: 'SIGKILL',
  });
  if (result.error && result.pid && process.platform !== 'win32') {
    try {
      process.kill(-result.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  writeFileSync(resolve(output, `${label}.log`), `${result.stdout ?? ''}${result.stderr ?? ''}`);
  receipt.commands.push({
    command,
    args,
    label,
    exitCode: result.status,
    signal: result.signal,
    error: result.error?.message,
  });
  if (result.error || result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    throw new Error(
      `${label} failed (${result.error?.message ?? result.signal ?? result.status}); see ${output}/${label}.log`,
    );
  }
  return result.stdout;
}
// 스트레스 바이너리 표준 출력에서 라운드·RSS 라인을 파싱해 러너가 상한을 재검증.
function metric(line, key) {
  const match = new RegExp(`(?:^| )${key}=(\\d+)(?: |$)`).exec(line);
  return match === null ? NaN : Number(match[1]);
}
function parseRunEvidence(stdout, index) {
  const lines = stdout.split('\n');
  const passLines = lines.filter((line) => line === EXPECTED_PASS);
  const roundLines = lines.filter((line) => line.startsWith('alloc round '));
  const rssLine = lines.find((line) => line.startsWith('alloc rss '));
  if (passLines.length !== 1)
    throw new Error(`run-${index} did not produce exactly one complete alloc-stress result`);
  if (roundLines.length !== 11)
    throw new Error(`run-${index} produced ${roundLines.length} round lines, expected 11`);
  if (!rssLine) throw new Error(`run-${index} produced no rss summary line`);
  const evidence = {
    start: metric(rssLine, 'start'),
    peak: metric(rssLine, 'peak'),
    end: metric(rssLine, 'end'),
    ceiling: metric(rssLine, 'ceiling'),
    multiplier: metric(rssLine, 'multiplier'),
    rounds: roundLines.map((line) => ({
      allocRss: metric(line, 'allocRss'),
      echoRss: metric(line, 'echoRss'),
      releaseRss: metric(line, 'releaseRss'),
    })),
  };
  const numbers = [
    evidence.start,
    evidence.peak,
    evidence.end,
    ...evidence.rounds.flatMap((round) => [round.allocRss, round.echoRss, round.releaseRss]),
  ];
  if (numbers.some((entry) => !Number.isFinite(entry) || entry <= 0))
    throw new Error(`run-${index} rss output was not fully parseable: ${rssLine}`);
  if (evidence.multiplier !== RSS_CEILING_MULTIPLIER)
    throw new Error(`run-${index} binary ran with multiplier ${evidence.multiplier}, expected ${RSS_CEILING_MULTIPLIER}`);
  const ceiling = Math.ceil(evidence.start * RSS_CEILING_MULTIPLIER);
  if (evidence.ceiling !== ceiling)
    throw new Error(`run-${index} binary ceiling ${evidence.ceiling} != ${ceiling} (start × ${RSS_CEILING_MULTIPLIER})`);
  const worst = Math.max(...numbers);
  if (worst > ceiling)
    throw new Error(
      `run-${index} rss ${worst} exceeded ceiling ${ceiling} (start ${evidence.start} × ${RSS_CEILING_MULTIPLIER})`,
    );
  if (evidence.peak < evidence.start || evidence.end < evidence.start)
    throw new Error(`run-${index} implausible rss trend: start=${evidence.start} peak=${evidence.peak} end=${evidence.end}`);
  return { ...evidence, worst, headroomBytes: ceiling - worst, lines: roundLines.length };
}
try {
  const pin = /SCRIPTC_VERSION=([0-9.]+)/.exec(
    readFileSync(resolve(root, 'examples/calculator/scriptc/run.sh'), 'utf8'),
  )?.[1];
  const direct = spawnSync('scriptc', ['--version'], { encoding: 'utf8', timeout: 10_000 });
  // scriptc 는 engines: node >=24 라 로컬 PATH 에 없으면 fnm 26 으로 폴백한다
  // (run.sh·run-stress.mjs 와 같은 규약 — CI ts-runtime 은 setup-node 26 이다).
  const compiler = direct.error?.code === 'ENOENT' ? 'fnm' : 'scriptc';
  const prefix = compiler === 'fnm' ? ['exec', '--using', '26', '--', 'scriptc'] : [];
  const version = run(compiler, [...prefix, '--version'], 'compiler-version', 10_000).trim();
  if (!pin || version !== pin) throw new Error(`scriptc ${pin} required, received ${version}`);
  receipt.scriptc = version;
  receipt.head = run('git', ['rev-parse', 'HEAD'], 'head', 10_000).trim();
  receipt.rustc = run('rustc', ['-Vv'], 'rustc', 10_000).trim();
  run('cargo', ['build', '--release', '-p', 'rustra-calculator-example', '--lib'], 'engine-build');
  const archive = resolve(root, 'target/release/librustra_calculator_example.a');
  receipt.archiveSha256 = hash(archive);
  const inputs = [
    'examples/calculator/scriptc/alloc-stress-app.ts',
    'examples/calculator/scriptc/run-alloc-stress.mjs',
    'examples/calculator/scriptc/ffi.json',
    'examples/calculator/scriptc/scriptc-ffi.ts',
    'examples/calculator/src/parity_bench.rs',
    'examples/calculator/src/lib.rs',
    'crates/rustra/src/ffi_sync_entries.rs',
    'crates/rustra/src/ffi_buffer_entries.rs',
    'crates/rustra/src/ffi_prelude.rs',
  ];
  for (const input of inputs) receipt.sourceHashes[input] = hash(resolve(root, input));
  // 커밋된 ffi.json 의 descriptor 전부에 libc 측정 심볼(open/read/close/getpagesize)
  // 만 추가한다(run-stress.mjs 의 fixture 함수 추가와 같은 확장 방식).
  const manifest = JSON.parse(
    readFileSync(resolve(root, 'examples/calculator/scriptc/ffi.json'), 'utf8'),
  );
  manifest.libraries = [archive];
  for (const [name, symbol, params, returns] of [
    ['alloc_open_readonly', 'open', ['string', 'i32'], 'i32'],
    ['alloc_read_buf', 'read', ['i32', 'mutable-bytes'], 'i64'],
    ['alloc_close_fd', 'close', ['i32'], 'i32'],
    ['alloc_page_size', 'getpagesize', [], 'i32'],
  ])
    manifest.functions.push({ name, symbol, params, returns });
  const manifestPath = resolve(output, 'alloc-ffi.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const binary = resolve(output, 'scriptc-alloc-stress');
  run(
    compiler,
    [
      ...prefix,
      'build',
      'examples/calculator/scriptc/alloc-stress-app.ts',
      '--ffi',
      manifestPath,
      '-o',
      binary,
    ],
    'native-build',
  );
  receipt.binarySha256 = hash(binary);
  runnerRssSample();
  for (let index = 1; index <= runs; index += 1) {
    const stdout = run(binary, [String(RSS_CEILING_MULTIPLIER)], `run-${index}`, 60_000);
    const evidence = parseRunEvidence(stdout, index);
    receipt.runsEvidence.push(evidence);
    runnerRssSample();
    console.log(
      `scriptc alloc-stress release ${index}/${runs}: PASS (rss start=${evidence.start} peak=${evidence.peak} ceiling=${evidence.ceiling} headroom=${evidence.headroomBytes})`,
    );
  }
  const changed = inputs.filter(
    (input) => receipt.sourceHashes[input] !== hash(resolve(root, input)),
  );
  receipt.changedInputs = changed;
  if (changed.length) throw new Error(`source changed during validation: ${changed.join(', ')}`);
  const runnerPeak = runnerRssSample();
  const runnerCeiling = runnerRssStart * RUNNER_RSS_CEILING_MULTIPLIER;
  receipt.runnerRss = { start: runnerRssStart, peak: runnerPeak, ceiling: runnerCeiling };
  if (runnerPeak > runnerCeiling)
    throw new Error(
      `runner rss ${runnerPeak} exceeded ceiling ${runnerCeiling} (start ${runnerRssStart} × ${RUNNER_RSS_CEILING_MULTIPLIER})`,
    );
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.error = error.message;
  process.exitCode = 1;
  console.error(error.message);
} finally {
  writeFileSync(resolve(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`scriptc alloc-stress receipt: ${output}/receipt.json`);
}
