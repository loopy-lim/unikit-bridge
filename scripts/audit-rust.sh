#!/usr/bin/env bash
set -euo pipefail

# Tauri 2.11.x still ships GTK3 bindings on Linux and its current tauri-utils
# release still uses the rust-unic identifier crates. These advisories have no
# patched Tauri 2 dependency path yet. Keep the exception set exact so every new
# advisory, including informational and soundness warnings, fails this gate.
tauri_upstream_advisories=(
  RUSTSEC-2024-0370 # proc-macro-error via glib/gtk macros
  RUSTSEC-2024-0411 # gdkwayland-sys
  RUSTSEC-2024-0412 # gdk
  RUSTSEC-2024-0413 # atk
  RUSTSEC-2024-0414 # gdkx11-sys
  RUSTSEC-2024-0415 # gtk
  RUSTSEC-2024-0416 # atk-sys
  RUSTSEC-2024-0417 # gdkx11
  RUSTSEC-2024-0418 # gdk-sys
  RUSTSEC-2024-0419 # gtk3-macros
  RUSTSEC-2024-0420 # gtk-sys
  RUSTSEC-2024-0429 # glib VariantStrIter soundness, fixed only in GTK4-era glib
  RUSTSEC-2025-0075 # unic-char-range via tauri-utils
  RUSTSEC-2025-0080 # unic-common via tauri-utils
  RUSTSEC-2025-0081 # unic-char-property via tauri-utils
  RUSTSEC-2025-0098 # unic-ucd-version via tauri-utils
  RUSTSEC-2025-0100 # unic-ucd-ident via tauri-utils
  # askama_derive 0.16.1(tauri-codegen 경유, 0.16 최신)이 아직 basic-toml 을
  # 쓴다 — unmaintained 어드바이저리이고 askama 상위 해소까지 예외한다.
  # askama 가 basic-toml 을 떼는 버전이 나오면 즉시 이 예외를 제거한다.
  RUSTSEC-2026-0374 # basic-toml unmaintained via askama_derive (tauri-codegen)
  # chrono 는 이 워크스페이스에서 컴파일되지 않는다 — cargo tree -i chrono
  # --target all -e all --all-features 로 어느 feature 조합에서도 의존
  # 그래프에 없음을 확인했다. Cargo.lock 이 그래프 내 크레이트의 optional
  # 의존까지 기재하는 탓에 tauri-utils → serde_with(optional chrono_0_4)
  # 경로로 lock 항목만 존재한다. RUSTSEC-2026-0543 은 patched=[] (전 버전
  # unmaintained)이라 버전 상향이 불가능하고, tauri-utils 2.10.3 ·
  # 3.0.0-alpha.4 까지 전부 serde_with 를 유지하며 serde_with 3.24.0 도
  # chrono_0_4 를 아직 쓴다. 둘 중 하나가 chrono 를 떼는 버전을 내면
  # 즉시 이 예외를 제거한다.
  RUSTSEC-2026-0543 # chrono unmaintained, 미컴파일 lock 전이 의존 (tauri-utils → serde_with)
)

audit_args=(--quiet --deny warnings)
for advisory in "${tauri_upstream_advisories[@]}"; do
  audit_args+=(--ignore "$advisory")
done

cargo audit --file Cargo.lock "${audit_args[@]}"
cargo audit --file fuzz/Cargo.lock --quiet --deny warnings

echo "Rust dependency audit clean: no actionable warnings or vulnerabilities"
