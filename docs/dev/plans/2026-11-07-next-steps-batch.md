# 0.13.0 이후 다음 스텝 5트랙 일괄 계획

- 작성일: 2026-11-07 · SDD 파이프라인(G0–G5) 일괄 실행
- 원 요청: "unikit그 다음 스텝으로 어떻게 해야할까??" → 5개 트랙 제시 → "를 통해서 각각 모든 것들을 이용해줘."(전트랙 실행 지시)
- 기준 리비전: `b7c07503` (main, clean — 미커밋 변경 없음)
- 환경: Linux(omarchy), bun 1.4.4, node 26.13, cargo/rustc 1.95.0. adb·xcodebuild·actionlint·Android NDK 부재 → 기기·macOS·Windows 네이티브 실행 증거는 이번 로컬에서 BLOCKED로 기록.
- 위임: Agent 스폰 가능(독립 평가 직군용). 커밋·푸시·PR 병합은 사용자 승인 전 금지 — working tree에만 반영.

## 목표와 범위

1. **T1 RN 이벤트 푸시 교착 수정** — 마지막으로 남은 지원 호스트 기능 결함.
2. **T2 RN/iOS 레지스트리 여정 스크립트** — A1/A2/A3(RN/iOS 시뮬레이터) 자동 여정 구현(실행은 수동 macOS).
3. **T3 dependabot PR 7건 검증·병합 권고** — 로컬 게이트 실행 + 권고 표(병합은 승인 후).
4. **T4 M2 착수 문서 + 로드맵 상태 갱신** — 소비자 앱 선정 기준·A5/A6 프로토콜, 0.12/0.13 완료 반영.
5. **T5 11/1 플랜 후속 로컬 항목** — 예제 tsconfig 상속(AC-7), JS 대규모 할당 스트레스(AC-8), Windows 코드젠 결정론 워크플로 초안(AC-9).

제외(사유 명시):
- npm OIDC 실전 전환·브랜치 프로텍션 required check — GitHub/npm 계정 설정(사용자 작업, 11/1 플랜 T12에서 절차 문서화 완료).
- cli lint 부채 811건 + react-native-core.ts 2규칙(eslint 스코프 오프 제거) — 대규모 기계적 정리로 작업 성격이 달라 별도 배치로 분리(11/1 플랜 후속).
- 실기기·시뮬레이터 실행 증거 수집 — 환경 부재(아래 BLOCKED 기록).
- 흡수: noUncheckedIndexedAccess 로컬 오버라이드 제거(11/1 후속: packages/cli·react-native-bare-calculator)는 T5-1에 흡수 — 렌더러 플래그 정리와 같은 근본 작업의 완결 단계. 서드파티 파리티 픽스처(`examples/react-native-calculator/modules/nitro-bench`)는 대상 제외(자체 관리 벤치마크 코드).

## 수용 기준

| ID | 관찰할 결과와 적용 조건 | 담당 태스크 | 검증 ID |
|---|---|---|---|
| AC-1 | 동기 Rust 실행 중 `Package::emit`이 JS 스레드 재진입 상황에서 `CallInvoker::invokeAsync`를 우회하고 HostFunction 에필로그에서 안전하게 drain한다. 관찰 조건: (a) C++ 코드 계약 정적 검토(V1 — 스코프 가드 부착 위치·에필로그 drain의 스레드/예외/재진입 안전), (b) JS 모킹 하네스 대리 시나리오 — 모킹 네이티브 `invoke` 실행 중 `onEvent`가 동기 재진입되어도 리스너가 emit 순서대로 무손실 수신(`packages/react-native/src/index.test.ts` 신규 케이스), (c) C++ 컴파일·기기 실행은 환경 부재로 BLOCKED로 분리 기록(임의 green 테스트를 증거로 대체하지 않음) | T1-1, T1-2 | V1, V2 |
| AC-2 | 교착 수정·재검증 절차가 문서화된다(발행 라인 반영 시점 포함). rn-android 여정에 옵트인 이벤트 검증 경로가 추가된다 | T1-2, T1-3 | V2, V3 |
| AC-3 | `scripts/registry-consumer-rn-ios.mjs`(+ 단위 테스트)가 Android 다리 패턴으로 존재하고 scaffold→정확 핀→codegen→pod install→xcodebuild(시뮬)→simctl 실행→a2/a3(+이벤트 시도) 단계를 정의한다. `verify:consumer:rn-ios` 스크립트와 문서(EN/KO)가 배선된다 | T2-1 | V3, V4 |
| AC-4 | 로컬 실행 불가(macOS 전용) 한계가 여정 문서·상태 문서에 BLOCKED로 기록된다 | T2-1, T4-1 | V4 |
| AC-5 | dependabot 7건 각각의 로컬 검증 결과와 병합 권고(병합/보류+사유) 표가 산출된다(실행 시점 `gh pr list` 재확인 포함 — 2026-11-07 확인: #101~#106·#111) | T3-1 | V5 |
| AC-6 | M2 착수 문서(소비자 앱 선정 기준·후보 조건·A5/A6 프로토콜·기록 양식)가 존재하고 로드맵 상태 문서가 최신 발행 라인까지의 완료 작업 항목으로 갱신된다(버전번호가 아닌 항목 기준 — 패키지별 독립 버전 정책: cli/types 0.13.0, node/bun 0.11.1, react-native 0.11.0, react 0.8.4, tauri 0.10.1) | T4-1 | V6 |
| AC-7 | 예제 tsconfig 7종이 `tsconfig.base.json`을 상속하고 nitro 플래그가 예제+생성물에 적용되어 관련 게이트(tsc·lint·codegen-fresh)가 green이다 | T5-1 | V7 |
| AC-8 | 대규모 할당 스트레스 러너(nitro 55k 상당)가 scriptc 어댑터(calculator 스크립트 호스트) 경유로 추가된다. 통과 기준: 라운드별 정답 단언 전건 일치 + 프로세스 RSS 상한(시작 대비 배수 상한을 러너에 명시) 통과 + `test:local` 체인 편입 | T5-2 | V8 |
| AC-9 | Windows 코드젠 결정론 검증 워크플로 초안이 존재하고, actionlint를 ci.yml gate 잡과 동일한 핀 다운로드(v1.7.12)로 로컬 실행해 통과하며, YAML·관례 정합이 확인된다. Windows 러너 실제 실행만 푸시 후 확인으로 BLOCKED 기록한다 | T5-3 | V9 |

## 설계

### T1 — RN 이벤트 교착 (원인과 수정)

- **원인(코드 계약 기반)**: `EventDispatcher::onRustEvent`(UnikitJSIBridge.cpp:562)은 FFI 싱크 콜백이다. 동기 invoke(HostFunction) 실행 중 명령이 `Package::emit`을 호출하면 이 콜백이 **JS 스레드에서 재진입**되고, `scheduleDrainLocked`(:579)은 같은 JS 스레드가 동기 네이티브 호출 중인 상태에서 `CallInvoker::invokeAsync`(:591)를 호출한다. Android(RN 0.81.5 실기기 3/3)에서 이 재진입 post 직후 JS 이벤트 루프가 다음 매크로태스크 전에 정지한다(영수증: `docs/verification/evidence/2026-09-21-registry-rn-android-device.json` findings). pollMs도 같은 싱크를 공유해 우회 불가.
- **수정(초크포인트 전수 부착)**: `thread_local` 깊이 카운터(`JsNativeCallScope` RAII)를 동기적으로 Rust 코드를 실행하는 HostFunction 전체에 걸치는 **공용 초크포인트 3곳**에 부착한다(개별 진입점 12+곳을 하나씩 붙이지 않는다):
  1. `makeInvoke` 람다 본체(.cpp:1045) — `invoke`·`invokeJson`·`invokePostcardFFI`·`invokeFrame` 4변형 공용(:1070-1077).
  2. `typedInvokeTail`(.cpp:329) — typed 동기 5종(`invokeTyped`·`invokeTypedById`·`invokeTypedPos`·`invokeTypedBatch`·`invokeTypedBatchById`, 직접 호출 :437/:460 포함) 공용 테일.
  3. `UnikitSyncBinding.inc`의 `invokeRawOnCore`/`invokeBufferOnCore` 테일(.inc:80/:103) — `invokeTypedRaw`(:1402)·`invokeTypedBuffer`(:1320)와 `createNativeSyncBinding`(.inc:167)·`bindSyncCommand` 생성 함수 경유 동기 바인딩.

  추가로 비동기 디스패치 `invokeTypedAsync`·`invokeTypedAsyncById` HostFunction에도 스코프를 부착한다(G1 F-8) — 이 진입은 세 초크포인트를 지나지 않아 "깊이>0 라우팅"이 작동하지 않기 때문. 즉시 실패 완료만 이 스코프 내부에서 발생하며, 워커 완료는 나중에 별도 스레드(깊이 0)에서 도착해 기존 경로를 쓴다.
- **통합 에필로그 큐**: 깊이 > 0이면 `invokeAsync` 대신 에필로그 큐에 callable을 적재한다. 항목 3종 — ① EventDispatcher drain, ② ChannelDispatcher 드레인(일반·바이트 큐), ③ 지연된 비동기 완료 람다. 스코프 이탈(깊이 0)에서 큐를 적재 순서대로 JS 스레드에서 인라인 실행(이미 JS 스레드, rt 사용 가능 — `invokeAsync`가 한 틱 뒤에 하려던 일을 안전한 시점에 수행). **ChannelDispatcher::scheduleDrainLocked**(.cpp:836, EventDispatcher와 동일 재진입 패턴 — 동기 명령의 `ChannelHandle::send`→`ChannelHost::send`(호출 스레드에서 sink 동기 실행)→`onChannelPayload`(:757/:774)→`invokeAsync` 경로)도 같은 깊이 검사로 전환한다. 드롭-올리스트 정책·`invokerGeneration_` 재로드 무효화 계약은 양 디스패처 모두 유지.
- **비동기 즉시 실패 완료**: `invoke_frame_async_into`의 크기 게이트·백프레셔 실패는 완료 콜백을 **호출 스레드**에서 실행한다(`ffi_typed_async.rs` "크기 게이트 실패는 호출 스레드에서 즉시 완료" + .cpp 완료 람다 주석 실측). 이 경로의 `invokeAsync` 게시(.cpp:~1630)도 깊이 > 0이면 에필로그 큐로 라우팅한다(완료 람다를 에필로그에서 인라인 실행 — resolve는 JS 스레드 마이크로태스크 예약이라 안전).
- **스레드 의미론**: `thread_local` 깊이는 워커 스레드에서 항상 0이므로 워커 경로(비동기 완료·백그라운드 emit)의 `invokeAsync`는 불변. JS 스레드에서도 호출 사이(깊이 0)는 불변.
- **계약 보존**: listeners 맵은 JS 스레드 전용 계약 유지(에필로그 drain도 JS 스레드). 리스너 JSError는 drain 내 기존 격리 유지, 에필로그 pump는 추가 try/catch로 HostFunction 예약외 전파 방지. 드롭-올리스트 정책·invokerGeneration_ 재로드 무효화 계약 그대로.
- **동작 변화(문서화)**: 동기 호출 중 emit된 이벤트·채널 페이로드는 "다음 매크로태스크"가 아니라 **해당 동기 호출 반환 직전**에 전달된다. 교착 대신 즉시 전달이며 순서는 emit 순서 보존. 즉시 실패한 비동기 호출의 완료도 동일 시점에 인라인 실행된다.
- **검증 경계**: C++은 Linux에서 컴파일 불가(folly/JSI 헤더·NDK 부재 — 11/1 플랜 실측과 동일). 로컬은 정적 리뷰+TS 회귀로 한정, 실기기 재검증은 rn-android 여정 `--assert-events` 옵트인(발행 라인에 수정이 반영된 뒤)으로 연결.

### T2 — RN/iOS 레지스트리 여정

- `scripts/registry-consumer-rn-android.mjs`의 구조(정확 핀·오염 검사·runOrderedSteps·영수증)를 그대로 재사용(`registry-consumer/*.mjs` 헬퍼). 차이점만 iOS화: 커뮤니티 템플릿(RN CLI, Expo 미사용), `pod install`(podspec prepare_command이 Rust aarch64-apple-ios-sim staticlib 빌드), `xcodebuild -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO -derivedDataPath 고정`, `simctl boot/install/launch --stdout` 마커 캡처(`scripts/ci-ios-runtime-smoke.sh`의 SIMULATOR_SHARED_RESOURCES_DIRECTORY 경로 매핑 기법 재사용), 마커 회수는 logcat 대신 stdout 캡처 파일 폴링.
- 증명 범위: 공개 패키지만으로 설치·생성·네이티브 빌드·시뮬레이터 실행·도메인 에러 전파·필드 변경 재생성. 이벤트(a3Events)는 **시도 후 결과를 정직 기록** — iOS 푸시 경로 첫 실측이며 발행 어댑터에 T1 수정 전 결함이 있으면 loud-fail로 관측된다(실패 시 여정 실패로 기록, 은폐 없음).
- 배선: package.json `verify:consumer:rn-ios`, `test:registry-consumer` 유닛 체인에 `.test.mjs` 추가, `docs/registry-onboarding.md`(+ko)·로드맵 상태 문서 갱신.

### T3 — dependabot 7건

| PR | 범프 | 로컬 검증 | 병합 판정 기준 |
|---|---|---|---|
| #101 | tauri 2.11.5→2.11.6 | `cargo update` 해석 + deny + PR 체크 상태 | macOS 전용 예제 — PR 브랜치 CI green이면 병합 권고 |
| #102 | napi-derive 3.6.5→3.6.12 | `cargo check/test -p unikit-calculator-napi` + macro 회귀 | 게이트 green |
| #103 | syn 3.0.5→3.0.6 | `cargo check/test -p unikit-bridge-macros` + clippy | 게이트 green |
| #104 | napi 3.12.4→3.14.2 | `cargo check/test -p unikit-calculator-napi` + napi 스모크 | 게이트 green |
| #105 | napi-build 2.4.2→2.6.0 | 빌드 스크립트 경로 check | 게이트 green |
| #106 | dorny/paths-filter v3→v4 | ci.yml `changes` 잡 사용처 입력 호환성 대조 + 웹 릴리스 노트 | 호환 시 권고 |
| #111 | dawidd6/action-download-artifact 24→28 | 사용처(workflow) 입출력 호환 대조 + PR 체크 | 호환 시 권고 |

- 로컬 검증은 main에 범프를 임시 적용해 실행 후 되돌린다(working tree 보존). 병합 권고 표 산출 후 사용자 승인 대기.

**T3 검증 결과·권고(2026-11-07 실행 완료, V5)** — 로컬: `cargo update -p <crate> --precise` 임시 적용 → 대상 크레이트 check/test/clippy → 원복. 로그: `/tmp/t3-verify*.log`(세션 종료 후 소멸 — 핵심 결과는 아래 표에 인용).

| PR | 로컬 검증 결과 | 권고 |
|---|---|---|
| #101 tauri 2.11.6 | `cargo check -p unikit-bridge --features tauri` PASS | **병합** |
| #102 napi-derive 3.6.12 | 단독 적용 시 `calculator-napi` 컴파일 FAIL — derive-backend 6.1.6 codegen이 `napi::bindgen_prelude::defer_native_borrow_scope`를 생성하나 napi 3.14.2 런타임에 해당 함수 부재(캐시 소스 grep 실측). 런타임 ≥3.15 필요 | **보류·닫기** — 하위 조정 범프로 대체 |
| #103 syn 3.0.6 | check·test(4 pass)·clippy `-D warnings` PASS(1차 시도는 `cargo update -p syn` ambiguous 스펙으로 미적용 — `syn@3.0.5` 명시로 재검증) | **병합** |
| #104 napi 3.14.2 | 단독 PASS — 그러나 crates.io 최신 3.16.1 존재 + #102(derive)와 조합 시 FAIL | **보류·닫기** — 조정 범프로 대체 |
| #105 napi-build 2.6.0 | 단독 PASS(build 의존, 런타임 무관) | 병합 무해 — 조정 범프에 흡수 권고 |
| #106 dorny/paths-filter v4 | v4 action.yml 대조: 입력 `filters`(필수, 사용중)·출력 `changes` 동일, 런타임 node24. 기존 PR CI gate/ts-checks 실패는 동일 시점 6건 공통 = 스테일 레포 전체 실패(0.13.0 직전) | **병합**(리베이스 후 새 CI green 확인 조건) |
| #111 dawidd6/action-download-artifact v28 | 사용 입력 workflow·branch·name·path 전부 v28에 동일 존재. PR CI 풀리런 전 25잡 green(run 42061301214 — 트리거: 2026-11-05 dependabot 리베이스 pull_request 이벤트, 오케스트레이터 원격 실행 아님. 벤치 워크플로 자체는 main 전용이라 액션 실행은 병합 후 첫 벤치에서 확인) | **병합**(최우선) |

**대체 안(napi 패밀리)**: #102·#104 close 후 napi 3.16.1 + napi-derive 3.7.0 + napi-build 2.6.0 단일 조정 범프 — 로컬 check·test PASS 실측(조정 범프 검증, /tmp/t3-verify3.log [B4] 레그: `cargo update -p napi --precise 3.16.1` + `napi-derive --precise 3.7.0` + `napi-build --precise 2.6.0` → check·test 후 원복). #105는 단독 병합해도 무해하나 대체 범프에 포함해 일괄 처리 권고.

### T4 — M2 착수 문서·상태 갱신

- `docs/dev/plans/2026-11-07-m2-kickoff.md`: 소비자 앱 선정 기준(비계산기·목적 상이·최소 1개 동일 계약 2호스트), A5 업그레이드/롤백 프로토콜(기존 앱 1 Tauri + 1 RN), A6 외부 평가자 프로토콜(모집 채널=사용자 결정, 기록 최소 열은 로드맵 §4 재인용), M2 기록 양식(사용 기록·생명주기 100회·2시간 부하 레시피).
- `docs/verification/2026-09-16-roadmap-status.md` 신규 날짜 섹션: 0.12.0/0.13.0 완료 사항(function registration·bindSync·nitro 성능 시도·TS 정적 강화·sanitizer/TSan 게이트·DX 정비·안전 게이트 PR 승격), 잔여(RN 교착=T1 진행, rn-ios 여정=T2 추가, M2 미착수).

### T5 — 후속 로컬 항목

- **T5-1 tsconfig 상속**: 실측(calculator 기준) 위반은 (a) `generated/frame-codecs.ts`(렌더러 템플릿 — `packages/cli/src/codegen-postcard-*.ts` 등에서 인덱스 접근 비-옵셔널 수정 후 전 예제 재생성), (b) 예제 앱 코드(직접 수정). 이후 7종 예제 tsconfig(auth·calculator·crud·reference-app·rn-experiment·streaming·tauri-calculator)를 `extends: ../../tsconfig.base.json` + 경로 오버라이드로 전환. **완결 단계로 noUncheckedIndexedAccess 오버라이드 제거를 포함**(11/1 후속 흡수): 렌더러 정리 후 `packages/cli/tsconfig.json`의 플래그 오프 제거, `examples/react-native-bare-calculator` 재생성 후 오버라이드 제거. codegen-fresh 게이트로 생성물 정합 확인.
- **T5-2 할당 스트레스**: `examples/calculator/scriptc/` 패턴 준수 — 엔진 경유 대량 객체 할당·해제(nitro 55k 상당) 반복에서 정답 보존+RSS 상한을 단언하는 러너 추가, `test:runtime:alloc-stress` 스크립트 + `test:local` 체인 편입.
- **T5-3 Windows 워크플로**: `.github/workflows/codegen-determinism.yml`(workflow_dispatch, windows-latest, codegen 실행→git diff--exit-code로 생성물 결정론 단언). 첫 실행은 CRLF 등 차이 발견이 목적(실패도 정보). 로컬 검증은 actionlint를 ci.yml gate 잡과 동일한 핀 다운로드(v1.7.12)로 실행 — PATH 부재는 기록했으나 핀 다운로드로 실행 가능하므로 약화하지 않는다. Windows 러너 실제 실행만 푸시 후 확인(BLOCKED 기록).

## 태스크

| ID | 목적·AC | 담당 직군 | 수정할 파일/경계 | 선행 | 검증 | 상태 |
|---|---|---|---|---|---|---|
| T1-1 | 네이티브 재진입 가드+에필로그 drain·JS 대리 시나리오 (AC-1) | Backend/Core Engineer | `packages/react-native/native/cpp/UnikitJSIBridge.cpp`, `UnikitSyncBinding.inc`, `packages/react-native/src/index.test.ts`(신규 모킹 케이스만) | 없음 | V1, V2 | done(구현+자체검증 — 독립 Task QA 대기. +272/-22: 깊이 가드·에필로그 큐·초크포인트 4곳[.inc는 WithDecode 템플릿에 부착해 바운드 변형 커버]·양 디스패처+비동기 완료 2곳 라우팅. RN 90 pass·types 311 pass·test:compile 0. C++ 컴파일·기기 BLOCKED) |
| T1-2 | 교착 결함 문서 갱신+재검증 절차 (AC-2) | Backend/Core Engineer | `docs/compatibility-matrix.md`(+ko) 이벤트 셀 각주. 로드맵 상태 문서는 T4-1과 공유하므로 순차 처리 | T1-1 | V2 | done(구현+자체검증 — 독립 Task QA 대기. Events·Channels 행 RN 셀 †각주 EN/KO 대칭, '수정 완료·발행 대기' 정확 표기, test:docs 37/37 통과) |
| T1-3 | rn-android 여정 `--assert-events` 옵트인 (AC-2) | Platform/Tooling Engineer | `scripts/registry-consumer-rn-android.mjs`(+test) | T1-1 | V3 | done(구현+자체검증 — 독립 Task QA 대기. 플래그 부재 시 렌더 바이트 동일 실증, 신규 유닛 9종 포함 15/15(6→15), 마커 subscribed→arrival×N→emit-returned→complete(매크로태스크+다음 명령)+`eventValues===[1,2,3]` 단언, findings 정직 갱신. 실기기 실행은 adb 부재로 BLOCKED — 발행 후 versions.json 핀 갱신→`--assert-events` 실행→영수증 증거 커밋 절차 보고됨. 문서 제안 문구는 조율자가 registry-onboarding EN/KO에 반영 완료) |
| T2-1 | RN/iOS 여정 스크립트·배선·문서 (AC-3, AC-4) | Platform/Tooling Engineer | `scripts/registry-consumer-rn-ios.mjs`(+test), `package.json`(script), `docs/registry-onboarding.md`(+ko) | 없음 | V3, V4 | done(구현+자체검증 — 독립 Task QA 대기. 여정 1,432줄·유닛 11종. 설계 발견: RN console.log는 os_log행 → Rust println! 마커+simctl stdout 캡처, Release 번들 빌드. Linux 실행 시 정직 BLOCKED 영수증 exit 1 확인. package.json 배선은 조율자 반영 완료) |
| T3-1 | 7건 로컬 검증·권고 표 (AC-5) | Platform/Tooling Engineer | 검증만(Cargo.toml/lock 임시 적용 후 원복), 권고 표는 이 문서에 기록 | 없음 | V5 | done(권고 산출 완료 — 병합·close·대체 범프는 사용자 승인 대기) |
| T4-1 | M2 착수 문서·상태 갱신 (AC-6) | Product Manager | `docs/dev/plans/2026-11-07-m2-kickoff.md`(신규), `docs/verification/2026-09-16-roadmap-status.md` | T2-1(잔여 문구 정합) | V6 | done(구현+자체검증 — 독립 Task QA 대기. 착수 문서 6절+사용자 결정 대기 4항(소비자 앱 선정·실기기·A6 채널·교착 수정 발행), 원장 2026-11-07 라운드 신규 섹션(항목 기준 16행·잔여 전환 4건), test:docs 37/37 green) |
| T5-1 | 렌더러 플래그 클린+tsconfig 상속+오버라이드 제거 (AC-7) | Frontend/UI Engineer(TS) | `packages/cli/src/codegen-postcard-*.ts` 및 렌더러, `packages/cli/tsconfig.json`, 재생성된 `examples/*/generated/*`, 예제 앱 TS, 예제 tsconfig 7종(+`react-native-bare-calculator/tsconfig.json`) | 없음 | V7 | done(구현+자체검증 — 독립 Task QA 대기. 렌더러 19파일·위반 173→0(8프로젝트, `--showConfig` 플래그 실활성 증명)·7예제 재생성·codegen-fresh 통과·cli 509/509·cross-wire 바이트 동일성 28 pass. 통합 후속 처리: build-fingerprint 재생성(조율자 완료 — T1-1 직후 933f22c3, G3 결함 반영(pump 관측성 로그) 후 76e68758 로 재재생성·멱등), auth package.json 없음→코드젠 스크립트 추가는 워크스페이스 편입 부작용 위험으로 보류·후속 제안, check-codegen-fresh.mjs 주석 6→7개 드리프트 교정(조율자 완료)) |
| T5-2 | 할당 스트레스 러너 (AC-8) | Verification/Test Engineer | `examples/calculator/scriptc/*`(신규 러너), `package.json`(script+test:local) | 없음 | V8 | done(구현+자체검증 — 독립 Task QA 대기. 11라운드×5,000=55,000 객체·전 필드 정답 단언·RSS 상한 12×[6실측 7.19–7.75× 근거]·/proc/self/statm FFI 자체 보고·변조 빌드 실패 실증·2회 연속 PASS. package.json 배선은 조율자 반영 완료) |
| T5-3 | Windows 결정론 워크플로 (AC-9) | Platform/Tooling Engineer | `.github/workflows/codegen-determinism.yml`(신규) | 없음 | V9 | done(구현+자체검증 — 독립 Task QA 대기. actionlint v1.7.12 exit=0[shellcheck 활성 조건 포함, SC2001 사전 수정]·YAML 관례 26항목 통과. Windows 러너 실행 BLOCKED) |

병렬성: T1-1(네이티브) · T2-1(신규 스크립트) · T5-1(CLI 렌더러+예제) · T5-2(예제 scriptc) · T5-3(신규 워크플로)는 파일 소유권 무교집합 — 병렬 스폰 가능. `package.json`은 T2-1·T5-2가 모두 건드림 → package.json 편집은 조율자(오케스트레이터)가 순차 반영하거나 후행 태스크가 적용. T1-2·T3-1·T4-1은 문서·검증이라 후행.

## 검증 계획과 결과

| ID | 방법·정의 근거 | cwd·환경 | 기대 결과 | 실제 결과·증거 | 판정 |
|---|---|---|---|---|---|
| V1 | T1 diff 정적 대조: 초크포인트 3곳(makeInvoke·typedInvokeTail·.inc core 테일)이 동기 Rust 실행 HostFunction 12+ 진입을 전수 커버하는지, ChannelDispatcher·비동기 즉시 실패 경로가 에필로그 큐로 라우팅되는지, 에필로그 실행의 스레드·예외·재진입 안전성(이중 drain·drain 중 emit·JSError 격리) 검토(독립 Security & Reliability Reviewer 포함) | 리포 루트 | 재진입 경로 전부 가드(이벤트·채널·즉시 실패 완료), 워커 경로 불변, 예외 전파 없음 | **실행 완료(11/7, G3 독립 2인 교차)**: Staff Code Reviewer — HostFunction 호출지 전수 스윕으로 동기 Rust 실행은 makeInvoke 4변형·typedInvokeTail 5종+.inc 2종·비동기 디스패치 2종뿐임 실증, 초크포인트 누락·이중 drain·크로스 스레드 오염·UAF 가설 전부 코드 근거 기각. Security & Reliability Reviewer — HostFunction 26사이트 전수 열거, 가드 없는 FFI(invoke_cancel·event_sink_register·channel_drop 등)는 Rust 원본으로 emit 불가 실증(ffi_typed_async.rs 즉시 실패만 호출 스레드 완료→가드 경유 확인), RAII 소멸 순서·take-and-run·drainScheduled_·스레드 친화성(JSI 계약상 JS 스레드만 Runtime&) 정합. 판정 각 PASS(P3 관측성 결함은 반영 완료). C++ 컴파일·실기기는 환경 부재로 BLOCKED 유지(정적 분석 한정 명시) | PASS(정적 분석 한정 — 컴파일·기기 BLOCKED 분리) |
| V2 | RN 어댑터·types 기존 회귀: `bun run --cwd packages/react-native test`, `bun run --cwd packages/types test`(C++ 변경 영향 없음 확인) + 문서 정합 `bun run test:docs` | 리포 루트 | 전부 green | T1-1 직후: react-native 90 pass/0 fail(기존 89+신규 대리 1), types 311 pass/0 fail, test:compile exit 0. 통합(11/7): test:local 체인 내 packages:check green + test:docs green(유닛 37/37·docs-gate 6동기화·미러 80쌍·release-docs 6). 단 react-native 신규 테스트 prettier 서식 정정 1건 후 재통과(로직 무변경) | PASS |
| V3 | 신규/변경 스크립트 유닛: `bun run test:registry-consumer`(여정 순수 함수·단언 유닛), cli 테스트 | 리포 루트 | green | T1-3 완료 후 재실행: 체인 **59/59 pass**(rn-android 슈트 7→15). 통합(11/7): test:local 체인 내 registry-consumer 59/59 재확인 + `--cwd packages/cli test` green | PASS |
| V4 | 문서 링크·정합: `bun run test:docs` + registry-onboarding EN/KO 쌍 검사 | 리포 루트 | green, rn-ios 여정·BLOCKED 한계 기록 존재 | 통합(11/7): test:docs green(유닛 37/37·docs-gate 6동기화·미러 80쌍·release-docs 6). registry-onboarding EN/KO rn-android `--assert-events` 문구 반영(조율자, T1-3 제안 원문) 후 쌍 정합 유지 확인, rn-ios 여정·BLOCKED 기록 존재 확인 | PASS |
| V5 | PR별: `cargo update -p <crate> --precise <ver>` → 대상 크레이트 check/test/clippy → `git checkout -- Cargo.toml Cargo.lock` 원복. 액션 2건은 사용처 입력 대조+`gh pr checks` | 리포 루트 | 게이트 green 또는 사유 기록 | **실행 완료(2026-11-07)**: PR 7건 재확인(#101~#106·#111). #101/#103/#105 PASS, #102 FAIL(derive 3.6.12↔runtime 3.14.2 비호환), #104 단독 PASS(단 3.16.1 최신·#102 조합 실패), 조정 범프(3.16.1+3.7.0+2.6.0) PASS. #111 풀리런 25잡 green, #106 v4 입력 호환. 권고 표는 설계 T3 섹션 | PASS(권고 산출) |
| V6 | 문서 정합: `bun run test:docs` + 상태 문서에 0.12/0.13 섹션 존재 확인 | 리포 루트 | green | T4-1 완료 후 실행: 유닛 37/37·미러 80쌍·release-docs 6 green, 2026-11-07 라운드 섹션 존재 확인. T1-3 문서 반영(본 조율자) 후 통합(11/7) 재실행: test:local 체인 내 test:docs 재확인 green | PASS |
| V7 | `bun run build`(전 패키지) + 예별 `tsc -p`(nitro 플래그) + `bun run test:codegen-fresh:check` + `bun run lint` | 리포 루트 | 전부 green | 통합(11/7) test:local 체인 EXIT=0: build 9패키지 exit 0, test:ts:node·test:ts:bun tsc green, codegen-fresh·bindings-fresh green, eslint --max-warnings 0 green, format:check green(react-native index.test.ts prettier 정정 후), release-coherence ok(6 npm 버전·Rust 0.13.0), audit:prod·api-surface·architecture·release-tools green | PASS |
| V8 | `node examples/calculator/scriptc/run-alloc-stress.mjs`(신규) 또는 등가 러너 — 정답 보존·RSS 상한 단언 통과 | 리포 루트 | 통과 + test:local 체인에 포함 | **실행 완료(T5-2)**: 2회 연속 PASS(EXIT=0, 라운드별 RSS·headroom 기록). 55,000 객체·전 필드 정답 단언·RSS 상한 12×(실측 7.19–7.75×). `test:runtime:alloc-stress` 스크립트+`test:local` 체인 편입 완료(조율자). 통합(11/7): test:local 체인 내 3/3 PASS 재확인(rss start≈5.5MB·peak≈41MB·ceiling≈67MB·headroom≈26MB, 영수증 target/scriptc-alloc/linux-x64/release/receipt.json) | PASS |
| V9 | actionlint 핀 다운로드(v1.7.12, ci.yml gate 잡과 동일 방식) 로컬 실행 + 기존 워크플로와 스키마 대조(runner·permissions·action 핀 관례) | 리포 루트 | actionlint 통과, 관례 일치. Windows 러너 실행은 푸시 후(BLOCKED 기록) | **실행 완료(T5-3)**: `.github/workflows/codegen-determinism.yml` 신규(workflow_dispatch·windows-latest·contents:read·timeout 60m·태그 핀 관례). actionlint v1.7.12 exit=0 — ubuntu gate 러너 조건(shellcheck 예장) 재현 시 SC2001 2건 발견·수정 후에도 exit=0(푸시 후 gate red 예방). YAML 파스·관례 대조 26항목 통과. 생성물 102개 전부 `i/lf`·ODB CR 0 사전 실측, clean 필터 마스킹 허점은 CR 원시 바이트 스캔 스텝으로 보완. Windows 러너 실행 BLOCKED(푸시 후 수동 트리거 절차 주석 기록) | PASS(Windows 러너 실행 BLOCKED 분리 기록) |

## 평가와 인계

- **G0 (intake)**: 독립 `Requirements Auditor`(별도 컨텍스트) — 1차 **FAIL**(F-1~F-7) → PM 전건 반영 개정 → 재감사 **PASS**(전건 해소, 잔여 N-1~N-3 모두 P3 — 인용 행번호·상태 표기·승인 범위 문구 정정 완료).
- **G1 (plan)**: 독립 `Architecture & Plan Reviewer` — 1차 **FAIL**(F-1 P1 가드 부착점 나열 불완전, F-2 P1 ChannelDispatcher 형제 경로 누락, F-3 P2 비동기 즉시 실패 완료의 호출 스레드 invokeAsync, F-4~F-7 P3 서류. T2~T5 경로·명령·패턴 대조는 전부 실존 확인됨). → PM이 F-1~F-3 코드 실증 재확인 후 설계 개정(초크포인트 3곳 전수 부착·통합 에필로그 큐로 이벤트+채널+즉시 실패 완료 통합, V1 기준 갱신), F-4~F-7 정정 → **델타 재감사 PASS**(F-1~F-7 전건 해소 — 초크포인트 호출 그래프·FFI 호출지 전수 스윕으로 12+ 진입 커버 실증. 잔여 F-8 P3 비동기 디스패치 미경유로 라우팅 미작동 → 스코프 부착으로 반영, F-9 P3 초크포인트 2/3 분류 귀속 정정 — 둘 다 본 개정에 반영 완료).
- **G2 (task)**: 독립 `Task QA Validator`(별도 컨텍스트) — **PASS 9/9**. 태스크별 파일·코드 대조 + 경량 재실행(RN 90/90, 여정 android 15/15·ios 11/11, cli 509/509+45/45, tsc --showConfig 3건, YAML 파스, 영수증 파싱, gh 읽기 조회). 환경 부재 항목 전부 BLOCKED 정직 기록 확인(PASS 둔갑 없음). F-1~F-5 전부 P3 서류 정정 — 본 배치에서 반영 완료(플랜 수치 3건·원장 시점 1건·워크플로 주석 1건).
- **G3 (code)**: 독립 `Staff Code Reviewer` — **PASS**(P0~P2 0건, P3 4건: pump 무음 catch(반영), 워크플로 주석 rn-experiment 누락(반영), rn-ios 단계 플랜 핀 미비(반영 — 플랜 상수에 mutated-codegen·mutated-contract-hash-verification 핀+유닛 보강), 원장 시점 문구(반영)). 독립 `Security & Reliability Reviewer` — **PASS(정적 분석 한정)**(P3 7건: pump catch 로그(반영), id 가시성·배치 세분성 문서(반영 — 매트릭스 각주), untracked 단언(반영 — 워크플로), 워커 post 추론 한계(실기기 BLOCKED와 동일 조건·잔여 한계로 기록), 여정 앱 정리·러너 그룹 킬(후속 제안)). C++ 컴파일·실기기 BLOCKED는 양 리뷰 모두 명시.
- **G3 결함 반영 후 재검증(조율자)**: C++ pump 로그 1줄 반영 → build-fingerprint 재생성(76e68758, 멱등) → rn-ios 유닛 11/11 재통과(플랜 핀 변경 포함) → 워크플로 스크립트 bash -n·구조 확인 → 영향받은 검증 재실행 전부 green: react-native 패키지 테스트 exit 0, `test:app:react-native` 타입체크(신규 지문 반영) exit 0, `test:codegen-fresh:check` exit 0(유닛 12/12), `test:registry-consumer` 59/59, `test:docs` 37/37·미러·release-docs green.
- **통합(G2 마지막 단계)**: `bun run test:local` 전체 체인 **EXIT=0**(2026-11-07, /tmp/integration-test-local.log — 빌드 9패키지·lint·format·audit:prod·cli 테스트·api-surface·codegen-fresh·bindings-fresh·architecture·release-tools·여정 체인 59/59·런타임 node/crud/bun/scriptc/scriptc:stress·alloc-stress 3/3(RSS start≈5.5MB·peak≈41MB·ceiling≈67MB)·types 311·packages:check·onboarding watch node·bun·test:docs). 최초 실행에서 react-native 신규 테스트 prettier 서식 미준수로 format:check 실패 1회 → 서식만 정정 후 재실행 전체 green(로직 무변경, RN 테스트 재통과로 확인).
- **G4 (usability·design)**: **N/A** — 본 배치 9태스크 전부 비UI 변경(네이티브 C++·스크립트·CI·문서·tsconfig·렌더러 논널 단언). 사용자 관찰 가능한 UI·정보 구조·상태 전이 변화 없음.
- **G5 (completion)**: 독립 `Release Gatekeeper`(별도 컨텍스트) — **총괄 PASS**. AC-1~AC-9 전건 최신 증거 충족(AC-1(c)·AC-9 Windows 실행 BLOCKED 정직 분리), P0~P2 0건, stale PASS 0건(스냅셋·증거 렌즈가 mtime 축+지문 76e68758 독립 재계산으로 실증). 신규 F-1 P3(check-codegen-fresh.test.ts 'six'→7 명명 드리프트)·F-2 P3(델타 후 actionlint 재실행 증거 부재) — **둘 다 판정 후 조율자 반영·폐쇄 완료**: F-1 테스트 제목·목록 rn-experiment 포함 정정+유닛 12/12 재통과, F-2 actionlint v1.7.12 최종 스냅샷 재실행 exit 0. 평가 한계 명시: 요구 추적성 렌즈 보고 미수령(게이트키퍼 직접 AC↔T↔V 전수 대조로 대체·제2 독립 재검 미수행), C++ 컴파일·실기기·시뮬·Windows 러너는 G5에서도 실행 불가(정적 검토 한계 G3와 동일). 사용자 승인 대기 ①~⑤가 다음 관문.
- **사용자 결정 대기 목록**(로컬 수행은 막히지 않음, 각 항목의 직후 단계를 게이트): ① M2 소비자 앱·실기기 대상 선정(roadmap-status §4), ② A6 외부 평가자 모집 채널·연락 권한, ③ npm OIDC 전환·브랜치 프로텍션 required check(GitHub/npm 설정), ④ T3 처방 승인 — 병합 4건(#101·#103·#106·#111) + close 2건(#102·#104) + 대체 조정 범프 PR 생성(napi 3.16.1·derive 3.7.0·build 2.6.0) 포함, ⑤ 최종 커밋·푸시·발행 승인.
- 다음 행동: G1 판정 반영 후 T1-1·T2-1·T5-1·T5-2·T5-3 병렬 구현 스폰 → 통합 → G2 Task QA → G3 Staff Code Review(+Security & Reliability: T1 동시성) → G4 N/A(비UI) → G5 Release Gatekeeper.
- 막힌 조건(환경): T1 C++ 컴파일·실기기 재검증(adb·NDK 부재 — 발행 라인 반영 후 `--assert-events`로 연결), T2 macOS 실행(xcodebuild 부재 — 수동 워크플로 트리거), T5-3 Windows 러너 실행.
