use super::ipc_dispatch;

/// Compose an app's native commands with a production Unikit registration.
///
/// Call this after [`super::register`], [`super::register_with_events`], or
/// [`super::register_dispatch`]. Tauri's `.invoke_handler()` replaces its previous
/// handler; use this helper as the final handler installation instead.
/// Existing managed state and event/channel plugins stay on the builder.
///
/// Unikit's six production endpoints take precedence over app commands. The
/// benchmark-only `unikit_dispatch_profiled` endpoint remains unavailable,
/// including when an app handler would otherwise claim it. This helper is for
/// production registrations, not [`super::register_profiled`].
///
/// ```rust,ignore
/// let builder = unikit_bridge::tauri_support::with_app_commands(
///     unikit_bridge::tauri_support::register_with_events(package(), tauri::Builder::default()),
///     tauri::generate_handler![greet, open_document],
/// );
/// ```
pub fn with_app_commands<R, F>(builder: tauri::Builder<R>, app_handler: F) -> tauri::Builder<R>
where
    R: tauri::Runtime,
    F: Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static,
{
    let unikit_handler = ipc_dispatch::production_handler();
    builder.invoke_handler(move |invoke| {
        let command = invoke.message.command();
        if ipc_dispatch::PRODUCTION_ENDPOINTS.contains(&command) {
            unikit_handler(invoke)
        } else if command == "unikit_dispatch_profiled" {
            false
        } else {
            app_handler(invoke)
        }
    })
}
