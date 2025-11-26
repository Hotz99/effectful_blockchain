/**
 * Merkle Tree Service
 *
 * This module provides fine-grained capability services for Merkle tree operations.
 * Each capability represents exactly one cohesive set of operations.
 *
 * Capabilities:
 * - HashingService — cryptographic hashing operations
 * - MerkleBuild — builds trees from data blocks
 * - MerkleRoot — computes and manages root hashes
 * - MerkleProofService — generates and verifies proofs
 * - MerkleDisplayService — displays trees and proofs
 *
 * Dependencies:
 * - MerkleBuild and MerkleProofService require HashingService for hash computation
 *
 * @module MerkleTreeService
 * @since 0.2.0
 */

import { Chunk, Context, Either, Effect, Layer, Option } from "effect";
import { keccak256 as ethersKeccak256, toUtf8Bytes } from "ethers";
import * as MerkleTree from "../entities/merkle_tree";
import * as Event from "../entities/event";
import * as Primitives from "../entities/primitives";

// ============================================================================
// Hashing Service
// ============================================================================

/**
 * HashingService capability — cryptographic hash operations
 *
 * Provides pure hashing operations for Merkle trees and Patricia tries.
 * All operations are deterministic and side-effect free.
 *
 * @category Capabilities
 * @since 0.2.0
 */
export class HashingService extends Context.Tag(
  "@services/crypto/HashingService"
)<
  HashingService,
  {
    readonly sha256: (data: string) => MerkleTree.MerkleHash;
    readonly keccak256: (data: string) => MerkleTree.MerkleHash;
    readonly combineHashes: (
      left: MerkleTree.MerkleHash,
      right: MerkleTree.MerkleHash
    ) => MerkleTree.MerkleHash;
  }
>() { }

/**
 * Live implementation of HashingService
 *
 * @category Services
 * @since 0.2.0
 */
export const HashingServiceLive = Layer.succeed(
  HashingService,
  HashingService.of({
    sha256: (data: string): MerkleTree.MerkleHash => {
      const hash = ethersKeccak256(toUtf8Bytes(data));
      // Remove '0x' prefix from ethers output
      return hash.slice(2) as MerkleTree.MerkleHash;
    },

    keccak256: (data: string): MerkleTree.MerkleHash => {
      const hash = ethersKeccak256(toUtf8Bytes(data));
      // Remove '0x' prefix from ethers output
      return hash.slice(2) as MerkleTree.MerkleHash;
    },

    combineHashes: (
      left: MerkleTree.MerkleHash,
      right: MerkleTree.MerkleHash
    ): MerkleTree.MerkleHash => {
      // Concatenate as hex strings (no 0x prefix)
      const combined = left + right;
      // Hash the combined string using keccak256
      const hash = ethersKeccak256(toUtf8Bytes(combined));
      return hash.slice(2) as MerkleTree.MerkleHash;
    },
  })
);

// ============================================================================
// Build Service
// ============================================================================

/**
 * Core level processing — shared by build and proof generation
 * Pairs nodes, computes hashes, and optionally tracks proof steps
 * @internal
 */
export const processLevel = (
  currentLevel: Chunk.NonEmptyChunk<MerkleTree.MerkleNode>,
  currentIndex: Option.Option<MerkleTree.ValidDataIndex>,
  combineHashesFn: (
    left: MerkleTree.MerkleHash,
    right: MerkleTree.MerkleHash
  ) => MerkleTree.MerkleHash
): {
  nextLevel: Chunk.NonEmptyChunk<MerkleTree.MerkleNode>;
  maybeProofStep: Option.Option<MerkleTree.MerkleProofStep>;
  nextIndex: Option.Option<MerkleTree.ValidDataIndex>;
} => {
  const size = Chunk.size(currentLevel);
  let nextLevel = Chunk.empty<MerkleTree.MerkleNode>();
  let maybeProofStep: Option.Option<MerkleTree.MerkleProofStep> = Option.none();
  let nextIndex: Option.Option<MerkleTree.ValidDataIndex> = Option.none();

  for (let i = 0; i < size; i += 2) {
    const left = Chunk.unsafeGet(currentLevel, i);
    const right = i + 1 < size ? Chunk.unsafeGet(currentLevel, i + 1) : left;

    const hash = combineHashesFn(left.hash, right.hash);
    const parent = MerkleTree.makeBranchNode({
      left: Option.some(left),
      right: Option.some(right),
      hash,
    });
    nextLevel = Chunk.append(nextLevel, parent);

    if (Option.isSome(currentIndex)) {
      if (currentIndex.value === i) {
        maybeProofStep = Option.some(
          MerkleTree.makeProofStep({ siblingHash: right.hash, isLeft: false })
        );
        // TODO is this cast safe or must we validate the validity of the index again ?
        // TODO2 make sure the below is reasonable
        // answer: it is safe because we are moving up the tree, so the index will always be valid
        // ie idx (of type `ValidDataIndex`) in level with n leaves
        // ie idx in [0, n-1] => idx/2 in [0, n/2 - 1]
        nextIndex = Option.some(
          Math.floor(i / 2) as MerkleTree.ValidDataIndex
        );
      } else if (currentIndex.value === i + 1) {
        maybeProofStep = Option.some(
          MerkleTree.makeProofStep({ siblingHash: left.hash, isLeft: true })
        );
        nextIndex = Option.some(
          Math.floor(i / 2) as MerkleTree.ValidDataIndex
        );
      }
    }
  }

  return {
    nextLevel: nextLevel as Chunk.NonEmptyChunk<MerkleTree.MerkleNode>,
    maybeProofStep,
    nextIndex,
  };
};

/**
 * Pure implementation of buildNextLevel
 * @internal
 */
export const buildNextLevel = (
  currentLevel: Chunk.NonEmptyChunk<MerkleTree.MerkleNode>,
  combineHashesFn: (
    left: MerkleTree.MerkleHash,
    right: MerkleTree.MerkleHash
  ) => MerkleTree.MerkleHash
) => processLevel(currentLevel, Option.none(), combineHashesFn).nextLevel;

/**
 * Pure implementation of build
 * @internal
 */
const buildPure = (
  dataBlocks: Chunk.NonEmptyChunk<Event.Event>,
  sha256Fn: (data: string) => MerkleTree.MerkleHash,
  combineHashesFn: (
    left: MerkleTree.MerkleHash,
    right: MerkleTree.MerkleHash
  ) => MerkleTree.MerkleHash
) => {
  // Create leaf nodes
  const leaves = Chunk.map(dataBlocks, (block) => {
    const serialized = JSON.stringify(block);
    const hash = sha256Fn(serialized);
    return MerkleTree.makeLeafNode({ hash, value: serialized });
  });

  // Build tree bottom-up
  // cast is safe bc `MerkleLeaf` is a variant/member of `MerkleNode` union type
  let currentLevel = leaves as Chunk.NonEmptyChunk<MerkleTree.MerkleNode>;

  while (Chunk.size(currentLevel) > 1)
    currentLevel = buildNextLevel(currentLevel, combineHashesFn);

  // Root is the last remaining node
  const root = Chunk.headNonEmpty(currentLevel);

  return MerkleTree.makeMerkleTree({ root, leaves, dataBlocks });
};

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
    ) => MerkleTree.MerkleTree;
  }
>() { }

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
// Root Service
// ============================================================================

/**
 * Pure implementation of recomputeRoot
 * @internal
 */
const recomputeRootPure = (
  tree: MerkleTree.MerkleTree,
  combineHashesFn: (
    left: MerkleTree.MerkleHash,
    right: MerkleTree.MerkleHash
  ) => MerkleTree.MerkleHash
) => {
  let currentLevel = tree.leaves as Chunk.NonEmptyChunk<MerkleTree.MerkleNode>;

  while (Chunk.size(currentLevel) > 1)
    currentLevel = buildNextLevel(currentLevel, combineHashesFn);

  return Chunk.headNonEmpty(currentLevel).hash;
};

/**
 * MerkleRoot capability — computes and manages root hashes
 */
export class MerkleRoot extends Context.Tag("@services/merkle/MerkleRoot")<
  MerkleRoot,
  {
    readonly getRootHash: (tree: MerkleTree.MerkleTree) => MerkleTree.MerkleHash;
    readonly recomputeRoot: (
      tree: MerkleTree.MerkleTree
    ) => MerkleTree.MerkleHash;
  }
>() { }

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
      getRootHash: (tree: MerkleTree.MerkleTree) => tree.root.hash,
      recomputeRoot: (tree) => recomputeRootPure(tree, hashing.combineHashes),
    });
  })
);

// ============================================================================
// Proof Service
// ============================================================================

/**
 * Pure implementation of generateProof
 * @internal
 */
const generateProofPure = (
  tree: MerkleTree.MerkleTree,
  dataIndex: MerkleTree.ValidDataIndex,
  combineHashesFn: (
    left: MerkleTree.MerkleHash,
    right: MerkleTree.MerkleHash
  ) => MerkleTree.MerkleHash
): MerkleTree.MerkleProof => {
  let currentLevel = tree.leaves as Chunk.NonEmptyChunk<MerkleTree.MerkleNode>;
  let currentIndex = Option.some(dataIndex);
  let proofSteps = Chunk.empty<MerkleTree.MerkleProofStep>();

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
  return MerkleTree.makeMerkleProof({ steps: proofSteps, dataIndex, data });
};

/**
 * Pure implementation of verifyProof
 * @internal
 */
const verifyProofPure = (
  proof: MerkleTree.MerkleProof,
  rootHash: MerkleTree.MerkleHash,
  sha256Fn: (data: string) => MerkleTree.MerkleHash
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
      new MerkleTree.InvalidProofError({
        message: "Proof verification failed",
        expected: rootHash,
        actual: currentHash,
      })
    );
};

/**
 * MerkleProofService capability — generates and verifies Merkle proofs
 */
export class MerkleProofService extends Context.Tag(
  "@services/merkle/MerkleProofService"
)<
  MerkleProofService,
  {
    readonly generateProof: (
      tree: MerkleTree.MerkleTree,
      dataIndex: MerkleTree.ValidDataIndex
    ) => MerkleTree.MerkleProof;
    readonly validateProof: (
      proof: MerkleTree.MerkleProof,
      rootHash: MerkleTree.MerkleHash
    ) => Either.Either<true, MerkleTree.InvalidProofError>;
  }
>() { }

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

// ============================================================================
// Display Service
// ============================================================================

/**
 * Compact inline representation of a node for single-line output.
 */
const displayNodeCompact = (node: MerkleTree.MerkleNode): string => {
  if (node._tag === "leaf") {
    const hashPrefix = node.hash.substring(0, 8);
    return `L[${hashPrefix}]`;
  }

  const hashPrefix = node.hash.substring(0, 8);
  const leftStr = Option.match(node.left, {
    onNone: () => "∅",
    onSome: displayNodeCompact,
  });
  const rightStr = Option.match(node.right, {
    onNone: () => "∅",
    onSome: displayNodeCompact,
  });
  return `B[${hashPrefix}](${leftStr},${rightStr})`;
};

/**
 * Compact single-line representation of the tree structure.
 * Format: "Tree(root=..., leaves=N)"
 */
const displayTree = (tree: MerkleTree.MerkleTree): string => {
  const nodeStr = displayNodeCompact(tree.root);
  return `Tree(root=${nodeStr}, leaves=${tree.leaves.length})`;
};

/**
 * Multi-line tree display with indentation.
 */
const displayNode = (
  node: MerkleTree.MerkleNode,
  indent = Option.some(0)
): string => {
  const padding = " ".repeat(Option.getOrElse(indent, () => 0));

  if (node._tag === "leaf") {
    const hashPrefix = node.hash.substring(0, 8);
    const dataPreview =
      node.value.length > 20 ? node.value.substring(0, 20) + "..." : node.value;
    return `${padding}[L](hash=${hashPrefix}..., data="${dataPreview}")`;
  }

  const hashPrefix = node.hash.substring(0, 8);
  const leftDisplay = Option.match(node.left, {
    onNone: () => `${padding}  [L] => (none)`,
    onSome: (child) =>
      `${padding}  [L] => ${displayNode(child, Option.none()).trim()}`,
  });
  const rightDisplay = Option.match(node.right, {
    onNone: () => `${padding}  [R] => (none)`,
    onSome: (child) =>
      `${padding}  [R] => ${displayNode(child, Option.none()).trim()}`,
  });

  return `${padding}[B](hash=${hashPrefix}...)\n${leftDisplay}\n${rightDisplay}`;
};

/**
 * Calculate tree height (longest path from root to leaf).
 */
const calculateTreeHeight = (node: MerkleTree.MerkleNode): number => {
  if (node._tag === "leaf") {
    return 0;
  }

  const leftHeight = Option.match(node.left, {
    onNone: () => 0,
    onSome: calculateTreeHeight,
  });
  const rightHeight = Option.match(node.right, {
    onNone: () => 0,
    onSome: calculateTreeHeight,
  });

  return 1 + Math.max(leftHeight, rightHeight);
};

/**
 * Display tree statistics including data blocks, leaves, height, root, etc.
 */
const displayStats = (tree: MerkleTree.MerkleTree): Effect.Effect<void> =>
  Effect.gen(function* () {
    const numLeaves = Chunk.size(tree.leaves);
    const treeHeight = calculateTreeHeight(tree.root);
    const rootHash = tree.root.hash;
    const proofSize = treeHeight;

    yield* Effect.logInfo("Merkle Tree Statistics");
    yield* Effect.logInfo(
      `Number of data blocks:     ${Chunk.size(tree.dataBlocks)}`
    );
    yield* Effect.logInfo(`Number of leaves:          ${numLeaves}`);
    yield* Effect.logInfo(`Tree height:               ${treeHeight}`);
    yield* Effect.logInfo(`Merkle root:               ${rootHash}`);
    yield* Effect.logInfo(`Proof size (hashes):       ${proofSize}`);
    yield* Effect.logInfo(
      `Verification complexity:   O(log n) = O(log ${numLeaves}) = ${treeHeight} steps`
    );
    yield* Effect.logInfo("=".repeat(70));
  });

/**
 * Display a Merkle proof showing the path from leaf to root.
 * For each step, show the sibling hash and whether it's on the left or right.
 */
const displayProof = (proof: MerkleTree.MerkleProof): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Merkle Proof");
    yield* Effect.logInfo(`Data index: ${proof.dataIndex}`);
    yield* Effect.logInfo(`Data: "${proof.data}"`);
    yield* Effect.logInfo(`Proof steps: ${proof.steps.length}`);
    yield* Effect.logInfo("-".repeat(70));

    yield* Effect.forEach(proof.steps, (step, index) => {
      const position = step.isLeft ? "LEFT" : "RIGHT";
      const hashPrefix = step.siblingHash.substring(0, 16);
      return Effect.logInfo(
        `Step ${index + 1}: Sibling on ${position.padEnd(
          5
        )} | Hash: ${hashPrefix}...`
      );
    });

    yield* Effect.logInfo("=".repeat(70));
  });

/**
 * MerkleDisplayService — simple, compact tree visualization
 *
 * Provides minimal display operations for debugging and inspection.
 * Focuses on readability and compactness without excessive formatting.
 *
 * @category Capabilities
 * @since 0.2.0
 */
export class MerkleDisplayService extends Context.Tag(
  "@services/merkle/MerkleDisplayService"
)<
  MerkleDisplayService,
  {
    readonly displayTree: (tree: MerkleTree.MerkleTree) => string;
    readonly displayNode: (
      node: MerkleTree.MerkleNode,
      indent: Option.Option<Primitives.PositiveInt>
    ) => string;
    readonly displayStats: (
      tree: MerkleTree.MerkleTree
    ) => Effect.Effect<void>;
    readonly displayProof: (
      proof: MerkleTree.MerkleProof
    ) => Effect.Effect<void>;
  }
>() { }

/**
 * Live implementation of MerkleDisplayService
 *
 * @category Services
 * @since 0.2.0
 */
export const MerkleDisplayServiceLive = Layer.succeed(
  MerkleDisplayService,
  MerkleDisplayService.of({
    displayTree,
    displayNode,
    displayStats,
    displayProof,
  })
);

// ============================================================================
// Combined Service Layer
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
  MerkleDisplayServiceLive
);
