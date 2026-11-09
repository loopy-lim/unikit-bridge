//! CRUD stdio runtime: invoke handles one request; serve retains the store across calls.
use unikit_crud_example::crud_package;
use serde_json::{Value, json};
use std::io::{BufRead, Read, Write};

fn main() -> unikit_bridge::Result<()> {
    match std::env::args().nth(1).as_deref() {
        Some("invoke") => return run_invoke_stdio(),
        Some("serve") => return run_serve_stdio(),
        _ => {}
    }
    let package = crud_package();
    let result = package.invoke_json("listItems", json!({}))?;
    let count = result
        .get("items")
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0);
    println!("crud: {count} item(s)");
    Ok(())
}

fn run_invoke_stdio() -> unikit_bridge::Result<()> {
    let mut input = String::new();
    std::io::stdin()
        .take(1024 * 1024)
        .read_to_string(&mut input)?;
    let response = invoke_response(&crud_package(), &input);
    serde_json::to_writer(std::io::stdout(), &response).map_err(unikit_bridge::UnikitError::internal)?;
    Ok(())
}

fn run_serve_stdio() -> unikit_bridge::Result<()> {
    let package = crud_package();
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let response = invoke_response(&package, &line);
        serde_json::to_writer(&mut stdout, &response).map_err(unikit_bridge::UnikitError::internal)?;
        stdout.write_all(b"\n")?;
        stdout.flush()?;
    }
    Ok(())
}

fn invoke_response(package: &unikit_bridge::Package, input: &str) -> Value {
    let request: Value = match serde_json::from_str(input) {
        Ok(request) => request,
        Err(error) => return error_response(unikit_bridge::UnikitError::invalid_args(error)),
    };
    let mut response = match handle_request(package, &request) {
        Ok(response) => response,
        Err(error) => error_response(error),
    };
    if let Some(id) = request.get("id") {
        response["id"] = id.clone();
    }
    response
}

fn error_response(error: unikit_bridge::UnikitError) -> Value {
    let detail = serde_json::to_string(&error).unwrap_or_else(|_| error.to_string());
    json!({ "ok": false, "error": detail })
}

fn handle_request(package: &unikit_bridge::Package, request: &Value) -> unikit_bridge::Result<Value> {
    let command = request
        .get("command")
        .and_then(Value::as_str)
        .ok_or_else(|| unikit_bridge::UnikitError::invalid_args("missing command"))?;
    if command == "__unikit_contract" {
        return Ok(json!({ "ok": true, "result": package.generate_typescript()?.contract_hash }));
    }
    if command == "__unikit_capabilities" {
        return Ok(json!({ "ok": true, "result": { "events": "polling" } }));
    }
    if command == "__drainEvents" {
        let events: Vec<Value> = package
            .event_bus()
            .take_pending_events()
            .into_iter()
            .map(|event| {
                let payload: Value =
                    serde_json::from_str(&event.payload).unwrap_or(Value::String(event.payload));
                json!({ "name": event.name, "payload": payload })
            })
            .collect();
        return Ok(json!({ "ok": true, "events": events }));
    }
    let args = request.get("args").cloned().unwrap_or_else(|| json!({}));
    let result = package.invoke_json(command, args)?;
    Ok(json!({ "ok": true, "result": result }))
}
