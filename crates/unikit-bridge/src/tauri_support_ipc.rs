//! Registered IPC entrypoints offload synchronous unikit dispatch. The public
//! Rust helpers retain their existing signatures for direct host callers.
use super::{BatchRequest, BatchResponse, ProfiledResponse, UnikitState, run_batch, run_profiled};
use serde_json::{Value, json};
use tauri::State;

pub(super) const PRODUCTION_ENDPOINTS: [&str; 6] = [
    "unikit_contract_hash",
    "unikit_dispatch",
    "unikit_dispatch_batch",
    "unikit_channel_create",
    "unikit_channel_create_bytes",
    "unikit_channel_drop",
];

pub(super) fn production_handler<R: tauri::Runtime>()
-> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        unikit_contract_hash_ipc,
        unikit_dispatch_ipc,
        unikit_dispatch_batch_ipc,
        crate::tauri_channels::unikit_channel_create,
        crate::tauri_channels::unikit_channel_create_bytes,
        crate::tauri_channels::unikit_channel_drop
    ]
}

// 오류 응답이 JSON Value 라 직렬화 실패를 되던질 수 없다. UnikitError 는
// 문자열/숫자 필드만 직렬화하므로 실패가 없다 — 이 불가결 오류만 허용.
#[allow(clippy::expect_used)]
async fn on_blocking_pool<T: Send + 'static>(
    work: impl FnOnce() -> T + Send + 'static,
) -> Result<T, Value> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| {
            serde_json::to_value(crate::UnikitError::internal(format!(
                "Tauri dispatch worker failed: {error}"
            )))
            .expect("UnikitError serializes")
        })
}

#[tauri::command(rename = "unikit_contract_hash")]
pub(super) async fn unikit_contract_hash_ipc(
    state: State<'_, UnikitState>,
    expected_hash: Option<String>,
) -> Result<String, Value> {
    let dispatch = state.dispatch.clone();
    on_blocking_pool(move || {
        let native_hash = dispatch.contract_hash()?;
        if let Some(expected) = expected_hash
            && native_hash != expected
        {
            return Err(json!({
                "code": "contract.mismatch",
                "message": format!("Tauri contract hash mismatch: native={native_hash} vs expected={expected}. Regenerate the client and rebuild the Rust host."),
                "retryable": false,
            }));
        }
        Ok(native_hash)
    })
    .await?
}

#[tauri::command(rename = "unikit_dispatch")]
pub(super) async fn unikit_dispatch_ipc(
    state: State<'_, UnikitState>,
    command: String,
    args: Value,
) -> Result<Value, Value> {
    let dispatch = state.dispatch.clone();
    on_blocking_pool(move || dispatch.invoke_json(&command, args)).await?
}

#[tauri::command(rename = "unikit_dispatch_batch")]
pub(super) async fn unikit_dispatch_batch_ipc(
    state: State<'_, UnikitState>,
    requests: Vec<BatchRequest>,
) -> Result<Vec<BatchResponse>, Value> {
    let dispatch = state.dispatch.clone();
    on_blocking_pool(move || run_batch(dispatch.as_ref(), requests)).await
}

#[tauri::command(rename = "unikit_dispatch_profiled")]
pub(super) async fn unikit_dispatch_profiled_ipc(
    state: State<'_, UnikitState>,
    command: String,
    args: Value,
) -> Result<ProfiledResponse, Value> {
    let dispatch = state.dispatch.clone();
    on_blocking_pool(move || run_profiled(dispatch.as_ref(), &command, args)).await
}
