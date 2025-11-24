// TODO make this shared between merkle tree/root and patricia trie services

/**
 * This module provides cryptographic hashing capabilities as Effect services.
 * Pure implementations using `ethers` for Ethereum-compatible hashing.
 *
 * Capabilities:
 * - HashingService — SHA-256 and Keccak-256 hashing operations
 *
 * @module Crypto
 * @since 0.2.0
 */

import { Context, Layer } from "effect";
import { keccak256 as ethersKeccak256, toUtf8Bytes } from "ethers";
import * as Crypto from "crypto";
import * as MerkleTree from "../../../src/entities/merkle_tree";

// ============================================================================
// CAPABILITY: HASHING SERVICE
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
>() {}

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
