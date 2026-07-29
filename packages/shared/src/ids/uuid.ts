/**
 * UUID version 7 — RFC 9562 §5.7.
 *
 * v7 puts a 48-bit big-endian Unix millisecond timestamp in the leading bytes,
 * so the *lexicographic* order of the hex string matches creation order. That is
 * the whole reason we prefer it to v4 for identifiers that end up in a database
 * column: `ORDER BY document_id` is chronological, a B-tree index on it appends
 * to the rightmost leaf instead of scattering random inserts across the whole
 * index, and any ID can be dated without a join (`uuidV7Timestamp`).
 *
 * Layout (128 bits):
 *
 *   0                   1                   2                   3
 *   0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |                          unix_ts_ms                           |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |          unix_ts_ms           |  ver  |        rand_a         |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |var|                        rand_b                             |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |                            rand_b                             |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *
 * Millisecond resolution alone does not order IDs minted inside the same
 * millisecond, and a bulk write (the demo seed, an import) mints dozens. So
 * `rand_a` is used as the RFC 9562 §6.2 "method 1" dedicated counter: seeded
 * randomly at the top of each millisecond, incremented for every subsequent ID
 * in that millisecond. Within a process the sequence is therefore *strictly*
 * increasing, which also means no two calls can ever collide on the timestamp
 * bits alone.
 *
 * Dual-consumed by apps/web (ESM source) and apps/cms (CJS bundle), so this
 * deliberately uses Web Crypto off `globalThis` rather than `node:crypto`:
 * the module then works unchanged in Node, in an edge runtime and in a browser.
 */

/** RFC 9562 §4: version nibble `7`, variant bits `10xx` (so `8`/`9`/`a`/`b`). */
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** `rand_a` is 12 bits, so the counter wraps at 4096. */
const COUNTER_LIMIT = 0x1000;

/**
 * Bits of `rand_a` that are randomised when a millisecond starts. Seeding into
 * the low 8 bits leaves at least 3840 increments of headroom before the counter
 * can overflow, while keeping the value unguessable. RFC 9562 §6.2 calls this
 * out explicitly: a counter seeded at zero leaks how many IDs a process has
 * minted this millisecond.
 */
const COUNTER_SEED_MASK = 0xff;

/**
 * Fill `length` bytes of CSPRNG output and hand back a `DataView` over them.
 *
 * A view rather than the array itself so callers read whole words
 * (`getUint16`/`getUint32`) instead of indexing bytes — the same bits, but
 * typed as `number` rather than `number | undefined`.
 */
function randomView(length: number): DataView {
  const webcrypto = globalThis.crypto;
  if (!webcrypto?.getRandomValues) {
    // Never fall back to Math.random: a predictable documentId is a
    // content-enumeration primitive, and a predictable device id is worse.
    throw new Error(
      "uuidv7() requires Web Crypto (globalThis.crypto.getRandomValues), which is unavailable in this runtime.",
    );
  }
  const bytes = webcrypto.getRandomValues(new Uint8Array(length));
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Last millisecond we minted in, and the counter state within it. */
let lastTimestamp = -1;
let counter = 0;

/**
 * Generate a UUIDv7 as the canonical lower-case hyphenated string.
 *
 * Monotonic within the process, including across a backwards clock step: if the
 * wall clock moves back (NTP correction, a VM snapshot restore) we keep minting
 * against the last timestamp we already used rather than re-issuing a range of
 * IDs that sort before rows already written.
 */
export function uuidv7(): string {
  const now = Date.now();

  if (now > lastTimestamp) {
    lastTimestamp = now;
    counter = randomView(2).getUint16(0) & COUNTER_SEED_MASK;
  } else {
    counter += 1;
    if (counter >= COUNTER_LIMIT) {
      // Counter exhausted for this millisecond. Borrow from the next one rather
      // than blocking or reusing a counter value; `lastTimestamp` may therefore
      // run slightly ahead of the wall clock under sustained load, which the RFC
      // permits and which preserves monotonicity.
      lastTimestamp += 1;
      counter = randomView(2).getUint16(0) & COUNTER_SEED_MASK;
    }
  }

  // 62 bits of rand_b, drawn as three words so nothing is read by byte index.
  const random = randomView(8);
  const randHigh = random.getUint16(0);
  const randMid = random.getUint16(2);
  const randLow = random.getUint32(4);

  // unix_ts_ms — 48 bits, rendered directly as 12 hex digits. `Number` holds
  // integers to 2^53 exactly, so no 48-bit bit-shifting (which JS's 32-bit
  // bitwise operators cannot express) is needed.
  const timestampHex = lastTimestamp.toString(16).padStart(12, "0");

  // ver (4 bits) = 7, then the 12-bit counter as rand_a — one 16-bit group.
  const versionAndCounter = (0x7000 | counter).toString(16).padStart(4, "0");

  // var (2 bits) = 0b10, then 14 of rand_b's bits — the next 16-bit group.
  const variantAndRandom = (0x8000 | (randHigh & 0x3fff)).toString(16).padStart(4, "0");

  // The remaining 48 bits of rand_b.
  const tail = randMid.toString(16).padStart(4, "0") + randLow.toString(16).padStart(8, "0");

  return `${timestampHex.slice(0, 8)}-${timestampHex.slice(8, 12)}-${versionAndCounter}-${variantAndRandom}-${tail}`;
}

/** True when `value` is a canonical UUIDv7 string. */
export function isUuidV7(value: unknown): value is string {
  return typeof value === "string" && UUID_V7_PATTERN.test(value);
}

/**
 * Read the embedded creation time out of a UUIDv7, as Unix milliseconds.
 *
 * Returns `null` for anything that is not a UUIDv7 — including a v4 UUID and
 * the cuid2 `documentId`s Strapi minted before this change — so callers can
 * treat "no embedded time" as a normal case rather than an error.
 */
export function uuidV7Timestamp(value: unknown): number | null {
  if (!isUuidV7(value)) return null;
  // First 12 hex digits (bytes 0-5) are unix_ts_ms; `-` sits at index 8.
  const hex = `${value.slice(0, 8)}${value.slice(9, 13)}`;
  return Number.parseInt(hex, 16);
}

/** The embedded creation time as a `Date`, or `null` if there is none. */
export function uuidV7Date(value: unknown): Date | null {
  const ms = uuidV7Timestamp(value);
  return ms === null ? null : new Date(ms);
}
