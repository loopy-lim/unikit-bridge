// 통합 테스트 — 어설션 가독성을 위해 unwrap/expect 를 허용한다.
#![allow(clippy::unwrap_used, clippy::expect_used)]

//! Exercise the actual debug free entry points in isolated child processes.
//! Release intentionally tests correct ownership only: invoking UB is not a test.
#![cfg(all(unix, not(miri)))]

use unikit_bridge::ffi::{
    unikit_ffi_free, unikit_ffi_free_owned_bytes, unikit_ffi_invoke_buffer, unikit_ffi_invoke_json,
};

fn header_buffer() -> (*mut u8, usize) {
    let payload = br#"{}"#;
    let mut len = 0;
    let ptr = unsafe { unikit_ffi_invoke_json(payload.as_ptr(), payload.len(), &mut len) };
    assert!(!ptr.is_null());
    (ptr, len)
}

fn owned_buffer() -> (*mut u8, usize) {
    let mut ptr = std::ptr::null_mut();
    let mut len = 0;
    // An unregistered command returns an owned error string through the same allocator.
    let result = unsafe { unikit_ffi_invoke_buffer(1, std::ptr::null(), 0, &mut ptr, &mut len) };
    assert_eq!(result, 1);
    assert!(!ptr.is_null());
    (ptr, len)
}

#[test]
fn matching_allocators_release_both_buffer_kinds() {
    let (header, header_len) = header_buffer();
    let (owned, owned_len) = owned_buffer();
    unsafe {
        unikit_ffi_free(header, header_len);
        unikit_ffi_free_owned_bytes(owned, owned_len);
    }
}

#[test]
#[cfg(debug_assertions)]
fn debug_free_misuse_aborts_before_dereferencing() {
    use std::os::unix::process::ExitStatusExt;
    for (case, diagnostic) in [
        ("header-wrong-len", "WrongLen"),
        ("owned-wrong-len", "WrongLen"),
        ("header-wrong-allocator", "WrongAllocator"),
        ("owned-wrong-allocator", "WrongAllocator"),
        ("header-double-free", "NotLive"),
        ("owned-double-free", "NotLive"),
        ("foreign-pointer", "NotLive"),
    ] {
        // ulimit applies only to this child; an expected abort must not create a core dump.
        let output = std::process::Command::new("sh")
            .args(["-c", "ulimit -c 0; exec \"$@\"", "unikit-free-contract"])
            .arg(std::env::current_exe().unwrap())
            .args(["--exact", "debug_free_child", "--ignored", "--nocapture"])
            .env("UNIKIT_FREE_CONTRACT_CASE", case)
            .output()
            .unwrap();
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert_eq!(output.status.signal(), Some(6), "{case}: {stderr}");
        assert!(
            stderr.contains(diagnostic),
            "{case}: missing {diagnostic}: {stderr}"
        );
    }
}

#[test]
#[ignore = "isolated child entry, invoked by debug_free_misuse_aborts_before_dereferencing"]
#[cfg(debug_assertions)]
fn debug_free_child() {
    let case = std::env::var("UNIKIT_FREE_CONTRACT_CASE").expect("parent selects a case");
    unsafe {
        match case.as_str() {
            "header-wrong-len" => {
                let (p, n) = header_buffer();
                unikit_ffi_free(p, n + 1);
            }
            "owned-wrong-len" => {
                let (p, n) = owned_buffer();
                unikit_ffi_free_owned_bytes(p, n + 1);
            }
            "header-wrong-allocator" => {
                let (p, n) = header_buffer();
                unikit_ffi_free_owned_bytes(p, n);
            }
            "owned-wrong-allocator" => {
                let (p, n) = owned_buffer();
                unikit_ffi_free(p, n);
            }
            "header-double-free" => {
                let (p, n) = header_buffer();
                unikit_ffi_free(p, n);
                unikit_ffi_free(p, n);
            }
            "owned-double-free" => {
                let (p, n) = owned_buffer();
                unikit_ffi_free_owned_bytes(p, n);
                unikit_ffi_free_owned_bytes(p, n);
            }
            "foreign-pointer" => {
                let mut byte = 0;
                unikit_ffi_free(&mut byte, 1);
            }
            _ => panic!("unknown child case"),
        }
    }
    panic!("misuse returned without aborting");
}
