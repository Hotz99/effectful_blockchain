import { assert, describe, it } from "@effect/vitest";
import { Chunk, DateTime, Effect, Either, Layer } from "effect";
import { makeValidDataIndex, MerkleHash } from "../src/entities/merkle_tree";
import * as HashingService from "../src/services/merkle/hash";
import { MerkleBuild } from "../src/services/merkle/build";
import { MerkleProofService } from "../src/services/merkle/proof";
import { MerkleRoot } from "../src/services/merkle/root";
import * as MerkleTreeService from "../src/services/merkle";
import * as Event from "../src/entities/event";

const TestLayer = Layer.provide(
  MerkleTreeService.MerkleServiceLive,
  HashingService.HashingServiceLive
);

describe("Merkle Proof Generation & Verification", () => {
  describe("Valid Proofs", () => {
    it.effect(
      "should generate and verify proof for first transaction in 4-leaf tree",
      () =>
        Effect.gen(function* () {
          const timestamp = yield* DateTime.now;
          // Arrange: Build tree with 4 transactions
          const transactions = Chunk.make(
            Event.makeTransaction({
              timestamp,
              senderAddress: "Alice",
              receiverAddress: "Bob",
              amount: 10,
            }),
            Event.makeTransaction({
              timestamp,
              senderAddress: "Charlie",
              receiverAddress: "David",
              amount: 5,
            }),
            Event.makeTransaction({
              timestamp,
              senderAddress: "Eve",
              receiverAddress: "Frank",
              amount: 3,
            }),
            Event.makeTransaction({
              timestamp,
              senderAddress: "Grace",
              receiverAddress: "Henry",
              amount: 7,
            })
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
          const result = proofService.validateProof(proof, rootHash);
          assert.isTrue(Either.isRight(result));
          assert.strictEqual(Either.getOrThrow(result), true);
        }).pipe(Effect.provide(TestLayer))
    );

    it.effect("should generate and verify proof for middle transaction", () =>
      Effect.gen(function* () {
        // Arrange
        const timestamp = yield* DateTime.now;
        const transactions = Chunk.make(
          Event.makeTransaction({
            timestamp,
            senderAddress: "Alice",
            receiverAddress: "Bob",
            amount: 10,
          }),
          Event.makeTransaction({
            timestamp,
            senderAddress: "Charlie",
            receiverAddress: "David",
            amount: 5,
          }),
          Event.makeTransaction({
            timestamp,
            senderAddress: "Eve",
            receiverAddress: "Frank",
            amount: 3,
          }),
          Event.makeTransaction({
            timestamp,
            senderAddress: "Grace",
            receiverAddress: "Henry",
            amount: 7,
          })
        );

        const builder = yield* MerkleBuild;
        const tree = builder.build(transactions);

        const merkleRoot = yield* MerkleRoot;
        const rootHash = merkleRoot.getRootHash(tree);

        // Act: Generate proof for index 1 (middle)
        const proofService = yield* MerkleProofService;
        const dataIndex = Either.getOrThrow(makeValidDataIndex(tree, 1));

        const proof = proofService.generateProof(tree, dataIndex);

        // Assert
        const result = proofService.validateProof(proof, rootHash);
        assert.isTrue(Either.isRight(result));
      }).pipe(Effect.provide(TestLayer))
    );

    it.effect("should work with single transaction tree", () =>
      Effect.gen(function* () {
        // Arrange
        const transactions = Chunk.make(
          Event.makeTransaction({
            timestamp: yield* DateTime.now,
            senderAddress: "Alice",
            receiverAddress: "Bob",
            amount: 10,
          })
        );

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

        const result = proofService.validateProof(proof, rootHash);
        assert.isTrue(Either.isRight(result));
      }).pipe(Effect.provide(TestLayer))
    );
  });

  describe("Invalid Proofs", () => {
    it.effect("should reject proof with tampered data", () =>
      Effect.gen(function* () {
        // Arrange
        const transactions = Chunk.make(
          Event.makeTransaction({
            timestamp: yield* DateTime.now,
            senderAddress: "Alice",
            receiverAddress: "Bob",
            amount: 10,
          })
        );

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
        const result = proofService.validateProof(tamperedProof, rootHash);
        assert.isTrue(Either.isLeft(result));
      }).pipe(Effect.provide(TestLayer))
    );

    it.effect("should reject proof with wrong root hash", () =>
      Effect.gen(function* () {
        // Arrange
        const transactions = Chunk.make(
          Event.makeTransaction({
            timestamp: yield* DateTime.now,
            senderAddress: "Alice",
            receiverAddress: "Bob",
            amount: 10,
          })
        );

        const builder = yield* MerkleBuild;
        const tree = builder.build(transactions);

        const proofService = yield* MerkleProofService;
        const dataIndex = Either.getOrThrow(makeValidDataIndex(tree, 0));

        const proof = proofService.generateProof(tree, dataIndex);

        // Act: Use wrong root hash
        const wrongRootHash = "a".repeat(64) as MerkleHash;

        // Assert
        const result = proofService.validateProof(proof, wrongRootHash);
        assert.isTrue(Either.isLeft(result));
      }).pipe(Effect.provide(TestLayer))
    );
  });

  describe("Proof Properties", () => {
    it.effect(
      "proof should have correct number of steps for power-of-2 leaves",
      () =>
        Effect.gen(function* () {
          // Arrange: 4 leaves = 2 levels = 2 proof steps
          const transactions = Chunk.make(
            Event.makeTransaction({
              timestamp: yield* DateTime.now,
              senderAddress: "Alice",
              receiverAddress: "Bob",
              amount: 10,
            }),
            Event.makeTransaction({
              timestamp: yield* DateTime.now,
              senderAddress: "Charlie",
              receiverAddress: "David",
              amount: 5,
            }),
            Event.makeTransaction({
              timestamp: yield* DateTime.now,
              senderAddress: "Eve",
              receiverAddress: "Frank",
              amount: 3,
            }),
            Event.makeTransaction({
              timestamp: yield* DateTime.now,
              senderAddress: "Grace",
              receiverAddress: "Henry",
              amount: 7,
            })
          );

          const builder = yield* MerkleBuild;
          const tree = builder.build(transactions);

          // Act
          const proofService = yield* MerkleProofService;
          const dataIndex = Either.getOrThrow(makeValidDataIndex(tree, 0));

          const proof = proofService.generateProof(tree, dataIndex);

          // Assert: 4 leaves requires log2(4) = 2 steps
          assert.strictEqual(Chunk.size(proof.steps), 2);
        }).pipe(Effect.provide(TestLayer))
    );
  });
});
