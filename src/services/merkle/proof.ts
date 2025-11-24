import { Chunk, Context, Either, Effect, Layer, Option } from "effect";
import { HashingService } from "./hash";
import {
  MerkleHash,
  MerkleNode,
  MerkleProof,
  MerkleProofStep,
  MerkleTree,
  ValidDataIndex,
  InvalidProofError,
  makeMerkleProof,
} from "../../entities/merkle_tree";
import { processLevel } from "./build";

// ============================================================================
// CAPABILITY: MERKLE PROOF
// ============================================================================

/**
 * MerkleProofService capability — generates and verifies Merkle proofs
 */
export class MerkleProofService extends Context.Tag(
  "@services/merkle/MerkleProofService"
)<
  MerkleProofService,
  {
    readonly generateProof: (
      tree: MerkleTree,
      dataIndex: ValidDataIndex
    ) => MerkleProof;
    readonly validateProof: (
      proof: MerkleProof,
      rootHash: MerkleHash
    ) => // TODO this `Either` may actually be less idiomatic than `Effect` here
    Either.Either<true, InvalidProofError>;
  }
>() {}

/**
 * Pure implementation of generateProof
 * @internal
 */
const generateProofPure = (
  tree: MerkleTree,
  dataIndex: ValidDataIndex,
  combineHashesFn: (left: MerkleHash, right: MerkleHash) => MerkleHash
): MerkleProof => {
  let currentLevel = tree.leaves as Chunk.NonEmptyChunk<MerkleNode>;
  let currentIndex = Option.some(dataIndex);
  let proofSteps = Chunk.empty<MerkleProofStep>();

  while (Chunk.size(currentLevel) > 1) {
    const { nextLevel, maybeProofStep, nextIndex } = processLevel(
      currentLevel,
      currentIndex,
      combineHashesFn
    );

    if (Option.isSome(maybeProofStep))
      proofSteps = Chunk.append(proofSteps, maybeProofStep.value);

    currentLevel = nextLevel;
    currentIndex = nextIndex;
  }

  // TODO vet this bs
  const data = Chunk.unsafeGet(tree.leaves, dataIndex as number).value;
  return makeMerkleProof({ steps: proofSteps, dataIndex, data });
};

/**
 * Pure implementation of verifyProof
 * @internal
 */
const verifyProofPure = (
  proof: MerkleProof,
  rootHash: MerkleHash,
  sha256Fn: (data: string) => MerkleHash
) => {
  let currentHash = sha256Fn(proof.data);

  for (const step of proof.steps) {
    const combined = step.isLeft
      ? step.siblingHash + currentHash
      : currentHash + step.siblingHash;

    currentHash = sha256Fn(combined);
  }

  return currentHash === rootHash
    ? Either.right<true>(true)
    : Either.left(
        new InvalidProofError({
          message: "Proof verification failed",
          expected: rootHash,
          actual: currentHash,
        })
      );
};

/**
 * Live implementation of MerkleProofService
 *
 * @category Services
 * @since 0.2.0
 */
export const MerkleProofServiceLive = Layer.effect(
  MerkleProofService,
  Effect.gen(function* () {
    const hashing = yield* HashingService;

    return MerkleProofService.of({
      generateProof: (tree, dataIndex) =>
        generateProofPure(tree, dataIndex, hashing.combineHashes),
      validateProof: (proof, rootHash) =>
        verifyProofPure(proof, rootHash, hashing.sha256),
    });
  })
);
