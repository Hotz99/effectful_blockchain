/**
 * Ethereum-related error types
 *
 * All errors are tagged using Effect's Data.TaggedError pattern
 * for exhaustive error handling and pattern matching
 *
 * @since 1.0.0
 */

import { Data } from "effect";

/**
 * No private key is currently loaded in the key manager
 *
 * @category Error
 * @since 1.0.0
 */
export class NoPrivateKeyLoadedError extends Data.TaggedError(
  "NoPrivateKeyLoadedError"
)<{
  readonly message: string;
}> {}

/**
 * Cryptographic operation failed
 *
 * @category Error
 * @since 1.0.0
 */
export class CryptographicError extends Data.TaggedError("CryptographicError")<{
  readonly operation: string;
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/**
 * Key generation failed
 *
 * @category Error
 * @since 1.0.0
 */
export class KeyGenerationError extends Data.TaggedError("KeyGenerationError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/**
 * Message signing failed
 *
 * @category Error
 * @since 1.0.0
 */
export class SigningError extends Data.TaggedError("SigningError")<{
  readonly message: string;
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/**
 * Key derivation analysis failed
 *
 * @category Error
 * @since 1.0.0
 */
export class KeyDerivationError extends Data.TaggedError("KeyDerivationError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}
