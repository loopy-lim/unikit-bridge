//! rn-experiment 코드젠 바이너리 — schema.json 을 generated/ 에 기록한다.
//!
//! CLI codegen(`bun ../../packages/cli/src/index.ts codegen --config
//! unikit.json`)이 이 바이너리로 스키마를 캡처한다(unikit.json codegen 섹션,
//! preferredName "generate" 관례).

use unikit_rn_experiment::rn_experiment_package;

fn main() {
    let package = rn_experiment_package();
    let generated = package.generate_typescript().expect("codegen failed");
    generated
        .write_schema_to_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/generated"))
        .expect("write failed");
}
