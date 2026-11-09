//! One-shot JSON consumer used to verify the generated Node entry against Rust.
use unikit_rn_experiment::rn_experiment_package;
use serde_json::{Value, json};
use std::io::Read;

fn main() -> unikit_bridge::Result<()> {
    if std::env::args().nth(1).as_deref() != Some("invoke") {
        return Err(unikit_bridge::UnikitError::invalid_args(
            "expected invoke on stdin",
        ));
    }
    let limit = unikit_bridge::ffi::max_payload_bytes();
    let mut input = Vec::new();
    std::io::stdin()
        .take(limit.saturating_add(1) as u64)
        .read_to_end(&mut input)?;
    let result = if input.len() > limit {
        Err(unikit_bridge::UnikitError::payload_too_large(input.len(), limit))
    } else {
        invoke_request(&input)
    };
    let response = match result {
        Ok(result) => json!({ "ok": true, "result": result }),
        Err(error) => json!({ "ok": false, "error": serde_json::to_string(&error)
            .map_err(unikit_bridge::UnikitError::internal)? }),
    };
    serde_json::to_writer(std::io::stdout(), &response).map_err(unikit_bridge::UnikitError::internal)
}

fn invoke_request(input: &[u8]) -> unikit_bridge::Result<Value> {
    let request: Value =
        serde_json::from_slice(input).map_err(unikit_bridge::UnikitError::invalid_args)?;
    let command = request["command"]
        .as_str()
        .ok_or_else(|| unikit_bridge::UnikitError::invalid_args("missing command"))?;
    let package = rn_experiment_package();
    if command == "__unikit_contract" {
        return Ok(json!(package.generate_typescript()?.contract_hash));
    }
    package.invoke_json(
        command,
        request.get("args").cloned().unwrap_or_else(|| json!({})),
    )
}
