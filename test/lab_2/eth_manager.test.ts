/**
 * Test suite for Ethereum utilities
 *
 * Tests key generation, signing, verification, and key derivation
 * using @effect/vitest for Effect-aware testing
 */

import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { ParseError } from "effect/ParseResult";
import * as EffectEthers from "../../src/lab_2/eth_manager";
import * as Key from "../../src/lab_2/domain/key";
import * as DomainErrors from "../../src/lab_2/domain/errors";
import { ethers } from "ethers";

describe("EthManager", () => {
  // TODO generate more tests to cover remaining
  // service components, using the below as template
  // note: focus on testing against invariants external to schema layer
  // the address corresponds to the derived public key,
  // the private key regenerates the same wallet,
  // subsequent encoding/decoding is reversible
  it.effect(
    "should generate a new key with valid cryptographic derivation",
    () =>
      Effect.gen(function* () {
        const keyGenerator = yield* EffectEthers.KeyGenerator;
        const keyData = yield* keyGenerator.generate;

        // Verify cryptographic invariants external to schema layer:

        // 1. Address must be derivable from public key using Keccak-256
        const expectedAddress = ethers.computeAddress(keyData.publicKey);
        assert.strictEqual(
          keyData.address.toLowerCase(),
          expectedAddress.toLowerCase()
        );

        // 2. Public key must be derivable from private key
        const signingKey = new ethers.SigningKey(keyData.privateKey);
        assert.strictEqual(
          keyData.publicKey.toLowerCase(),
          signingKey.publicKey.toLowerCase()
        );

        // 3. Private key should regenerate the same wallet
        const wallet = new ethers.Wallet(keyData.privateKey);
        assert.strictEqual(
          keyData.address.toLowerCase(),
          wallet.address.toLowerCase()
        );

        // 4. Encoding/decoding should be reversible (round-trip)
        const reloadedPrivateKey = yield* Key.PrivateKey.decode(
          keyData.privateKey
        );
        assert.strictEqual(reloadedPrivateKey, keyData.privateKey);
      }).pipe(Effect.provide(EffectEthers.EthManagerLive))
  );
});

// ============================================================================
// KeyLoader Error Propagation Tests
// ============================================================================

describe("KeyLoader.load - Error Propagation", () => {
  it.effect("should reject invalid private key format (too short)", () =>
    Effect.gen(function* () {
      const loader = yield* EffectEthers.KeyLoader;
      const error = yield* Effect.flip(loader.loadFromHex("0x123"));

      assert.instanceOf(error, ParseError);
    }).pipe(Effect.provide(EffectEthers.EthManagerLive))
  );

  it.effect(
    "should reject invalid private key format (non-hex characters)",
    () =>
      Effect.gen(function* () {
        const loader = yield* EffectEthers.KeyLoader;
        const invalidKey =
          "0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG";
        const error = yield* Effect.flip(loader.loadFromHex(invalidKey));

        assert.instanceOf(error, ParseError);
      }).pipe(Effect.provide(EffectEthers.EthManagerLive))
  );

  it.effect(
    "should reject private key with no 0x prefix but invalid format",
    () =>
      Effect.gen(function* () {
        const loader = yield* EffectEthers.KeyLoader;
        const invalidKey = "123";
        const error = yield* Effect.flip(loader.loadFromHex(invalidKey));

        assert.instanceOf(error, ParseError);
      }).pipe(Effect.provide(EffectEthers.EthManagerLive))
  );

  it.effect(
    "should handle CryptographicError on invalid wallet construction",
    () =>
      Effect.gen(function* () {
        const loader = yield* EffectEthers.KeyLoader;
        const validFormatButInvalidKey =
          "0x0000000000000000000000000000000000000000000000000000000000000000";
        const error = yield* Effect.flip(
          loader.loadFromHex(validFormatButInvalidKey)
        );

        assert.instanceOf(error, DomainErrors.CryptographicError);
      }).pipe(Effect.provide(EffectEthers.EthManagerLive))
  );
});

describe("Address.make - Pipeline Validation", () => {
  it("accepts valid checksummed address", () => {
    const addr = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
    const result = Key.Address.decodeSync(addr);
    assert.isTrue(Key.Address.is(result));
    assert.strictEqual(result, ethers.getAddress(addr));
  });

  it("normalizes address missing 0x prefix", () => {
    const addr = "742d35Cc6634C0532925a3b844Bc454e4438f44e";
    const result = Key.Address.decodeSync(addr);
    assert.isTrue(result.startsWith("0x"));
  });

  it("rejects invalid hex characters", () => {
    assert.throws(() =>
      Key.Address.decodeSync("0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG")
    );
  });

  it("rejects wrong length (too short)", () => {
    assert.throws(() => Key.Address.decodeSync("0x69420"));
  });

  it("rejects wrong length (too long)", () => {
    assert.throws(() =>
      Key.Address.decodeSync("0x742d35Cc6634C0532925a3b844Bc454e4438f44e123")
    );
  });

  it("rejects invalid checksum", () => {
    assert.throws(() =>
      Key.Address.decodeSync("0x742d35Cc6634C0532925a3b844Bc454e4438f44f")
    );
  });
});

describe("PublicKey.decode - Pipeline Validation", () => {
  it.effect("accepts valid uncompressed public key with 0x04 prefix", () =>
    Effect.gen(function* () {
      // Valid uncompressed public key (65 bytes = 130 hex chars)
      const pubKey =
        "0x04a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd5b8dec5235a0fa8722476c7709c02559e3aa73aa03918ba2d492eea75abea235";
      const result = yield* Key.PublicKey.decode(pubKey);

      assert.isTrue(Key.PublicKey.is(result));
      assert.isTrue(result.startsWith("0x04"));
      assert.strictEqual(result.length, 132); // 0x + 130 hex chars
    })
  );

  it.effect("accepts and normalizes compressed public key", () =>
    Effect.gen(function* () {
      // Compressed public key (33 bytes = 66 hex chars, starts with 0x02 or 0x03)
      const compressedPubKey =
        "0x02a34b99f22c790c4e36b2b3c2c35a36db06226e41c692fc82b8b56ac1c540c5bd";
      const result = yield* Key.PublicKey.decode(compressedPubKey);

      assert.isTrue(Key.PublicKey.is(result));
      // Should convert to uncompressed format
      assert.isTrue(result.startsWith("0x04"));
      assert.strictEqual(result.length, 132);
    })
  );

  it.effect("derives public key from valid private key", () =>
    Effect.gen(function* () {
      const privateKey =
        "0x0123456789012345678901234567890123456789012345678901234567890123";
      const result = yield* Key.PublicKey.decode(privateKey);

      assert.isTrue(Key.PublicKey.is(result));
      assert.isTrue(result.startsWith("0x04"));
      assert.strictEqual(result.length, 132);
    })
  );

  it.effect("rejects invalid hex characters", () =>
    Effect.gen(function* () {
      const invalidKey = "0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG";
      const error = yield* Effect.flip(Key.PublicKey.decode(invalidKey));

      assert.instanceOf(error, ParseError);
    })
  );

  it.effect("rejects invalid public key format (too short)", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(Key.PublicKey.decode("0x04123"));

      assert.instanceOf(error, ParseError);
    })
  );

  it.effect("rejects completely invalid key format", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        Key.PublicKey.decode("not a key at all")
      );

      assert.instanceOf(error, ParseError);
    })
  );
});
