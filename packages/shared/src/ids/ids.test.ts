/**
 * Tests for the UUIDv7 generator. `node:test` + `node:assert` — zero new
 * dependencies, runs as `pnpm --filter @vng/shared test`.
 *
 * The properties asserted here are the ones the rest of the system relies on:
 * a documentId that sorts chronologically, never repeats, and can be dated.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isUuidV7, uuidV7Date, uuidV7Timestamp, uuidv7 } from "./uuid.ts";

describe("uuidv7", () => {
  it("produces a canonical v7 string", () => {
    const id = uuidv7();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(id.length, 36);
    assert.ok(isUuidV7(id));
  });

  it("sets the version nibble to 7 and the variant bits to 0b10", () => {
    for (let i = 0; i < 500; i += 1) {
      const id = uuidv7();
      assert.equal(id.charAt(14), "7", `version nibble in ${id}`);
      assert.ok("89ab".includes(id.charAt(19)), `variant nibble in ${id}`);
    }
  });

  it("embeds the current time in the leading 48 bits", () => {
    const before = Date.now();
    const id = uuidv7();
    const after = Date.now();

    const ms = uuidV7Timestamp(id);
    assert.ok(ms !== null);
    // The counter-overflow path may borrow milliseconds from the future, so the
    // upper bound is `after` plus a small allowance rather than `after` exactly.
    assert.ok(ms >= before && ms <= after + 10, `${ms} outside [${before}, ${after}]`);
  });

  it("is strictly increasing lexicographically, even within one millisecond", () => {
    // 20k ids in a tight loop is far more than fits in a millisecond, so this
    // exercises the rand_a counter and its overflow-into-the-next-ms path.
    const ids = Array.from({ length: 20_000 }, () => uuidv7());

    let previous = "";
    for (const [index, id] of ids.entries()) {
      assert.ok(id > previous, `id ${index} (${id}) does not sort after ${previous}`);
      previous = id;
    }
  });

  it("never collides", () => {
    const ids = new Set(Array.from({ length: 20_000 }, () => uuidv7()));
    assert.equal(ids.size, 20_000);
  });

  it("keeps the random tail random", () => {
    // rand_b (the last 12 hex digits) must differ across ids minted in the same
    // millisecond — if the counter were the only thing changing, a leaked id
    // would let an attacker enumerate its neighbours.
    const tails = new Set(Array.from({ length: 1_000 }, () => uuidv7().slice(24)));
    assert.equal(tails.size, 1_000);
  });
});

describe("isUuidV7", () => {
  it("rejects other UUID versions and non-UUID ids", () => {
    // v4 — version nibble 4.
    assert.equal(isUuidV7("f81d4fae-7dec-41d0-a765-00a0c91e6bf6"), false);
    // A cuid2 documentId, the format Strapi minted before this change.
    assert.equal(isUuidV7("clh3am1f30000udocl4qtrb2b"), false);
    assert.equal(isUuidV7(""), false);
    assert.equal(isUuidV7(null), false);
    assert.equal(isUuidV7(undefined), false);
    assert.equal(isUuidV7(12345), false);
    // Right shape, wrong variant nibble.
    assert.equal(isUuidV7("017f22e2-79b0-7cc3-c8c4-d5b2f1a3e4f5"), false);
    // Unhyphenated.
    assert.equal(isUuidV7("017f22e279b07cc398c4dc0c0c07398f"), false);
  });

  it("accepts upper-case input", () => {
    const id = uuidv7().toUpperCase();
    assert.ok(isUuidV7(id));
  });
});

describe("uuidV7Timestamp / uuidV7Date", () => {
  it("decodes a known vector", () => {
    // RFC 9562 §A.6 test vector: 2022-02-22T19:22:22.000Z.
    const id = "017f22e2-79b0-7cc3-98c4-dc0c0c07398f";
    assert.equal(uuidV7Timestamp(id), 1_645_557_742_000);
    assert.equal(uuidV7Date(id)?.toISOString(), "2022-02-22T19:22:22.000Z");
  });

  it("round-trips a freshly minted id", () => {
    const id = uuidv7();
    const date = uuidV7Date(id);
    assert.ok(date instanceof Date);
    assert.ok(Number.isFinite(date.getTime()));
  });

  it("returns null rather than throwing for ids with no embedded time", () => {
    assert.equal(uuidV7Timestamp("clh3am1f30000udocl4qtrb2b"), null);
    assert.equal(uuidV7Timestamp("f81d4fae-7dec-41d0-a765-00a0c91e6bf6"), null);
    assert.equal(uuidV7Date(null), null);
  });
});
