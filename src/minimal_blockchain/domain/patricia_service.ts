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
 * - PatriciaHash — computes Merkle-style root hashes
 *
 * @module PatriciaService
 * @since 0.2.0
 */

import { Context, Layer, Option } from "effect";
import { keccak256 } from "./crypto";
import { MerkleHash } from "./merkle_tree";
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
  isBranch,
  isExtension,
  isLeaf,
  Nibbles,
  PatriciaNodeKey,
} from "./patricia_trie";

// ============================================================================
// INTERNAL UTILITIES
// ============================================================================

/**
 * Convert a UTF-8 string key to an array of hex nibbles (4-bit values).
 * @internal
 */
const keyToNibbles = (key: PatriciaNodeKey): Nibbles => {
  // If key is "0x..." hex format, strip prefix and use directly
  const hexStr = key.startsWith("0x") ? key.slice(2) : key;

  // Convert hex string to nibbles (each hex char is one nibble)
  return Array.from(hexStr).map((char) => parseInt(char, 16));

  // const hexString = Buffer.from(key, "utf8").toString("hex");
  // return Array.from(hexString).map((char) => parseInt(char, 16));
};

/**
 * Find the length of the common prefix between two nibble arrays.
 * @internal
 */
const commonPrefixLength = (
  nibbles1: readonly number[],
  nibbles2: readonly number[]
): number => {
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
  key: string
): Option.Option<PatriciaNode> => {
  const nibbles = keyToNibbles(key);
  return lookupNibbles(trie.root, nibbles);
};

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

  while (true) {
    // Branch node
    if (isBranch(currentNode)) {
      if (remaining.length === 0) {
        return Option.some(currentNode);
      }
      const nextNibble = remaining[0].toString(16);
      const child = currentNode.children[nextNibble];
      if (!child) {
        return Option.none();
      }
      currentNode = child;
      remaining = remaining.slice(1);
      continue;
    }

    // Extension node
    if (isExtension(currentNode)) {
      const prefixLen = commonPrefixLength(currentNode.nibbles, remaining);
      if (prefixLen < currentNode.nibbles.length) {
        return Option.none();
      }
      currentNode = currentNode.nextNode;
      remaining = remaining.slice(prefixLen);
      continue;
    }

    // Leaf node
    if (isLeaf(currentNode)) {
      const prefixLen = commonPrefixLength(currentNode.nibbles, remaining);
      if (
        prefixLen === currentNode.nibbles.length &&
        prefixLen === remaining.length
      ) {
        return Option.some(currentNode);
      }
      return Option.none();
    }

    // Exhaustive
    return Option.none();
  }
};

/**
 * Check if a key exists in the trie.
 */
const hasKey = (trie: PatriciaTrie, key: string): boolean =>
  Option.isSome(lookup(trie, key));

// ============================================================================
// INSERT OPERATIONS
// ============================================================================

/**
 * Insert a key-value pair into the trie.
 */
const insertPure = (
  trie: PatriciaTrie,
  key: string,
  value: unknown
): PatriciaTrie => {
  const nibbles = keyToNibbles(key);
  const hadKey = hasKey(trie, key);
  const newRoot = insertNodeNibbles(trie.root, nibbles, value);
  const newSize = hadKey ? trie.size : trie.size + 1;
  return makeTrie(newRoot, newSize);
};

/**
 * Insert nibbles into a node.
 * @internal
 */
const insertNodeNibbles = (
  node: PatriciaNode,
  nibbles: Nibbles,
  value: unknown
): PatriciaNode => {
  if (isBranch(node)) {
    return insertIntoBranch(node, nibbles, value);
  }
  if (isExtension(node)) {
    return insertIntoExtension(node, nibbles, value);
  }
  return insertIntoLeaf(node as LeafNode, nibbles, value);
};

/**
 * Insert into a branch node.
 * @internal
 */
const insertIntoBranch = (
  branch: BranchNode,
  nibbles: Nibbles,
  value: unknown
): PatriciaNode => {
  if (nibbles.length === 0) {
    return makeBranch({ children: branch.children, value: Option.some(value) });
  }

  const nextNibble = nibbles[0];
  const nextNibbleChar = nextNibble.toString(16);
  const remaining = nibbles.slice(1);
  const existingChild = branch.children[nextNibbleChar];

  const newChild = existingChild
    ? insertNodeNibbles(existingChild, remaining, value)
    : remaining.length === 0
    ? makeLeaf({ nibbles: [], value })
    : makeLeaf({ nibbles: Array.from(remaining), value });

  return makeBranch({
    children: { ...branch.children, [nextNibbleChar]: newChild },
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
  value: unknown
): PatriciaNode => {
  const prefixNibbles = ext.nibbles;
  const commonLen = commonPrefixLength(prefixNibbles, nibbles);

  // Exact match - pass value down to child
  if (commonLen === prefixNibbles.length && commonLen === nibbles.length) {
    return makeExtension({
      nibbles: ext.nibbles,
      nextNode: insertNodeNibbles(ext.nextNode, [], value),
    });
  }

  // Full prefix match - continue into child
  if (commonLen === prefixNibbles.length) {
    const remaining = nibbles.slice(commonLen);
    return makeExtension({
      nibbles: ext.nibbles,
      nextNode: insertNodeNibbles(ext.nextNode, remaining, value),
    });
  }

  // Partial match - need to split extension
  const matchedPrefix = Array.from(prefixNibbles.slice(0, commonLen));
  const extSuffix = Array.from(prefixNibbles.slice(commonLen));
  const nibblesSuffix = Array.from(nibbles.slice(commonLen));

  const extSuffixChar = (extSuffix[0] as Nibbles[number]).toString(16);
  let branchChildren: Record<string, PatriciaNode> = {};

  // Add old path
  if (extSuffix.length === 1) {
    branchChildren[extSuffixChar] = ext.nextNode;
  } else {
    branchChildren[extSuffixChar] = makeExtension({
      nibbles: extSuffix.slice(1) as Nibbles,
      nextNode: ext.nextNode,
    });
  }

  // Add new path
  let branchValue = Option.none<unknown>();
  if (nibblesSuffix.length === 0) {
    branchValue = Option.some(value);
  } else {
    const newNibbleChar = nibblesSuffix[0].toString(16);
    branchChildren[newNibbleChar] = makeLeaf({
      nibbles: nibblesSuffix.slice(1),
      value,
    });
  }

  const branchNode = makeBranch({
    children: branchChildren,
    value: branchValue,
  });

  // Wrap in extension if there's a matched prefix
  if (matchedPrefix.length > 0) {
    return makeExtension({
      nibbles: matchedPrefix as Nibbles,
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
  value: unknown
): PatriciaNode => {
  const leafNibbles = leaf.nibbles;
  const commonLen = commonPrefixLength(leafNibbles, nibbles);

  // Exact match - update value
  if (commonLen === leafNibbles.length && commonLen === nibbles.length) {
    return makeLeaf({ nibbles: Array.from(leaf.nibbles), value });
  }

  // Leaf prefix is a prefix of new key
  if (commonLen === leafNibbles.length) {
    const remaining = Array.from(nibbles.slice(commonLen));
    if (remaining.length === 0) {
      return makeLeaf({ nibbles: Array.from(leaf.nibbles), value });
    }

    const newNibbleChar = remaining[0].toString(16);
    const branchChildren: Record<string, PatriciaNode> = {
      [newNibbleChar]: makeLeaf({ nibbles: remaining.slice(1), value }),
    };

    const branch = makeBranch({
      children: branchChildren,
      value: Option.some(leaf.value),
    });

    if (leafNibbles.length > 0) {
      return makeExtension({
        nibbles: Array.from(leaf.nibbles),
        nextNode: branch,
      });
    }
    return branch;
  }

  // Partial match - split the leaf
  const matchedPrefix = Array.from(leafNibbles.slice(0, commonLen));
  const leafSuffix = Array.from(leafNibbles.slice(commonLen));
  const nibblesSuffix = Array.from(nibbles.slice(commonLen));

  let branchChildren: Record<string, PatriciaNode> = {};

  // Add old leaf
  if (leafSuffix.length > 0) {
    const leafNibbleChar = (leafSuffix[0] as Nibbles[number]).toString(16);
    branchChildren[leafNibbleChar] = makeLeaf({
      nibbles: leafSuffix.slice(1) as Nibbles,
      value: leaf.value,
    });
  }

  // Add new key
  let branchValue = Option.none<unknown>();
  if (nibblesSuffix.length > 0) {
    const newNibbleChar = nibblesSuffix[0].toString(16);
    branchChildren[newNibbleChar] = makeLeaf({
      nibbles: nibblesSuffix.slice(1),
      value,
    });
  } else {
    branchValue = Option.some(value);
  }

  const branchNode = makeBranch({
    children: branchChildren,
    value: branchValue,
  });

  if (matchedPrefix.length > 0) {
    return makeExtension({
      nibbles: matchedPrefix as Nibbles,
      nextNode: branchNode,
    });
  }

  return branchNode;
};

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

/**
 * Delete a key from the trie.
 */
const deletePure = (trie: PatriciaTrie, key: string): PatriciaTrie => {
  if (!hasKey(trie, key)) {
    return trie;
  }

  const nibbles = keyToNibbles(key);
  const newRootOpt = deleteNodeNibbles(trie.root, nibbles);

  return Option.match(newRootOpt, {
    onNone: () => makeTrie(makeBranch(), 0),
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
): Option.Option<PatriciaNode> => {
  if (isBranch(node)) {
    return deleteFromBranch(node, nibbles);
  }
  if (isExtension(node)) {
    return deleteFromExtension(node, nibbles);
  }
  return deleteFromLeaf(node as LeafNode, nibbles);
};

/**
 * Delete from a branch node.
 * @internal
 */
const deleteFromBranch = (
  branch: BranchNode,
  nibbles: Nibbles
): Option.Option<PatriciaNode> => {
  if (nibbles.length === 0) {
    const newBranch = makeBranch({
      children: branch.children,
      value: Option.none(),
    });
    // Check if empty
    if (
      Option.isNone(newBranch.value) &&
      Object.keys(newBranch.children).length === 0
    ) {
      return Option.none();
    }
    return Option.some(newBranch);
  }

  const nextNibble = nibbles[0].toString(16);
  const remaining = nibbles.slice(1);
  const child = branch.children[nextNibble];

  if (!child) {
    return Option.some(branch);
  }

  const updatedChildOpt = deleteNodeNibbles(child, remaining);

  const newChildren = { ...branch.children };
  if (Option.isNone(updatedChildOpt)) {
    delete newChildren[nextNibble];
  } else {
    newChildren[nextNibble] = updatedChildOpt.value;
  }

  const newBranch = makeBranch({
    children: newChildren,
    value: branch.value,
  });

  // Prune empty branch
  if (
    Option.isNone(newBranch.value) &&
    Object.keys(newBranch.children).length === 0
  ) {
    return Option.none();
  }

  return Option.some(newBranch);
};

/**
 * Delete from an extension node.
 * @internal
 */
const deleteFromExtension = (
  ext: ExtensionNode,
  nibbles: Nibbles
): Option.Option<PatriciaNode> => {
  const prefixNibbles = ext.nibbles;
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
      nibbles: ext.nibbles,
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
  const leafNibbles = leaf.nibbles;
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
 */
const calculateRootHashPure = (trie: PatriciaTrie): MerkleHash => {
  return hashNode(trie.root);
};

/**
 * Hash a node recursively.
 * @internal
 */
const hashNode = (node: PatriciaNode): MerkleHash => {
  const serialized = serializeNode(node);
  return keccak256(serialized);
};

/**
 * Serialize a node to deterministic JSON.
 * Branch: ["branch", valueOrNull, {children}]
 * Extension: ["ext", nibbles, childHash]
 * Leaf: ["leaf", nibbles, value]
 * @internal
 */
const serializeNode = (node: PatriciaNode): string => {
  if (isBranch(node)) {
    const valueRepr = Option.match(node.value, {
      onNone: () => null,
      onSome: (v) => v,
    });

    const childHashes: Record<string, string> = {};
    for (const [key, child] of Object.entries(node.children)) {
      childHashes[key] = hashNode(child);
    }

    return JSON.stringify(["branch", valueRepr, childHashes]);
  }

  if (isExtension(node)) {
    const childHash = hashNode(node.nextNode);
    return JSON.stringify(["ext", Array.from(node.nibbles), childHash]);
  }

  // Leaf
  return JSON.stringify(["leaf", Array.from(node.nibbles), node.value]);
};

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
      key: string
    ) => Option.Option<PatriciaNode>;
    readonly hasKey: (trie: PatriciaTrie, key: string) => boolean;
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
      key: string,
      value: unknown
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
    readonly delete: (trie: PatriciaTrie, key: string) => PatriciaTrie;
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

export const PatriciaHashLive = Layer.succeed(
  PatriciaHash,
  PatriciaHash.of({
    calculateRootHash: calculateRootHashPure,
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

  if (isLeaf(node)) {
    const nibbles = Array.from(node.nibbles).join(",");
    return `${padding}Leaf(nibbles=[${nibbles}], value=${JSON.stringify(
      node.value
    )})`;
  }

  if (isExtension(node)) {
    const nibbles = Array.from(node.nibbles).join(",");
    const childDisplay = displayNode(node.nextNode, indent + 2);
    return `${padding}Extension(nibbles=[${nibbles}])\n${childDisplay}`;
  }

  // Branch
  const value = Option.isSome(node.value)
    ? `, value=${JSON.stringify(Option.getOrThrow(node.value))}`
    : "";
  const childLines = Object.entries(node.children).map(([key, child]) => {
    const childDisplay = displayNode(child, indent + 2);
    return `${" ".repeat(indent + 2)}[${key}] => ${childDisplay.trim()}`;
  });

  const childStr = childLines.length > 0 ? `\n${childLines.join("\n")}` : "";
  return `${padding}Branch(children=${
    Object.keys(node.children).length
  }${value})${childStr}`;
};

/**
 * Compact inline representation of a node for single-line output.
 * @internal
 */
const displayNodeCompact = (node: PatriciaNode): string => {
  if (isLeaf(node)) {
    return `L[${Array.from(node.nibbles).join("")}]=${JSON.stringify(
      node.value
    )}`;
  }

  if (isExtension(node)) {
    return `E[${Array.from(node.nibbles).join("")}]->${displayNodeCompact(
      node.nextNode
    )}`;
  }

  // Branch
  const childCount = Object.keys(node.children).length;
  const valueStr = Option.isSome(node.value)
    ? `:${JSON.stringify(Option.getOrThrow(node.value))}`
    : "";
  return `B(${childCount}children${valueStr})`;
};

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
 * Provides: PatriciaInsert, PatriciaDelete, PatriciaQuery, PatriciaHash, PatriciaDisplayService
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
