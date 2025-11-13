/**
 * Ethereum Key Management Demonstration
 *
 * This module demonstrates all Ethereum cryptographic operations:
 * - Key generation
 * - Key derivation
 * - Message signing
 * - Signature verification
 *
 * @since 1.0.0
 */

import { Effect } from "effect";
import * as EthManager from "./eth_manager";
import * as Utils from "./utils";

/**
 * 1. Generate new key
 * 2. Demonstrate key derivation
 * 3. Sign a message
 * 4. Verify signature
 * 5. Test with tampered message
 */
const demonstration = Effect.gen(function* () {
  yield* Effect.log(Utils.header("ETHEREUM KEY MANAGEMENT DEMONSTRATION"));

  yield* Effect.log("\nGenerating new Ethereum key...");
  const keyGenerator = yield* EthManager.KeyGenerator;
  const keyData = yield* keyGenerator.generate;
  yield* Utils.displayKeyData(keyData);

  yield* Effect.log("\nDemonstrating key derivation...");
  const analyzer = yield* EthManager.KeyDerivationAnalyzer;
  const derivation = yield* analyzer.analyze(keyData.privateKey);
  yield* Utils.displayKeyDerivation(derivation);

  yield* Effect.log("\nSigning a message...");
  const message = "Hello, Blockchain!";
  const signer = yield* EthManager.MessageSigner;
  const signature = yield* signer.sign(keyData.privateKey, message);
  yield* Utils.displaySignature(signature);

  yield* Effect.log("\nVerifying signature...");
  const verifier = yield* EthManager.SignatureVerifier;
  const verification = yield* verifier.verify(
    message,
    signature.signature,
    keyData.address
  );
  yield* Utils.displayVerification(verification, message);

  yield* Effect.log("\nTesting with tampered message...");
  const tamperedMessage = message + "!";
  const tamperedVerification = yield* verifier.verify(
    tamperedMessage,
    signature.signature,
    keyData.address
  );
  yield* Utils.displayVerification(tamperedVerification, tamperedMessage);
});

/**
 * Example: Load an existing private key
 */
export const loadExistingKeyExample = (privateKeyHex: string) =>
  Effect.gen(function* () {
    yield* Effect.log(Utils.header("LOADING EXISTING PRIVATE KEY"));

    const loader = yield* EthManager.KeyLoader;
    const keyData = yield* loader.loadFromHex(privateKeyHex);
    yield* Utils.displayKeyData(keyData);

    return keyData;
  }).pipe(Effect.provide(EthManager.EthManagerLive));

/**
 * Example: Sign and verify in one operation
 */
export const signAndVerifyExample = (privateKeyHex: string, message: string) =>
  Effect.gen(function* () {
    yield* Effect.log(Utils.header("SIGN AND VERIFY DEMONSTRATION"));

    const loader = yield* EthManager.KeyLoader;
    const keyData = yield* loader.loadFromHex(privateKeyHex);

    const signer = yield* EthManager.MessageSigner;
    const signature = yield* signer.sign(keyData.privateKey, message);

    const verifier = yield* EthManager.SignatureVerifier;
    const verification = yield* verifier.verify(
      message,
      signature.signature,
      keyData.address
    );

    yield* Utils.displaySignature(signature);
    yield* Utils.displayVerification(verification, message);

    return { signature, verification };
  }).pipe(Effect.provide(EthManager.EthManagerLive));

/**
 * Example: Generate and analyze a key
 */
export const generateAndAnalyzeExample = Effect.gen(function* () {
  yield* Effect.log(Utils.header("GENERATE AND ANALYZE KEY"));

  const keyGenerator = yield* EthManager.KeyGenerator;
  const keyData = yield* keyGenerator.generate;

  const analyzer = yield* EthManager.KeyDerivationAnalyzer;
  const derivation = yield* analyzer.analyze(keyData.privateKey);

  yield* Utils.displayKeyData(keyData);
  yield* Utils.displayKeyDerivation(derivation);

  return { keyData, derivation };
}).pipe(Effect.provide(EthManager.EthManagerLive));

// ============================================================================
// EXECUTE DEMONSTRATION
// ============================================================================

/**
 * Run the main demonstration
 * Uncomment to execute when running this file directly
 */
// Effect.runPromise(program).catch(console.error);

/**
 * Export the main program for external execution
 */
/**
 * Run the demonstration with the live EthereumKeyManager service
 */
const program = demonstration.pipe(Effect.provide(EthManager.EthManagerLive));
export const main = program;
