//! Internal copy of identifier naming rules for proc-macro codegen.
//! Keep `snake_to_lower_camel` identical to `crates/unikit-bridge/src/naming.rs`.

/// Converts snake-, kebab-, and dot-separated names to lower camel case.
///
/// The first alphanumeric character is always lower-cased. Delimiters are
/// removed and uppercase the next alphanumeric character, matching the
/// historical Unikit codegen behavior.
pub(crate) fn snake_to_lower_camel(name: &str) -> String {
    let mut output = String::new();
    let mut uppercase_next = false;

    for character in name.chars() {
        if matches!(character, '_' | '-' | '.') {
            uppercase_next = true;
            continue;
        }

        if output.is_empty() {
            output.push(character.to_ascii_lowercase());
            uppercase_next = false;
        } else if uppercase_next {
            output.push(character.to_ascii_uppercase());
            uppercase_next = false;
        } else {
            output.push(character);
        }
    }

    output
}
