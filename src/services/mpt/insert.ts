/**
 * Patricia Trie Insert Capability
 *
 * Insert operations for adding key-value pairs to the Patricia trie.
 *
 * @module MPTService/Insert
 * @since 0.2.0
 */

import { Context, Layer, Option, Match } from "effect";
import * as MPT from "../../entities/mpt";
import { keyToNibbles, commonPrefixLength, compressNode } from "./internal";

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
 * Check if a key exists (local helper).
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
