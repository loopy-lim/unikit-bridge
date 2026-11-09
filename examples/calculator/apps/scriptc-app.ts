import {
  unikit_mobile_init,
  unikit_ffi_invoke_json_into_len,
  unikit_ffi_event_sink_release_scriptc,
  unikit_ffi_event_sink_register_scriptc,
  unikit_ffi_channel_release_scriptc,
  unikit_ffi_channel_create_bytes,
  unikit_ffi_invoke_json_async_channel,
  unikit_ffi_channel_send_bytes,
} from '../scriptc/scriptc-ffi.js';

// scriptc Native FFI 스모크 — 코드젠 매니페스트(ffi_format 7)가 커밋 그대로 통하는
// 정적 링크 경로를 증명한다. uniform 초기화(unikit_bridge::native_entry! 진입) 1회 후
// caller-buffer envelope 진입(unikit_ffi_invoke_json_into_len)으로 addNumbers 를
// 호출한다. payload 는 string 클래스(scriptc 가 NUL-free UTF-8 로 인코딩해
// (ptr,len) 쌍으로 전달), buf 는 mutable-bytes(쓰기 가능한 borrow, len=capacity)다.
// 길이는 out 포인터 없이 u64 반환으로 온다 — usize::MAX(0xffff_ffff_ffff_ffff)가
// 유일한 실패 신호다.
unikit_mobile_init();

const decoder = new TextDecoder();
const input = JSON.stringify({ command: 'addNumbers', args: { a: 20, b: 22 } });
const outputBuffer = new Uint8Array(4096);
const written = unikit_ffi_invoke_json_into_len(input, outputBuffer);
if (written === 0xffff_ffff_ffff_ffffn) {
  throw new Error('FFI invocation failed (usize::MAX) — payload malformed or buffer too small');
}
if (written === 0n || written > BigInt(outputBuffer.length)) {
  throw new Error(`implausible response length: ${written}`);
}
const response = JSON.parse(decoder.decode(outputBuffer.subarray(0, Number(written)))) as {
  result?: { value: number };
};
// result 래퍼 유무와 무관하게 { value } 형태로 좁힌다(fixture 응답 계약).
const result = (response.result ?? response) as { value: number };
if (result.value !== 42) throw new Error(`expected 42, got ${result.value}`);
console.log(`scriptc FFI zero-config result: ${result.value}`);

// Retained foreign callbacks copy payloads before queueing to the script loop.
// Release the same named closure to close its native registration and loop ref.
let eventCount = 0;
const onEvent: (name: string, payload: string) => void = (name, payload) => {
  if (name === 'progress.tick') eventCount += 1;
  if (name === 'demo.done') {
    if (eventCount !== 2) throw new Error(`expected 2 events, got ${eventCount}`);
    JSON.parse(payload);
    unikit_ffi_event_sink_release_scriptc(onEvent);
    console.log('scriptc FFI retained events: 2');
  }
};
unikit_ffi_event_sink_register_scriptc(onEvent);
const emitted = unikit_ffi_invoke_json_into_len(
  JSON.stringify({ command: 'emitDemo', args: { ticks: 2, stepDelayMs: 0 } }),
  outputBuffer,
);
if (emitted === 0n || emitted > BigInt(outputBuffer.length))
  throw new Error('event command failed');

const onComplete: (handle: number, payload: Uint8Array) => void = (_handle, payload) => {
  // fixture 응답 봉투 { ok, result: { value } } — 파서 결과를 구조 타입으로 고정한다.
  const envelope = JSON.parse(decoder.decode(payload)) as {
    ok: boolean;
    result?: { value: number };
  };
  if (!envelope.ok || envelope.result?.value !== 42) throw new Error('async result mismatch');
  unikit_ffi_channel_release_scriptc(onComplete);
  console.log('scriptc FFI async result: 42');
};
const completionChannel = unikit_ffi_channel_create_bytes(onComplete);
if (completionChannel === 0) throw new Error('completion channel exhausted');
const invocationId = unikit_ffi_invoke_json_async_channel(input, completionChannel);
if (invocationId === 0n) throw new Error('invalid completion channel');

const onBytes: (handle: number, payload: Uint8Array) => void = (_handle, payload) => {
  if (payload.length !== 3 || payload[0] !== 0 || payload[1] !== 128 || payload[2] !== 255)
    throw new Error('byte channel data mismatch');
  unikit_ffi_channel_release_scriptc(onBytes);
  console.log('scriptc FFI bytes channel: 3');
};
const byteChannel = unikit_ffi_channel_create_bytes(onBytes);
if (unikit_ffi_channel_send_bytes(byteChannel, new Uint8Array([0, 128, 255])) !== 1)
  throw new Error('byte channel send failed');
