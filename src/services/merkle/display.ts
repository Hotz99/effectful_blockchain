/**
 * Merkle Tree Display Capability
 *
 * Simple, compact tree visualization for debugging and inspection.
 * Focuses on readability and compactness without excessive formatting.
 *
 * @module MerkleService/Display
 * @since 0.2.0
 */

import { Chunk, Context, Effect, Layer, Option } from "effect";
import * as Merkle from "../../entities/merkle_tree";
import * as Primitives from "../../entities/primitives";

// ============================================================================
// CAPABILITY: MERKLE DISPLAY
// ============================================================================

// TODO is this commented version better ?

// /**
//  * MerkleDisplay capability — utilities for visualizing Merkle trees
//  */
// export class MerkleDisplay extends Context.Tag(
//   "@services/merkle/MerkleDisplay"
// )<
//   MerkleDisplay,
//   {
//     readonly displayTree: (tree: MerkleTree) => string;
//   }
// >() {}

// /**
//  * Pure implementation of displayTree
//  *
//  * Creates a formatted ASCII representation of the Merkle tree structure.
//  * Example output:
//  *
//  *              [root_hash]
//  *              /        \
//  *        [hash_1]      [hash_2]
//  *        /     \        /     \
//  *    [L0] [L1] [L2] [L3]
//  *     |     |     |     |
//  *    tx0   tx1   tx2   tx3
//  */
// const displayTreePure = (tree: MerkleTree): string => {
//   const lines: string[] = [];

//   // Header with tree statistics
//   lines.push(`Merkle Tree (${Chunk.size(tree.leaves)} leaves)`);
//   lines.push(`Root: ${tree.root.hash.slice(0, 16)}...`);
//   lines.push("");

//   // Collect all levels of the tree
//   const levels: MerkleNode[][] = [];
//   let currentLevel: MerkleNode[] = [tree.root];

//   // Build levels from root to leaves
//   while (currentLevel.length > 0) {
//     levels.push([...currentLevel]);
//     const nextLevel: MerkleNode[] = [];

//     for (const node of currentLevel) {
//       if (node._tag === "branch") {
//         if (Option.isSome(node.left)) nextLevel.push(node.left.value);
//         if (Option.isSome(node.right)) nextLevel.push(node.right.value);
//       }
//     }

//     currentLevel = nextLevel;
//   }

//   // Reverse to display from root (top) to leaves (bottom)
//   levels.reverse();

//   // Display each level
//   for (let levelIdx = 0; levelIdx < levels.length; levelIdx++) {
//     const level = levels[levelIdx];
//     const isLeafLevel = levelIdx === levels.length - 1;

//     // Indentation increases at deeper levels
//     const indent = " ".repeat(levelIdx * 2);

//     lines.push(`Level ${levelIdx}:`);

//     for (const node of level) {
//       const hashDisplay = node.hash.slice(0, 16) + "...";
//       const nodeType = node._tag === "leaf" ? "LEAF" : "NODE";

//       if (isLeafLevel && node._tag === "leaf") {
//         // Show leaf data
//         const data = node.data;
//         const dataDisplay = data.slice(0, 30);
//         const dataEllipsis = data.length > 30 ? "..." : "";
//         lines.push(
//           `${indent}  [${hashDisplay}] ${nodeType} -> "${dataDisplay}${dataEllipsis}"`
//         );
//       } else {
//         // Show internal node
//         lines.push(`${indent}  [${hashDisplay}] ${nodeType}`);
//       }
//     }

//     lines.push("");
//   }

//   return lines.join("\n");
// };

// /**
//  * Live implementation of MerkleDisplay
//  */
// export const MerkleDisplayLive = Layer.succeed(
//   MerkleDisplay,
//   MerkleDisplay.of({
//     displayTree: displayTreePure,
//   })
// );

/**
 * Compact single-line representation of the tree structure.
 * Format: "Tree(root=..., leaves=N)"
 */
const displayTree = (tree: Merkle.MerkleTree): string => {
  const nodeStr = displayNodeCompact(tree.root);
  return `Tree(root=${nodeStr}, leaves=${tree.leaves.length})`;
};

/**
 * Multi-line tree display with indentation.
 */
const displayNode = (
  node: Merkle.MerkleNode,
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
 * Compact inline representation of a node for single-line output.
 */
const displayNodeCompact = (node: Merkle.MerkleNode): string => {
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
 * Calculate tree height (longest path from root to leaf).
 */
const calculateTreeHeight = (node: Merkle.MerkleNode): number => {
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
const displayStats = (tree: Merkle.MerkleTree): Effect.Effect<void> =>
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
const displayProof = (proof: Merkle.MerkleProof): Effect.Effect<void> =>
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

    // Chunk.forEach(proof.steps, (step, index) => {
    //   const position = step.isLeft ? "LEFT" : "RIGHT";
    //   const hashPrefix = step.siblingHash.substring(0, 16);
    //   return Effect.logInfo(
    //     `Step ${index + 1}: Sibling on ${position.padEnd(
    //       5
    //     )} | Hash: ${hashPrefix}...`
    //   );
    // });

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
    readonly displayTree: (tree: Merkle.MerkleTree) => string;
    readonly displayNode: (
      node: Merkle.MerkleNode,
      indent: Option.Option<Primitives.PositiveInt>
    ) => string;
    readonly displayStats: (tree: Merkle.MerkleTree) => Effect.Effect<void>;
    readonly displayProof: (proof: Merkle.MerkleProof) => Effect.Effect<void>;
  }
>() {}

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
