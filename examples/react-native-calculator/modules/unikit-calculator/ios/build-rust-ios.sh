#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
UNIKIT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

TARGET="${UNIKIT_IOS_TARGET:-aarch64-apple-ios-sim}"
CRATE_NAME="unikit-calculator-example"
LIB_NAME="libunikit_calculator_example.a"

OUT_DIR="$SCRIPT_DIR/rust/lib"
mkdir -p "$OUT_DIR"

build_target() {
  target="$1"
  echo "Building $CRATE_NAME for $target..."
  RUSTFLAGS="-C target-feature=+simd128" \
    cargo build \
      --manifest-path "$UNIKIT_ROOT/examples/calculator/Cargo.toml" \
      --lib \
      --release \
      --target "$target"
}

if [ -n "${UNIKIT_IOS_TARGET+set}" ]; then
  build_target "$TARGET"
  cp "$UNIKIT_ROOT/target/$TARGET/release/$LIB_NAME" "$OUT_DIR/"
else
  build_target aarch64-apple-ios-sim
  build_target x86_64-apple-ios
  lipo -create \
    "$UNIKIT_ROOT/target/aarch64-apple-ios-sim/release/$LIB_NAME" \
    "$UNIKIT_ROOT/target/x86_64-apple-ios/release/$LIB_NAME" \
    -output "$OUT_DIR/$LIB_NAME"
fi

echo "Copied $LIB_NAME to $OUT_DIR"
