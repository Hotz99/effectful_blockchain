/**
 * Merkle Tree Demo
 *
 * Demonstrates the Merkle tree implementation with transactions
 */

import { Effect, Chunk, Logger, Either } from "effect";
import {
  MerkleBuild,
  MerkleProofService,
  MerkleRoot,
  MerkleDisplay,
  MerkleServiceLive,
} from "./domain/services/merkle_service";
import { HashingServiceLive } from "./domain/crypto";
import { makeValidDataIndex } from "./domain/entities/merkle_tree";

const header = (title: string) => {
  const separator = "=".repeat(70);
  return `${separator}\n${title}\n${separator}`;
};

/**
 * Main demonstration program
 */
const demonstration = Effect.gen(function* () {
  yield* Effect.log(header("MERKLE TREE DEMONSTRATION"));

  // Example transactions
  const transactions = Chunk.make(
    "Alice sends 10 ETH to Bob",
    "Charlie sends 5 ETH to David",
    "Eve sends 3 ETH to Frank",
    "Grace sends 7 ETH to Henry"
  );

  yield* Effect.log("\nBuilding Merkle tree with 4 transactions...");

  // Build the tree
  const builder = yield* MerkleBuild;
  const tree = builder.build(transactions);

  yield* Effect.log("\nTree Structure:");
  const display = yield* MerkleDisplay;
  yield* Effect.log(display.displayTree(tree));

  // Demonstrate proof generation and verification
  yield* Effect.log("\n" + header("MERKLE PROOF DEMONSTRATION"));

  // Validate and extract index, failing the Effect if out of bounds
  const dataIndex = yield* Either.match(makeValidDataIndex(tree, 1), {
    onLeft: (error) => Effect.fail(error),
    onRight: (index) => Effect.succeed(index),
  });

  yield* Effect.log(
    `\nProving inclusion of: '${Chunk.unsafeGet(transactions, dataIndex)}'`
  );

  // Generate proof
  const merkleProof = yield* MerkleProofService;
  const proof = merkleProof.generateProof(tree, dataIndex);
  const merkleRoot = yield* MerkleRoot;
  const rootHash = merkleRoot.getRootHash(tree);

  yield* Effect.log(`\nMerkle Proof (index ${dataIndex}):`);
  let stepNum = 1;
  for (const step of proof.steps) {
    const position = step.isLeft ? "LEFT" : "RIGHT";
    yield* Effect.log(
      ` Step ${stepNum}: ${step.siblingHash.slice(
        0,
        16
      )}... (sibling on ${position})`
    );
    stepNum++;
  }

  // Verify proof
  yield* Effect.log("\nVerifying proof...");
  const isValid = merkleProof.verifyProof(proof, rootHash);
  yield* Effect.log(`Result: ${isValid ? "VALID" : "INVALID"}`);

  // Test with tampered data
  yield* Effect.log("\nTesting with tampered data...");
  const tamperedProof = { ...proof, data: "Alice sends 100 ETH to Bob" };
  const isTamperedValid = merkleProof.verifyProof(tamperedProof, rootHash);
  yield* Effect.log(`Result: ${isTamperedValid ? "VALID" : "INVALID"}`);

  // Efficiency comparison
  yield* Effect.log("\n" + header("EFFICIENCY COMPARISON"));

  const sizes = [10, 100, 1000, 10000];
  yield* Effect.log(
    "\n| Data Blocks | Without Merkle | With Merkle | Efficiency Gain |"
  );
  yield* Effect.log(
    "|-------------|----------------|-------------|------------------|"
  );

  for (const size of sizes) {
    const withoutMerkle = size; // Need to check all blocks
    const withMerkle = Math.ceil(Math.log2(size)); // Only need log(n) hashes
    const efficiency = withoutMerkle / withMerkle;
    yield* Effect.log(
      `| ${String(size).padStart(11)} | ${String(withoutMerkle).padStart(
        14
      )} | ${String(withMerkle).padStart(11)} | ${efficiency
        .toFixed(1)
        .padStart(14)}x |`
    );
  }
});

// ============================================================================
// EXECUTE DEMONSTRATION
// ============================================================================

/**
 * Run the demonstration with the Logger and Merkle services
 */
const program = demonstration.pipe(
  Effect.provide(MerkleServiceLive),
  Effect.provide(HashingServiceLive),
  Effect.provide(Logger.pretty)
);

program.pipe(Effect.runPromise);

/**
 * Export the main program for external execution
 */
export const main = program;
