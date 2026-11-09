/// Exposes the stable mobile initialization symbol expected by Unikit's
/// React Native bridge.
///
/// React Native autolinking calls `unikit_mobile_init` on both iOS and
/// Android. Apple targets also receive a load-time constructor as a fallback.
#[macro_export]
macro_rules! mobile_entry {
    ($package:path $(,)?) => {
        #[unsafe(no_mangle)]
        pub extern "C" fn unikit_mobile_init() {
            let _ = $package();
        }

        #[cfg(target_vendor = "apple")]
        mod __unikit_mobile_auto_init {
            extern "C" fn initialize() {
                super::unikit_mobile_init();
            }

            #[used]
            #[unsafe(link_section = "__DATA,__mod_init_func")]
            static INITIALIZE: extern "C" fn() = initialize;
        }
    };
}

/// Host-neutral name for [`mobile_entry!`].
#[macro_export]
macro_rules! native_entry {
    ($package:path $(,)?) => {
        $crate::mobile_entry!($package);
    };
}
