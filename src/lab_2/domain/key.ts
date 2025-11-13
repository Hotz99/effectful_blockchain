/**
 * Domain types for Ethereum cryptographic keys
 *
 * This module encapsulates:
 * - Branded types for PrivateKey, PublicKey, Address
 * - Constructors and validation functions
 * - Type guards and equivalence
 *
 * @since 1.0.0
 */

import { Data, Schema, ParseResult } from "effect";
import { ethers } from "ethers";

// ============================================================================
// SCHEMAS (Source of Truth; likely rendundant given `ethers` validation; kept for learning purposes)
// ============================================================================

/**
 * Private key schema - a 32-byte (256-bit) secret value in hex format with 0x prefix
 *
 * Pipeline:
 * 1. Transform: Normalize input by ensuring 0x prefix
 * 2. Pattern: Validate format (0x + exactly 64 hex characters)
 * 3. Brand: Apply type brand for type safety
 *
 * @category Schema
 * @since 1.0.0
 */
const PrivateKeySchema = Schema.String.pipe(Schema.brand("PrivateKey"));

export const PrivateKeyFromString = Schema.transformOrFail(
  Schema.String, // input type
  PrivateKeySchema, // output type
  {
    strict: true,
    decode: (s, _, ast) =>
      ParseResult.try({
        try: () => {
          // Normalize: ensure 0x prefix
          const normalized = s.startsWith("0x") ? s : `0x${s}`;
          // Validate: must be 0x followed by exactly 64 hex chars
          if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
            throw new Error("Invalid private key format");
          }
          return normalized;
        },
        catch: () => new ParseResult.Type(ast, s),
      }),
    encode: ParseResult.succeed, // encoding: identity
  }
);

/**
 * Private key - a 32-byte (256-bit) secret value in hex format with 0x prefix
 *
 * @category Type
 * @since 1.0.0
 */
export type PrivateKey = typeof PrivateKeyFromString.Type;

/**
 * Public key schema - derived from private key using secp256k1 elliptic curve
 * Uncompressed format: 64 bytes (x,y coordinates) with 0x04 prefix
 *
 * Pipeline:
 * 1. Transform: Normalize and validate using ethers.SigningKey.computePublicKey
 * 2. Brand: Apply type brand for type safety
 *
 * @category Schema
 * @since 1.0.0
 */
const PublicKeySchema = Schema.String.pipe(Schema.brand("PublicKey"));

const PublicKeyFromString = Schema.transformOrFail(
  Schema.String, // input type
  PublicKeySchema, // output type
  {
    strict: true,
    decode: (s, _, ast) =>
      ParseResult.try({
        try: () => ethers.SigningKey.computePublicKey(s, false), // normalize + validate (uncompressed format)
        catch: () => new ParseResult.Type(ast, s),
      }),
    encode: ParseResult.succeed, // encoding: identity
  }
);

/**
 * Public key - derived from private key using secp256k1 elliptic curve
 * Uncompressed format: 64 bytes (x,y coordinates) with 0x04 prefix
 *
 * @category Type
 * @since 1.0.0
 */
export type PublicKey = typeof PublicKeyFromString.Type;

/**
 * Address schema - Ethereum address: last 20 bytes of Keccak-256 hash of public key
 * Checksummed format with 0x prefix
 *
 * Pipeline:
 * 1. Transform: Normalize input by ensuring 0x prefix
 * 2. Pattern: Validate format (0x + exactly 40 hex characters)
 * 3. Transform: Apply checksum using ethers.getAddress
 * 4. Brand: Apply type brand for type safety
 *
 * @category Schema
 * @since 1.0.0
 */
const AddressSchema = Schema.String.pipe(Schema.brand("Address"));

const AddressFromString = Schema.transformOrFail(
  Schema.String, // input type
  AddressSchema, // output type
  {
    strict: true,
    decode: (s, _, ast) =>
      ParseResult.try({
        try: () => ethers.getAddress(s), // normalize + validate
        catch: () => new ParseResult.Type(ast, s),
      }),
    encode: ParseResult.succeed, // encoding: identity
  }
);

/**
 * Ethereum address - last 20 bytes of Keccak-256 hash of public key
 * Checksummed format with 0x prefix
 *
 * @category Type
 * @since 1.0.0
 */
export type Address = typeof AddressFromString.Type;

/**
 * Complete key data schema containing all three components
 * All fields are automatically normalized and validated through their schemas
 *
 * @category Schema
 * @since 1.0.0
 */
export const KeyDataSchema = Schema.Struct({
  privateKey: PrivateKeySchema,
  publicKey: PublicKeySchema,
  address: AddressFromString,
});

/**
 * Complete key data containing all three components
 *
 * @category Type
 * @since 1.0.0
 */
export type KeyData = typeof KeyDataSchema.Type;

// ============================================================================
// ERRORS
// ============================================================================

/**
 * Invalid private key format error
 *
 * @category Error
 * @since 1.0.0
 */
export class InvalidPrivateKeyError extends Data.TaggedError(
  "InvalidPrivateKeyError"
)<{
  readonly reason: string;
}> {}

/**
 * Invalid address format error
 *
 * @category Error
 * @since 1.0.0
 */
export class InvalidAddressError extends Data.TaggedError(
  "InvalidAddressError"
)<{
  readonly reason: string;
}> {}

// ============================================================================
// NAMESPACE EXPORTS
// ============================================================================

/**
 * PrivateKey namespace with schema, constructor, guard, and equivalence
 *
 * @category Namespace
 * @since 1.0.0
 */
export const PrivateKey = {
  Schema: PrivateKeySchema,
  // Effectful decoding from unknown data
  decode: Schema.decode(PrivateKeySchema),
  // Synchronous decode, throws on failure
  decodeSync: Schema.decodeSync(PrivateKeySchema),
  // Pure constructor for already-validated strings
  make: PrivateKeySchema.make,
  // Type guard
  is: Schema.is(PrivateKeySchema),
  // Structural equivalence
  Equivalence: Schema.equivalence(PrivateKeySchema),
  // Deterministic encoding
  toString: Schema.encodeSync(PrivateKeySchema),
};

/**
 * PublicKey namespace with schema and constructor
 *
 * @category Namespace
 * @since 1.0.0
 */
export const PublicKey = {
  Schema: PublicKeySchema,
  // Effectful decoding from unknown data
  decode: Schema.decode(PublicKeyFromString),
  // Synchronous decode, throws on failure
  decodeSync: Schema.decodeSync(PublicKeyFromString),
  // Pure constructor for already-validated strings
  make: PublicKeySchema.make,
  // Type guard
  is: Schema.is(PublicKeySchema),
  // Structural equivalence
  Equivalence: Schema.equivalence(PublicKeySchema),
  // Deterministic encoding
  toString: Schema.encodeSync(PublicKeySchema),
};

/**
 * Address namespace with schema, constructor, guard, and equivalence
 *
 * @category Namespace
 * @since 1.0.0
 */
export const Address = {
  Schema: AddressSchema,
  // Effectful decoding from unknown data
  decode: Schema.decode(AddressFromString),
  // Synchronous decode, throws on failure
  decodeSync: Schema.decodeSync(AddressFromString),
  // Pure constructor for already-validated strings
  make: AddressSchema.make,
  // Type guard
  is: Schema.is(AddressSchema),
  // Structural equivalence
  Equivalence: Schema.equivalence(AddressSchema),
  // Deterministic encoding
  toString: Schema.encodeSync(AddressSchema),
};

/**
 * KeyData namespace with schema, constructor, guard, and equivalence
 *
 * @category Namespace
 * @since 1.0.0
 */
export const KeyData = {
  Schema: KeyDataSchema,
  // TODO does `KeyData` need effectful decode/encode methods ?
  // below `make` is sufficient for now
  // since all fields are validated individually (see `eth_manager.ts`)
  // Pure constructor for already-validated components
  make: KeyDataSchema.make,
  // Type guard
  is: Schema.is(KeyDataSchema),
  // Structural equivalence
  Equivalence: Schema.equivalence(KeyDataSchema),
  // Deterministic encoding
  toString: Schema.encodeSync(KeyDataSchema),
};
