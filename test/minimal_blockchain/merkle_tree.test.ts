/**
 * Merkle Proof Generation & Verification Tests
 *
 * Focused test suite for proof generation and verification flow
 */

import { assert, describe, it } from "@effect/vitest";
import { Chunk, Effect, Either } from "effect";
import {
  MerkleBuild,
  MerkleProofService,
  MerkleRoot,
  MerkleServiceLive,
} from "../../src/minimal_blockchain/domain/merkle_service";
import {
  makeValidDataIndex,
  MerkleHash,
} from "../../src/minimal_blockchain/domain/merkle_tree";

describe("Merkle Proof Generation & Verification", () => {
  describe("Valid Proofs", () => {
    it.effect(
      "should generate and verify proof for first transaction in 4-leaf tree",
      () =>
        Effect.gen(function* () {
          // Arrange: Build tree with 4 transactions
          const transactions = Chunk.make(
            "Alice sends 10 ETH to Bob",
            "Charlie sends 5 ETH to David",
            "Eve sends 3 ETH to Frank",
            "Grace sends 7 ETH to Henry"
          );

          const builder = yield* MerkleBuild;
          const tree = builder.build(transactions);

          const merkleRoot = yield* MerkleRoot;
          const rootHash = merkleRoot.getRootHash(tree);

          // Act: Generate proof for index 0
          const proofService = yield* MerkleProofService;
          const dataIndex = Either.getOrThrow(makeValidDataIndex(tree, 0));

          const proof = proofService.generateProof(tree, dataIndex);

          // Assert: Verify proof is valid
          const result = proofService.verifyProof(proof, rootHash);
          assert.isTrue(Either.isRight(result));
          assert.strictEqual(Either.getOrThrow(result), true);
        }).pipe(Effect.provide(MerkleServiceLive))
    );

    it.effect(
      "should generate and verify proof for last transaction in 4-leaf tree",
      () =>
        Effect.gen(function* () {
          // Arrange
          const transactions = Chunk.make("tx0", "tx1", "tx2", "tx3");

          const builder = yield* MerkleBuild;
          const tree = builder.build(transactions);

          const merkleRoot = yield* MerkleRoot;
          const rootHash = merkleRoot.getRootHash(tree);

          // Act: Generate proof for index 3 (last)
          const proofService = yield* MerkleProofService;
          const dataIndex = Either.getOrThrow(makeValidDataIndex(tree, 3));

          const proof = proofService.generateProof(tree, dataIndex);

          // Assert
          const result = proofService.verifyProof(proof, rootHash);
          assert.isTrue(Either.isRight(result));
        }).pipe(Effect.provide(MerkleServiceLive))
    );

    it.effect("should generate and verify proof for middle transaction", () =>
      Effect.gen(function* () {
        // Arrange
        const transactions = Chunk.make("tx0", "tx1", "tx2", "tx3");

        const builder = yield* MerkleBuild;
        const tree = builder.build(transactions);

        const merkleRoot = yield* MerkleRoot;
        const rootHash = merkleRoot.getRootHash(tree);

        // Act: Generate proof for index 1 (middle)
        const proofService = yield* MerkleProofService;
        const dataIndex = Either.getOrThrow(makeValidDataIndex(tree, 1));

        const proof = proofService.generateProof(tree, dataIndex);

        // Assert
        const result = proofService.verifyProof(proof, rootHash);
        assert.isTrue(Either.isRight(result));
      }).pipe(Effect.provide(MerkleServiceLive))
    );

    it.effect("should work with single transaction tree", () =>
      Effect.gen(function* () {
        // Arrange
        const transactions = Chunk.make("single transaction");

        const builder = yield* MerkleBuild;
        const tree = builder.build(transactions);

        const merkleRoot = yield* MerkleRoot;
        const rootHash = merkleRoot.getRootHash(tree);

        // Act
        const proofService = yield* MerkleProofService;
        const dataIndex = Either.getOrThrow(makeValidDataIndex(tree, 0));

        const proof = proofService.generateProof(tree, dataIndex);

        // Assert: Single leaf should have empty proof path
        assert.strictEqual(Chunk.size(proof.steps), 0);

        const result = proofService.verifyProof(proof, rootHash);
        assert.isTrue(Either.isRight(result));
      }).pipe(Effect.provide(MerkleServiceLive))
    );

    it.effect("should work with odd number of leaves (3 leaves)", () =>
      Effect.gen(function* () {
        // Arrange
        const transactions = Chunk.make("tx0", "tx1", "tx2");

        const builder = yield* MerkleBuild;
        const tree = builder.build(transactions);

        const merkleRoot = yield* MerkleRoot;
        const rootHash = merkleRoot.getRootHash(tree);

        // Act: Verify all indices
        const proofService = yield* MerkleProofService;

        for (let i = 0; i < 3; i++) {
          const dataIndex = Either.getOrThrow(makeValidDataIndex(tree, i));

          const proof = proofService.generateProof(tree, dataIndex);

          const result = proofService.verifyProof(proof, rootHash);
          assert.isTrue(Either.isRight(result));
        }
      }).pipe(Effect.provide(MerkleServiceLive))
    );
  });

  describe("Invalid Proofs", () => {
    it.effect("should reject proof with tampered data", () =>
      Effect.gen(function* () {
        // Arrange
        const transactions = Chunk.make("tx0", "tx1", "tx2", "tx3");

        const builder = yield* MerkleBuild;
        const tree = builder.build(transactions);

        const merkleRoot = yield* MerkleRoot;
        const rootHash = merkleRoot.getRootHash(tree);

        const proofService = yield* MerkleProofService;
        const dataIndex = Either.getOrThrow(makeValidDataIndex(tree, 0));

        const proof = proofService.generateProof(tree, dataIndex);

        // Act: Tamper with the data
        const tamperedProof = { ...proof, data: "tampered transaction" };

        // Assert
        const result = proofService.verifyProof(tamperedProof, rootHash);
        assert.isTrue(Either.isLeft(result));
      }).pipe(Effect.provide(MerkleServiceLive))
    );

    it.effect("should reject proof with wrong root hash", () =>
      Effect.gen(function* () {
        // Arrange
        const transactions = Chunk.make("tx0", "tx1", "tx2", "tx3");

        const builder = yield* MerkleBuild;
        const tree = builder.build(transactions);

        const proofService = yield* MerkleProofService;
        const dataIndex = Either.getOrThrow(makeValidDataIndex(tree, 0));

        const proof = proofService.generateProof(tree, dataIndex);

        // Act: Use wrong root hash
        const wrongRootHash = "a".repeat(64) as MerkleHash;

        // Assert
        const result = proofService.verifyProof(proof, wrongRootHash);
        assert.isTrue(Either.isLeft(result));
      }).pipe(Effect.provide(MerkleServiceLive))
    );
  });

  describe("Proof Properties", () => {
    it.effect(
      "proof should have correct number of steps for power-of-2 leaves",
      () =>
        Effect.gen(function* () {
          // Arrange: 4 leaves = 2 levels = 2 proof steps
          const transactions = Chunk.make("tx0", "tx1", "tx2", "tx3");

          const builder = yield* MerkleBuild;
          const tree = builder.build(transactions);

          // Act
          const proofService = yield* MerkleProofService;
          const dataIndex = Either.getOrThrow(makeValidDataIndex(tree, 0));

          const proof = proofService.generateProof(tree, dataIndex);

          // Assert: 4 leaves requires log2(4) = 2 steps
          assert.strictEqual(Chunk.size(proof.steps), 2);
        }).pipe(Effect.provide(MerkleServiceLive))
    );

    it.effect("proof should contain correct data for verified index", () =>
      Effect.gen(function* () {
        // Arrange
        const expectedData = "Charlie sends 5 ETH to David";
        const transactions = Chunk.make(
          "Alice sends 10 ETH to Bob",
          expectedData,
          "Eve sends 3 ETH to Frank",
          "Grace sends 7 ETH to Henry"
        );

        const builder = yield* MerkleBuild;
        const tree = builder.build(transactions);

        // Act
        const proofService = yield* MerkleProofService;
        const dataIndex = Either.getOrThrow(makeValidDataIndex(tree, 1));

        const proof = proofService.generateProof(tree, dataIndex);

        // Assert
        assert.strictEqual(proof.data, expectedData);
        assert.strictEqual(proof.dataIndex, 1);
      }).pipe(Effect.provide(MerkleServiceLive))
    );
  });
});
