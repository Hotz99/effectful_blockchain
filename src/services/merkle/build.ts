import { Chunk, Context, Effect, Layer, Option } from "effect";
import { HashingService } from "./hash";
import {
  MerkleHash,
  MerkleNode,
  MerkleProofStep,
  MerkleTree,
  ValidDataIndex,
  makeBranchNode,
  makeLeafNode,
  makeMerkleTree,
  makeProofStep,
} from "../../entities/merkle_tree";
import * as Event from "../../entities/event";

// ============================================================================
// CAPABILITY: MERKLE BUILD
// ============================================================================

/**
 * MerkleBuild capability — builds Merkle trees from data blocks
 *
 * @category Capabilities
 * @since 0.2.0
 */
export class MerkleBuild extends Context.Tag("@services/merkle/MerkleBuild")<
  MerkleBuild,
  {
    readonly build: (
      dataBlocks: Chunk.NonEmptyChunk<Event.Event>
    ) => MerkleTree;
  }
>() {}

/**
 * Core level processing — shared by build and proof generation
 * Pairs nodes, computes hashes, and optionally tracks proof steps
 * @internal
 */
export const processLevel = (
  currentLevel: Chunk.NonEmptyChunk<MerkleNode>,
  currentIndex: Option.Option<ValidDataIndex>,
  combineHashesFn: (left: MerkleHash, right: MerkleHash) => MerkleHash
): {
  nextLevel: Chunk.NonEmptyChunk<MerkleNode>;
  maybeProofStep: Option.Option<MerkleProofStep>;
  nextIndex: Option.Option<ValidDataIndex>;
} => {
  const size = Chunk.size(currentLevel);
  let nextLevel = Chunk.empty<MerkleNode>();
  let maybeProofStep: Option.Option<MerkleProofStep> = Option.none();
  let nextIndex: Option.Option<ValidDataIndex> = Option.none();

  for (let i = 0; i < size; i += 2) {
    const left = Chunk.unsafeGet(currentLevel, i);
    const right = i + 1 < size ? Chunk.unsafeGet(currentLevel, i + 1) : left;

    const hash = combineHashesFn(left.hash, right.hash);
    const parent = makeBranchNode({
      left: Option.some(left),
      right: Option.some(right),
      hash,
    });
    nextLevel = Chunk.append(nextLevel, parent);

    if (Option.isSome(currentIndex)) {
      if (currentIndex.value === i) {
        maybeProofStep = Option.some(
          makeProofStep({ siblingHash: right.hash, isLeft: false })
        );
        // TODO is this cast safe or must we validate the validity of the index again ?
        // TODO2 make sure the below is reasonable
        // answer: it is safe because we are moving up the tree, so the index will always be valid
        // ie idx (of type `ValidDataIndex`) in level with n leaves
        // ie idx in [0, n-1] => idx/2 in [0, n/2 - 1]
        nextIndex = Option.some(Math.floor(i / 2) as ValidDataIndex);
      } else if (currentIndex.value === i + 1) {
        maybeProofStep = Option.some(
          makeProofStep({ siblingHash: left.hash, isLeft: true })
        );
        nextIndex = Option.some(Math.floor(i / 2) as ValidDataIndex);
      }
    }
  }

  return {
    nextLevel: nextLevel as Chunk.NonEmptyChunk<MerkleNode>,
    maybeProofStep,
    nextIndex,
  };
};

/**
 * Pure implementation of buildNextLevel
 * @internal
 */
export const buildNextLevel = (
  currentLevel: Chunk.NonEmptyChunk<MerkleNode>,
  combineHashesFn: (left: MerkleHash, right: MerkleHash) => MerkleHash
) => processLevel(currentLevel, Option.none(), combineHashesFn).nextLevel;

/**
 * Pure implementation of build
 * @internal
 */
const buildPure = (
  dataBlocks: Chunk.NonEmptyChunk<Event.Event>,
  sha256Fn: (data: string) => MerkleHash,
  combineHashesFn: (left: MerkleHash, right: MerkleHash) => MerkleHash
) => {
  // Create leaf nodes
  const leaves = Chunk.map(dataBlocks, (block) => {
    const serialized = JSON.stringify(block);
    const hash = sha256Fn(serialized);
    return makeLeafNode({ hash, value: serialized });
  });

  // Build tree bottom-up
  // cast is safe bc `MerkleLeaf` is a variant/member of `MerkleNode` union type
  let currentLevel = leaves as Chunk.NonEmptyChunk<MerkleNode>;

  while (Chunk.size(currentLevel) > 1)
    currentLevel = buildNextLevel(currentLevel, combineHashesFn);

  // Root is the last remaining node
  const root = Chunk.headNonEmpty(currentLevel);

  return makeMerkleTree({ root, leaves, dataBlocks });
};

/**
 * Live implementation of MerkleBuild
 *
 * @category Services
 * @since 0.2.0
 */
export const MerkleBuildLive = Layer.effect(
  MerkleBuild,
  Effect.gen(function* () {
    const hashing = yield* HashingService;

    return MerkleBuild.of({
      build: (data) => buildPure(data, hashing.sha256, hashing.combineHashes),
    });
  })
);
