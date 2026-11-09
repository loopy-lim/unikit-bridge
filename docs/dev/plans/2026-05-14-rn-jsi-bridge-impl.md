# RN JSI Direct Bridge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Expo Module bridge with a raw JSI HostObject to reduce React Native invocation latency from ~52.5µs to ~8-12µs.

**Architecture:** A byte-tunnel C++ JSI HostObject passes raw bytes between JS (via ArrayBuffer) and Rust (via FFI). The C++ layer is protocol-agnostic — currently JSON flows as bytes, future binary protocols require zero C++ changes. The Expo Module is removed entirely.

**Tech Stack:** Rust (extern "C" FFI), C++ (JSI HostObject), Objective-C++ (RN module registration), TypeScript (engine adapter), CocoaPods (build integration), Hermes (JS runtime)

---

### Task 1: Add byte-buffer FFI to Rust calculator example

Add `unikit_calculator_invoke_bytes` and `unikit_calculator_free_buffer` alongside the existing string-based FFI. These are the entry points the C++ bridge will call.

**Files:**

- Modify: `examples/calculator/src/lib.rs`

**Step 1: Write the failing test**

Add a test at the bottom of `examples/calculator/src/lib.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::CString;

    #[test]
    fn test_invoke_bytes_round_trip() {
        let input = r#"{"command":"addNumbers","args":{"a":42,"b":58}}"#;
        let payload = input.as_bytes();
        let mut out_len: usize = 0;

        let result_ptr = unsafe {
            unikit_calculator_invoke_bytes(payload.as_ptr(), payload.len(), &mut out_len)
        };

        assert!(!result_ptr.is_null());
        assert!(out_len > 0);

        let result_bytes = unsafe { std::slice::from_raw_parts(result_ptr, out_len) };
        let result_str = std::str::from_utf8(result_bytes).unwrap();
        let result: serde_json::Value = serde_json::from_str(result_str).unwrap();

        assert_eq!(result["ok"], true);
        assert_eq!(result["result"]["value"], 100);

        unsafe { unikit_calculator_free_buffer(result_ptr, out_len) };
    }

    #[test]
    fn test_invoke_bytes_null_payload() {
        let mut out_len: usize = 0;
        let result = unsafe { unikit_calculator_invoke_bytes(std::ptr::null(), 0, &mut out_len) };
        assert!(result.is_null());
    }

    #[test]
    fn test_invoke_bytes_bad_json() {
        let payload = b"not json";
        let mut out_len: usize = 0;
        let result_ptr = unsafe {
            unikit_calculator_invoke_bytes(payload.as_ptr(), payload.len(), &mut out_len)
        };
        assert!(!result_ptr.is_null());
        let result_bytes = unsafe { std::slice::from_raw_parts(result_ptr, out_len) };
        let result_str = std::str::from_utf8(result_bytes).unwrap();
        assert!(result_str.contains(r#""ok":false"#));
        unsafe { unikit_calculator_free_buffer(result_ptr, out_len) };
    }
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p unikit-calculator-example -- test_invoke_bytes`
Expected: FAIL — function does not exist yet

**Step 3: Write minimal implementation**

Add these functions to `examples/calculator/src/lib.rs` (before the `#[cfg(test)]` module):

```rust
#[unsafe(no_mangle)]
pub unsafe extern "C" fn unikit_calculator_invoke_bytes(
    payload: *const u8,
    payload_len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    if payload.is_null() || out_len.is_null() {
        return std::ptr::null_mut();
    }

    if payload_len > MAX_PAYLOAD_BYTES {
        let error = format!(r#"{{"ok":false,"error":"payload exceeds size limit"}}"#);
        return alloc_response(error.into_bytes(), out_len);
    }

    let bytes = unsafe { std::slice::from_raw_parts(payload, payload_len) };

    let payload_str = match std::str::from_utf8(bytes) {
        Ok(s) => s,
        Err(e) => {
            let error = format!(r#"{{"ok":false,"error":"payload was not UTF-8: {e}"}}"#);
            return alloc_response(error.into_bytes(), out_len);
        }
    };

    let c_payload = match CString::new(payload_str) {
        Ok(c) => c,
        Err(_) => {
            let error = r#"{"ok":false,"error":"payload contained null byte"}"#;
            return alloc_response(error.as_bytes().to_vec(), out_len);
        }
    };

    let result_ptr = unsafe { unikit_calculator_invoke(c_payload.as_ptr()) };
    let result_cstr = unsafe { std::ffi::CStr::from_ptr(result_ptr) };
    let result_bytes = result_cstr.to_bytes().to_vec();
    unsafe { unikit_calculator_free_string(result_ptr) };

    alloc_response(result_bytes, out_len)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn unikit_calculator_free_buffer(ptr: *mut u8, len: usize) {
    if !ptr.is_null() && len > 0 {
        unsafe {
            let slice = std::slice::from_raw_parts_mut(ptr, len);
            let _ = Box::from_raw(slice as *mut [u8]);
        }
    }
}

fn alloc_response(data: Vec<u8>, out_len: *mut usize) -> *mut u8 {
    unsafe { *out_len = data.len() };
    let boxed: Box<[u8]> = data.into_boxed_slice();
    Box::into_raw(boxed) as *mut u8
}
```

**Step 4: Run tests to verify they pass**

Run: `cargo test -p unikit-calculator-example -- test_invoke_bytes`
Expected: all 3 tests PASS

**Step 5: Commit**

```bash
git add examples/calculator/src/lib.rs
git commit -m "feat(calculator): add byte-buffer FFI entry points for JSI bridge"
```

---

### Task 2: Create the JSI native module directory structure

Create the new native module that will replace the Expo Module. This module installs a JSI HostObject globally accessible as `globalThis.__unikitNative`.

**Files:**

- Create: `examples/react-native-calculator/modules/unikit-jsi/package.json`
- Create: `examples/react-native-calculator/modules/unikit-jsi/react-native.config.js`
- Create: `examples/react-native-calculator/modules/unikit-jsi/src/index.ts`
- Create: `examples/react-native-calculator/modules/unikit-jsi/tsconfig.json`

**Step 1: Create package.json**

`examples/react-native-calculator/modules/unikit-jsi/package.json`:

```json
{
  "name": "unikit-jsi",
  "version": "1.0.0",
  "main": "src/index.ts",
  "private": true
}
```

**Step 2: Create react-native.config.js**

`examples/react-native-calculator/modules/unikit-jsi/react-native.config.js`:

```js
module.exports = {
  dependency: {
    platforms: {
      ios: {
        podspecPath: './ios/UnikitJSI.podspec',
      },
    },
  },
};
```

**Step 3: Create src/index.ts**

`examples/react-native-calculator/modules/unikit-jsi/src/index.ts`:

```typescript
/**
 * Type declaration for the JSI-installed native bridge.
 * The C++ module installs `globalThis.__unikitNative` at startup.
 */
export type UnikitNative = {
  invoke(packageId: string, payload: ArrayBuffer): ArrayBuffer;
};

declare global {
  // eslint-disable-next-line no-var
  var __unikitNative: UnikitNative | undefined;
}

export function getUnikitNative(): UnikitNative {
  const native = globalThis.__unikitNative;
  if (!native) {
    throw new Error(
      'UnikitJSI native module not installed. ' +
        'Make sure the native module is linked and the app is rebuilt.',
    );
  }
  return native;
}
```

**Step 4: Create tsconfig.json**

`examples/react-native-calculator/modules/unikit-jsi/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**Step 5: Commit**

```bash
git add examples/react-native-calculator/modules/unikit-jsi/
git commit -m "feat(rn): scaffold JSI native module package structure"
```

---

### Task 3: Create the C++ JSI bridge and ObjC++ module

This is the core of the implementation. The C++ HostObject receives ArrayBuffer from JS, passes raw bytes to Rust FFI, and returns the result as ArrayBuffer. The ObjC++ wrapper registers this as a React Native module.

**Files:**

- Create: `examples/react-native-calculator/modules/unikit-jsi/ios/UnikitJSIBridge.hpp`
- Create: `examples/react-native-calculator/modules/unikit-jsi/ios/UnikitJSIBridge.cpp`
- Create: `examples/react-native-calculator/modules/unikit-jsi/ios/UnikitJSIModule.mm`

**Step 1: Create C++ header**

`examples/react-native-calculator/modules/unikit-jsi/ios/UnikitJSIBridge.hpp`:

```cpp
#pragma once

#include <jsi/jsi.h>
#include <memory>
#include <string>

namespace unikit {

// Rust FFI declarations
extern "C" {
  uint8_t* unikit_calculator_invoke_bytes(
    const uint8_t* payload, size_t payload_len, size_t* out_len);
  void unikit_calculator_free_buffer(uint8_t* ptr, size_t len);
}

class UnikitHostObject : public facebook::jsi::HostObject {
public:
  facebook::jsi::Value get(
    facebook::jsi::Runtime& rt,
    const facebook::jsi::PropNameID& name) override;

  void set(
    facebook::jsi::Runtime& rt,
    const facebook::jsi::PropNameID& name,
    const facebook::jsi::Value& value) override {}

  std::vector<facebook::jsi::PropNameID> getPropertyNames(
    facebook::jsi::Runtime& rt) override;
};

void installUnikitJSI(facebook::jsi::Runtime& rt);

} // namespace unikit
```

**Step 2: Create C++ implementation**

`examples/react-native-calculator/modules/unikit-jsi/ios/UnikitJSIBridge.cpp`:

```cpp
#include "UnikitJSIBridge.hpp"
#include <cstring>
#include <jsi/jsi.h>

namespace unikit {

using namespace facebook::jsi;

static Value createArrayBuffer(Runtime& rt, const uint8_t* data, size_t size) {
  Function arrayBufferCtor = rt.global()
    .getPropertyAsFunction(rt, "ArrayBuffer");
  Object ab = arrayBufferCtor.callAsConstructor(rt, static_cast<double>(size))
    .getObject(rt);
  ArrayBuffer buf = ab.getArrayBuffer(rt);
  std::memcpy(buf.data(rt), data, size);
  return ab;
}

static std::pair<const uint8_t*, size_t> extractBytes(Runtime& rt, const Value& value) {
  auto obj = value.asObject(rt);

  // Direct ArrayBuffer
  if (obj.isArrayBuffer(rt)) {
    auto buf = obj.getArrayBuffer(rt);
    return {buf.data(rt), buf.size(rt)};
  }

  // TypedArray — get underlying ArrayBuffer via .buffer property
  auto bufferProp = obj.getProperty(rt, "buffer");
  if (bufferProp.isObject() && bufferProp.asObject(rt).isArrayBuffer(rt)) {
    auto buf = bufferProp.asObject(rt).getArrayBuffer(rt);
    auto byteOffset = static_cast<size_t>(obj.getProperty(rt, "byteOffset").asNumber());
    auto byteLength = static_cast<size_t>(obj.getProperty(rt, "byteLength").asNumber());
    return {buf.data(rt) + byteOffset, byteLength};
  }

  throw JSError(rt, "UnikitJSI: expected ArrayBuffer or TypedArray");
}

Value UnikitHostObject::get(Runtime& rt, const PropNameID& name) {
  auto propName = name.utf8(rt);

  if (propName == "invoke") {
    return Function::createFromHostFunction(
      rt, name, 2,
      [](Runtime& rt, const Value&, const Value* args, size_t count) -> Value {
        if (count < 2) {
          throw JSError(rt, "UnikitJSI.invoke requires 2 arguments: (packageId, payload)");
        }

        auto [data, size] = extractBytes(rt, args[1]);

        size_t out_len = 0;
        uint8_t* result = unikit_calculator_invoke_bytes(data, size, &out_len);

        if (!result) {
          throw JSError(rt, "UnikitJSI: Rust returned null (invalid payload)");
        }

        auto returnValue = createArrayBuffer(rt, result, out_len);
        unikit_calculator_free_buffer(result, out_len);
        return returnValue;
      });
  }

  return Value::undefined();
}

std::vector<PropNameID> UnikitHostObject::getPropertyNames(Runtime& rt) {
  return {PropNameID::forAscii(rt, "invoke")};
}

void installUnikitJSI(Runtime& rt) {
  auto hostObject = std::make_shared<UnikitHostObject>();
  auto obj = Object::createFromHostObject(rt, hostObject);
  rt.global().setProperty(rt, "__unikitNative", Value(rt, obj));
}

} // namespace unikit
```

**Step 3: Create ObjC++ module wrapper**

`examples/react-native-calculator/modules/unikit-jsi/ios/UnikitJSIModule.mm`:

```objc
#import <React/RCTBridgeModule.h>
#import <React/RCTBridge+Private.h>
#import <React/RCTCxxBridge.h>
#import <jsi/jsi.h>

#import "UnikitJSIBridge.hpp"

@interface UnikitJSI : NSObject <RCTBridgeModule>
@end

@implementation UnikitJSI

RCT_EXPORT_MODULE(UnikitJSI)

- (void)setBridge:(RCTBridge *)bridge {
  RCTCxxBridge *cxxBridge = (RCTCxxBridge *)bridge;
  if (!cxxBridge.runtime) {
    return;
  }

  unikit_bridge::installUnikitJSI(*cxxBridge.runtime);
}

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

@end
```

**Step 4: Commit**

```bash
git add examples/react-native-calculator/modules/unikit-jsi/ios/
git commit -m "feat(rn): add C++ JSI HostObject and ObjC++ module registration"
```

---

### Task 4: Create podspec and Rust build script

Wire up the build system so CocoaPods compiles the C++ bridge and links it with the Rust static library.

**Files:**

- Create: `examples/react-native-calculator/modules/unikit-jsi/ios/UnikitJSI.podspec`
- Create: `examples/react-native-calculator/modules/unikit-jsi/ios/build-rust-ios.sh`

**Step 1: Create podspec**

`examples/react-native-calculator/modules/unikit-jsi/ios/UnikitJSI.podspec`:

```ruby
Pod::Spec.new do |s|
  s.name           = 'UnikitJSI'
  s.version        = '1.0.0'
  s.summary        = 'Unikit JSI Bridge for React Native'
  s.author         = ''
  s.homepage       = 'https://github.com/loopy-lim/unikit'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.prepare_command = 'sh build-rust-ios.sh'
  s.vendored_libraries = 'rust/lib/libunikit_calculator_example.a'

  s.source_files = "**/*.{h,mm,hpp,cpp}"

  s.dependency 'React-jsi'
  s.dependency 'React-RCTBridge'

  install_modules_dependencies(s)

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'OTHER_LDFLAGS' => '$(inherited) -force_load ${PODS_TARGET_SRCROOT}/rust/lib/libunikit_calculator_example.a',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
  }
end
```

**Step 2: Create build script**

`examples/react-native-calculator/modules/unikit-jsi/ios/build-rust-ios.sh`:

```sh
#!/bin/sh
set -eu

MODULE_DIR=$(cd "$(dirname "$0")/.." && pwd)
REPO_ROOT=$(cd "$MODULE_DIR/../../.." && pwd)
TARGET=${UNIKIT_IOS_TARGET:-aarch64-apple-ios-sim}
CARGO_BIN=${CARGO_BIN:-"$HOME/.cargo/bin/cargo"}
RUSTUP_BIN=${RUSTUP_BIN:-"$(dirname "$CARGO_BIN")/rustup"}
RUST_HOME=$(cd "$(dirname "$RUSTUP_BIN")/../.." && pwd)
export CARGO_HOME=${CARGO_HOME:-"$RUST_HOME/.cargo"}
export RUSTUP_HOME=${RUSTUP_HOME:-"$RUST_HOME/.rustup"}
export RUSTUP_TOOLCHAIN=${RUSTUP_TOOLCHAIN:-stable-aarch64-apple-darwin}
export RUSTC=${RUSTC:-"$("$RUSTUP_BIN" which rustc)"}

"$CARGO_BIN" build \
  --manifest-path "$REPO_ROOT/Cargo.toml" \
  -p unikit-calculator-example \
  --lib \
  --release \
  --target "$TARGET"

mkdir -p "$MODULE_DIR/ios/rust/lib"
cp "$REPO_ROOT/target/$TARGET/release/libunikit_calculator_example.a" \
  "$MODULE_DIR/ios/rust/lib/libunikit_calculator_example.a"
```

**Step 3: Make build script executable**

Run: `chmod +x examples/react-native-calculator/modules/unikit-jsi/ios/build-rust-ios.sh`

**Step 4: Commit**

```bash
git add examples/react-native-calculator/modules/unikit-jsi/ios/UnikitJSI.podspec
git add examples/react-native-calculator/modules/unikit-jsi/ios/build-rust-ios.sh
git commit -m "feat(rn): add CocoaPods podspec and Rust iOS build script for JSI module"
```

---

### Task 5: Rewrite packages/react-native for byte-buffer JSI engine

Replace the Expo Module adapter with a JSI byte-buffer engine. The engine takes a JSI native module reference and uses `TextEncoder`/`TextDecoder` to convert JSON to/from `Uint8Array` bytes.

**Files:**

- Modify: `packages/react-native/src/index.ts`

**Step 1: Rewrite the adapter**

Replace the entire contents of `packages/react-native/src/index.ts`:

```typescript
export type UnikitJSINative = {
  invoke(payload: ArrayBuffer): ArrayBuffer;
};

export type ReactNativeEngineClient = {
  invoke<T>(command: string, args?: unknown): Promise<T>;
};

export function createReactNativeEngine(native: UnikitJSINative): ReactNativeEngineClient {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return {
    invoke<T>(command: string, args?: unknown): Promise<T> {
      const json = JSON.stringify({ command, args });
      const payload = encoder.encode(json);
      const resultBytes = native.invoke(payload.buffer);
      const resultJson = decoder.decode(resultBytes);
      const response = JSON.parse(resultJson) as {
        ok: boolean;
        result?: T;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(response.error ?? 'Unikit invoke failed');
      }
      return Promise.resolve(response.result as T);
    },
  };
}
```

**Step 2: Verify types compile**

Run: `cd packages/react-native && npx tsc --noEmit`
Expected: PASS (no type errors)

**Step 3: Commit**

```bash
git add packages/react-native/src/index.ts
git commit -m "feat(rn): rewrite react-native adapter for byte-buffer JSI engine"
```

---

### Task 6: Update example app

Wire up the example app to use the new JSI module instead of the Expo Module. Update the benchmark to compare JSI bridge vs Nitro.

**Files:**

- Modify: `examples/react-native-calculator/package.json`
- Modify: `examples/react-native-calculator/BenchmarkApp.tsx`
- Modify: `examples/react-native-calculator/index.ts` (if exists and needs changes)

**Step 1: Update package.json dependencies**

Remove `unikit-calculator` (Expo module) and add `unikit-jsi`:

In `examples/react-native-calculator/package.json`, change dependencies:

```diff
- "unikit-calculator": "file:./modules/unikit-calculator"
+ "unikit-jsi": "file:./modules/unikit-jsi"
```

Keep `nitro-bench` for comparison.

**Step 2: Update BenchmarkApp.tsx**

Replace `examples/react-native-calculator/BenchmarkApp.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { NitroModules } from 'react-native-nitro-modules';
import { addNumbers } from '../calculator/generated/commands';
import { createReactNativeEngine } from '../../packages/react-native/src';
import { getUnikitNative } from './modules/unikit-jsi/src';

// ── Helpers ──────────────────────────────────────────────

function bar(value: number, max: number, width = 25): string {
  const filled = Math.max(1, Math.round((value / max) * width));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function formatNs(ns: number): string {
  if (ns >= 1_000_000) return `${(ns / 1_000_000).toFixed(2)} ms`;
  if (ns >= 1_000) return `${(ns / 1_000).toFixed(1)} µs`;
  return `${ns.toFixed(0)} ns`;
}

function formatOps(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

type BenchResult = {
  label: string;
  avg: number;
  p50: number;
  p99: number;
  ops: number;
};

async function measure(
  label: string,
  fn: () => Promise<unknown>,
  iterations = 10_000,
): Promise<BenchResult> {
  for (let i = 0; i < 500; i++) await fn();

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push((performance.now() - start) * 1_000_000);
  }
  times.sort((a, b) => a - b);

  const avg = times.reduce((s, t) => s + t, 0) / times.length;
  const p50 = times[Math.floor(times.length * 0.5)];
  const p99 = times[Math.floor(times.length * 0.99)];
  const ops = 1_000_000_000 / avg;

  return { label, avg, p50, p99, ops };
}

// ── Benchmark Runner ─────────────────────────────────────

async function runBenchmarks(): Promise<string[]> {
  const lines: string[] = [];
  const log = (s: string) => lines.push(s);

  const unikitNative = getUnikitNative();
  const engine = createReactNativeEngine(unikitNative);

  // Load Nitro HybridObject
  const nitroBench = NitroModules.createHybridObject<{
    add(a: number, b: number): number;
  }>('NitroBench');

  log('╔════════════════════════════════════════════════╗');
  log('║    Unikit JSI vs Nitro (iOS Simulator)        ║');
  log('╚════════════════════════════════════════════════╝');
  log('');

  // 1. Nitro (JSI C++ direct)
  log('┌─ Nitro Modules (JSI C++ HybridObject) ────────┐');
  const nitroResult = await measure('NitroBench.add', () =>
    Promise.resolve(nitroBench.add(42, 58)),
  );
  log(`│  10,000 iterations`);
  log(
    `│  avg: ${formatNs(nitroResult.avg).padStart(10)}  p50: ${formatNs(nitroResult.p50).padStart(10)}  p99: ${formatNs(nitroResult.p99).padStart(10)}`,
  );
  log(`│  ${formatOps(nitroResult.ops)} ops/sec`);
  log('└───────────────────────────────────────────────┘');
  log('');

  // 2. Unikit JSI
  log('┌─ Unikit JSI (byte buffer + Rust FFI) ─────────┐');
  const unikitResult = await measure('addNumbers (JSI)', () =>
    addNumbers(engine, { a: 42, b: 58 }),
  );
  log(`│  10,000 iterations`);
  log(
    `│  avg: ${formatNs(unikitResult.avg).padStart(10)}  p50: ${formatNs(unikitResult.p50).padStart(10)}  p99: ${formatNs(unikitResult.p99).padStart(10)}`,
  );
  log(`│  ${formatOps(unikitResult.ops)} ops/sec`);
  log('└───────────────────────────────────────────────┘');
  log('');

  // 3. Head-to-head
  log('╔════════════════════════════════════════════════╗');
  log('║         Head-to-Head Comparison               ║');
  log('╠════════════════════════════════════════════════╣');
  log('│');

  const allResults = [
    { name: 'Nitro (JSI C++)', result: nitroResult },
    { name: 'Unikit JSI', result: unikitResult },
  ];

  const maxAvg = Math.max(...allResults.map((r) => r.result.avg));
  for (const r of allResults) {
    const b = bar(r.result.avg, maxAvg);
    log(`│  ${r.name.padEnd(24)} ${b} ${formatNs(r.result.avg)}`);
  }

  log('│');
  const ratio = unikitResult.avg / nitroResult.avg;
  const overhead = unikitResult.avg - nitroResult.avg;
  log(`│  Unikit JSI / Nitro = ${ratio.toFixed(1)}x`);
  log(`│  Unikit overhead: ${formatNs(overhead)}`);
  log('╚════════════════════════════════════════════════╝');

  return lines;
}

// ── UI ───────────────────────────────────────────────────

export default function App() {
  const [output, setOutput] = useState<string[]>(['Running benchmarks...']);

  useEffect(() => {
    runBenchmarks()
      .then(setOutput)
      .catch((e) => setOutput([String(e)]));
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll}>
        {output.map((line, i) => (
          <Text key={i} style={styles.text}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    padding: 16,
    paddingTop: 60,
  },
  scroll: {
    flex: 1,
  },
  text: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: '#e0e0e0',
    lineHeight: 16,
  },
});
```

**Step 3: Update index.ts if it references old module**

Check and update `examples/react-native-calculator/index.ts` — it should register the benchmark app:

```ts
import { registerRootComponent } from 'expo';
import App from './BenchmarkApp';

registerRootComponent(App);
```

**Step 4: Commit**

```bash
git add examples/react-native-calculator/package.json
git add examples/react-native-calculator/BenchmarkApp.tsx
git add examples/react-native-calculator/index.ts
git commit -m "feat(rn): update example app to use JSI bridge instead of Expo Module"
```

---

### Task 7: Remove old Expo Module

Delete the Expo Module that is being replaced by the JSI bridge.

**Files:**

- Delete: `examples/react-native-calculator/modules/unikit-calculator/` (entire directory)

**Step 1: Remove the Expo module directory**

Run: `rm -rf examples/react-native-calculator/modules/unikit-calculator`

**Step 2: Verify package.json no longer references it**

Check `examples/react-native-calculator/package.json` — should already be updated in Task 6 to use `unikit-jsi` instead of `unikit-calculator`.

**Step 3: Commit**

```bash
git add -A examples/react-native-calculator/modules/unikit-calculator
git commit -m "chore(rn): remove Expo Module replaced by JSI bridge"
```

---

### Task 8: Build and verify

Build the Rust library, install pods, compile the iOS app, and run benchmarks.

**Step 1: Build Rust for iOS simulator**

Run: `cd examples/react-native-calculator/modules/unikit-jsi/ios && sh build-rust-ios.sh`
Expected: `libunikit_calculator_example.a` created in `modules/unikit-jsi/ios/rust/lib/`

**Step 2: Install npm dependencies**

Run: `cd examples/react-native-calculator && npm install`

**Step 3: Install CocoaPods**

Run: `cd examples/react-native-calculator/ios && bundle exec pod install`
Expected: UnikitJSI pod installed and linked. Watch for any compilation errors in the C++ bridge.

**Step 4: Build the iOS app**

Run: `cd examples/react-native-calculator && npx expo run:ios`
Expected: App builds and launches in simulator

**Step 5: Run benchmarks**

The app auto-runs benchmarks on launch. Compare the results:

- **Before (Expo):** ~52.5µs
- **Target (JSI):** ~8-12µs
- **Nitro reference:** ~5-7µs

**Step 6: Record results and commit if successful**

If benchmarks show improvement, no additional commit needed. If issues arise, debug the C++ bridge.

---

### Task 9: Update Podfile (if needed)

The Podfile may need adjustments to properly link the JSI module without the Expo autolinking for the removed module.

**Files:**

- May modify: `examples/react-native-calculator/ios/Podfile`

**Step 1: After `pod install`, check for errors**

If autolinking fails because `unikit-calculator` is no longer found, run:

Run: `cd examples/react-native-calculator && npx react-native-clean-project`

Then re-run `npm install && cd ios && pod install`.

**Step 2: Verify autolinking picks up new module**

Run: `cd examples/react-native-calculator && npx react-native config`
Expected: `unikit-jsi` listed under dependencies with iOS platform pointing to the podspec.

**Step 3: Commit Podfile changes if any**

```bash
git add examples/react-native-calculator/ios/Podfile examples/react-native-calculator/ios/Podfile.lock
git commit -m "chore(rn): update Podfile for JSI module"
```

---

## Task Summary

| #   | Task                    | Key Files                                                       |
| --- | ----------------------- | --------------------------------------------------------------- |
| 1   | Rust byte-buffer FFI    | `examples/calculator/src/lib.rs`                                |
| 2   | JSI module scaffold     | `modules/unikit-jsi/{package.json,react-native.config.js,src/}` |
| 3   | C++ JSI bridge + ObjC++ | `modules/unikit-jsi/ios/{Bridge.hpp,Bridge.cpp,Module.mm}`      |
| 4   | Podspec + build script  | `modules/unikit-jsi/ios/{UnikitJSI.podspec,build-rust-ios.sh}`  |
| 5   | Rewrite RN adapter      | `packages/react-native/src/index.ts`                            |
| 6   | Update example app      | `{BenchmarkApp.tsx,package.json,index.ts}`                      |
| 7   | Remove Expo Module      | Delete `modules/unikit-calculator/`                             |
| 8   | Build & verify          | `cargo build`, `pod install`, `expo run:ios`                    |
| 9   | Fix Podfile if needed   | `ios/Podfile`                                                   |
