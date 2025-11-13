/**
 * Utility functions for Ethereum operations
 *
 * Pure helper functions for:
 * - Formatting and display
 * - Hash shortening
 * - Pretty printing
 *
 * @since 1.0.0
 */

import { Effect } from "effect";
import * as Key from "./domain/key";
import * as Signature from "./domain/signature";

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Shorten a hex string for display (e.g., "0x1234...abcd")
 *
 * @category Pure
 * @since 1.0.0
 * @example
 * ```typescript
 * shortenHex("0x1234567890abcdef", 4, 4) // "0x1234...cdef"
 * ```
 */
export const shortenHex = (
  hex: string,
  prefixLen = 6,
  suffixLen = 4
): string => {
  if (hex.length <= prefixLen + suffixLen + 3) return hex;
  return `${hex.slice(0, prefixLen)}...${hex.slice(-suffixLen)}`;
};

/**
 * Format a private key for safe display (hide most of it)
 *
 * @category Pure
 * @since 1.0.0
 */
export const formatPrivateKeySafe = (privateKey: Key.PrivateKey): string =>
  `${privateKey.slice(0, 6)}${"*".repeat(56)}${privateKey.slice(-4)}`;

/**
 * Format an address for display
 *
 * @category Pure
 * @since 1.0.0
 */
export const formatAddress = (address: Key.Address): string =>
  shortenHex(address, 6, 4);

/**
 * Create a separator line for console output
 *
 * @category Pure
 * @since 1.0.0
 */
export const separator = (length = 70, char = "="): string =>
  char.repeat(length);

/**
 * Create a header with separator lines
 *
 * @category Pure
 * @since 1.0.0
 */
export const header = (title: string, length = 70): string =>
  `${separator(length)}\n${title.padStart(
    (length + title.length) / 2
  )}\n${separator(length)}`;

// ============================================================================
// DISPLAY FUNCTIONS (Effect-wrapped for logging)
// ============================================================================

/**
 * Display key data in a formatted way using structured logging
 *
 * @category Display
 * @since 1.0.0
 */
export const displayKeyData = (keyData: Key.KeyData) =>
  Effect.log("NEW ETHEREUM KEY GENERATED").pipe(
    Effect.annotateLogs({
      privateKeySafe: formatPrivateKeySafe(keyData.privateKey),
      publicKey: shortenHex(keyData.publicKey, 10, 8),
      address: keyData.address,
      warning:
        "Keep your private key secret! Anyone with it can control the funds.",
    }),
    Effect.withLogSpan("key-generation")
  );

/**
 * Display loaded key information using structured logging
 *
 * @category Display
 * @since 1.0.0
 */
export const displayLoadedKey = (keyData: Key.KeyData) =>
  Effect.log("PRIVATE KEY LOADED").pipe(
    Effect.annotateLogs({
      address: keyData.address,
    }),
    Effect.withLogSpan("key-loading")
  );

/**
 * Display signature information using structured logging
 *
 * @category Display
 * @since 1.0.0
 */
export const displaySignature = (sigData: Signature.SignatureData) =>
  Effect.log("MESSAGE SIGNED").pipe(
    Effect.annotateLogs({
      message: sigData.message,
      messageHash: shortenHex(sigData.messageHash, 10, 8),
      signature: shortenHex(sigData.signature, 10, 8),
      r: shortenHex(sigData.r, 10, 8),
      s: shortenHex(sigData.s, 10, 8),
      v: sigData.v,
    }),
    Effect.withLogSpan("message-signing")
  );

/**
 * Display verification result using structured logging
 *
 * @category Display
 * @since 1.0.0
 */
export const displayVerification = (
  verification: Signature.VerificationResult,
  message: string
) =>
  Effect.log("SIGNATURE VERIFICATION").pipe(
    Effect.annotateLogs({
      message,
      expectedSigner: verification.expectedAddress,
      recoveredAddress: verification.recoveredAddress,
      isValid: verification.isValid,
      result: verification.isValid ? "✓ VALID" : "✗ INVALID",
    }),
    Effect.withLogSpan("signature-verification")
  );

/**
 * Display key derivation information using structured logging
 *
 * @category Display
 * @since 1.0.0
 */
export const displayKeyDerivation = (derivation: Signature.KeyDerivationInfo) =>
  Effect.log("KEY DERIVATION DEMONSTRATION").pipe(
    Effect.annotateLogs({
      privateKey: {
        hex: shortenHex(derivation.privateKey.hex, 10, 8),
        hexLength: derivation.privateKey.hexLength,
        bytes: derivation.privateKey.bytes,
      },
      publicKey: {
        hex: shortenHex(derivation.publicKey.hex, 10, 8),
        hexLength: derivation.publicKey.hexLength,
        bytes: derivation.publicKey.bytes,
      },
      address: {
        keccakHash: shortenHex(derivation.address.keccakHash, 10, 8),
        last20Bytes: derivation.address.last20Bytes,
        finalAddress: derivation.address.finalAddress,
      },
      insights: [
        "Private key is random 32 bytes",
        "Public key derived via elliptic curve (one-way)",
        "Address is last 20 bytes of Keccak hash",
        "Cannot reverse: Address ← Public Key ← Private Key",
      ],
    }),
    Effect.withLogSpan("key-derivation")
  );
