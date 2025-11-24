import { Chunk, Context, Effect, Layer } from "effect";
import { HashingService } from "./hash";
import { MerkleHash, MerkleNode, MerkleTree } from "../../entities/merkle_tree";
import { buildNextLevel } from "./build";

// ============================================================================
// CAPABILITY: MERKLE ROOT
// ============================================================================

/**
 * MerkleRoot capability — computes and manages root hashes
 */
export class MerkleRoot extends Context.Tag("@services/merkle/MerkleRoot")<
  MerkleRoot,
  {
    readonly getRootHash: (tree: MerkleTree) => MerkleHash;
    readonly recomputeRoot: (tree: MerkleTree) => MerkleHash;
  }
>() {}

/**
 * Pure implementation of recomputeRoot
 * @internal
 */
const recomputeRootPure = (
  tree: MerkleTree,
  combineHashesFn: (left: MerkleHash, right: MerkleHash) => MerkleHash
) => {
  let currentLevel = tree.leaves as Chunk.NonEmptyChunk<MerkleNode>;

  while (Chunk.size(currentLevel) > 1)
    currentLevel = buildNextLevel(currentLevel, combineHashesFn);

  return Chunk.headNonEmpty(currentLevel).hash;
};

/**
 * Live implementation of MerkleRoot
 *
 * @category Services
 * @since 0.2.0
 */
export const MerkleRootLive = Layer.effect(
  MerkleRoot,
  Effect.gen(function* () {
    const hashing = yield* HashingService;

    return MerkleRoot.of({
      getRootHash: (tree: MerkleTree) => tree.root.hash,
      recomputeRoot: (tree) => recomputeRootPure(tree, hashing.combineHashes),
    });
  })
);
