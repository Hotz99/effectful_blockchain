/**
 * Patricia Trie Delete Capability
 *
 * Delete operations for removing keys from the Patricia trie.
 *
 * @module MPTService/Delete
 * @since 0.2.0
 */

import { Context, Layer, Option, Match } from "effect";
import * as MPT from "../../entities/mpt";
import { keyToNibbles, commonPrefixLength, compressNode } from "./internal";

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
 * Check if a key exists (local helper).
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
