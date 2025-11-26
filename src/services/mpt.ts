/**
 * Merkle Patricia Trie Service
 *
 * Unified service providing all MPT capabilities:
 * - Query: Lookup and existence checks
 * - Insert: Add key-value pairs
 * - Delete: Remove keys
 * - Hash: Calculate Merkle root hash
 * - Display: Visualize trie structure
 *
 * @module MPTService
 * @since 0.2.0
 */

import { Context, Effect, Layer, Option, Match } from "effect";
import * as MPT from "../entities/mpt";
import * as MerkleTree from "../entities/merkle_tree";
import * as Primitives from "../entities/primitives";
import * as MerkleHashingService from "./merkle_tree";

// ============================================================================
// Internal Utilities
// ============================================================================

/**
 * Convert a UTF-8 string key to an array of hex nibbles (4-bit values).
 */
export const keyToNibbles = (key: MPT.NodeKey): MPT.Nibbles => {
  const hexStr = key.startsWith("0x") ? key.slice(2) : key;
  return Array.from(hexStr).map((char) => parseInt(char, 16));
};

/**
 * Find the length of the common prefix between two nibble arrays.
 */
export const commonPrefixLength = (
  nibbles1: MPT.Nibbles,
  nibbles2: MPT.Nibbles
): Primitives.PositiveInt => {
  let i = 0;
  const minLen = Math.min(nibbles1.length, nibbles2.length);
  while (i < minLen && nibbles1[i] === nibbles2[i]) {
    i++;
  }
  return i;
};

/**
 * Compress a node to optimize the trie structure.
 * - Single-child branches with no value become extensions
 * - Consecutive extensions are merged
 */
export const compressNode = (node: MPT.PatriciaNode): MPT.PatriciaNode =>
  Match.typeTags<MPT.PatriciaNode>()({
    Branch: (branch) => {
      const compressedChildren: Record<string, MPT.PatriciaNode> = {};
      for (const [key, child] of Object.entries(branch.children)) {
        compressedChildren[key] = compressNode(child);
      }

      const childCount = Object.keys(compressedChildren).length;

      if (childCount === 1 && Option.isNone(branch.value)) {
        const [childKey, childNode] = Object.entries(compressedChildren)[0];
        const nibble = parseInt(childKey, 16);

        if (childNode._tag === "Extension") {
          return MPT.makeExtension({
            sharedPrefix: [nibble, ...childNode.sharedPrefix] as MPT.Nibbles,
            nextNode: childNode.nextNode,
          });
        }

        return MPT.makeExtension({
          sharedPrefix: [nibble] as MPT.Nibbles,
          nextNode: childNode,
        });
      }

      return MPT.makeBranch({
        children: compressedChildren,
        value: branch.value,
      });
    },
    Extension: (ext) => {
      const compressedChild = compressNode(ext.nextNode);

      // If child is an extension, merge them
      if (compressedChild._tag === "Extension") {
        return MPT.makeExtension({
          sharedPrefix: [
            ...ext.sharedPrefix,
            ...compressedChild.sharedPrefix,
          ] as MPT.Nibbles,
          nextNode: compressedChild.nextNode,
        });
      }

      // If child is a branch with no children and a value, convert to leaf
      if (
        compressedChild._tag === "Branch" &&
        Object.keys(compressedChild.children).length === 0 &&
        Option.isSome(compressedChild.value)
      ) {
        return MPT.makeLeaf({
          keyEnd: ext.sharedPrefix,
          // TODO vet this bs
          value: compressedChild.value.value as MPT.NodeValue,
        });
      }

      return MPT.makeExtension({
        sharedPrefix: ext.sharedPrefix,
        nextNode: compressedChild,
      });
    },
    Leaf: (leaf) => leaf,
  })(node);

// ============================================================================
// Query
// ============================================================================

/**
 * PatriciaQuery capability — lookup and existence checks
 *
 * @category Capabilities
 * @since 0.2.0
 */
export class MPTQuery extends Context.Tag("@services/mpt/MPTQuery")<
  MPTQuery,
  {
    readonly query: (
      trie: MPT.PatriciaTrie,
      key: MPT.NodeKey
    ) => Option.Option<MPT.PatriciaNode>;
  }
>() {}

export const MPTQueryLive = Layer.succeed(
  MPTQuery,
  MPTQuery.of({
    query: (
      trie: MPT.PatriciaTrie,
      key: MPT.NodeKey
    ): Option.Option<MPT.PatriciaNode> => {
      let currentNode = trie.root;
      let remaining = keyToNibbles(key);

      const matcher = Match.typeTags<MPT.PatriciaNode>()({
        Branch: (branch) => {
          if (remaining.length === 0) return Option.some(branch);

          const nextNibble = remaining[0].toString(16);
          const child = branch.children[nextNibble];
          if (!child) return Option.none();

          currentNode = child;
          remaining = remaining.slice(1);
          return null;
        },
        Extension: (ext) => {
          const prefixLen = commonPrefixLength(ext.sharedPrefix, remaining);
          if (prefixLen < ext.sharedPrefix.length) return Option.none();

          currentNode = ext.nextNode;
          remaining = remaining.slice(prefixLen);
          return null;
        },
        Leaf: (leaf) => {
          const prefixLen = commonPrefixLength(leaf.keyEnd, remaining);

          if (
            prefixLen === leaf.keyEnd.length &&
            prefixLen === remaining.length
          )
            return Option.some(leaf);

          return Option.none();
        },
      });

      while (true) {
        const result = matcher(currentNode);
        if (result !== null) return result;
      }
    },
  })
);

// ============================================================================
// Insert
// ============================================================================

/**
 * Check if a key exists (local helper for insert).
 */
const lookupKey = (
  trie: MPT.PatriciaTrie,
  key: MPT.NodeKey
): Option.Option<MPT.PatriciaNode> =>
  lookupNibbles(trie.root, keyToNibbles(key));

/**
 * Internal lookup by nibble array.
 */
const lookupNibbles = (
  node: MPT.PatriciaNode,
  nibbles: MPT.Nibbles
): Option.Option<MPT.PatriciaNode> => {
  let currentNode = node;
  let remaining = nibbles;

  const matcher = Match.typeTags<MPT.PatriciaNode>()({
    Branch: (branch) => {
      if (remaining.length === 0) return Option.some(branch);

      const nextNibble = remaining[0].toString(16);
      const child = branch.children[nextNibble];
      if (!child) return Option.none();

      currentNode = child;
      remaining = remaining.slice(1);
      return null;
    },
    Extension: (ext) => {
      const prefixLen = commonPrefixLength(ext.sharedPrefix, remaining);
      if (prefixLen < ext.sharedPrefix.length) return Option.none();

      currentNode = ext.nextNode;
      remaining = remaining.slice(prefixLen);
      return null;
    },
    Leaf: (leaf) => {
      const prefixLen = commonPrefixLength(leaf.keyEnd, remaining);

      if (prefixLen === leaf.keyEnd.length && prefixLen === remaining.length)
        return Option.some(leaf);

      return Option.none();
    },
  });

  while (true) {
    const result = matcher(currentNode);
    if (result !== null) return result;
  }
};

/**
 * Insert nibbles into a node.
 */
const insertNodeNibbles = (
  node: MPT.PatriciaNode,
  nibbles: MPT.Nibbles,
  value: MPT.NodeValue
): MPT.PatriciaNode =>
  Match.typeTags<MPT.PatriciaNode>()({
    Branch: (branch) => insertIntoBranch(branch, nibbles, value),
    Extension: (ext) => insertIntoExtension(ext, nibbles, value),
    Leaf: (leaf) => insertIntoLeaf(leaf, nibbles, value),
  })(node);

/**
 * Insert into a branch node.
 */
const insertIntoBranch = (
  branch: MPT.BranchNode,
  nibbles: MPT.Nibbles,
  value: MPT.NodeValue
): MPT.PatriciaNode => {
  if (nibbles.length === 0) {
    return MPT.makeBranch({
      children: branch.children,
      value: Option.some(value),
    });
  }

  const nextNibble = nibbles[0].toString(16);
  const remaining = nibbles.slice(1);
  const existingChild = branch.children[nextNibble];

  let newChild: MPT.PatriciaNode;

  if (existingChild) {
    newChild = insertNodeNibbles(existingChild, remaining, value);
  } else if (remaining.length === 0) {
    newChild = MPT.makeBranch({
      children: {},
      value: Option.some(value),
    });
  } else {
    newChild = MPT.makeLeaf({ keyEnd: remaining, value });
  }

  return MPT.makeBranch({
    children: { ...branch.children, [nextNibble]: newChild },
    value: branch.value,
  });
};

/**
 * Insert into an extension node.
 */
const insertIntoExtension = (
  ext: MPT.ExtensionNode,
  nibbles: MPT.Nibbles,
  value: MPT.NodeValue
): MPT.PatriciaNode => {
  const prefixNibbles = ext.sharedPrefix;
  const commonLen = commonPrefixLength(prefixNibbles, nibbles);

  if (MPT.NibblesEquivalence(prefixNibbles, nibbles))
    return MPT.makeExtension({
      sharedPrefix: ext.sharedPrefix,
      nextNode: insertNodeNibbles(ext.nextNode, [], value),
    });

  if (commonLen === prefixNibbles.length) {
    const remaining = nibbles.slice(commonLen);
    return MPT.makeExtension({
      sharedPrefix: ext.sharedPrefix,
      nextNode: insertNodeNibbles(ext.nextNode, remaining, value),
    });
  }

  const matchedPrefix = prefixNibbles.slice(0, commonLen);
  const extSuffix = prefixNibbles.slice(commonLen);
  const nibblesSuffix = nibbles.slice(commonLen);

  const extSuffixChar = extSuffix[0]!.toString(16);
  let branchChildren: Record<string, MPT.PatriciaNode> = {};

  if (extSuffix.length === 1) {
    branchChildren[extSuffixChar] = ext.nextNode;
  } else {
    branchChildren[extSuffixChar] = MPT.makeExtension({
      sharedPrefix: extSuffix.slice(1),
      nextNode: ext.nextNode,
    });
  }

  let branchValue = Option.none<unknown>();
  if (nibblesSuffix.length === 0) {
    branchValue = Option.some(value);
  } else {
    const newNibbleChar = nibblesSuffix[0].toString(16);
    branchChildren[newNibbleChar] =
      nibblesSuffix.length === 1
        ? MPT.makeLeaf({ keyEnd: [nibblesSuffix[0]], value })
        : MPT.makeLeaf({ keyEnd: nibblesSuffix.slice(1), value });
  }

  const branchNode = MPT.makeBranch({
    children: branchChildren,
    value: branchValue,
  });

  if (matchedPrefix.length > 0) {
    return MPT.makeExtension({
      sharedPrefix: matchedPrefix as MPT.Nibbles,
      nextNode: branchNode,
    });
  }

  return branchNode;
};

/**
 * Insert into a leaf node.
 */
const insertIntoLeaf = (
  leaf: MPT.LeafNode,
  nibbles: MPT.Nibbles,
  value: MPT.NodeValue
): MPT.PatriciaNode => {
  const leafNibbles = leaf.keyEnd;
  const commonLen = commonPrefixLength(leafNibbles, nibbles);

  if (commonLen === leafNibbles.length && commonLen === nibbles.length) {
    return MPT.makeLeaf({ keyEnd: leaf.keyEnd, value });
  }

  if (commonLen === nibbles.length) {
    const leafSuffix = leafNibbles.slice(commonLen);
    const firstNibble = leafSuffix[0].toString(16);

    const branchChildren: Record<string, MPT.PatriciaNode> = {
      [firstNibble]:
        leafSuffix.length === 1
          ? MPT.makeBranch({ children: {}, value: Option.some(leaf.value) })
          : MPT.makeLeaf({ keyEnd: leafSuffix.slice(1), value: leaf.value }),
    };

    const branch = MPT.makeBranch({
      children: branchChildren,
      value: Option.some(value),
    });

    if (commonLen > 0) {
      return MPT.makeExtension({
        sharedPrefix: nibbles.slice(0, commonLen) as MPT.Nibbles,
        nextNode: branch,
      });
    }
    return branch;
  }

  if (commonLen === leafNibbles.length) {
    const remaining = nibbles.slice(commonLen);

    const newNibbleChar = remaining[0].toString(16);
    const branchChildren: Record<string, MPT.PatriciaNode> = {
      [newNibbleChar]:
        remaining.length === 1
          ? MPT.makeBranch({ children: {}, value: Option.some(value) })
          : MPT.makeLeaf({ keyEnd: remaining.slice(1), value }),
    };

    const branch = MPT.makeBranch({
      children: branchChildren,
      value: Option.some(leaf.value),
    });

    if (leafNibbles.length > 1) {
      return MPT.makeExtension({
        sharedPrefix: leaf.keyEnd,
        nextNode: branch,
      });
    } else if (leafNibbles.length === 1) {
      return MPT.makeBranch({
        children: { [leafNibbles[0].toString(16)]: branch },
        value: Option.none(),
      });
    }
    return branch;
  }

  const matchedPrefix = leafNibbles.slice(0, commonLen);
  const leafSuffix = leafNibbles.slice(commonLen);
  const nibblesSuffix = nibbles.slice(commonLen);

  let branchChildren: Record<string, MPT.PatriciaNode> = {};

  const leafNibbleChar = leafSuffix[0]!.toString(16);
  if (leafSuffix.length === 1) {
    // When suffix is 1 nibble, store value in branch at that position
    branchChildren[leafNibbleChar] = MPT.makeBranch({
      children: {},
      value: Option.some(leaf.value),
    });
  } else {
    branchChildren[leafNibbleChar] = MPT.makeLeaf({
      keyEnd: leafSuffix.slice(1),
      value: leaf.value,
    });
  }

  let branchValue = Option.none<unknown>();
  if (nibblesSuffix.length > 0) {
    const newNibbleChar = nibblesSuffix[0].toString(16);
    if (nibblesSuffix.length === 1) {
      // When suffix is 1 nibble, store value in branch at that position
      branchChildren[newNibbleChar] = MPT.makeBranch({
        children: {},
        value: Option.some(value),
      });
    } else {
      branchChildren[newNibbleChar] = MPT.makeLeaf({
        keyEnd: nibblesSuffix.slice(1),
        value,
      });
    }
  } else {
    branchValue = Option.some(value);
  }

  const branchNode = MPT.makeBranch({
    children: branchChildren,
    value: branchValue,
  });

  if (matchedPrefix.length > 0) {
    return MPT.makeExtension({
      sharedPrefix: matchedPrefix as MPT.Nibbles,
      nextNode: branchNode,
    });
  }

  return branchNode;
};

/**
 * Insert a key-value pair into the trie.
 */
const insertPure = (
  trie: MPT.PatriciaTrie,
  key: MPT.NodeKey,
  value: MPT.NodeValue
): MPT.PatriciaTrie => {
  const nibbles = keyToNibbles(key);
  const hadKey = Option.isSome(lookupKey(trie, key));
  const newRoot = insertNodeNibbles(trie.root, nibbles, value);
  const compressedRoot = compressNode(newRoot);
  const newSize = hadKey ? trie.size : trie.size + 1;
  return MPT.makeTrie(compressedRoot, newSize);
};

/**
 * MPTInsert capability — inserts key-value pairs
 *
 * @category Capabilities
 * @since 0.2.0
 */
export class MPTInsert extends Context.Tag("@services/mpt/MPTInsert")<
  MPTInsert,
  {
    readonly insert: (
      trie: MPT.PatriciaTrie,
      key: MPT.NodeKey,
      value: MPT.NodeValue
    ) => MPT.PatriciaTrie;
  }
>() {}

export const PatriciaInsertLive = Layer.succeed(
  MPTInsert,
  MPTInsert.of({
    insert: insertPure,
  })
);

// ============================================================================
// Delete
// ============================================================================

/**
 * Check if a key exists (local helper for delete).
 */
const hasKey = (trie: MPT.PatriciaTrie, key: MPT.NodeKey): boolean =>
  Option.isSome(lookup(trie, key));

/**
 * Lookup a node in the trie by string key.
 */
const lookup = (
  trie: MPT.PatriciaTrie,
  key: MPT.NodeKey
): Option.Option<MPT.PatriciaNode> =>
  lookupNibbles(trie.root, keyToNibbles(key));

/**
 * Delete nibbles from a node.
 */
const deleteNodeNibbles = (
  node: MPT.PatriciaNode,
  nibbles: MPT.Nibbles
): Option.Option<MPT.PatriciaNode> =>
  Match.typeTags<MPT.PatriciaNode>()({
    Branch: (branch) => deleteFromBranch(branch, nibbles),
    Extension: (ext) => deleteFromExtension(ext, nibbles),
    Leaf: (leaf) => deleteFromLeaf(leaf, nibbles),
  })(node);

/**
 * Delete from a branch node.
 */
const deleteFromBranch = (
  branch: MPT.BranchNode,
  nibbles: MPT.Nibbles
): Option.Option<MPT.PatriciaNode> => {
  // If nibbles is empty, we're deleting the value at this branch node itself
  if (nibbles.length === 0) {
    // Remove the value at this branch
    const nb = MPT.makeBranch({
      children: branch.children,
      value: Option.none(),
    });

    // If branch now has no value and no children, remove it entirely
    if (Object.keys(nb.children).length === 0) {
      return Option.none();
    }

    return Option.some(nb);
  }

  const k = nibbles[0].toString(16);
  const tail = nibbles.slice(1);
  const child = branch.children[k];

  if (!child) return Option.some(branch);

  const upd = deleteNodeNibbles(child, tail);

  const ch = { ...branch.children };
  if (Option.isNone(upd)) delete ch[k];
  else ch[k] = upd.value;

  const nb = MPT.makeBranch({ children: ch, value: branch.value });

  if (Option.isNone(nb.value) && Object.keys(nb.children).length === 0)
    return Option.none();

  return Option.some(nb);
};

/**
 * Delete from an extension node.
 */
const deleteFromExtension = (
  ext: MPT.ExtensionNode,
  nibbles: MPT.Nibbles
): Option.Option<MPT.PatriciaNode> => {
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
    MPT.makeExtension({
      sharedPrefix: ext.sharedPrefix,
      nextNode: updatedChildOpt.value,
    })
  );
};

/**
 * Delete from a leaf node.
 */
const deleteFromLeaf = (
  leaf: MPT.LeafNode,
  nibbles: MPT.Nibbles
): Option.Option<MPT.PatriciaNode> => {
  const leafNibbles = leaf.keyEnd;
  const commonLen = commonPrefixLength(leafNibbles, nibbles);

  if (commonLen === leafNibbles.length && commonLen === nibbles.length) {
    return Option.none();
  }

  return Option.some(leaf);
};

/**
 * Delete a key from the trie.
 */
const deletePure = (
  trie: MPT.PatriciaTrie,
  key: MPT.NodeKey
): MPT.PatriciaTrie => {
  if (!hasKey(trie, key)) {
    return trie;
  }

  const nibbles = keyToNibbles(key);
  const newRootOpt = deleteNodeNibbles(trie.root, nibbles);

  return Option.match(newRootOpt, {
    onNone: () => MPT.makeEmptyTrie(),
    onSome: (newRoot) => MPT.makeTrie(compressNode(newRoot), trie.size - 1),
  });
};

/**
 * PatriciaDelete capability — removes keys from trie
 *
 * @category Capabilities
 * @since 0.2.0
 */
export class PatriciaDelete extends Context.Tag("@services/mpt/MPTDelete")<
  PatriciaDelete,
  {
    readonly delete: (
      trie: MPT.PatriciaTrie,
      key: MPT.NodeKey
    ) => MPT.PatriciaTrie;
  }
>() {}

export const PatriciaDeleteLive = Layer.succeed(
  PatriciaDelete,
  PatriciaDelete.of({
    delete: deletePure,
  })
);

// ============================================================================
// Hash
// ============================================================================

/**
 * Serialize a Patricia node to canonical deterministic representation.
 *
 * This is the **canonical serialization format** for Ethereum-style MPT nodes.
 * Current implementation uses deterministic JSON.
 *
 * Serialization formats by node type:
 * - **Branch**: `["branch", valueOrNull, {childrenHashes}]`
 * - **Extension**: `["ext", nibbles, childHash]`
 * - **Leaf**: `["leaf", nibbles, value]`
 *
 * Future enhancements:
 * - Implement hex-prefix encoding for nibble arrays
 * - Migrate to RLP (Recursive Length Prefix) encoding for Ethereum compatibility
 */
const serializeNode = (
  node: MPT.PatriciaNode,
  keccak256Fn: (data: string) => MerkleTree.MerkleHash
): string =>
  Match.typeTags<MPT.PatriciaNode>()({
    Branch: (branch) => {
      const valueRepr =
        branch.value._tag === "None" ? null : branch.value.value;

      const childHashes: Record<string, string> = {};
      for (const [key, child] of Object.entries(branch.children)) {
        childHashes[key] = hashNode(child, keccak256Fn);
      }

      return JSON.stringify(["branch", valueRepr, childHashes]);
    },
    Extension: (ext) => {
      const childHash = hashNode(ext.nextNode, keccak256Fn);
      return JSON.stringify(["ext", ext.sharedPrefix, childHash]);
    },
    Leaf: (leaf) => JSON.stringify(["leaf", leaf.keyEnd, leaf.value]),
  })(node);

/**
 * Hash a single Patricia node recursively.
 *
 * This is the core node hashing primitive for canonical MPT hashing.
 * Serializes the node and applies Keccak-256.
 */
const hashNode = (
  node: MPT.PatriciaNode,
  keccak256Fn: (data: string) => MerkleTree.MerkleHash
): MerkleTree.MerkleHash => {
  const serialized = serializeNode(node, keccak256Fn);
  return keccak256Fn(serialized);
};

/**
 * MPTHash capability — computes deterministic Merkle-style root hashes
 *
 * Depends on HashingService for Keccak-256 hashing operations.
 *
 * @category Capabilities
 * @since 0.2.0
 */
export class MPTHash extends Context.Tag("@services/mpt/MPTHash")<
  MPTHash,
  {
    readonly calculateRootHash: (
      trie: MPT.PatriciaTrie
    ) => MerkleTree.MerkleHash;
  }
>() {}

/**
 * Live implementation of MPTHash
 *
 * @category Services
 * @since 0.2.0
 */
export const MPTHashLive = Layer.effect(
  MPTHash,
  Effect.gen(function* () {
    const hashing = yield* MerkleHashingService.HashingService;

    // TODO:
    // implement hex-prefix encoding for nibble paths
    // implement RLP (Recursive Length Prefix) serialization
    return MPTHash.of({
      calculateRootHash: (trie: MPT.PatriciaTrie): MerkleTree.MerkleHash =>
        hashNode(trie.root, hashing.keccak256),
    });
  })
);

// ============================================================================
// Display
// ============================================================================

/**
 * Compact inline representation of a node for single-line output.
 */
const displayNodeCompact = (node: MPT.PatriciaNode): string =>
  Match.typeTags<MPT.PatriciaNode>()({
    Branch: (branch) => {
      const childCount = Object.keys(branch.children).length;
      const valueStr =
        branch.value._tag === "Some"
          ? `:${JSON.stringify(branch.value.value)}`
          : "";
      return `B(${childCount}children${valueStr})`;
    },
    Extension: (ext) =>
      `E[${ext.sharedPrefix.join("")}]->${displayNodeCompact(ext.nextNode)}`,
    Leaf: (leaf) => `L[${leaf.keyEnd.join("")}]=${JSON.stringify(leaf.value)}`,
  })(node);

/**
 * Compact single-line representation of the trie structure.
 * Format: "Branch(child0=..., child1=...) | value=X"
 */
const displayTrie = (trie: MPT.PatriciaTrie): string => {
  const nodeStr = displayNodeCompact(trie.root);
  return `Trie(root=${nodeStr}, size=${trie.size})`;
};

/**
 * Multi-line tree display with indentation.
 */
const displayNode = (node: MPT.PatriciaNode, indent: number = 0): string => {
  const padding = " ".repeat(indent);

  return Match.typeTags<MPT.PatriciaNode>()({
    Branch: (branch) => {
      const value =
        branch.value._tag === "Some"
          ? `, value=${JSON.stringify(branch.value.value)}`
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
    Extension: (ext) => {
      const sharedPrefix = ext.sharedPrefix.map((n) => n.toString(16)).join("");
      const childDisplay = displayNode(ext.nextNode, indent + 2);
      return `${padding}[E](sharedPrefix=[${sharedPrefix}])\n${childDisplay}`;
    },
    Leaf: (leaf) =>
      `${padding}[L](keyEnd=[${leaf.keyEnd.join(",")}], value=${JSON.stringify(
        leaf.value
      )})`,
  })(node);
};

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
  "@services/mpt/MPTDisplayService"
)<
  PatriciaDisplayService,
  {
    readonly displayTrie: (trie: MPT.PatriciaTrie) => string;
    readonly displayNode: (node: MPT.PatriciaNode, indent?: number) => string;
  }
>() {}

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
// Unified Service
// ============================================================================

/**
 * Unified MPT Service
 *
 * Provides all capabilities for working with Merkle Patricia Tries.
 * High cohesion: All MPT operations are grouped together.
 * Low coupling: Only depends on MerkleHashingService for hash operations.
 *
 * @category Services
 * @since 0.2.0
 */
export class MPTService extends Context.Tag("@services/MPTService")<
  MPTService,
  {
    readonly query: (
      trie: MPT.PatriciaTrie,
      key: MPT.NodeKey
    ) => Effect.Effect<Option.Option<MPT.PatriciaNode>, never, never>;
    readonly insert: (
      trie: MPT.PatriciaTrie,
      key: MPT.NodeKey,
      value: MPT.NodeValue
    ) => MPT.PatriciaTrie;
    readonly delete: (
      trie: MPT.PatriciaTrie,
      key: MPT.NodeKey
    ) => MPT.PatriciaTrie;
    readonly calculateRootHash: (
      trie: MPT.PatriciaTrie
    ) => MerkleTree.MerkleHash;
    readonly displayTrie: (trie: MPT.PatriciaTrie) => string;
    readonly displayNode: (node: MPT.PatriciaNode, indent?: number) => string;
  }
>() {}

/**
 * Live implementation of unified MPT Service
 *
 * Composes all individual MPT capabilities into a single cohesive service.
 *
 * @category Services
 * @since 0.2.0
 */
export const MPTServiceLive = Layer.effect(
  MPTService,
  Effect.gen(function* () {
    const query = yield* MPTQuery;
    const insert = yield* MPTInsert;
    const deleteService = yield* PatriciaDelete;
    const hash = yield* MPTHash;
    const display = yield* PatriciaDisplayService;

    return MPTService.of({
      query: (trie, key) => Effect.succeed(query.query(trie, key)),
      insert: insert.insert,
      delete: deleteService.delete,
      calculateRootHash: hash.calculateRootHash,
      displayTrie: display.displayTrie,
      displayNode: display.displayNode,
    });
  })
).pipe(
  Layer.provide(
    Layer.mergeAll(
      MPTQueryLive,
      PatriciaInsertLive,
      PatriciaDeleteLive,
      MPTHashLive,
      PatriciaDisplayServiceLive
    )
  )
);
