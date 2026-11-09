//! Test-only scheduling controls. All callbacks, ownership and cancellation use
//! the production unikit FFI; these symbols are not part of the published ABI.
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Condvar, Mutex};
use std::time::{Duration, Instant};

static OPEN: Mutex<bool> = Mutex::new(false);
static RELEASE: Condvar = Condvar::new();
static BLOCKED: AtomicU32 = AtomicU32::new(0);
static HANDLER_CALLS: AtomicU32 = AtomicU32::new(0);

#[unsafe(no_mangle)]
pub extern "C" fn unikit_mobile_init() {
    unikit_bridge::Package::builder("scriptc.stress")
        .command("echo", |value: u32| Ok::<_, unikit_bridge::UnikitError>(value))
        .command("block", |value: u32| {
            let gate = OPEN.lock().unwrap();
            BLOCKED.fetch_add(1, Ordering::SeqCst);
            let (gate, timeout) = RELEASE
                .wait_timeout_while(gate, Duration::from_secs(10), |open| !*open)
                .unwrap();
            BLOCKED.fetch_sub(1, Ordering::SeqCst);
            if timeout.timed_out() && !*gate {
                return Err(unikit_bridge::UnikitError::custom(
                    "stress.timeout",
                    "worker gate timed out",
                ));
            }
            Ok(value)
        })
        .command("count", |value: u32| {
            HANDLER_CALLS.fetch_add(1, Ordering::SeqCst);
            Ok::<_, unikit_bridge::UnikitError>(value)
        })
        .command("emit", |value: u32| {
            unikit_bridge::ffi::get_package().unwrap().emit("notice", value);
            Ok::<_, unikit_bridge::UnikitError>(value)
        })
        .event::<u32>("notice")
        .build()
        .register_ffi();
}

#[unsafe(no_mangle)]
pub extern "C" fn unikit_stress_wait_workers() -> bool {
    let deadline = Instant::now() + Duration::from_secs(5);
    while BLOCKED.load(Ordering::SeqCst) != 2 {
        if Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(Duration::from_millis(1));
    }
    true
}

#[unsafe(no_mangle)]
pub extern "C" fn unikit_stress_release_workers() {
    *OPEN.lock().unwrap() = true;
    RELEASE.notify_all();
}

#[unsafe(no_mangle)]
pub extern "C" fn unikit_stress_handler_calls() -> u32 {
    HANDLER_CALLS.load(Ordering::SeqCst)
}
