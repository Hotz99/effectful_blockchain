/**
 * Patricia Trie Query Capability
 *
 * Lookup and existence check operations for the Patricia trie.
 *
 * @module MPTService/Query
 * @since 0.2.0
 */

import { Context, Layer, Option, Match } from "effect";
import * as MPT from "../../entities/mpt";
import { keyToNibbles, commonPrefixLength } from "./internal";

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
