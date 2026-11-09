English | [한국어](registry-onboarding.ko.md)

# Verify public-registry onboarding

Unikit has two distinct checks:

- `bun run test:onboarding` exercises the current checkout before publication. It injects local Cargo patches and package symlinks.
- `bun run verify:consumer:registry --output /tmp/unikit-registry/receipt.json` creates a new consumer using exact public npm and crates.io versions. It executes the published CLI, native builds, generated calls, a contract change, an upgrade and rollback. The receipt names the actual adapters and untested segments.

Three sibling journeys extend the same contract beyond the Node/Bun command line:

- `bun run verify:consumer:tauri --output <abs>/registry-tauri.json` scaffolds a registry-only Tauri consumer (`@unikit-bridge/tauri` + crates.io `unikit` with the `tauri` feature), bundles the frontend, embeds it via `generate_context!`, boots the real macOS WebView and reports observations from inside the WebView through a `reportEvidence` command on the Unikit contract itself. It covers first call, domain-error propagation, event subscribe/unsubscribe over the push sink and a contract field change with regeneration and a real-WebView re-run.
- `bun run verify:consumer:rn-android --output <abs>/registry-rn-android.json --serial <adb-serial>` scaffolds a public React Native community template (no Expo), pins the published CLI/types/adapter, lets codegen render the `unikit-bridge` native module, builds the Rust staticlib with cargo-ndk and the debug APK with Gradle, then runs it on a physical Android device and recovers JS observations from the logcat marker. The same A1/A2/A3 surface as the Tauri leg, at device-evidence level. The Android leg also accepts an opt-in `--assert-events` flag: after the fix for the emit-during-invoke JS-thread deadlock (depth guard + unified epilogue queue) reaches the published adapter line, it subscribes to `calc.tick`, fires three `Package::emit`s inside one synchronous Rust invoke — the original reproduction condition — and asserts from logcat markers that the JS event loop reaches a later macrotask and a follow-up command and that all three events arrive in emit order without loss. Run it on a physical device with adb only after the fix is published; on unfixed lines the completion marker never arrives and the journey times out and fails loudly by design, and without the flag `a3Events` stays "not asserted on this leg" exactly as before.
- `bun run verify:consumer:rn-ios --output <abs>/registry-rn-ios.json [--sim <udid-or-name>]` scaffolds the same community RN template (no Expo — unlike the Expo-prebuild-based rn-ios CI job) for iOS, pins the published CLI/types/adapter, renders the `unikit-bridge` module with its podspec, runs `pod install` (the podspec `prepare_command` builds the Rust staticlib for `aarch64-apple-ios-sim` and `x86_64-apple-ios`), builds with `xcodebuild -configuration Release -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO -derivedDataPath <fixed>`, and installs/launches the app on an iPhone simulator with `simctl launch --stdout` capture. JS observations travel back over the Unikit bridge itself — a `reportEvidence` command prints the marker to native stdout, and the journey polls the capture file mapped to the host through `SIMULATOR_SHARED_RESOURCES_DIRECTORY` (RN `console.log` only reaches os_log, never stdout). Unlike the Android leg this journey **attempts** the event push (subscribe → `emitTicks` → unsubscribe) and records the outcome honestly: it is the first live measurement of the iOS push path, so on success the receipt asserts 3/3 deliveries before unsubscribe and 0 after, and if the published adapter still deadlocks the JS thread the final report never arrives — the journey then verifies the already-delivered a2 breadcrumb evidence, records a `rn-ios-event-push-freeze-suspected` finding and fails loudly (no softening, no concealment). Running it requires macOS with Xcode, CocoaPods and an iOS simulator runtime: this is **BLOCKED** on Linux/Windows — the preflight step writes a failed receipt that says so instead of pretending; run it manually on macOS (procedure below) and commit the receipt as evidence.
- `bun run verify:consumer:diagnostics --output <abs>/registry-diagnostics.json` injects five real failure inputs — stale generated files, a stale client against a rebuilt binary, a missing native binary, an emptied `PATH` for `doctor`, and an out-of-contract payload — and requires each to fail loudly with cause, target and next action (A4).

These journeys need the same tools as the base gate plus, for the Tauri leg, nothing beyond macOS; for the RN/Android leg, the Android SDK/NDK, cargo-ndk and a connected device; for the RN/iOS leg, macOS with Xcode, CocoaPods and an iOS simulator runtime (BLOCKED elsewhere); each writes its own receipt and logs under the output directory.

The second check requires Node 22, Bun 1.4, Rust 1.88 or newer, a native linker, and registry access. It writes only the new temporary consumer, its own caches and the requested output directory. Run it from this checkout; the consumer itself must have no local Unikit dependency. The npm installer and Cargo may download dependencies, so allow time for an empty cache.

```bash
bun run test:registry-consumer
bun run verify:consumer:registry --output /tmp/unikit-registry/receipt.json
```

Use a new output directory per execution to preserve the previous receipt. The command fails at the first failing step and retains diagnostics. It checks installed package versions and sources; substituting a local checkout, Cargo patch, Git source, package override or symlink must fail. Successful process exit alone is insufficient: returned values and the changed field must match.

The default version cycle verifies the Rust upgrade `0.11.0 → 0.12.0 → 0.11.0` with `@unikit-bridge/cli` `0.12.0`, `types` `0.12.1`, `node`/`bun` `0.11.0` — the current published line, including `@unikit-bridge/tauri` `0.10.0` and `@unikit-bridge/react-native` `0.10.0` for the sibling journeys (see `scripts/registry-consumer/versions.json`). This verifies one Rust upgrade and rollback, not two successive product upgrades. Pins are deliberate: a floating `latest` could silently change the thing being verified. Review the version selection when preparing another release.

The published CLI advertises caret ranges in its own manifest (`types ^0.12.1`, `node/bun ^0.11.0`, `tauri ^0.10.0`). Caret ranges silently absorb new patches inside the published line, so the gate writes **exact** pins in consumer manifests, prepares the npm lock with `--save-exact`, installs with `npm ci`, and checks the lock and installed versions at every phase — what is verified must not move between runs. Exact pins inside the CLI's advertised range satisfy both the CLI guard and the contamination scan. A newer resolution still fails. Cargo dependencies remain exact `=0.11.0`/`=0.12.0` pins. This does not substitute local packages for the published CLI.

The manual **Registry consumer** workflow runs this check on macOS and uploads the receipt and logs even on failure. Its success is separate from the normal source CI and publishing workflows. It does not publish packages. Local results do not prove that this workflow has run.

## Running the RN/iOS journey manually on macOS

The RN/iOS leg is macOS-only (Xcode, xcrun, CocoaPods, an iOS simulator runtime and the Rust `aarch64-apple-ios-sim`/`x86_64-apple-ios` targets — `rustup target add aarch64-apple-ios-sim x86_64-apple-ios`). On Linux/Windows the journey is BLOCKED by design: its first step writes a failed receipt naming the missing tools, so the limitation is recorded instead of skipped. To run it for real:

```bash
xcode-select --install || true            # ensure the CLT/Xcode is active
rustup target add aarch64-apple-ios-sim x86_64-apple-ios
bun run verify:consumer:rn-ios --output /tmp/unikit-registry-rn-ios/registry-rn-ios.json
# optional: --sim <udid-or-name> picks a specific iPhone simulator
# (default: an already-booted iPhone, else the newest runtime's first iPhone)
```

Read the receipt's `journey.verified.a3Events` and `journey.findings` together: `rn-ios-event-push-first-measurement` records the first live iOS push-path outcome (3/3 delivered then 0 after unsubscribe, on success); `rn-ios-event-push-freeze-suspected` appears on failure when a2 evidence arrived but the events report did not — that is the honest record of a frozen JS thread, and the stdout/stderr captures under `registry-rn-ios-logs/` plus `xcrun simctl spawn booted log stream` on a re-run are the follow-up diagnostics. The whole run is simulator-level evidence; it does not claim physical-device execution.

## Known published-CLI findings (2026-09-21)

Two onboarding defects were found by the sibling journeys against published CLI `0.11.3`; both are fixed in this repository and in published CLI `0.12.0`:

1. The generated `@unikit-bridge/generated-react-native` module manifest declared `"type": "module"` while its `react-native.config.js` is CommonJS. Node-based autolinking (Gradle settings generation) silently skipped the module, so `UnikitBridge` was never linked — invisible to `bunx --bun react-native config` verification because Bun's `require` loads ESM. The renderer now omits `type` (shipped in CLI `0.12.0`); on CLI `0.11.3` or earlier the RN journey applies the same edit after codegen and records it as `workaround-published-cli-esm-module-manifest`.
2. RN CLI autolinking registers the generated module through the `node_modules` workspace symlink, so Gradle's `file()` base made the rendered relative adapter path resolve to `node_modules/node_modules/...`. Apps avoid this by pinning the dependency root in an app-owned `react-native.config.js` (the journey renders one); a renderer-side hardening is a follow-up candidate.

## Read the evidence correctly

Record the runner revision, package versions, actual adapter, OS/tool versions, step duration, generated/native hashes, lockfile/source checks and original log locations. A Bun process invoking the Node adapter proves the Node transport under Bun; only a real FFI library call proves the Bun FFI adapter.

The extended fixture checks error propagation across each adapter; it does not declare typed domain errors. Event subscribe/unsubscription is covered by the Tauri and RN journeys above on their push paths. The original Node scaffold is executed before adding that fixture.

The Node/Bun probe does not replace Tauri WebView execution, existing-app integration, RN execution on a real device, external evaluator observations or real-device lifetime tests — the Tauri, RN/Android and RN/iOS journeys now cover the first and both RN execution legs at their stated evidence levels (Android: physical device; iOS: simulator, with the event push attempted and its outcome recorded honestly). Neither proves two hours of load or four weeks of actual use. See the [current roadmap status](verification/2026-09-16-roadmap-status.md) and [roadmap acceptance criteria](specs/2026-09-14-unikit-roadmap.md).
