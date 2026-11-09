// Link-only ABI definitions. Every tested call must use an explicit fake CoreTable.
namespace unikit {
extern "C" {
[[noreturn]] static void unexpectedStaticCore() { std::abort(); }
uint8_t* unikit_ffi_invoke(const uint8_t*, size_t, size_t*) { unexpectedStaticCore(); }
uint8_t* unikit_ffi_invoke_json(const uint8_t*, size_t, size_t*) { unexpectedStaticCore(); }
uint8_t* unikit_ffi_invoke_postcard(const uint8_t*, size_t, size_t*) { unexpectedStaticCore(); }
uint8_t* unikit_ffi_invoke_frame(const uint8_t*, size_t, size_t*) { unexpectedStaticCore(); }
void unikit_ffi_free(uint8_t*, size_t) { unexpectedStaticCore(); }
uint32_t unikit_ffi_invoke_buffer(uint16_t, const uint8_t*, size_t, uint8_t**, size_t*) { unexpectedStaticCore(); }
uint32_t unikit_ffi_has_buffer(uint16_t) { unexpectedStaticCore(); }
void unikit_ffi_free_owned_bytes(uint8_t*, size_t) { unexpectedStaticCore(); }
void unikit_ffi_event_sink_register(unikit_event_callback_t, void*) { unexpectedStaticCore(); }
void unikit_ffi_event_sink_unregister() { unexpectedStaticCore(); }
uint32_t unikit_ffi_channel_create(unikit_channel_callback_t, void*) { unexpectedStaticCore(); }
int32_t unikit_ffi_channel_send(uint32_t, const char*) { unexpectedStaticCore(); }
uint32_t unikit_ffi_channel_create_bytes(unikit_channel_bytes_callback_t, void*) { unexpectedStaticCore(); }
int32_t unikit_ffi_channel_send_bytes(uint32_t, const uint8_t*, size_t) { unexpectedStaticCore(); }
int32_t unikit_ffi_channel_drop(uint32_t) { unexpectedStaticCore(); }
void unikit_mobile_init() { unexpectedStaticCore(); }
bool unikit_ffi_invoke_cancel(uint64_t) { unexpectedStaticCore(); }
void unikit_ffi_invoke_frame_async_into(const uint8_t*, size_t, uint8_t*, size_t,
  void*, unikit_async_into_callback_t, uint64_t*) { unexpectedStaticCore(); }
size_t unikit_ffi_invoke_frame_into(const uint8_t*, size_t, uint8_t*, size_t, size_t*) { unexpectedStaticCore(); }
uint8_t* unikit_ffi_invoke_frame_owned(const uint8_t*, size_t, uint8_t*, size_t, size_t*) { unexpectedStaticCore(); }
uint32_t unikit_ffi_invoke_raw(uint16_t, const uint64_t*, size_t, uint64_t*, uint8_t*, size_t, size_t*) { unexpectedStaticCore(); }
uint8_t unikit_ffi_has_raw(uint16_t) { unexpectedStaticCore(); }
uint8_t* unikit_ffi_get_schema(size_t*) { unexpectedStaticCore(); }
uint8_t* unikit_ffi_contract_hash(size_t*) { unexpectedStaticCore(); }
}
}
