/**
 * Domain types for Ethereum message signatures
 *
 * This module encapsulates:
 * - Branded types for Signature, MessageHash
 * - Signature verification result types
 * - Constructors and validation functions
 *
 * @since 1.0.0
 */

import { Data, Schema, ParseResult } from "effect";
import { ethers } from "ethers";
import * as Key from "./key";

// ============================================================================
// PRIMITIVE SCHEMAS
// ============================================================================
// TODO reuse from key.ts ? or move both to common utils to avoid duplication
/**
 * Hex string validation (starts with 0x followed by hex chars)
 *
 * @category Schema
 * @since 1.0.0
 */
const HexStringSchema = Schema.String.pipe(Schema.pattern(/^0x[0-9a-fA-F]+$/));

/**
 * Recovery parameter (v value: 27 or 28)
 *
 * @category Schema
 * @since 1.0.0
 */
const RecoveryParameterSchema = Schema.Union(
  Schema.Literal(27),
  Schema.Literal(28)
);

// ============================================================================
// BRANDED TYPES
// ============================================================================

/**
 * Message hash schema - Keccak-256 hash of a message
 *
 * @category Schema
 * @since 1.0.0
 */
const MessageHashSchema = HexStringSchema.pipe(Schema.brand("MessageHash"));

/**
 * Message hash type - Keccak-256 hash of a message
 *
 * @category Type
 * @since 1.0.0
 */
export type MessageHash = typeof MessageHashSchema.Type;

/**
 * Signature schema - ECDSA signature in hex format
 * Contains r, s, v components packed together
 *
 * @category Schema
 * @since 1.0.0
 */
const SignatureSchema = HexStringSchema.pipe(Schema.brand("Signature"));

/**
 * Signature type - ECDSA signature in hex format
 * Contains r, s, v components packed together
 *
 * @category Type
 * @since 1.0.0
 */
export type Signature = typeof SignatureSchema.Type;

// ============================================================================
// SCHEMA-BASED MODELS
// ============================================================================

/**
 * Complete signature data with all components
 * Schema-based model using Effect Schema for validation
 *
 * @category Schema
 * @since 1.0.0
 */
const SignatureDataSchema = Schema.Struct({
  message: Schema.String,
  messageHash: MessageHashSchema,
  signature: SignatureSchema,
  r: HexStringSchema,
  s: HexStringSchema,
  v: RecoveryParameterSchema,
});

export type SignatureData = typeof SignatureDataSchema.Type;

/**
 * Verification result with recovered address matching
 * Schema-based model for type safety and validation
 *
 * @category Schema
 * @since 1.0.0
 */
const VerificationResultSchema = Schema.Struct({
  isValid: Schema.Boolean,
  recoveredAddress: Schema.String,
  expectedAddress: Schema.String,
});

export type VerificationResult = typeof VerificationResultSchema.Type;

/**
 * Key derivation information with computed metrics
 * Transforms from KeyData by computing hex length and byte count
 *
 * @category Schema
 * @since 1.0.0
 */
const KeyMetricsSchema = Schema.Struct({
  hex: HexStringSchema,
  hexLength: Schema.Number.pipe(Schema.int()),
  bytes: Schema.Number.pipe(Schema.int()),
});

const AddressMetricsSchema = Schema.Struct({
  keccakHash: HexStringSchema,
  last20Bytes: Schema.String,
  finalAddress: Schema.String,
});

const KeyDerivationInfoSchema = Schema.Struct({
  privateKey: KeyMetricsSchema,
  publicKey: KeyMetricsSchema,
  address: AddressMetricsSchema,
});

/**
 * Transform from (KeyData + keccakHash) to KeyDerivationInfo
 * Computes metrics: hexLength and bytes from hex string lengths
 *
 * @category Schema
 * @since 1.0.0
 */
export const KeyDerivationInfoFromKeyData = Schema.transformOrFail(
  Schema.Struct({
    keyData: Key.KeyData.Schema,
    keccakHash: HexStringSchema,
  }),
  KeyDerivationInfoSchema,
  {
    strict: true,
    decode: ({ keyData, keccakHash }, _, ast) =>
      ParseResult.try({
        try: () => ({
          privateKey: {
            hex: keyData.privateKey,
            hexLength: keyData.privateKey.length - 2,
            bytes: (keyData.privateKey.length - 2) / 2,
          },
          publicKey: {
            hex: keyData.publicKey,
            hexLength: keyData.publicKey.length - 2,
            bytes: (keyData.publicKey.length - 2) / 2,
          },
          address: {
            keccakHash,
            last20Bytes: keyData.address.slice(-40),
            finalAddress: keyData.address,
          },
        }),
        catch: () => new ParseResult.Type(ast, { keyData, keccakHash }),
      }),
    encode: (derivation, _, ast) =>
      ParseResult.try({
        try: () => {
          return {
            // TODO can we avoid reconstructing KeyData here ?
            keyData: Key.KeyData.make({
              privateKey: Key.PrivateKey.make(derivation.privateKey.hex),
              publicKey: Key.PublicKey.make(derivation.publicKey.hex),
              address: Key.Address.make(derivation.address.finalAddress),
            }),
            keccakHash: derivation.address.keccakHash,
          };
        },
        catch: () => new ParseResult.Type(ast, derivation),
      }),
  }
);

export type KeyDerivationInfo = typeof KeyDerivationInfoSchema.Type;

// ============================================================================
// ERRORS
// ============================================================================

/**
 * Invalid signature format error
 *
 * @category Error
 * @since 1.0.0
 */
export class InvalidSignatureError extends Data.TaggedError(
  "InvalidSignatureError"
)<{
  readonly reason: string;
}> {}

/**
 * Signature verification failure error
 *
 * @category Error
 * @since 1.0.0
 */
export class SignatureVerificationError extends Data.TaggedError(
  "SignatureVerificationError"
)<{
  readonly reason: string;
}> {}

// ============================================================================
// CONSTRUCTORS
// ============================================================================

/**
 * Create a MessageHash from text (by hashing it)
 *
 * @category Constructor
 * @since 1.0.0
 * @example
 * ```typescript
 * const hash = MessageHash.fromText("Hello, Blockchain!")
 * ```
 */
export const makeMessageHashFromText = (message: string): MessageHash => {
  const hash = ethers.id(message);
  return Schema.decodeSync(MessageHashSchema)(hash);
};

/**
 * Create a MessageHash from existing hash string
 *
 * @category Constructor
 * @since 1.0.0
 */
export const makeMessageHash = (hash: string): MessageHash =>
  Schema.decodeSync(MessageHashSchema)(hash);

/**
 * Create a Signature from hex string
 *
 * @category Constructor
 * @since 1.0.0
 */
export const makeSignature = (sig: string): Signature =>
  Schema.decodeSync(SignatureSchema)(sig);

/**
 * Create complete SignatureData
 *
 * @category Constructor
 * @since 1.0.0
 */
export const makeSignatureData = (
  message: string,
  messageHash: MessageHash,
  signature: Signature,
  r: string,
  s: string,
  v: 27 | 28
) =>
  SignatureDataSchema.make({
    message,
    messageHash,
    signature,
    r,
    s,
    v,
  });

/**
 * Create VerificationResult
 *
 * @category Constructor
 * @since 1.0.0
 */
export const makeVerificationResult = (
  isValid: boolean,
  recoveredAddress: string,
  expectedAddress: string
) =>
  VerificationResultSchema.make({
    isValid,
    recoveredAddress,
    expectedAddress,
  });

/**
 * Create KeyDerivationInfo from KeyData and keccakHash
 * Uses schema transformation to compute metrics from validated key data
 *
 * @category Constructor
 * @since 1.0.0
 */
export const makeKeyDerivationInfo = (
  keyData: Key.KeyData,
  keccakHash: string
) =>
  Schema.decodeSync(KeyDerivationInfoFromKeyData)({
    keyData,
    keccakHash,
  });

// ============================================================================
// DESTRUCTORS
// ============================================================================
// TODO does effect/Schema have built-in destructors ?
/**
 * Convert MessageHash to raw string
 *
 * @category Destructor
 * @since 1.0.0
 */
export const messageHashToString = (hash: MessageHash): string => hash;

/**
 * Convert Signature to raw string
 *
 * @category Destructor
 * @since 1.0.0
 */
export const signatureToString = (sig: Signature): string => sig;

// ============================================================================
// NAMESPACE EXPORT
// ============================================================================

export const MessageHash = {
  make: MessageHashSchema.make,
  fromText: makeMessageHashFromText,
  is: Schema.is(MessageHashSchema),
  Equivalence: Schema.equivalence(MessageHashSchema),
  toString: messageHashToString,
};

export const Signature = {
  make: SignatureSchema.make,
  is: Schema.is(SignatureSchema),
  Equivalence: Schema.equivalence(SignatureSchema),
  toString: signatureToString,
};

export const SignatureData = {
  make: SignatureDataSchema.make,
  is: Schema.is(SignatureDataSchema),
  Equivalence: Schema.equivalence(SignatureDataSchema),
  Schema: SignatureDataSchema,
};

export const VerificationResult = {
  make: VerificationResultSchema.make,
  is: Schema.is(VerificationResultSchema),
  Equivalence: Schema.equivalence(VerificationResultSchema),
  Schema: VerificationResultSchema,
};

export const KeyDerivationInfo = {
  Schema: KeyDerivationInfoSchema,
  // Effectful decoding from KeyData + keccakHash
  decode: Schema.decode(KeyDerivationInfoFromKeyData),
  // Synchronous decode, throws on failure
  decodeSync: Schema.decodeSync(KeyDerivationInfoFromKeyData),
  // Pure constructor using decoded schema
  make: makeKeyDerivationInfo,
  // Type guard
  is: Schema.is(KeyDerivationInfoSchema),
  // Structural equivalence
  Equivalence: Schema.equivalence(KeyDerivationInfoSchema),
  // Deterministic encoding
  toString: Schema.encodeSync(KeyDerivationInfoSchema),
};
