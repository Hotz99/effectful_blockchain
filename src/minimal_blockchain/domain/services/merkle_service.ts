/**
 * Merkle Service — Effect-Based Capabilities
 *
 * This module provides fine-grained capability services for Merkle tree operations.
 * Each capability represents exactly one cohesive set of operations.
 *
 * Capabilities:
 * - MerkleBuild — builds trees from data blocks
 * - MerkleRoot — computes and manages root hashes
 * - MerkleProofService — generates and verifies proofs
 *
 * Dependencies:
 * - MerkleBuild and MerkleProofService require HashingService for hash computation
 *
 * @module MerkleService
 * @since 0.2.0
 */

import { Chunk, Context, Effect, Either, Layer, Option } from "effect";
import { HashingService } from "../crypto";
import {
  makeLeafNode,
  makeMerkleTree,
  MerkleNode,
  makeInternalNode,
  MerkleTree,
  MerkleHash,
  MerkleProof,
  makeMerkleProof,
  makeProofStep,
  InvalidProofError,
  ValidDataIndex,
  MerkleProofStep,
} from "../entities/merkle_tree";

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
    readonly build: (data: Chunk.NonEmptyChunk<string>) => MerkleTree;
  }
>() {}

/**
 * Core level processing — shared by build and proof generation
 * Pairs nodes, computes hashes, and optionally tracks proof steps
 * @internal
 */
const processLevel = (
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
    const parent = makeInternalNode(left, right, hash);
    nextLevel = Chunk.append(nextLevel, parent);

    if (Option.isSome(currentIndex)) {
      if (currentIndex.value === i) {
        maybeProofStep = Option.some(makeProofStep(right.hash, false));
        // TODO is this cast safe or must we validate the validity of the index again ?
        // TODO2 make sure the below is reasonable
        // answer: it is safe because we are moving up the tree, so the index will always be valid
        // ie idx (of type `ValidDataIndex`) in level with n leaves
        // ie idx in [0, n-1] => idx/2 in [0, n/2 - 1]
        nextIndex = Option.some(Math.floor(i / 2) as ValidDataIndex);
      } else if (currentIndex.value === i + 1) {
        maybeProofStep = Option.some(makeProofStep(left.hash, true));
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
const buildNextLevel = (
  currentLevel: Chunk.NonEmptyChunk<MerkleNode>,
  combineHashesFn: (left: MerkleHash, right: MerkleHash) => MerkleHash
) => processLevel(currentLevel, Option.none(), combineHashesFn).nextLevel;

/**
 * Pure implementation of build
 * @internal
 */
const buildPure = (
  data: Chunk.NonEmptyChunk<string>,
  sha256Fn: (data: string) => MerkleHash,
  combineHashesFn: (left: MerkleHash, right: MerkleHash) => MerkleHash
) => {
  // Create leaf nodes
  const leaves = Chunk.map(data, (block) => {
    const hash = sha256Fn(block);
    return makeLeafNode(block, hash);
  });

  // Build tree bottom-up
  let currentLevel = leaves;

  while (Chunk.size(currentLevel) > 1)
    currentLevel = buildNextLevel(currentLevel, combineHashesFn);

  // Root is the last remaining node
  const root = Chunk.headNonEmpty(currentLevel);

  return makeMerkleTree(root, leaves, data);
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
  let currentLevel = tree.leaves;
  while (Chunk.size(currentLevel) > 1) {
    currentLevel = buildNextLevel(currentLevel, combineHashesFn);
  }
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
    readonly verifyProof: (
      proof: MerkleProof,
      rootHash: MerkleHash
    ) => Either.Either<true, InvalidProofError>;
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
  let currentLevel = tree.leaves;
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

  const data = Chunk.unsafeGet(tree.dataBlocks, dataIndex as number);
  return makeMerkleProof(proofSteps, dataIndex, data);
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
      verifyProof: (proof, rootHash) =>
        verifyProofPure(proof, rootHash, hashing.sha256),
    });
  })
);

// ============================================================================
// CAPABILITY: MERKLE DISPLAY
// ============================================================================

/**
 * MerkleDisplay capability — utilities for visualizing Merkle trees
 */
export class MerkleDisplay extends Context.Tag(
  "@services/merkle/MerkleDisplay"
)<
  MerkleDisplay,
  {
    readonly displayTree: (tree: MerkleTree) => string;
  }
>() {}

/**
 * Pure implementation of displayTree
 *
 * Creates a formatted ASCII representation of the Merkle tree structure.
 * Example output:
 *
 *              [root_hash]
 *              /        \
 *        [hash_1]      [hash_2]
 *        /     \        /     \
 *    [L0] [L1] [L2] [L3]
 *     |     |     |     |
 *    tx0   tx1   tx2   tx3
 */
const displayTreePure = (tree: MerkleTree): string => {
  const lines: string[] = [];

  // Header with tree statistics
  lines.push(`Merkle Tree (${Chunk.size(tree.leaves)} leaves)`);
  lines.push(`Root: ${tree.root.hash.slice(0, 16)}...`);
  lines.push("");

  // Collect all levels of the tree
  const levels: MerkleNode[][] = [];
  let currentLevel: MerkleNode[] = [tree.root];

  // Build levels from root to leaves
  while (currentLevel.length > 0) {
    levels.push([...currentLevel]);
    const nextLevel: MerkleNode[] = [];

    for (const node of currentLevel) {
      if (Option.isSome(node.left))
        nextLevel.push(node.left.value as MerkleNode);
      if (Option.isSome(node.right))
        nextLevel.push(node.right.value as MerkleNode);
    }

    currentLevel = nextLevel;
  }

  // Reverse to display from root (top) to leaves (bottom)
  levels.reverse();

  // Display each level
  for (let levelIdx = 0; levelIdx < levels.length; levelIdx++) {
    const level = levels[levelIdx];
    const isLeafLevel = levelIdx === levels.length - 1;

    // Indentation increases at deeper levels
    const indent = " ".repeat(levelIdx * 2);

    lines.push(`Level ${levelIdx}:`);

    for (const node of level) {
      const hashDisplay = node.hash.slice(0, 16) + "...";
      const nodeType = node.isLeaf ? "LEAF" : "NODE";

      if (isLeafLevel && Option.isSome(node.data)) {
        // Show leaf data
        const data = node.data.value as string;
        const dataDisplay = data.slice(0, 30);
        const dataEllipsis = data.length > 30 ? "..." : "";
        lines.push(
          `${indent}  [${hashDisplay}] ${nodeType} -> "${dataDisplay}${dataEllipsis}"`
        );
      } else {
        // Show internal node
        lines.push(`${indent}  [${hashDisplay}] ${nodeType}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
};

/**
 * Live implementation of MerkleDisplay
 */
export const MerkleDisplayLive = Layer.succeed(
  MerkleDisplay,
  MerkleDisplay.of({
    displayTree: displayTreePure,
  })
);

// ============================================================================
// EXPORTS & COMPOSITION
// ============================================================================

/**
 * All Merkle service layers combined for convenience
 *
 * Requires: HashingService
 *
 * @category Services
 * @since 0.2.0
 */
export const MerkleServiceLive = Layer.mergeAll(
  MerkleBuildLive,
  MerkleRootLive,
  MerkleProofServiceLive,
  MerkleDisplayLive
);
