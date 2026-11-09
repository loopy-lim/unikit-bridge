import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertEventObservation,
  assertJourneyObservation,
  assertMutatedObservation,
  EVENT_COLLECT_STEP,
  EVENT_MARKER_PHASE,
  EVENT_TICKS,
  EVENT_VERIFY_STEP,
  isEventEvidenceComplete,
  mutateRnLibRs,
  parseCliArgs,
  parseLogcatMarker,
  renderA3EventsEntry,
  renderJourneyFindings,
  renderJourneyInputTs,
  renderMetroConfigJs,
  renderRnAppTsx,
  renderRnCargoToml,
  renderRnConfigJson,
  renderRnLibRs,
  runRnAndroidRegistryJourney,
  USAGE,
} from './registry-consumer-rn-android.mjs';
import { assertNoConsumerContamination } from './registry-consumer/provenance.mjs';

const JOURNEY_MARKER = '__UNIKIT_RN_JOURNEY__';

function validObservation(overrides = {}) {
  return {
    phase: 'baseline',
    echoResult: { message: 'registry-rn' },
    failEchoError: {
      code: 'command.invalid_args',
      message: 'registry rn journey error propagation',
    },
    ...overrides,
  };
}

test('rendered RN lib.rs mutates exactly once and ends with native_entry', () => {
  const baseline = renderRnLibRs();
  assert.match(baseline, /unikit_bridge::native_entry!\(package\);/);
  const mutated = mutateRnLibRs(baseline);
  assert.match(mutated, /pub repeat: u32/);
  assert.throws(() => mutateRnLibRs(mutated), /anchor not found/);
});

test('RN journey observation assertions mirror the bridge contract', () => {
  assert.equal(assertJourneyObservation(validObservation()), true);
  assert.throws(
    () => assertJourneyObservation(validObservation({ failEchoError: null })),
    /did not reject/,
  );
  assert.throws(
    () =>
      assertJourneyObservation(
        validObservation({ failEchoError: { code: null, message: 'different' } }),
      ),
    /cross the JSI bridge intact/,
  );
  assert.throws(
    () => assertJourneyObservation(validObservation({ journeyError: 'install failed' })),
    /install failed/,
  );
  assert.equal(
    assertMutatedObservation(
      validObservation({ phase: 'mutated', echoResult: { message: 'registry-rn', repeat: 3 } }),
    ),
    true,
  );
  assert.throws(
    () => assertMutatedObservation(validObservation({ phase: 'mutated' })),
    /repeat=3/,
  );
});

test('logcat marker parsing keeps only complete JSON for the requested phase', () => {
  const good = JSON.stringify(validObservation({ phase: 'mutated' }));
  const logcat = [
    '09-21 10:00:00.000 I/ReactNativeJS( 1234): booting',
    `09-21 10:00:01.000 I/ReactNativeJS( 1234): ${JOURNEY_MARKER}${good}`,
    `09-21 10:00:01.100 I/ReactNativeJS( 1234): ${JOURNEY_MARKER}${good.slice(0, 40)}`,
  ].join('\n');
  const parsed = parseLogcatMarker(logcat, 'mutated');
  assert.equal(parsed.echoResult.message, 'registry-rn');
  assert.equal(parseLogcatMarker(logcat, 'baseline'), null);
});

test('metro config strips .js specifiers before the default resolver', () => {
  const metro = renderMetroConfigJs();
  assert.match(metro, /moduleName\.endsWith\('\.js'\)/);
  assert.match(metro, /getDefaultConfig/);
});

test('renderers keep deterministic anchors for the RN journey', () => {
  assert.match(renderRnAppTsx(), /generated\/react-native\.js/);
  assert.match(renderRnAppTsx(), new RegExp(JOURNEY_MARKER));
  assert.doesNotMatch(renderRnAppTsx(), /subscribeEvent/);
  assert.match(renderJourneyInputTs({ phase: 'mutated', repeat: 3 }), /repeat: 3/);
  const config = JSON.parse(renderRnConfigJson());
  assert.equal(config.reactNative.rustManifest, './Cargo.toml');
  assert.match(renderRnCargoToml(), /crate-type = \["rlib", "staticlib"\]/);
});

test('contamination scan allows only the declared generated workspace package', () => {
  const root = mkdtempSync(join(tmpdir(), 'rn-contamination-'));
  try {
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        private: true,
        dependencies: {
          '@unikit/generated-react-native': 'workspace:*',
          '@unikit/react-native': '0.9.2',
        },
        workspaces: ['modules/unikit-bridge'],
      }),
    );
    writeFileSync(join(root, 'Cargo.toml'), '[package]\nname="x"\n');
    assert.doesNotThrow(() =>
      assertNoConsumerContamination(root, {
        expectedNpm: { '@unikit/react-native': '0.9.2' },
        allowedWorkspacePackages: ['@unikit/generated-react-native'],
      }),
    );
    assert.throws(
      () =>
        assertNoConsumerContamination(root, {
          expectedNpm: { '@unikit/react-native': '0.9.2' },
          allowedWorkspacePackages: [],
        }),
      /forbidden dependency source workspace:\*/,
    );
    // 다른 패키지의 workspace:* 는 허용 목록에 있어도 통과하지 않는다.
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    manifest.dependencies['@unikit/types'] = 'workspace:*';
    writeFileSync(join(root, 'package.json'), JSON.stringify(manifest));
    assert.throws(
      () =>
        assertNoConsumerContamination(root, {
          expectedNpm: { '@unikit/react-native': '0.9.2' },
          allowedWorkspacePackages: ['@unikit/generated-react-native'],
        }),
      /forbidden dependency source workspace:\*/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── --assert-events 옵트인 다리 ────────────────────────────────────────────

function eventEvidence(overrides = {}) {
  return {
    phase: EVENT_MARKER_PHASE,
    stage: 'complete',
    emitted: EVENT_TICKS,
    arrivalsAtReturn: EVENT_TICKS,
    arrivalsAtMacrotask: EVENT_TICKS,
    eventValues: [1, 2, 3],
    macrotaskReached: true,
    postMacrotaskEchoMessage: 'after-events',
    postMacrotaskEchoError: null,
    ...overrides,
  };
}

test('parseCliArgs defaults --assert-events off and accepts the flag anywhere', () => {
  const base = ['--output', '/tmp/receipt.json', '--serial', 'device-1'];
  assert.equal(parseCliArgs(base).assertEvents, false);
  assert.equal(parseCliArgs([...base, '--assert-events']).assertEvents, true);
  assert.equal(parseCliArgs(['--assert-events', ...base]).assertEvents, true);
  assert.equal(parseCliArgs([...base, '--assert-events', '--assert-events']).assertEvents, true);
  // 오타·누락은 기존 오류 경로를 그대로 쓴다.
  assert.throws(() => parseCliArgs(['--output', '/tmp/r.json', '--assert-event']), /unknown option/);
  assert.throws(
    () => parseCliArgs(['--serial', 'x', '--assert-events']),
    /--output <absolute-path> is required/,
  );
});

test('usage documents --assert-events and its post-fix device-only contract', () => {
  assert.match(USAGE, /--output <absolute-path>/);
  assert.match(USAGE, /--serial <adb-serial>/);
  assert.match(USAGE, /--assert-events/);
  assert.match(USAGE, /published adapter line/);
  assert.match(USAGE, /times out and fails the journey\s+loudly/);
  assert.match(USAGE, /not asserted on this leg/);
});

test('App renderer emits the event scenario only when the flag is on', () => {
  const off = renderRnAppTsx();
  assert.doesNotMatch(off, /subscribeEvent/);
  assert.doesNotMatch(off, /emitTicks/);
  assert.doesNotMatch(off, /phase: 'events'/);

  const on = renderRnAppTsx({ assertEvents: true });
  // 교착 재현 조건 — 동기 Rust 호출 1회 안에서 Package::emit 3회.
  assert.match(on, /await emitTicks\(\{ ticks: 3 \}\);/);
  assert.match(on, /subscribeEvent\('calc\.tick'/);
  // 마커 — 구독·리스너 도착·반환·complete.
  assert.match(on, /stage: 'subscribed'/);
  assert.match(on, /stage: 'arrival'/);
  assert.match(on, /stage: 'emit-returned'/);
  assert.match(on, /stage: 'complete'/);
  // complete 마커는 setTimeout(매크로태스크) 안에서만 발행된다 — 루프 생존 증명.
  const setTimeoutIndex = on.indexOf('setTimeout(() => {');
  const completeIndex = on.indexOf("stage: 'complete'");
  assert.ok(setTimeoutIndex > 0 && setTimeoutIndex < completeIndex);
  // 루프 생존의 두 번째 증거 — 이벤트 폭풍 뒤 다음 명령 완료.
  assert.match(on, /'after-events'/);
  // 베이스라인 다리 전용 — mutated 다리는 계약 필드 변경 증명에 쓴다.
  assert.match(on, /if \(INPUT\.phase === 'baseline'\)/);
});

test('staged events markers resolve to the complete report without touching other phases', () => {
  const stamp = (payload) =>
    `09-21 10:00:00.000 I/ReactNativeJS( 1234): ${JOURNEY_MARKER}${JSON.stringify(payload)}`;
  const logcat = [
    stamp({ phase: 'baseline', echoResult: { message: 'registry-rn' } }),
    stamp({ phase: EVENT_MARKER_PHASE, stage: 'subscribed' }),
    stamp({ phase: EVENT_MARKER_PHASE, stage: 'arrival', value: 1, arrivalsSoFar: 1 }),
    stamp({ phase: EVENT_MARKER_PHASE, stage: 'arrival', value: 2, arrivalsSoFar: 2 }),
    stamp({ phase: EVENT_MARKER_PHASE, stage: 'arrival', value: 3, arrivalsSoFar: 3 }),
    stamp({ phase: EVENT_MARKER_PHASE, stage: 'emit-returned', emitted: 3, arrivalsAtReturn: 3 }),
    stamp(eventEvidence()),
  ].join('\n');
  const events = parseLogcatMarker(logcat, EVENT_MARKER_PHASE);
  assert.equal(events.stage, 'complete');
  assert.deepEqual(events.eventValues, [1, 2, 3]);
  assert.equal(isEventEvidenceComplete(events), true);
  // 단계 마커가 다른 페이즈 해석을 오염시키지 않는다.
  assert.equal(parseLogcatMarker(logcat, 'baseline').echoResult.message, 'registry-rn');
  assert.equal(parseLogcatMarker(logcat, 'mutated'), null);
  // 교착이 살아 있으면 complete 미도달 — 중간 단계만 관측된다.
  const frozen = parseLogcatMarker(
    [stamp({ phase: EVENT_MARKER_PHASE, stage: 'emit-returned', emitted: 3, arrivalsAtReturn: 0 })].join('\n'),
    EVENT_MARKER_PHASE,
  );
  assert.equal(isEventEvidenceComplete(frozen), false);
  assert.equal(frozen.stage, 'emit-returned');
});

test('assertEventObservation enforces loop survival, count, order, and next-command completion', () => {
  assert.equal(assertEventObservation(eventEvidence()), true);
  // (a) 루프 생존 — complete 마커 미도달은 타임아웃 경로와 동일 자료형으로 실패한다.
  assert.throws(() => assertEventObservation(null), /macrotask completion marker/);
  assert.throws(
    () => assertEventObservation(eventEvidence({ stage: 'emit-returned' })),
    /macrotask completion marker/,
  );
  assert.throws(
    () => assertEventObservation(eventEvidence({ macrotaskReached: false })),
    /macrotask completion marker/,
  );
  assert.throws(() => assertEventObservation(eventEvidence({ emitted: 2 })), /emitted=3/);
  // (b) 무손실 — 누락·중복 모두 실패.
  assert.throws(
    () => assertEventObservation(eventEvidence({ eventValues: [1, 3] })),
    /lossy or duplicated/,
  );
  assert.throws(
    () => assertEventObservation(eventEvidence({ eventValues: [1, 2, 3, 2] })),
    /lossy or duplicated/,
  );
  // (b) 순서 보존 — emit 값은 index+1 이므로 원소 위치로 판정한다.
  assert.throws(
    () => assertEventObservation(eventEvidence({ eventValues: [2, 1, 3] })),
    /order violated at index 0/,
  );
  assert.throws(
    () => assertEventObservation(eventEvidence({ eventValues: [1, 3, 2] })),
    /order violated at index 1/,
  );
  // 이벤트 폭풍 뒤 다음 명령이 완료되지 않으면 실패한다.
  assert.throws(
    () =>
      assertEventObservation(
        eventEvidence({ postMacrotaskEchoMessage: null, postMacrotaskEchoError: 'bridge gone' }),
      ),
    /follow-up command/,
  );
  // arrivalsAtReturn(에필로그 drain 기대 동작)은 증거 기록이지 단언 대상이 아니다.
  assert.equal(assertEventObservation(eventEvidence({ arrivalsAtReturn: 0 })), true);
});

test('a3Events entry and findings stay non-assertive without the flag', () => {
  assert.equal(
    renderA3EventsEntry({}),
    'not asserted on this leg — see findings rn-android-event-push-deadlock; covered by the Tauri real-WebView journey',
  );
  const findings = renderJourneyFindings({});
  assert.equal(findings.length, 1);
  assert.equal(findings[0].id, 'rn-android-event-push-deadlock');
  assert.match(findings[0].consequence, /intentionally not asserted/);
});

test('a3Events entry and findings record the re-measurement honestly with the flag', () => {
  const evidence = eventEvidence();
  const entry = renderA3EventsEntry({ assertEvents: true, eventEvidence: evidence });
  assert.match(entry, /3\/3 events delivered in emit order without loss/);
  assert.match(entry, /3\/3 before the invoke returned/);
  assert.match(entry, /next macrotask/);

  const findings = renderJourneyFindings({ assertEvents: true, eventEvidence: evidence });
  assert.equal(findings[0].id, 'rn-android-event-push-reverified');
  assert.equal(findings[0].evidence.arrivalsAtReturn, 3);
  assert.deepEqual(findings[0].evidence.eventValues, [1, 2, 3]);
  assert.match(findings[0].reproduction, /inside ONE synchronous Rust invoke/);
  assert.match(findings[0].consequence, /fails the journey loudly/);
  // 역사적 교착 finding 은 남되, consequence 는 재실측 사실을 가리킨다.
  assert.equal(findings[1].id, 'rn-android-event-push-deadlock');
  assert.match(findings[1].consequence, /re-measured on this leg via --assert-events/);
});

test('runRnAndroidRegistryJourney forwards the flag to the cycle (wiring, no device)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rn-journey-wiring-'));
  const seen = [];
  const fakeCycle = async (args) => {
    seen.push({ logDir: args.logDir, serial: args.serial, assertEvents: args.assertEvents });
    return { gate: 'wiring-probe', journey: { verified: {}, findings: [] }, steps: [] };
  };
  try {
    const onReceipt = await runRnAndroidRegistryJourney({
      outputPath: join(root, 'on.json'),
      serial: 'device-9',
      assertEvents: true,
      execute: fakeCycle,
    });
    assert.equal(onReceipt.ok, true);
    assert.equal(seen[0].assertEvents, true);
    assert.equal(seen[0].serial, 'device-9');

    const offReceipt = await runRnAndroidRegistryJourney({
      outputPath: join(root, 'off.json'),
      serial: 'device-9',
      execute: fakeCycle,
    });
    assert.equal(offReceipt.ok, true);
    assert.equal(seen[1].assertEvents, false);
    assert.ok(readFileSync(join(root, 'on.json'), 'utf8').includes('"ok": true'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the opt-in event steps sit inside the baseline leg behind the flag guard', () => {
  const source = readFileSync(
    fileURLToPath(new URL('./registry-consumer-rn-android.mjs', import.meta.url)),
    'utf8',
  );
  // 플래그 가드 — 부재 시 이벤트 단계는 실행되지 않는다(기존 동작 불변).
  assert.match(
    source,
    /const eventEvidence = assertEvents \? await collectEventEvidence\(context, device\) : null;/,
  );
  assert.match(source, /if \(assertEvents\) \{\s*\n\s*internalStep\(context, EVENT_VERIFY_STEP/);
  // 단계 순서 — 베이스라인 관측 검증 뒤, 계약 변형 앞(베이스라인 다리에 속한다).
  const baselineVerify = source.indexOf("'baseline-observation-verification'");
  const eventsCollect = source.indexOf('await collectEventEvidence(context, device)');
  const mutate = source.indexOf("'mutate-contract'");
  assert.ok(
    baselineVerify > 0 && eventsCollect > baselineVerify && mutate > eventsCollect,
    'event steps must stay between baseline verification and the contract mutation',
  );
  // 수집기는 complete 마커만 승인하고 타임아웃 시 덤프를 남겨 loud-fail 한다.
  assert.match(source, /isEventEvidenceComplete\(report\)/);
  assert.match(source, /last observed stage/);
  // 단계 이름 상수는 수집기·검증 단계가 실제로 쓰는 값이다.
  assert.equal(EVENT_COLLECT_STEP, 'baseline-events-collect-evidence');
  assert.equal(EVENT_VERIFY_STEP, 'baseline-events-verification');
});
