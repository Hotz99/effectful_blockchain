/**
 * Ethereum Key Manager - Effect-TS service for Ethereum cryptographic operations
 *
 * This module provides a capability-based service for:
 * - Key generation (random private keys)
 * - Key loading (from existing private keys)
 * - Message signing (ECDSA signatures)
 * - Signature verification (address recovery)
 * - Key derivation demonstration
 *
 * Following Effect-TS patterns:
 * - Pure functions wrapped with Effect.succeed
 * - Sync impure functions wrapped with Effect.sync
 * - Promise-based operations wrapped with Effect.tryPromise
 * - Service dependencies via Context.Tag
 * - Errors as tagged discriminated unions
 *
 * @since 1.0.0
 */

import { Effect, Context, Layer, Schema, ParseResult } from "effect";
import { ethers } from "ethers";
import * as Key from "./domain/key";
import * as Signature from "./domain/signature";
import * as Errors from "./domain/errors";
import { ParseError } from "effect/ParseResult";
import { PrivateKeyFromString } from "./domain/key";

// ============================================================================
// SERVICE DEFINITIONS - Fine-Grained Capabilities
// ============================================================================

/**
 * KeyGenerator - Capability for generating new random Ethereum keys
 *
 * @category Service
 * @since 1.0.0
 */
export class KeyGenerator extends Context.Tag("@ethereum/KeyGenerator")<
  KeyGenerator,
  {
    readonly generate: Effect.Effect<
      Key.KeyData,
      Errors.KeyGenerationError | ParseError
    >;
  }
>() {}

/**
 * KeyLoader - Capability for loading existing private keys
 *
 * @category Service
 * @since 1.0.0
 */
export class KeyLoader extends Context.Tag("@ethereum/KeyLoader")<
  KeyLoader,
  {
    readonly loadFromHex: (
      privateKeyHex: string
    ) => Effect.Effect<
      Key.KeyData,
      ParseResult.ParseError | Errors.CryptographicError
    >;
  }
>() {}

/**
 * MessageSigner - Capability for signing messages with ECDSA
 *
 * @category Service
 * @since 1.0.0
 */
export class MessageSigner extends Context.Tag("@ethereum/MessageSigner")<
  MessageSigner,
  {
    readonly sign: (
      privateKey: Key.PrivateKey,
      message: string
    ) => Effect.Effect<Signature.SignatureData, Errors.SigningError>;
  }
>() {}

/**
 * SignatureVerifier - Capability for verifying signatures and recovering addresses
 *
 * @category Service
 * @since 1.0.0
 */
export class SignatureVerifier extends Context.Tag(
  "@ethereum/SignatureVerifier"
)<
  SignatureVerifier,
  {
    readonly verify: (
      message: string,
      signature: Signature.Signature,
      expectedAddress: Key.Address
    ) => Effect.Effect<
      Signature.VerificationResult,
      Signature.SignatureVerificationError
    >;
  }
>() {}

/**
 * KeyDerivationAnalyzer - Capability for demonstrating key derivation process
 *
 * @category Service
 * @since 1.0.0
 */
export class KeyDerivationAnalyzer extends Context.Tag(
  "@ethereum/KeyDerivationAnalyzer"
)<
  KeyDerivationAnalyzer,
  {
    readonly analyze: (
      privateKey: Key.PrivateKey
    ) => Effect.Effect<Signature.KeyDerivationInfo, Errors.KeyDerivationError>;
  }
>() {}

// ============================================================================
// IMPLEMENTATION - LIVE LAYER
// ============================================================================

// TODO use Schema.decode inside Effect so failures surface
// as typed ParseError in the Effect error channel
// instead of throwing ?
// if so, adjust 'lifting_into_effectts.md' accordingly

/**
 * Generate a new random Ethereum key
 * Uses schema validation to lift raw ethers output into domain types
 *
 * @category Implementation
 * @since 1.0.0
 */
const generateNewKeyImpl = Effect.try({
  try: () => ethers.Wallet.createRandom(),
  catch: (error) =>
    // Explicit handling to translate `ethers` errors into domain errors
    new Errors.KeyGenerationError({
      reason: `Failed to generate random wallet: ${
        error instanceof Error ? error.message : String(error)
      }`,
      cause: error,
    }),
}).pipe(
  Effect.flatMap((wallet) =>
    Schema.decode(Key.KeyDataSchema)({
      privateKey: wallet.privateKey,
      publicKey: wallet.signingKey.publicKey,
      address: wallet.address,
    })
  )
);

/**
 * Load an existing private key
 * Uses schema validation to lift user input into domain types
 *
 * @category Implementation
 * @since 1.0.0
 */
const loadPrivateKeyImpl = (privateKeyHex: string) =>
  Effect.gen(function* () {
    // Validate the private key via schema
    const privateKey = yield* Schema.decode(PrivateKeyFromString)(
      privateKeyHex
    );

    // Load into ethers wallet and decode full KeyData
    const keyData = yield* Effect.try({
      try: () => {
        const wallet = new ethers.Wallet(privateKey);
        return {
          privateKey,
          // `ethers.Wallet` provides validated public key and address
          // hence use `make` and not `decode`
          publicKey: Key.PublicKey.make(wallet.signingKey.publicKey),
          address: Key.Address.make(wallet.address),
        };
      },
      catch: (error) =>
        // Explicit handling to translate `ethers` errors into domain errors
        new Errors.CryptographicError({
          operation: "loadPrivateKey",
          reason: `Failed to load private key into wallet: ${
            error instanceof Error ? error.message : String(error)
          }`,
          cause: error,
        }),
    });

    // `keyData` has already been type-validated via schema decoding
    // hence we use pure & direct ctor `make()`
    return Key.KeyData.make(keyData);
  });

/**
 * Sign a message with a private key
 * Uses Effect.tryPromise because signMessage returns a Promise
 *
 * @category Implementation
 * @since 1.0.0
 */
const signMessageImpl = (privateKey: Key.PrivateKey, message: string) =>
  Effect.tryPromise({
    try: async () => {
      const wallet = new ethers.Wallet(privateKey);
      const messageBytes = ethers.toUtf8Bytes(message);
      const signatureHex = await wallet.signMessage(messageBytes);

      // Parse signature to get r, s, v components
      const { v, s, r } = ethers.Signature.from(signatureHex);

      const messageHash = Signature.MessageHash.fromText(message);
      const signature = Signature.Signature.make(signatureHex);

      return Signature.SignatureData.make({
        message,
        messageHash,
        signature,
        r,
        s,
        v,
      });
    },
    catch: (error) =>
      new Errors.SigningError({
        message,
        reason: `Failed to sign message: ${
          error instanceof Error ? error.message : String(error)
        }`,
        cause: error,
      }),
  });

/**
 * Verify a signature and recover the signer's address
 * Uses Effect.sync because verification is synchronous (no promises, no randomness)
 *
 * @category Implementation
 * @since 1.0.0
 */
const verifySignatureImpl = (
  message: string,
  signature: Signature.Signature,
  expectedAddress: Key.Address
) =>
  Effect.try({
    try: () => {
      const messageBytes = ethers.toUtf8Bytes(message);
      const messageHash = ethers.hashMessage(messageBytes);
      const recoveredAddress = ethers.recoverAddress(messageHash, signature);
      const recoveredAddressChecksummed = ethers.getAddress(recoveredAddress);

      const isValid =
        recoveredAddressChecksummed.toLowerCase() ===
        expectedAddress.toLowerCase();

      return Signature.VerificationResult.make({
        isValid,
        recoveredAddress,
        expectedAddress,
      });
    },
    catch: (error) =>
      new Signature.SignatureVerificationError({
        reason: `Signature verification failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }),
  });

/**
 * Demonstrate step-by-step key derivation
 * Builds KeyData from validated fields, then computes metrics
 *
 * @category Implementation
 * @since 1.0.0
 */
const demonstrateKeyDerivationImpl = (privateKey: Key.PrivateKey) =>
  Effect.try({
    try: () => {
      const wallet = new ethers.Wallet(privateKey);
      const keyData = Key.KeyData.make({
        privateKey,
        publicKey: Key.PublicKey.make(wallet.signingKey.publicKey),
        address: Key.Address.make(wallet.address),
      });

      // TODO should this be moved to schema transformation ?
      // answer: Schema transformations should only handle representation normalization
      // (e.g., adding 0x, checksum casing) and input validation (pattern, checksum, length)
      // they should not perform semantic derivations or cryptographic computations
      const publicKeyBytes = ethers.getBytes(keyData.publicKey);
      // skip 0x04 prefix
      const publicKeyCoordinates = publicKeyBytes.slice(1);
      const keccakHashBytes = ethers.keccak256(publicKeyCoordinates);

      return Signature.KeyDerivationInfo.make(keyData, keccakHashBytes);
    },
    catch: (error) =>
      new Errors.KeyDerivationError({
        reason: `Key derivation analysis failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        cause: error,
      }),
  });

// ============================================================================
// LAYER IMPLEMENTATIONS
// ============================================================================

/**
 * Live implementation of KeyGenerator capability
 *
 * @category Layer
 * @since 1.0.0
 */
export const KeyGeneratorLive = Layer.succeed(KeyGenerator, {
  generate: generateNewKeyImpl,
});

/**
 * Live implementation of KeyLoader capability
 *
 * @category Layer
 * @since 1.0.0
 */
export const KeyLoaderLive = Layer.succeed(KeyLoader, {
  loadFromHex: loadPrivateKeyImpl,
});

/**
 * Live implementation of MessageSigner capability
 *
 * @category Layer
 * @since 1.0.0
 */
export const MessageSignerLive = Layer.succeed(MessageSigner, {
  sign: signMessageImpl,
});

/**
 * Live implementation of SignatureVerifier capability
 *
 * @category Layer
 * @since 1.0.0
 */
export const SignatureVerifierLive = Layer.succeed(SignatureVerifier, {
  verify: verifySignatureImpl,
});

/**
 * Live implementation of KeyDerivationAnalyzer capability
 *
 * @category Layer
 * @since 1.0.0
 */
export const KeyDerivationAnalyzerLive = Layer.succeed(KeyDerivationAnalyzer, {
  analyze: demonstrateKeyDerivationImpl,
});

/**
 * Composed layer providing all Ethereum key management capabilities
 *
 * @category Layer
 * @since 1.0.0
 */
export const EthManagerLive = Layer.mergeAll(
  KeyGeneratorLive,
  KeyLoaderLive,
  MessageSignerLive,
  SignatureVerifierLive,
  KeyDerivationAnalyzerLive
);
