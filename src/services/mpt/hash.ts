/**
 * Merkle-Patricia Trie Hash Capability
 *
 * Canonical Merkle-style root hash calculations for the Patricia trie.
 * Depends on HashingService for Keccak-256 hashing operations.
 *
 * @module MPTService/Hash
 * @since 0.2.0
 */

import { Context, Effect, Layer, Match } from "effect";
import * as MPT from "../../entities/mpt";
import * as MerkleTree from "../../entities/merkle_tree";
import * as MerkleHashingService from "../../services/merkle/hash";

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

// TODO move to internal utils ? such that merkle root also uses it, instead of sha256
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
