import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  RN_IOS_STEP_PLAN,
  assertEventObservation,
  assertJourneyObservation,
  assertMutatedObservation,
  assertStepsFollowPlan,
  findReport,
  lastReportStage,
  mutateRnIosLibRs,
  parseCliArgs,
  parseStdoutReports,
  renderAppReactNativeConfigJs,
  renderJourneyInputTs,
  renderMetroConfigJs,
  renderRnIosAppTsx,
  renderRnIosCargoToml,
  renderRnIosConfigJson,
  renderRnIosLibRs,
  runRnIosRegistryJourney,
  selectSimulatorDevice,
} from './registry-consumer-rn-ios.mjs';

const JOURNEY_MARKER = '__RUSTRA_RN_IOS_JOURNEY__';

function validFinalObservation(overrides = {}) {
  return {
    phase: 'baseline',
    stage: 'events',
    echoResult: { message: 'registry-rn-ios' },
    failEchoError: {
      code: 'command.invalid_args',
      message: 'registry rn-ios journey error propagation',
    },
    eventsBeforeUnsubscribe: 3,
    eventsAfterUnsubscribe: 0,
    firstEmitted: 3,
    secondEmitted: 2,
    ...overrides,
  };
}

test('CLI args require an absolute output, accept --sim and --help, reject the unknown', () => {
  assert.throws(() => parseCliArgs([]), /--output <absolute-path> is required/);
  assert.throws(() => parseCliArgs(['--output', 'relative.json']), /--output <absolute-path>/);
  assert.throws(() => parseCliArgs(['--output', '/tmp/r.json', '--device', 'x']), /unknown option/);
  assert.deepEqual(parseCliArgs(['--output', '/tmp/r.json', '--sim', 'IPHONE-1']), {
    outputPath: '/tmp/r.json',
    sim: 'IPHONE-1',
  });
  assert.deepEqual(parseCliArgs(['--help']), { help: true });
});

test('rendered RN/iOS lib.rs reports evidence over stdout and mutates exactly once', () => {
  const baseline = renderRnIosLibRs();
  assert.match(baseline, /rustra::native_entry!\(package\);/);
  assert.match(baseline, /package\.register_ffi\(\);/);
  // 증거 회신 채널 — println! 이 stdout 캡처로 가는 마커를 찍는다.
  assert.match(
    baseline,
    new RegExp(`writeln!\\(handle, "${JOURNEY_MARKER}\\{\\}", input.payload\\)`),
  );
  assert.match(
    baseline,
    /fn report_evidence\(input: ReportEvidenceInput\) -> Result<ReportEvidenceOutput>/,
  );
  const mutated = mutateRnIosLibRs(baseline);
  assert.match(mutated, /pub repeat: u32/);
  assert.throws(() => mutateRnIosLibRs(mutated), /anchor not found/);
});

test('rendered app reports breadcrumbs in order and attempts the event push', () => {
  const app = renderRnIosAppTsx();
  const ready = app.indexOf("report('ready', {})");
  const commands = app.indexOf("report('commands'");
  const events = app.indexOf("report('events'");
  const subscribe = app.indexOf("subscribeEvent('calc.tick'");
  const firstEmit = app.indexOf('emitTicks({ ticks: 3 })');
  const unsubscribe = app.indexOf('unsubscribe();');
  const secondEmit = app.indexOf('emitTicks({ ticks: 2 })');
  assert.ok(ready !== -1 && commands !== -1 && events !== -1, 'breadcrumbs exist');
  assert.ok(ready < commands && commands < events, 'ready → commands → events order');
  assert.ok(subscribe !== -1 && subscribe < firstEmit, 'subscribes before the first emit');
  assert.ok(unsubscribe !== -1 && unsubscribe < secondEmit, 'unsubscribes before the second emit');
  assert.match(app, /generated\/react-native\.js/);
  assert.match(app, new RegExp(JOURNEY_MARKER));
  assert.match(app, /reportEvidence\(/);
});

test('RN/iOS journey observation assertions mirror the bridge contract', () => {
  assert.equal(assertJourneyObservation(validFinalObservation()), true);
  assert.throws(
    () => assertJourneyObservation(validFinalObservation({ failEchoError: null })),
    /did not reject/,
  );
  assert.throws(
    () =>
      assertJourneyObservation(
        validFinalObservation({ failEchoError: { code: null, message: 'different' } }),
      ),
    /cross the JSI bridge intact/,
  );
  assert.throws(
    () => assertJourneyObservation(validFinalObservation({ echoResult: { message: 'other' } })),
    /echo result message mismatch/,
  );
  assert.throws(
    () => assertJourneyObservation(validFinalObservation({ journeyError: 'install failed' })),
    /install failed/,
  );
});

test('event assertions loud-fail on any delivery deviation (first live iOS measurement)', () => {
  assert.equal(assertEventObservation(validFinalObservation()), true);
  assert.throws(
    () => assertEventObservation(validFinalObservation({ eventsBeforeUnsubscribe: 2 })),
    /expected 3 calc\.tick events before unsubscribe, saw 2/,
  );
  assert.throws(
    () => assertEventObservation(validFinalObservation({ eventsAfterUnsubscribe: 2 })),
    /kept arriving after unsubscribe: 2/,
  );
  assert.throws(
    () => assertEventObservation(validFinalObservation({ secondEmitted: 0 })),
    /emitTicks\(ticks: 2\) returned/,
  );
  const mutated = validFinalObservation({
    phase: 'mutated',
    echoResult: { message: 'registry-rn-ios', repeat: 3 },
  });
  assert.equal(assertMutatedObservation(mutated), true);
  assert.throws(
    () => assertMutatedObservation(validFinalObservation({ phase: 'mutated' })),
    /repeat=3/,
  );
});

test('stdout marker parsing keeps only complete JSON and the requested phase/stage', () => {
  const good = JSON.stringify(validFinalObservation({ phase: 'mutated' }));
  const stdout = [
    'some native noise line',
    `${JOURNEY_MARKER}${JSON.stringify({ phase: 'mutated', stage: 'commands', echoResult: { message: 'registry-rn-ios' } })}`,
    `${JOURNEY_MARKER}${good}`,
    `${JOURNEY_MARKER}${good.slice(0, 40)}`,
  ].join('\n');
  const reports = parseStdoutReports(stdout);
  assert.equal(reports.length, 2, 'truncated lines are not evidence');
  const final = findReport(reports, 'mutated', 'events');
  assert.equal(final.echoResult.message, 'registry-rn-ios');
  assert.equal(findReport(reports, 'baseline', 'events'), null);
  assert.equal(lastReportStage(reports, 'mutated'), 'events');
  assert.equal(lastReportStage(reports, 'baseline'), null);
  assert.deepEqual(parseStdoutReports('no markers here'), []);
});

test('simulator selection prefers a booted iPhone, then the newest runtime', () => {
  const devicesJson = {
    devices: {
      'iOS 17.5': [
        { udid: 'IPAD-1', name: 'iPad (10th generation)', isAvailable: true, state: 'Shutdown' },
        { udid: 'IPHONE-OLD', name: 'iPhone 15', isAvailable: true, state: 'Shutdown' },
      ],
      'iOS 18.2': [
        { udid: 'IPHONE-A', name: 'iPhone 16', isAvailable: true, state: 'Shutdown' },
        { udid: 'IPHONE-B', name: 'iPhone 16 Pro', isAvailable: true, state: 'Booted' },
        { udid: 'IPHONE-OFF', name: 'iPhone 16e', isAvailable: false, state: 'Shutdown' },
      ],
    },
  };
  assert.equal(selectSimulatorDevice(devicesJson).udid, 'IPHONE-B');
  const shutdown = structuredClone(devicesJson);
  shutdown.devices['iOS 18.2'][1].state = 'Shutdown';
  const newest = selectSimulatorDevice(shutdown);
  assert.equal(newest.udid, 'IPHONE-A');
  assert.equal(newest.runtime, 'iOS 18.2');
  assert.equal(selectSimulatorDevice(devicesJson, 'IPHONE-OLD').udid, 'IPHONE-OLD');
  assert.equal(selectSimulatorDevice(devicesJson, 'iPhone 16 Pro').udid, 'IPHONE-B');
  assert.throws(() => selectSimulatorDevice(devicesJson, 'iPhone 99'), /not an available iPhone/);
  assert.throws(
    () =>
      selectSimulatorDevice({
        devices: {
          'iOS 18.2': [{ udid: 'IPAD-2', name: 'iPad Air', isAvailable: true, state: 'Shutdown' }],
        },
      }),
    /no available iPhone/,
  );
});

test('step plan guard accepts interleaved steps and rejects reordering or gaps', () => {
  const plan = ['preflight', 'scaffold', 'build'];
  assert.equal(
    assertStepsFollowPlan(['preflight', 'env', 'scaffold', 'link', 'build'], plan),
    true,
  );
  assert.throws(
    () => assertStepsFollowPlan(['scaffold', 'preflight', 'build'], plan),
    /do not follow the designed plan/,
  );
  assert.throws(() => assertStepsFollowPlan(['preflight', 'build'], plan), /expected scaffold/);
  assert.throws(() => assertStepsFollowPlan([], plan), /do not follow the designed plan/);
});

test('the designed RN/iOS pipeline order is scaffold → pins → pod/xcodebuild → simulator → a2/a3 → cleanup', () => {
  const indexOf = (name) => RN_IOS_STEP_PLAN.indexOf(name);
  assert.equal(RN_IOS_STEP_PLAN[0], 'preflight-macos-toolchain');
  assert.ok(indexOf('rn-init') < indexOf('pin-npm-versions'));
  assert.ok(indexOf('pin-npm-versions') < indexOf('baseline-codegen'));
  assert.ok(indexOf('baseline-codegen') < indexOf('baseline-pod-install'));
  assert.ok(indexOf('baseline-pod-install') < indexOf('baseline-xcodebuild'));
  assert.ok(indexOf('baseline-xcodebuild') < indexOf('baseline-collect-evidence'));
  assert.ok(indexOf('baseline-collect-evidence') < indexOf('mutate-contract'));
  assert.ok(indexOf('mutate-contract') < indexOf('mutated-force-pod-reprepare'));
  assert.ok(indexOf('mutate-contract') < indexOf('mutated-codegen'));
  assert.ok(indexOf('mutated-codegen') < indexOf('mutated-force-pod-reprepare'));
  assert.ok(indexOf('mutated-xcodebuild') < indexOf('mutated-contract-hash-verification'));
  assert.ok(indexOf('mutated-contract-hash-verification') < indexOf('mutated-launch-app'));
  assert.ok(indexOf('mutated-collect-evidence') < indexOf('uninstall-app'));
  assert.equal(RN_IOS_STEP_PLAN[RN_IOS_STEP_PLAN.length - 1], 'uninstall-app');
});

test('renderers keep deterministic anchors for the RN/iOS journey', () => {
  const config = JSON.parse(renderRnIosConfigJson());
  assert.equal(config.reactNative.rustManifest, './Cargo.toml');
  const cargo = renderRnIosCargoToml();
  assert.match(cargo, /crate-type = \["rlib", "staticlib"\]/);
  assert.match(cargo, /\[\[bin\]\]\nname = "generate"/);
  assert.match(renderMetroConfigJs(), /moduleName\.endsWith\('\.js'\)/);
  assert.match(
    renderAppReactNativeConfigJs(),
    /root: path\.resolve\(__dirname, 'modules', 'rustra-bridge'\)/,
  );
  assert.match(renderJourneyInputTs({ phase: 'mutated', repeat: 3 }), /repeat: 3/);
});

test('receipt wiring round-trips an injected execution and preserves honest findings on failure', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rn-ios-journey-test-'));
  try {
    const outputPath = join(root, 'receipt.json');
    const success = await runRnIosRegistryJourney({
      outputPath,
      sim: null,
      execute: async ({ logDir, sim }) => {
        assert.equal(sim, null);
        assert.ok(existsSync(logDir));
        return {
          gate: 'injected-gate',
          journey: { verified: { a2FirstCall: 'injected' }, findings: [], excluded: [] },
          steps: [{ name: 'injected', ok: true }],
          scratchRoot: null,
        };
      },
    });
    assert.equal(success.ok, true);
    assert.equal(success.gate, 'injected-gate');
    assert.equal(success.evidenceBoundary.includes('iOS simulator'), true);
    assert.ok(existsSync(outputPath));
    assert.equal(JSON.parse(readFileSync(outputPath, 'utf8')).ok, true);

    const failurePath = join(root, 'failure.json');
    const failure = await runRnIosRegistryJourney({
      outputPath: failurePath,
      sim: 'IPHONE-B',
      execute: async () => {
        const error = new Error(
          'final baseline event report never arrived on the stdout capture within 180000ms',
        );
        error.journeyFinding = {
          id: 'rn-ios-event-push-freeze-suspected',
          summary: 'a2 commands evidence was delivered, then no events report arrived',
        };
        error.partialObservations = { phase: 'baseline', stage: 'commands' };
        throw error;
      },
    });
    assert.equal(failure.ok, false);
    assert.match(failure.failure.message, /never arrived/);
    assert.equal(failure.journey.findings[0].id, 'rn-ios-event-push-freeze-suspected');
    assert.equal(failure.partialObservations.stage, 'commands');
    assert.equal(JSON.parse(readFileSync(failurePath, 'utf8')).ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
