/**
 * Internal Utilities for MPT Trie Operations
 *
 * Shared helper functions for trie manipulation including:
 * - Key-to-nibble conversion
 * - Common prefix calculation
 * - Compression logic
 *
 * @module MPTService/Internal
 * @since 0.2.0
 * @internal
 */

import { Option, Match } from "effect";
import * as MPT from "../../entities/mpt";
import * as Primitives from "../../entities/primitives";

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
