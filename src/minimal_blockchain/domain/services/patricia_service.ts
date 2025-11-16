/**
 * PATRICIA Trie Service — Core Effect-Based Capabilities
 *
 * Minimal capability services for PATRICIA trie operations.
 * Focus: structural operations and hash-deterministic primitives only.
 *
 * Core Capabilities:
 * - PatriciaInsert — inserts key-value pairs
 * - PatriciaDelete — removes keys
 * - PatriciaQuery — lookup and existence checks
 * - PatriciaHash — computes Merkle-style root hashes (depends on HashingService)
 *
 * Dependencies:
 * - PatriciaHash requires HashingService from crypto module
 *
 * @module PatriciaService
 * @since 0.2.0
 */

import { Context, Effect, Layer, Option, Match } from "effect";
import { MerkleHash } from "../entities/merkle_tree";
import { HashingService } from "../crypto";
import {
  PatriciaTrie,
  PatriciaNode,
  BranchNode,
  ExtensionNode,
  LeafNode,
  makeBranch,
  makeExtension,
  makeLeaf,
  makeTrie,
  Nibbles,
  NodeKey,
  makeEmptyTrie,
  NodeValue as NodeValue,
  NibblesEquivalence,
} from "../entities/patricia_trie";
import * as Primitives from "../primitives";

// ============================================================================
// INTERNAL UTILITIES
// ============================================================================

/**
 * Convert a UTF-8 string key to an array of hex nibbles (4-bit values).
 * @internal
 */
const keyToNibbles = (key: NodeKey): Nibbles => {
  // TODO why slice ?
  const hexStr = key.startsWith("0x") ? key.slice(2) : key;

  // Convert hex string to nibbles (each hex char is one nibble)
  return Array.from(hexStr).map((char) => parseInt(char, 16));
};

/**
 * Find the length of the common prefix between two nibble arrays.
 * @internal
 */
const commonPrefixLength = (
  nibbles1: Nibbles,
  nibbles2: Nibbles
): Primitives.PositiveInt => {
  let i = 0;
  const minLen = Math.min(nibbles1.length, nibbles2.length);
  while (i < minLen && nibbles1[i] === nibbles2[i]) {
    i++;
  }
  return i;
};

// ============================================================================
// QUERY OPERATIONS
// ============================================================================

/**
 * Lookup a node in the trie by string key.
 * Returns the matched node if found.
 */
const lookup = (
  trie: PatriciaTrie,
  key: NodeKey
): Option.Option<PatriciaNode> => lookupNibbles(trie.root, keyToNibbles(key));

/**
 * Internal lookup by nibble array.
 * @internal
 */
const lookupNibbles = (
  node: PatriciaNode,
  nibbles: Nibbles
): Option.Option<PatriciaNode> => {
  let currentNode = node;
  let remaining = nibbles;

  // TODO refactor to tail-recursive form
  const matcher = Match.typeTags<PatriciaNode>()({
    branch: (branch) => {
      if (remaining.length === 0) return Option.some(branch);

      const nextNibble = remaining[0].toString(16);
      const child = branch.children[nextNibble];
      if (!child) return Option.none();

      // Continue traversal
      currentNode = child;
      remaining = remaining.slice(1);
      return null; // Signal to continue loop
    },
    extension: (ext) => {
      const prefixLen = commonPrefixLength(ext.sharedPrefix, remaining);
      if (prefixLen < ext.sharedPrefix.length) return Option.none();

      // Continue traversal
      currentNode = ext.nextNode;
      remaining = remaining.slice(prefixLen);
      return null; // Signal to continue loop
    },
    leaf: (leaf) => {
      const prefixLen = commonPrefixLength(leaf.keyEnd, remaining);

      if (prefixLen === leaf.keyEnd.length && prefixLen === remaining.length)
        return Option.some(leaf);

      return Option.none();
    },
  });

  while (true) {
    const result = matcher(currentNode);
    if (result !== null) return result;

    // Otherwise continue the loop with updated currentNode/remaining
  }
};

/**
 * Check if a key exists in the trie.
 */
const hasKey = (trie: PatriciaTrie, key: NodeKey): boolean =>
  Option.isSome(lookup(trie, key));

// ============================================================================
// INSERT OPERATIONS
// ============================================================================

/**
 * Insert a key-value pair into the trie.
 */
const insertPure = (
  trie: PatriciaTrie,
  key: NodeKey,
  value: NodeValue
): PatriciaTrie => {
  const nibbles = keyToNibbles(key);
  const hadKey = hasKey(trie, key);
  const newRoot = insertNodeNibbles(trie.root, nibbles, value);
  const compressedRoot = compressNode(newRoot);
  const newSize = hadKey ? trie.size : trie.size + 1;
  return makeTrie(compressedRoot, newSize);
};

/**
 * Insert nibbles into a node.
 * @internal
 */
const insertNodeNibbles = (
  node: PatriciaNode,
  nibbles: Nibbles,
  value: NodeValue
): PatriciaNode =>
  Match.typeTags<PatriciaNode>()({
    branch: (branch) => insertIntoBranch(branch, nibbles, value),
    extension: (ext) => insertIntoExtension(ext, nibbles, value),
    leaf: (leaf) => insertIntoLeaf(leaf, nibbles, value),
  })(node);

/**
 * Insert into a branch node.
 * @internal
 */
const insertIntoBranch = (
  branch: BranchNode,
  nibbles: Nibbles,
  value: NodeValue
): PatriciaNode => {
  // key terminates at this branch
  if (nibbles.length === 0) {
    return makeBranch({
      children: branch.children,
      value: Option.some(value),
    });
  }

  const nextNibble = nibbles[0].toString(16);
  const remaining = nibbles.slice(1);
  const existingChild = branch.children[nextNibble];

  let newChild: PatriciaNode;

  if (existingChild) {
    newChild = insertNodeNibbles(existingChild, remaining, value);
  } else if (remaining.length === 0) {
    // key terminates exactly at this child position
    newChild = makeBranch({
      children: {},
      value: Option.some(value),
    });
  } else {
    // non-empty unmatched suffix → leaf
    newChild = makeLeaf({ keyEnd: remaining, value });
  }

  return makeBranch({
    children: { ...branch.children, [nextNibble]: newChild },
    value: branch.value,
  });
};

/**
 * Insert into an extension node.
 * @internal
 */
const insertIntoExtension = (
  ext: ExtensionNode,
  nibbles: Nibbles,
  value: NodeValue
): PatriciaNode => {
  const prefixNibbles = ext.sharedPrefix;
  const commonLen = commonPrefixLength(prefixNibbles, nibbles);

  // Exact match - pass value down to child
  if (NibblesEquivalence(prefixNibbles, nibbles))
    return makeExtension({
      sharedPrefix: ext.sharedPrefix,
      nextNode: insertNodeNibbles(ext.nextNode, [], value),
    });

  // Full prefix match - continue into child
  if (commonLen === prefixNibbles.length) {
    const remaining = nibbles.slice(commonLen);
    return makeExtension({
      sharedPrefix: ext.sharedPrefix,
      nextNode: insertNodeNibbles(ext.nextNode, remaining, value),
    });
  }

  // Partial match - need to split extension
  const matchedPrefix = prefixNibbles.slice(0, commonLen);
  const extSuffix = prefixNibbles.slice(commonLen);
  const nibblesSuffix = nibbles.slice(commonLen);

  const extSuffixChar = extSuffix[0]!.toString(16);
  let branchChildren: Record<string, PatriciaNode> = {};

  // Add old path
  if (extSuffix.length === 1) {
    branchChildren[extSuffixChar] = ext.nextNode;
  } else {
    branchChildren[extSuffixChar] = makeExtension({
      sharedPrefix: extSuffix.slice(1),
      nextNode: ext.nextNode,
    });
  }

  // Add new path
  let branchValue = Option.none<unknown>();
  if (nibblesSuffix.length === 0) {
    branchValue = Option.some(value);
  } else {
    const newNibbleChar = nibblesSuffix[0].toString(16);
    branchChildren[newNibbleChar] =
      nibblesSuffix.length === 1
        ? makeLeaf({ keyEnd: [nibblesSuffix[0]], value })
        : makeLeaf({ keyEnd: nibblesSuffix.slice(1), value });
  }

  const branchNode = makeBranch({
    children: branchChildren,
    value: branchValue,
  });

  // Wrap in extension if there's a matched prefix
  if (matchedPrefix.length > 0) {
    return makeExtension({
      sharedPrefix: matchedPrefix as Nibbles,
      nextNode: branchNode,
    });
  }

  return branchNode;
};

/**
 * Insert into a leaf node.
 * @internal
 */
const insertIntoLeaf = (
  leaf: LeafNode,
  nibbles: Nibbles,
  value: NodeValue
): PatriciaNode => {
  const leafNibbles = leaf.keyEnd;
  const commonLen = commonPrefixLength(leafNibbles, nibbles);

  // Exact match - update value
  if (commonLen === leafNibbles.length && commonLen === nibbles.length) {
    return makeLeaf({ keyEnd: leaf.keyEnd, value });
  }

  // New key is a prefix of existing leaf - need to split
  if (commonLen === nibbles.length) {
    // New key is shorter - create branch with new value, old leaf as child
    const leafSuffix = leafNibbles.slice(commonLen);
    const firstNibble = leafSuffix[0].toString(16);

    const branchChildren: Record<string, PatriciaNode> = {
      [firstNibble]:
        leafSuffix.length === 1
          ? makeBranch({ children: {}, value: Option.some(leaf.value) })
          : makeLeaf({ keyEnd: leafSuffix.slice(1), value: leaf.value }),
    };

    const branch = makeBranch({
      children: branchChildren,
      value: Option.some(value),
    });

    if (commonLen > 0) {
      return makeExtension({
        sharedPrefix: nibbles.slice(0, commonLen) as Nibbles,
        nextNode: branch,
      });
    }
    return branch;
  }

  // Leaf nibbles is a prefix of new key
  if (commonLen === leafNibbles.length) {
    const remaining = nibbles.slice(commonLen);

    const newNibbleChar = remaining[0].toString(16);
    const branchChildren: Record<string, PatriciaNode> = {
      [newNibbleChar]:
        remaining.length === 1
          ? makeBranch({ children: {}, value: Option.some(value) })
          : makeLeaf({ keyEnd: remaining.slice(1), value }),
    };

    const branch = makeBranch({
      children: branchChildren,
      value: Option.some(leaf.value),
    });

    // Only create extension if leaf has multiple nibbles
    // Single nibble should become a branch child
    if (leafNibbles.length > 1) {
      return makeExtension({
        sharedPrefix: leaf.keyEnd,
        nextNode: branch,
      });
    } else if (leafNibbles.length === 1) {
      // Convert single-nibble leaf to branch chain
      return makeBranch({
        children: { [leafNibbles[0].toString(16)]: branch },
        value: Option.none(),
      });
    }
    return branch;
  }

  // Partial match - split the leaf
  const matchedPrefix = leafNibbles.slice(0, commonLen);
  const leafSuffix = leafNibbles.slice(commonLen);
  const nibblesSuffix = nibbles.slice(commonLen);

  let branchChildren: Record<string, PatriciaNode> = {};

  // Add old leaf path
  const leafNibbleChar = leafSuffix[0]!.toString(16);
  branchChildren[leafNibbleChar] =
    leafSuffix.length === 1
      ? makeLeaf({ keyEnd: [leafSuffix[0]], value: leaf.value })
      : makeLeaf({ keyEnd: leafSuffix.slice(1), value: leaf.value });

  // Add new key path
  let branchValue = Option.none<unknown>();
  if (nibblesSuffix.length > 0) {
    const newNibbleChar = nibblesSuffix[0].toString(16);
    branchChildren[newNibbleChar] =
      nibblesSuffix.length === 1
        ? makeLeaf({ keyEnd: [nibblesSuffix[0]], value })
        : makeLeaf({ keyEnd: nibblesSuffix.slice(1), value });
  } else {
    branchValue = Option.some(value);
  }

  const branchNode = makeBranch({
    children: branchChildren,
    value: branchValue,
  });

  if (matchedPrefix.length > 0) {
    return makeExtension({
      sharedPrefix: matchedPrefix as Nibbles,
      nextNode: branchNode,
    });
  }

  return branchNode;
};

// ============================================================================
// COMPRESSION OPERATIONS
// ============================================================================

/**
 * Compress a node to optimize the trie structure.
 * - Single-child branches with no value become extensions
 * - Consecutive extensions are merged
 * @internal
 */
const compressNode = (node: PatriciaNode): PatriciaNode =>
  Match.typeTags<PatriciaNode>()({
    branch: (branch) => {
      // Recursively compress all children first
      const compressedChildren: Record<string, PatriciaNode> = {};
      for (const [key, child] of Object.entries(branch.children)) {
        compressedChildren[key] = compressNode(child);
      }

      const childCount = Object.keys(compressedChildren).length;

      // If branch has only one child and no value, convert to extension
      if (childCount === 1 && Option.isNone(branch.value)) {
        const [childKey, childNode] = Object.entries(compressedChildren)[0];
        const nibble = parseInt(childKey, 16);

        // If child is an extension, merge the nibbles
        if (childNode._tag === "extension") {
          return makeExtension({
            sharedPrefix: [nibble, ...childNode.sharedPrefix] as Nibbles,
            nextNode: childNode.nextNode,
          });
        }

        // Otherwise create new extension with single nibble
        return makeExtension({
          sharedPrefix: [nibble] as Nibbles,
          nextNode: childNode,
        });
      }

      // Return branch with compressed children
      return makeBranch({
        children: compressedChildren,
        value: branch.value,
      });
    },
    extension: (ext) => {
      // Recursively compress the child
      const compressedChild = compressNode(ext.nextNode);

      // If child is also an extension, merge them
      if (compressedChild._tag === "extension") {
        return makeExtension({
          sharedPrefix: [
            ...ext.sharedPrefix,
            ...compressedChild.sharedPrefix,
          ] as Nibbles,
          nextNode: compressedChild.nextNode,
        });
      }

      return makeExtension({
        sharedPrefix: ext.sharedPrefix,
        nextNode: compressedChild,
      });
    },
    leaf: (leaf) => leaf, // Leaves don't need compression
  })(node);

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

/**
 * Delete a key from the trie.
 */
const deletePure = (trie: PatriciaTrie, key: NodeKey): PatriciaTrie => {
  if (!hasKey(trie, key)) {
    return trie;
  }

  const nibbles = keyToNibbles(key);
  const newRootOpt = deleteNodeNibbles(trie.root, nibbles);

  return Option.match(newRootOpt, {
    onNone: () => makeEmptyTrie(),
    onSome: (newRoot) => makeTrie(newRoot, trie.size - 1),
  });
};

/**
 * Delete nibbles from a node.
 * @internal
 */
const deleteNodeNibbles = (
  node: PatriciaNode,
  nibbles: Nibbles
): Option.Option<PatriciaNode> =>
  Match.typeTags<PatriciaNode>()({
    branch: (branch) => deleteFromBranch(branch, nibbles),
    extension: (ext) => deleteFromExtension(ext, nibbles),
    leaf: (leaf) => deleteFromLeaf(leaf, nibbles),
  })(node);

/**
 * Delete from a branch node.
 * @internal
 */
const deleteFromBranch = (
  branch: BranchNode,
  nibbles: Nibbles
): Option.Option<PatriciaNode> => {
  const k = nibbles[0].toString(16);
  const tail = nibbles.slice(1);
  const child = branch.children[k];

  if (!child) return Option.some(branch);

  const upd = deleteNodeNibbles(child, tail);

  const ch = { ...branch.children };
  if (Option.isNone(upd)) delete ch[k];
  else ch[k] = upd.value;

  const nb = makeBranch({ children: ch, value: branch.value });

  if (Option.isNone(nb.value) && Object.keys(nb.children).length === 0)
    return Option.none();

  return Option.some(nb);
};

/**
 * Delete from an extension node.
 * @internal
 */
const deleteFromExtension = (
  ext: ExtensionNode,
  nibbles: Nibbles
): Option.Option<PatriciaNode> => {
  const prefixNibbles = ext.sharedPrefix;
  const commonLen = commonPrefixLength(prefixNibbles, nibbles);

  if (commonLen < prefixNibbles.length) {
    return Option.some(ext);
  }

  const remaining = nibbles.slice(commonLen);
  const updatedChildOpt = deleteNodeNibbles(ext.nextNode, remaining);

  if (Option.isNone(updatedChildOpt)) {
    return Option.none();
  }

  return Option.some(
    makeExtension({
      sharedPrefix: ext.sharedPrefix,
      nextNode: updatedChildOpt.value,
    })
  );
};

/**
 * Delete from a leaf node.
 * @internal
 */
const deleteFromLeaf = (
  leaf: LeafNode,
  nibbles: Nibbles
): Option.Option<PatriciaNode> => {
  const leafNibbles = leaf.keyEnd;
  const commonLen = commonPrefixLength(leafNibbles, nibbles);

  if (commonLen === leafNibbles.length && commonLen === nibbles.length) {
    return Option.none();
  }

  return Option.some(leaf);
};

// ============================================================================
// HASH OPERATIONS
// ============================================================================

/**
 * Calculate the Merkle root hash of the trie.
 * Pure function that requires a keccak256 hashing function.
 * @internal
 */
const calculateRootHashPure = (
  trie: PatriciaTrie,
  keccak256Fn: (data: string) => MerkleHash
): MerkleHash => {
  return hashNode(trie.root, keccak256Fn);
};

/**
 * Hash a node recursively.
 * @internal
 */
const hashNode = (
  node: PatriciaNode,
  keccak256Fn: (data: string) => MerkleHash
): MerkleHash => {
  const serialized = serializeNode(node, keccak256Fn);
  return keccak256Fn(serialized);
};

/**
 * Serialize a node to deterministic JSON.
 * Branch: ["branch", valueOrNull, {children}]
 * Extension: ["ext", nibbles, childHash]
 * Leaf: ["leaf", nibbles, value]
 * @internal
 */
const serializeNode = (
  node: PatriciaNode,
  keccak256Fn: (data: string) => MerkleHash
): string =>
  Match.typeTags<PatriciaNode>()({
    branch: (branch) => {
      const valueRepr = Option.match(branch.value, {
        onNone: () => null,
        onSome: (v) => v,
      });

      const childHashes: Record<string, string> = {};
      for (const [key, child] of Object.entries(branch.children)) {
        childHashes[key] = hashNode(child, keccak256Fn);
      }

      return JSON.stringify(["branch", valueRepr, childHashes]);
    },
    extension: (ext) => {
      const childHash = hashNode(ext.nextNode, keccak256Fn);
      return JSON.stringify(["ext", ext.sharedPrefix, childHash]);
    },
    leaf: (leaf) => JSON.stringify(["leaf", leaf.keyEnd, leaf.value]),
  })(node);

// ============================================================================
// CAPABILITY SERVICES
// ============================================================================

/**
 * PatriciaQuery capability — lookup and existence checks
 *
 * @category Capabilities
 * @since 0.2.0
 */
export class PatriciaQuery extends Context.Tag(
  "@services/patricia/PatriciaQuery"
)<
  PatriciaQuery,
  {
    readonly lookup: (
      trie: PatriciaTrie,
      key: NodeKey
    ) => Option.Option<PatriciaNode>;
    readonly hasKey: (trie: PatriciaTrie, key: NodeKey) => boolean;
  }
>() {}

export const PatriciaQueryLive = Layer.succeed(
  PatriciaQuery,
  PatriciaQuery.of({
    lookup,
    hasKey,
  })
);

/**
 * PatriciaInsert capability — inserts key-value pairs
 *
 * @category Capabilities
 * @since 0.2.0
 */
export class PatriciaInsert extends Context.Tag(
  "@services/patricia/PatriciaInsert"
)<
  PatriciaInsert,
  {
    readonly insert: (
      trie: PatriciaTrie,
      key: NodeKey,
      value: NodeValue
    ) => PatriciaTrie;
  }
>() {}

export const PatriciaInsertLive = Layer.succeed(
  PatriciaInsert,
  PatriciaInsert.of({
    insert: insertPure,
  })
);

/**
 * PatriciaDelete capability — removes keys from trie
 *
 * @category Capabilities
 * @since 0.2.0
 */
export class PatriciaDelete extends Context.Tag(
  "@services/patricia/PatriciaDelete"
)<
  PatriciaDelete,
  {
    readonly delete: (trie: PatriciaTrie, key: NodeKey) => PatriciaTrie;
  }
>() {}

export const PatriciaDeleteLive = Layer.succeed(
  PatriciaDelete,
  PatriciaDelete.of({
    delete: deletePure,
  })
);

/**
 * PatriciaHash capability — computes deterministic Merkle-style root hashes
 *
 * Depends on HashingService for Keccak-256 hashing operations.
 *
 * @category Capabilities
 * @since 0.2.0
 */
export class PatriciaHash extends Context.Tag(
  "@services/patricia/PatriciaHash"
)<
  PatriciaHash,
  {
    readonly calculateRootHash: (trie: PatriciaTrie) => MerkleHash;
  }
>() {}

/**
 * Live implementation of PatriciaHash
 *
 * @category Services
 * @since 0.2.0
 */
export const PatriciaHashLive = Layer.effect(
  PatriciaHash,
  Effect.gen(function* () {
    const hashing = yield* HashingService;

    return PatriciaHash.of({
      calculateRootHash: (trie) =>
        calculateRootHashPure(trie, hashing.keccak256),
    });
  })
);

// ============================================================================
// DISPLAY CAPABILITY
// ============================================================================

/**
 * PatriciaDisplayService — simple, compact tree visualization
 *
 * Provides minimal display operations for debugging and inspection.
 * Focuses on readability and compactness without excessive formatting.
 *
 * @category Capabilities
 * @since 0.2.0
 */
export class PatriciaDisplayService extends Context.Tag(
  "@services/patricia/PatriciaDisplayService"
)<
  PatriciaDisplayService,
  {
    readonly displayTrie: (trie: PatriciaTrie) => string;
    readonly displayNode: (node: PatriciaNode, indent?: number) => string;
  }
>() {}

/**
 * Compact single-line representation of the trie structure.
 * Format: "Branch(child0=..., child1=...) | value=X"
 * @internal
 */
const displayTrie = (trie: PatriciaTrie): string => {
  const nodeStr = displayNodeCompact(trie.root);
  return `Trie(root=${nodeStr}, size=${trie.size})`;
};

/**
 * Multi-line tree display with indentation.
 * @internal
 */
const displayNode = (node: PatriciaNode, indent: number = 0): string => {
  const padding = " ".repeat(indent);

  return Match.typeTags<PatriciaNode>()({
    leaf: (leaf) =>
      `${padding}[L](keyEnd=[${leaf.keyEnd.join(",")}], value=${JSON.stringify(
        leaf.value
      )})`,
    extension: (ext) => {
      const sharedPrefix = ext.sharedPrefix.map((n) => n.toString(16)).join("");
      const childDisplay = displayNode(ext.nextNode, indent + 2);
      return `${padding}[E](sharedPrefix=[${sharedPrefix}])\n${childDisplay}`;
    },
    branch: (branch) => {
      const value = Option.isSome(branch.value)
        ? `, value=${JSON.stringify(Option.getOrThrow(branch.value))}`
        : "";
      const childLines = Object.entries(branch.children).map(([key, child]) => {
        const childDisplay = displayNode(child, indent + 2);
        return `${" ".repeat(indent + 2)}[${key}] => ${childDisplay.trim()}`;
      });

      const childStr =
        childLines.length > 0 ? `\n${childLines.join("\n")}` : "";

      return `${padding} [B](children=${
        Object.keys(branch.children).length
      }${value})${childStr}`;
    },
  })(node);
};

/**
 * Compact inline representation of a node for single-line output.
 * @internal
 */
const displayNodeCompact = (node: PatriciaNode): string =>
  Match.typeTags<PatriciaNode>()({
    leaf: (leaf) => `L[${leaf.keyEnd.join("")}]=${JSON.stringify(leaf.value)}`,
    extension: (ext) =>
      `E[${ext.sharedPrefix.join("")}]->${displayNodeCompact(ext.nextNode)}`,
    branch: (branch) => {
      const childCount = Object.keys(branch.children).length;
      const valueStr = Option.isSome(branch.value)
        ? `:${JSON.stringify(Option.getOrThrow(branch.value))}`
        : "";
      return `B(${childCount}children${valueStr})`;
    },
  })(node);

/**
 * Live implementation of PatriciaDisplayService
 *
 * @category Services
 * @since 0.2.0
 */
export const PatriciaDisplayServiceLive = Layer.succeed(
  PatriciaDisplayService,
  PatriciaDisplayService.of({
    displayTrie,
    displayNode,
  })
);

// ============================================================================
// SERVICE COMPOSITION
// ============================================================================

/**
 * Complete MPT service stack with all essential capabilities.
 *
 * Provides:
 * - PatriciaInsert — insert operations (no dependencies)
 * - PatriciaDelete — delete operations (no dependencies)
 * - PatriciaQuery — lookup operations (no dependencies)
 * - PatriciaHash — hash operations (requires HashingService)
 * - PatriciaDisplayService — display operations (no dependencies)
 *
 * Dependencies:
 * - PatriciaHash requires HashingService
 *
 * @example
 * ```typescript
 * import { HashingServiceLive } from "../crypto"
 * import { PatriciaServiceLive } from "./patricia_service"
 *
 * const program = Effect.gen(function* () {
 *   const insert = yield* PatriciaInsert
 *   const hash = yield* PatriciaHash
 *
 *   let trie = makeEmptyTrie()
 *   trie = insert.insert(trie, "key1", "value1")
 *   const rootHash = hash.calculateRootHash(trie)
 * })
 *
 * // Provide dependencies
 * const runnable = program.pipe(
 *   Effect.provide(PatriciaServiceLive),
 *   Effect.provide(HashingServiceLive)
 * )
 * ```
 *
 * @category Services
 * @since 0.2.0
 */
export const PatriciaServiceLive = Layer.mergeAll(
  PatriciaInsertLive,
  PatriciaDeleteLive,
  PatriciaQueryLive,
  PatriciaHashLive,
  PatriciaDisplayServiceLive
);
