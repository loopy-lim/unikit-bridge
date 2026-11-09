import type { PostcardField } from './generate-postcard-types.js';

/** Generate a direct cursor writer for the encodeInto fast path. */
export function generateFieldEncodeIntoExpr(
  field: PostcardField,
  valueExpr: string,
  indent: string,
): string {
  // do-while 은 최소 1바이트를 쓰므로 out[w - 1] 은 직전에 쓴 바이트다 —
  // noUncheckedIndexedAccess 하에서 out[w - 1]! 로 그 계약을 표현한다.
  const endVarint = `out[w - 1] = out[w - 1]! & 0x7f;`;
  const writeVarint = (target: string) =>
    `${indent}{ let _v = ${target}; do { ensure(1); out[w++] = (_v % 128) | 0x80; _v = Math.floor(_v / 128); } while (_v > 0); ${endVarint} }`;
  const writeZigzag = (target: string) =>
    `${indent}{ const _z = ${target} >= 0 ? ${target} * 2 : -${target} * 2 - 1; let _v = _z; do { ensure(1); out[w++] = (_v % 128) | 0x80; _v = Math.floor(_v / 128); } while (_v > 0); ${endVarint} }`;
  switch (field.kind) {
    case 'unit':
      return `${indent}// unit has no postcard bytes`;
    case 'zigzag':
      return writeZigzag(valueExpr);
    case 'uvar':
      return writeVarint(valueExpr);
    case 'f64':
      return `${indent}{ ensure(8); _dvScratch.setFloat64(0, ${valueExpr}, true); for (let _i = 0; _i < 8; _i++) out[w++] = _dvScratchU8[_i]!; }`;
    case 'f32':
      return `${indent}{ ensure(4); _dvScratch.setFloat32(0, ${valueExpr}, true); for (let _i = 0; _i < 4; _i++) out[w++] = _dvScratchU8[_i]!; }`;
    case 'bool':
      return `${indent}{ ensure(1); out[w++] = ${valueExpr} ? 1 : 0; }`;
    case 'string':
      return `${indent}{ const _s = ${valueExpr}; const _u = _utf8Encode(_s); ensure(5 + _u.length); let _v = _u.length; do { out[w++] = (_v % 128) | 0x80; _v = Math.floor(_v / 128); } while (_v > 0); ${endVarint} out.set(_u, w); w += _u.length; }`;
    case 'bytes':
      return `${indent}{ const _b = ${valueExpr}; const _u = typeof _b === 'string' ? _utf8Encode(_b) : _b instanceof Uint8Array ? _b : new Uint8Array(_b); ensure(5 + _u.length); let _v = _u.length; do { out[w++] = (_v % 128) | 0x80; _v = Math.floor(_v / 128); } while (_v > 0); ${endVarint} out.set(_u, w); w += _u.length; }`;
    case 'vec_zigzag':
      return `${indent}{ const _arr = ${valueExpr}; let _v = _arr.length; do { ensure(1); out[w++] = (_v % 128) | 0x80; _v = Math.floor(_v / 128); } while (_v > 0); ${endVarint} for (let _i = 0; _i < _arr.length; _i++) { const _e = _arr[_i]!; const _z = _e >= 0 ? _e * 2 : -_e * 2 - 1; let _x = _z; do { ensure(1); out[w++] = (_x % 128) | 0x80; _x = Math.floor(_x / 128); } while (_x > 0); ${endVarint} } }`;
    case 'vec_uvar':
      return `${indent}{ const _arr = ${valueExpr}; let _v = _arr.length; do { ensure(1); out[w++] = (_v % 128) | 0x80; _v = Math.floor(_v / 128); } while (_v > 0); ${endVarint} for (let _i = 0; _i < _arr.length; _i++) { let _x = _arr[_i]!; do { ensure(1); out[w++] = (_x % 128) | 0x80; _x = Math.floor(_x / 128); } while (_x > 0); ${endVarint} } }`;
    case 'uvar64':
      return `${indent}{ const _v = ${valueExpr}; if (typeof _v === 'number' && Number.isSafeInteger(_v) && _v >= 0) { let _x = _v; do { ensure(1); out[w++] = (_x % 128) | 0x80; _x = Math.floor(_x / 128); } while (_x > 0); ${endVarint} } else { const _b = BigInt(_v); if (_b < 0n) throw new Error('varint must be non-negative: ' + _b.toString()); if (_b > 0xffffffffffffffffn) throw new Error('varint exceeds u64 range: ' + _b.toString()); let _x = _b; do { ensure(1); out[w++] = Number(_x & 0x7fn) | 0x80; _x >>= 7n; } while (_x !== 0n); ${endVarint} } }`;
    case 'zigzag64':
      return `${indent}{ let _x = BigInt(${valueExpr}); if (_x < _pcI64Min || _x > _pcI64Max) throw new Error('zigzag64 input outside i64 range: ' + _x.toString()); _x = (_x << 1n) ^ (_x >> 63n); do { ensure(1); out[w++] = Number(_x & 0x7fn) | 0x80; _x >>= 7n; } while (_x !== 0n); ${endVarint} }`;
    default:
      return `${indent}/* unsupported kind: ${field.kind} */`;
  }
}
